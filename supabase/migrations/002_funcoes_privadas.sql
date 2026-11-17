-- 1.0.1: as funções de checagem de perfil saem da API pública (esquema "privado", não exposto pelo Supabase).
-- As regras (RLS) continuam usando as mesmas funções.
create schema if not exists privado;
revoke all on schema privado from public, anon;
grant usage on schema privado to authenticated, service_role;

alter function public.meu_perfil() set schema privado;
alter function public.eh_membro() set schema privado;
alter function public.eh_admin() set schema privado;

create or replace function privado.eh_membro() returns boolean
language sql stable security definer set search_path = '' as $$ select privado.meu_perfil() is not null $$;
create or replace function privado.eh_admin() returns boolean
language sql stable security definer set search_path = '' as $$ select coalesce(privado.meu_perfil() = 'administrador', false) $$;

create or replace function public.salvar_acao(p_id uuid, p_local text, p_data date, p_alocacoes jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_id uuid;
begin
  if not privado.eh_membro() then raise exception 'Sem permissão.' using errcode = '42501'; end if;
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
