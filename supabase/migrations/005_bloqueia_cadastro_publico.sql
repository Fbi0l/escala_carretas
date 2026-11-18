-- Cadastro público desligado pelo banco: toda conta nova precisa vir do cadastro por convite
-- (função register-user), que grava app_metadata.cadastro = 'convite'. Só o servidor (service_role)
-- consegue gravar app_metadata; quem se cadastra pela chave pública só controla user_metadata.
create or replace function privado.exigir_cadastro_por_convite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(new.raw_app_meta_data ->> 'cadastro', '') <> 'convite' then
    raise exception 'Cadastro só por convite.' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function privado.exigir_cadastro_por_convite() from public, anon, authenticated;

drop trigger if exists exigir_cadastro_por_convite on auth.users;
create trigger exigir_cadastro_por_convite
  before insert on auth.users
  for each row execute function privado.exigir_cadastro_por_convite();

-- O Auth (supabase_auth_admin) grava em auth.users e dispara a regra acima.
grant usage on schema privado to supabase_auth_admin;
grant execute on function privado.exigir_cadastro_por_convite() to supabase_auth_admin;
