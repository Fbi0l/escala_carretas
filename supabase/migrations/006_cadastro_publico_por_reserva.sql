-- Correção da 005: o Auth grava app_metadata só depois de criar a conta, então a marca não serve.
-- Agora a conta nova só é aceita se houver um convite válido reservado, há menos de 5 minutos,
-- para esse mesmo e-mail. Quem reserva e grava o e-mail é a função register-user (service_role).
alter table public.convites_cadastro add column if not exists email_reserva text;

create or replace function privado.exigir_cadastro_por_convite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.convites_cadastro c
    where c.reserva_id is not null
      and c.usado_em is null
      and c.expira_em > now()
      and c.reservado_em > now() - interval '5 minutes'
      and c.email_reserva = lower(new.email)
  ) then
    raise exception 'Cadastro só por convite.' using errcode = '42501';
  end if;
  return new;
end;
$$;
