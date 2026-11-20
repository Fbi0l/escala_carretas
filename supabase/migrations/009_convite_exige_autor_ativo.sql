-- Auditoria de segurança do código (20/11/2026): bloquear um administrador não cancelava os convites dele.
-- Agora um convite só é aceito se quem o gerou ainda for administrador ativo (não bloqueado nem excluído).
-- Vale também para rebaixamento e exclusão, além do gatilho perfis_vence_convites.
create or replace function public.reservar_convite_cadastro(p_hash text, p_reserva uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_perfil text;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Acesso negado.'; end if;
  update public.convites_cadastro c set reservado_em = now(), reserva_id = p_reserva
  where c.token_hash = p_hash and c.usado_em is null and c.expira_em > now()
    and (c.reservado_em is null or c.reservado_em < now() - interval '5 minutes')
    and exists (
      select 1 from public.perfis_usuarios p join auth.users u on u.id = p.usuario_id
      where p.usuario_id = c.criado_por and p.perfil = 'administrador'
        and (u.banned_until is null or u.banned_until < now()) and u.deleted_at is null)
  returning c.perfil into v_perfil;
  return v_perfil;
end $$;
revoke all on function public.reservar_convite_cadastro(text, uuid) from public, anon, authenticated;
grant execute on function public.reservar_convite_cadastro(text, uuid) to service_role;
