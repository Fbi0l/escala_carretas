-- Escala das Carretas — esquema inicial (1.0.0)
-- Perfis: administrador (usuários, médicos, carretas e escalas) e enfermagem (escalas e relatórios).
-- Todas as tabelas com RLS. Visitantes sem login (anon) não têm acesso a nada.

-- ---------- Perfis ----------
create table public.perfis_usuarios (
  usuario_id uuid primary key references auth.users(id) on delete cascade,
  perfil text not null check (perfil in ('administrador','enfermagem')),
  nome text not null default '' check (char_length(nome) <= 150),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- Perfil de quem está logado. Conta bloqueada (banned_until no futuro) perde o acesso na hora,
-- sem esperar o token expirar.
create or replace function public.meu_perfil() returns text
language sql stable security definer set search_path = '' as $$
  select p.perfil
  from public.perfis_usuarios p
  join auth.users u on u.id = p.usuario_id
  where p.usuario_id = auth.uid()
    and (u.banned_until is null or u.banned_until < now())
    and u.deleted_at is null
$$;
create or replace function public.eh_membro() returns boolean
language sql stable security definer set search_path = '' as $$ select public.meu_perfil() is not null $$;
create or replace function public.eh_admin() returns boolean
language sql stable security definer set search_path = '' as $$ select coalesce(public.meu_perfil() = 'administrador', false) $$;
revoke all on function public.meu_perfil(), public.eh_membro(), public.eh_admin() from public, anon;
grant execute on function public.meu_perfil(), public.eh_membro(), public.eh_admin() to authenticated, service_role;

-- ---------- Cadastros ----------
create table public.carretas (
  cnes text primary key check (cnes ~ '^[0-9]{7}$'),
  nome text not null check (char_length(nome) between 2 and 80),
  placa text not null default '' check (placa ~ '^[A-Z0-9]{0,8}$'),
  placa_confirmada boolean not null default false,
  ordem smallint not null default 0,
  ficha_data date,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users(id) on delete set null
);

create table public.medicos (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (char_length(nome) between 3 and 150),
  cns text unique check (cns ~ '^[0-9]{15}$'),
  funcao text not null default '' check (char_length(funcao) <= 40),
  obs text not null default '' check (char_length(obs) <= 300),
  cbo_manual text not null default '' check (cbo_manual = '' or cbo_manual ~ '^[0-9]{6}$'),
  origem text not null default '' check (char_length(origem) <= 80),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users(id) on delete set null
);
create unique index medicos_nome_unico on public.medicos (lower(nome));

-- Vínculo do médico com o CNES de cada carreta (vem da ficha do CNES). Um médico pode ter mais de um CBO no mesmo CNES.
create table public.medico_vinculos (
  medico_id uuid not null references public.medicos(id) on delete cascade,
  cnes text not null references public.carretas(cnes) on update cascade,
  cbo text not null check (cbo ~ '^[0-9]{6}$'),
  descricao text not null default '' check (char_length(descricao) <= 120),
  carga_horaria smallint check (carga_horaria between 0 and 168),
  primary key (medico_id, cnes, cbo)
);

-- ---------- Escalas ----------
create table public.acoes (
  id uuid primary key default gen_random_uuid(),
  local text not null check (char_length(local) between 2 and 120),
  data date not null check (data between date '2020-01-01' and date '2100-12-31'),
  criado_por uuid references auth.users(id) on delete set null default auth.uid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users(id) on delete set null
);
create index acoes_data_idx on public.acoes (data);

create table public.alocacoes (
  id uuid primary key default gen_random_uuid(),
  acao_id uuid not null references public.acoes(id) on delete cascade,
  cnes text not null references public.carretas(cnes) on update cascade,
  medico_id uuid not null references public.medicos(id) on delete restrict,
  cbo text not null default '' check (cbo = '' or cbo ~ '^[0-9]{6}$'),
  funcao text not null default '' check (char_length(funcao) <= 40),
  ordem smallint not null default 0,
  unique (acao_id, cnes, medico_id)
);
create index alocacoes_acao_idx on public.alocacoes (acao_id);
create index alocacoes_medico_idx on public.alocacoes (medico_id);

-- ---------- Convites (somente pelas Edge Functions, com service_role) ----------
create table public.convites_cadastro (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  perfil text not null check (perfil in ('administrador','enfermagem')),
  criado_por uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null,
  usado_em timestamptz,
  usado_por uuid references auth.users(id) on delete set null,
  reservado_em timestamptz,
  reserva_id uuid
);
create index convites_cadastro_expira_idx on public.convites_cadastro (expira_em);

-- ---------- Auditoria ----------
create table public.auditoria (
  id bigint generated always as identity primary key,
  quando timestamptz not null default now(),
  autor_id uuid,
  autor_email text,
  acao text not null,
  entidade text not null,
  entidade_id text,
  descricao text not null default '',
  detalhes jsonb not null default '{}'
);
create index auditoria_quando_idx on public.auditoria (quando desc);

-- ---------- Gatilhos: carimbo de alteração e auditoria ----------
create or replace function public.carimbar() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.atualizado_em := now();
  new.atualizado_por := auth.uid();
  return new;
end $$;
create trigger carretas_carimbo before update on public.carretas for each row execute function public.carimbar();
create trigger medicos_carimbo before update on public.medicos for each row execute function public.carimbar();
create trigger acoes_carimbo before update on public.acoes for each row execute function public.carimbar();

create or replace function public.auditar() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_reg jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_desc text;
  v_det jsonb := '{}';
begin
  if auth.uid() is null then return null; end if; -- cargas feitas pelo administrador do banco não entram
  v_desc := case tg_table_name
    when 'acoes' then coalesce(v_reg->>'local','') || ' ' || to_char((v_reg->>'data')::date, 'DD/MM/YYYY')
    when 'medicos' then coalesce(v_reg->>'nome','')
    when 'carretas' then 'CNES ' || coalesce(v_reg->>'cnes','')
    else '' end;
  if tg_op = 'UPDATE' and tg_table_name = 'carretas' then
    v_det := jsonb_build_object('placa_antes', old.placa, 'placa_depois', new.placa);
  end if;
  insert into public.auditoria (autor_id, autor_email, acao, entidade, entidade_id, descricao, detalhes)
  values (auth.uid(), auth.jwt() ->> 'email',
          case tg_op when 'INSERT' then 'criou' when 'UPDATE' then 'alterou' else 'excluiu' end,
          tg_table_name, coalesce(v_reg->>'id', v_reg->>'cnes'), v_desc, v_det);
  return null;
end $$;
revoke all on function public.auditar() from public, anon, authenticated;
create trigger acoes_auditoria after insert or update or delete on public.acoes for each row execute function public.auditar();
create trigger medicos_auditoria after insert or update or delete on public.medicos for each row execute function public.auditar();
create trigger carretas_auditoria after update on public.carretas for each row execute function public.auditar();

-- ---------- Salvar uma ação com todas as alocações, de uma vez ----------
-- Roda com as permissões de quem chama: as regras (RLS) continuam valendo.
create or replace function public.salvar_acao(p_id uuid, p_local text, p_data date, p_alocacoes jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_id uuid;
begin
  if not public.eh_membro() then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  if jsonb_typeof(coalesce(p_alocacoes, '[]')) <> 'array' or jsonb_array_length(coalesce(p_alocacoes, '[]')) > 60 then
    raise exception 'Lista de profissionais inválida.';
  end if;
  if p_id is null then
    insert into public.acoes (local, data) values (trim(p_local), p_data) returning id into v_id;
  else
    update public.acoes set local = trim(p_local), data = p_data where id = p_id returning id into v_id;
    if v_id is null then raise exception 'Ação não encontrada.'; end if;
    delete from public.alocacoes where acao_id = v_id;
  end if;
  insert into public.alocacoes (acao_id, cnes, medico_id, cbo, funcao, ordem)
  select v_id, x.cnes, x.medico_id, coalesce(x.cbo, ''), upper(trim(coalesce(x.funcao, ''))), x.n
  from jsonb_to_recordset(coalesce(p_alocacoes, '[]')) with ordinality as x(cnes text, medico_id uuid, cbo text, funcao text, n bigint);
  return v_id;
end $$;
revoke all on function public.salvar_acao(uuid, text, date, jsonb) from public, anon;
grant execute on function public.salvar_acao(uuid, text, date, jsonb) to authenticated;

-- ---------- Convites: reservar, finalizar, liberar (somente service_role) ----------
create or replace function public.reservar_convite_cadastro(p_hash text, p_reserva uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_perfil text;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Acesso negado.'; end if;
  update public.convites_cadastro set reservado_em = now(), reserva_id = p_reserva
  where token_hash = p_hash and usado_em is null and expira_em > now()
    and (reservado_em is null or reservado_em < now() - interval '5 minutes')
  returning perfil into v_perfil;
  return v_perfil;
end $$;
create or replace function public.finalizar_convite_cadastro(p_hash text, p_reserva uuid, p_user uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Acesso negado.'; end if;
  update public.convites_cadastro set usado_em = now(), usado_por = p_user, reservado_em = null, reserva_id = null
  where token_hash = p_hash and reserva_id = p_reserva and usado_em is null;
  get diagnostics v_count = row_count;
  return v_count = 1;
end $$;
create or replace function public.liberar_convite_cadastro(p_hash text, p_reserva uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Acesso negado.'; end if;
  update public.convites_cadastro set reservado_em = null, reserva_id = null
  where token_hash = p_hash and reserva_id = p_reserva and usado_em is null;
end $$;
revoke all on function public.reservar_convite_cadastro(text, uuid), public.finalizar_convite_cadastro(text, uuid, uuid), public.liberar_convite_cadastro(text, uuid) from public, anon, authenticated;
grant execute on function public.reservar_convite_cadastro(text, uuid), public.finalizar_convite_cadastro(text, uuid, uuid), public.liberar_convite_cadastro(text, uuid) to service_role;

-- Convites gerados por quem perdeu o perfil de administrador (ou foi excluído) vencem na hora.
create or replace function public.vencer_convites_do_autor() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' or new.perfil <> 'administrador' then
    update public.convites_cadastro set expira_em = now()
    where criado_por = old.usuario_id and usado_em is null and expira_em > now();
  end if;
  return null;
end $$;
revoke all on function public.vencer_convites_do_autor() from public, anon, authenticated;
create trigger perfis_vence_convites after update or delete on public.perfis_usuarios
  for each row when (old.perfil = 'administrador') execute function public.vencer_convites_do_autor();

-- ---------- Permissões e RLS ----------
alter table public.perfis_usuarios enable row level security;
alter table public.carretas enable row level security;
alter table public.medicos enable row level security;
alter table public.medico_vinculos enable row level security;
alter table public.acoes enable row level security;
alter table public.alocacoes enable row level security;
alter table public.convites_cadastro enable row level security;
alter table public.auditoria enable row level security;

revoke all on all tables in schema public from public, anon, authenticated;
grant all on all tables in schema public to service_role;
grant select on public.perfis_usuarios, public.auditoria to authenticated;
grant select, update on public.carretas to authenticated;
grant select, insert, update, delete on public.medicos, public.medico_vinculos, public.acoes, public.alocacoes to authenticated;

create policy perfis_ler on public.perfis_usuarios for select to authenticated
  using (usuario_id = (select auth.uid()) or (select public.eh_admin()));

create policy carretas_ler on public.carretas for select to authenticated using ((select public.eh_membro()));
create policy carretas_editar on public.carretas for update to authenticated
  using ((select public.eh_admin())) with check ((select public.eh_admin()));

create policy medicos_ler on public.medicos for select to authenticated using ((select public.eh_membro()));
create policy medicos_incluir on public.medicos for insert to authenticated with check ((select public.eh_admin()));
create policy medicos_editar on public.medicos for update to authenticated using ((select public.eh_admin())) with check ((select public.eh_admin()));
create policy medicos_excluir on public.medicos for delete to authenticated using ((select public.eh_admin()));

create policy vinculos_ler on public.medico_vinculos for select to authenticated using ((select public.eh_membro()));
create policy vinculos_incluir on public.medico_vinculos for insert to authenticated with check ((select public.eh_admin()));
create policy vinculos_editar on public.medico_vinculos for update to authenticated using ((select public.eh_admin())) with check ((select public.eh_admin()));
create policy vinculos_excluir on public.medico_vinculos for delete to authenticated using ((select public.eh_admin()));

create policy acoes_ler on public.acoes for select to authenticated using ((select public.eh_membro()));
create policy acoes_incluir on public.acoes for insert to authenticated with check ((select public.eh_membro()));
create policy acoes_editar on public.acoes for update to authenticated using ((select public.eh_membro())) with check ((select public.eh_membro()));
create policy acoes_excluir on public.acoes for delete to authenticated using ((select public.eh_membro()));

create policy alocacoes_ler on public.alocacoes for select to authenticated using ((select public.eh_membro()));
create policy alocacoes_incluir on public.alocacoes for insert to authenticated with check ((select public.eh_membro()));
create policy alocacoes_editar on public.alocacoes for update to authenticated using ((select public.eh_membro())) with check ((select public.eh_membro()));
create policy alocacoes_excluir on public.alocacoes for delete to authenticated using ((select public.eh_membro()));

create policy auditoria_ler on public.auditoria for select to authenticated using ((select public.eh_admin()));
-- convites_cadastro: nenhuma política para authenticated = nenhum acesso pelo site.

-- Tabelas e funções futuras não ficam abertas por padrão.
alter default privileges in schema public revoke all on tables from public, anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
