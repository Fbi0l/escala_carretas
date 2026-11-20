-- Teste das regras de acesso (RLS) por perfil. Roda dentro de uma transação e DESFAZ tudo no fim (rollback).
-- Uso: colar no SQL Editor do Supabase. O resultado é uma tabela com cada verificação e "ok" true/false.
begin;
create temp table _r(teste text, ok boolean, detalhe text);
grant all on _r to authenticated, anon, service_role;
-- Desde a 006, conta nova só entra com convite reservado para o mesmo e-mail: reserva um para cada usuário de teste.
insert into public.convites_cadastro(token_hash, perfil, expira_em, reservado_em, reserva_id, email_reserva)
select md5(e) || md5(e || 'x'), 'enfermagem', now() + interval '1 hour', now(), gen_random_uuid(), e
from unnest(array['teste-admin@exemplo.invalid','teste-enf@exemplo.invalid','teste-bloq@exemplo.invalid','teste-sem@exemplo.invalid']) e;
insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at) values
 ('00000000-0000-4000-8000-0000000000a1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','teste-admin@exemplo.invalid',now(),now()),
 ('00000000-0000-4000-8000-0000000000e1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','teste-enf@exemplo.invalid',now(),now()),
 ('00000000-0000-4000-8000-0000000000b1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','teste-bloq@exemplo.invalid',now(),now()),
 ('00000000-0000-4000-8000-0000000000c1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','teste-sem@exemplo.invalid',now(),now());
update auth.users set banned_until = now() + interval '1 day' where id = '00000000-0000-4000-8000-0000000000b1';
insert into public.perfis_usuarios(usuario_id, perfil) values
 ('00000000-0000-4000-8000-0000000000a1','administrador'),('00000000-0000-4000-8000-0000000000e1','enfermagem'),('00000000-0000-4000-8000-0000000000b1','enfermagem');

-- Visitante sem login
set local role anon;
do $$ begin
  begin perform count(*) from public.medicos; insert into _r values ('anon não lê médicos', false, 'leu');
  exception when insufficient_privilege then insert into _r values ('anon não lê médicos', true, sqlerrm); end;
  begin perform public.salvar_acao(null,'X',current_date,'[]'); insert into _r values ('anon não salva ação', false, 'salvou');
  exception when others then insert into _r values ('anon não salva ação', true, sqlerrm); end;
end $$;
reset role;

-- Enfermagem
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000e1","role":"authenticated","email":"teste-enf@exemplo.invalid"}';
do $$ declare n int; v uuid; m uuid; begin
  select count(*) into n from public.medicos; insert into _r values ('enfermagem lê médicos', n > 0, n::text);
  select count(*) into n from public.perfis_usuarios; insert into _r values ('enfermagem vê só o próprio perfil', n = 1, n::text);
  select count(*) into n from public.auditoria; insert into _r values ('enfermagem não lê auditoria', n = 0, n::text);
  begin insert into public.medicos(nome) values ('TESTE ENF'); insert into _r values ('enfermagem não cadastra médico', false, 'inseriu');
  exception when insufficient_privilege then insert into _r values ('enfermagem não cadastra médico', true, sqlerrm); end;
  update public.carretas set placa = 'ZZZ0000'; get diagnostics n = row_count; insert into _r values ('enfermagem não altera carreta', n = 0, n::text);
  select id into m from public.medicos order by nome limit 1;
  v := public.salvar_acao(null, 'Teste RLS', date '2026-12-01', jsonb_build_array(jsonb_build_object('cnes','5940176','medico_id',m,'cbo','','funcao','gineco')));
  select count(*) into n from public.alocacoes where acao_id = v and funcao = 'GINECO'; insert into _r values ('enfermagem salva ação', n = 1, n::text);
  perform public.salvar_acao(v, 'Teste RLS 2', date '2026-12-02', '[]'::jsonb);
  select count(*) into n from public.alocacoes where acao_id = v; insert into _r values ('enfermagem edita ação', n = 0, n::text);
  delete from public.acoes where id = v; get diagnostics n = row_count; insert into _r values ('enfermagem exclui ação', n = 1, n::text);
  begin perform * from public.convites_cadastro; insert into _r values ('enfermagem não lê convites', false, 'leu');
  exception when insufficient_privilege then insert into _r values ('enfermagem não lê convites', true, sqlerrm); end;
  begin perform public.reservar_convite_cadastro('x', gen_random_uuid()); insert into _r values ('enfermagem não reserva convite', false, 'executou');
  exception when others then insert into _r values ('enfermagem não reserva convite', true, sqlerrm); end;
end $$;
reset role;

-- Conta bloqueada (perfil enfermagem)
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}';
do $$ declare n int; begin
  select count(*) into n from public.medicos; insert into _r values ('bloqueado não lê nada', n = 0, n::text);
  begin perform public.salvar_acao(null,'X',current_date,'[]'); insert into _r values ('bloqueado não salva', false, 'salvou');
  exception when others then insert into _r values ('bloqueado não salva', true, sqlerrm); end;
