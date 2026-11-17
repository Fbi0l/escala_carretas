-- 1.0.3: salvar médico e vínculos de uma vez só (tudo ou nada). Roda com as permissões de quem chama:
-- só administradores passam pelas regras de médicos e vínculos.
create or replace function public.salvar_medico(p_id uuid, p_nome text, p_cns text, p_funcao text, p_obs text, p_cbo_manual text, p_vinculos jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_id uuid;
begin
  if not privado.eh_admin() then raise exception 'Somente administradores alteram o cadastro de médicos.' using errcode = '42501'; end if;
  if jsonb_typeof(coalesce(p_vinculos, '[]')) <> 'array' or jsonb_array_length(coalesce(p_vinculos, '[]')) > 40 then
    raise exception 'Lista de vínculos inválida.';
  end if;
  if p_id is null then
    insert into public.medicos (nome, cns, funcao, obs, cbo_manual, origem)
    values (upper(trim(p_nome)), nullif(trim(p_cns), ''), upper(trim(coalesce(p_funcao, ''))), trim(coalesce(p_obs, '')), coalesce(p_cbo_manual, ''), 'Cadastro manual')
    returning id into v_id;
  else
    update public.medicos set nome = upper(trim(p_nome)), cns = nullif(trim(p_cns), ''), funcao = upper(trim(coalesce(p_funcao, ''))),
      obs = trim(coalesce(p_obs, '')), cbo_manual = coalesce(p_cbo_manual, '')
    where id = p_id returning id into v_id;
    if v_id is null then raise exception 'Médico não encontrado.'; end if;
    delete from public.medico_vinculos where medico_id = v_id;
  end if;
  insert into public.medico_vinculos (medico_id, cnes, cbo, descricao, carga_horaria)
  select distinct on (x.cnes, x.cbo) v_id, x.cnes, x.cbo, upper(coalesce(x.descricao, '')), x.carga_horaria
  from jsonb_to_recordset(coalesce(p_vinculos, '[]')) as x(cnes text, cbo text, descricao text, carga_horaria smallint);
  return v_id;
end $$;
revoke all on function public.salvar_medico(uuid, text, text, text, text, text, jsonb) from public, anon;
grant execute on function public.salvar_medico(uuid, text, text, text, text, text, jsonb) to authenticated;
