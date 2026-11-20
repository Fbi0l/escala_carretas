-- Termo de uso da equipe (LGPD, 1.2.0): cada usuário aceita o termo no primeiro acesso e de novo
-- sempre que a versão mudar. Guarda a versão e a data do aceite no próprio perfil.
alter table public.perfis_usuarios
  add column if not exists termo_versao text check (termo_versao is null or termo_versao ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  add column if not exists termo_aceito_em timestamptz;

-- O usuário não altera o próprio perfil (sem política de UPDATE). Esta função grava só o aceite,
-- só da linha de quem está logado e só para contas ativas (bloqueado não aceita).
create or replace function public.aceitar_termo(p_versao text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare n int;
begin
  if p_versao is null or p_versao !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception 'Versão do termo inválida.' using errcode = '22023';
  end if;
  if not privado.eh_membro() then
    raise exception 'Sem acesso.' using errcode = '42501';
  end if;
  update public.perfis_usuarios
     set termo_versao = p_versao, termo_aceito_em = now()
   where usuario_id = (select auth.uid());
  get diagnostics n = row_count;
  return n = 1;
end;
$$;
revoke all on function public.aceitar_termo(text) from public, anon;
grant execute on function public.aceitar_termo(text) to authenticated;