end $$;
reset role;

-- Conta sem perfil
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000c1","role":"authenticated"}';
do $$ declare n int; begin
  select count(*) into n from public.acoes; insert into _r values ('sem perfil não lê ações', n = 0, n::text);
end $$;
reset role;

-- Administrador
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated","email":"teste-admin@exemplo.invalid"}';
do $$ declare n int; m uuid; begin
  insert into public.medicos(nome, cns) values ('TESTE ADMIN', '799999999999999') returning id into m;
  insert into public.medico_vinculos(medico_id, cnes, cbo) values (m, '5940176', '225250');
  insert into _r values ('admin cadastra médico e vínculo', true, '');
  update public.carretas set placa = 'ABC1D23' where cnes = '5940176'; get diagnostics n = row_count; insert into _r values ('admin altera carreta', n = 1, n::text);
  select count(*) into n from public.perfis_usuarios; insert into _r values ('admin vê todos os perfis', n >= 3, n::text);
  select count(*) into n from public.auditoria where autor_id = '00000000-0000-4000-8000-0000000000a1'; insert into _r values ('auditoria registra ações do admin', n >= 2, n::text);
  begin delete from public.medicos where id = (select medico_id from public.alocacoes limit 1); insert into _r values ('médico escalado não pode ser excluído', false, 'excluiu');
  exception when foreign_key_violation then insert into _r values ('médico escalado não pode ser excluído', true, 'bloqueado'); end;
end $$;
reset role;

-- Termo de uso (007): cada um aceita só o próprio; bloqueado e visitante não aceitam.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000e1","role":"authenticated","email":"teste-enf@exemplo.invalid"}';
do $$ declare ok boolean; v text; begin
  select public.aceitar_termo('2026-11-20') into ok;
  select termo_versao into v from public.perfis_usuarios where usuario_id = '00000000-0000-4000-8000-0000000000e1';
  insert into _r values ('enfermagem aceita o termo', ok and v = '2026-11-20', coalesce(v, 'nulo'));
  begin update public.perfis_usuarios set termo_versao = '2026-01-01' where usuario_id = '00000000-0000-4000-8000-0000000000a1';
    insert into _r values ('ninguém altera o aceite de outro', not found, 'linhas alteradas: ' || (case when found then 1 else 0 end));
  exception when insufficient_privilege then insert into _r values ('ninguém altera o aceite de outro', true, sqlerrm); end;
  begin perform public.aceitar_termo('qualquer'); insert into _r values ('versão inválida é recusada', false, 'aceitou');
  exception when others then insert into _r values ('versão inválida é recusada', true, sqlerrm); end;
end $$;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated","email":"teste-bloq@exemplo.invalid"}';
do $$ begin
  begin perform public.aceitar_termo('2026-11-20'); insert into _r values ('bloqueado não aceita o termo', false, 'aceitou');
  exception when others then insert into _r values ('bloqueado não aceita o termo', true, sqlerrm); end;
end $$;
reset role;
set local role anon;
do $$ begin
  begin perform public.aceitar_termo('2026-11-20'); insert into _r values ('visitante não aceita o termo', false, 'aceitou');
  exception when others then insert into _r values ('visitante não aceita o termo', true, sqlerrm); end;
end $$;
reset role;

-- Convite só vale enquanto quem o gerou for administrador ativo (migração 009).
insert into public.convites_cadastro(token_hash, perfil, criado_por, expira_em) values
 ('teste-conv-admin', 'administrador', '00000000-0000-4000-8000-0000000000a1', now() + interval '1 hour'),
 ('teste-conv-enf',   'administrador', '00000000-0000-4000-8000-0000000000e1', now() + interval '1 hour'),
 ('teste-conv-bloq',  'administrador', '00000000-0000-4000-8000-0000000000b1', now() + interval '1 hour');
update public.perfis_usuarios set perfil = 'administrador' where usuario_id = '00000000-0000-4000-8000-0000000000b1';
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
do $$ declare p text; begin
  p := public.reservar_convite_cadastro('teste-conv-admin', gen_random_uuid());
  insert into _r values ('convite de administrador ativo vale', p = 'administrador', coalesce(p, 'null'));
  p := public.reservar_convite_cadastro('teste-conv-enf', gen_random_uuid());
  insert into _r values ('convite de quem não é mais administrador não vale', p is null, coalesce(p, 'null'));
  p := public.reservar_convite_cadastro('teste-conv-bloq', gen_random_uuid());
  insert into _r values ('convite de administrador bloqueado não vale', p is null, coalesce(p, 'null'));
end $$;
reset role;

select * from _r;
rollback;
