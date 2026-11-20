/* Supabase FALSO para os testes no navegador (tests/navegador/teste.mjs).
   Substitui vendor/supabase-*.js: nada sai para a internet e os dados são fictícios.
   O cenário vem de window.__cenario (definido pelo teste antes de a página carregar). */
(function () {
  'use strict';
  const cen = Object.assign({ logado: false, perfil: 'administrador', termo: null, senha: 'senha-correta' }, window.__cenario || {});
  const chamadas = window.__chamadas = [];
  const hoje = new Date(), ym = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
  const usuario = { id: '00000000-0000-4000-8000-000000000001', email: 'teste@exemplo.invalid', user_metadata: { full_name: 'Pessoa de Teste' } };
  const carretas = [
    { cnes: '1000001', nome: 'CARRETA MULHER I', placa: 'ABC1D23', placa_confirmada: true, ordem: 1, ficha_data: '2026-11-01' },
    { cnes: '1000002', nome: 'CARRETA MULHER II', placa: 'ABC1D24', placa_confirmada: true, ordem: 2, ficha_data: '2026-11-01' },
    { cnes: '1000003', nome: 'CARRETA MULHER III', placa: '', placa_confirmada: false, ordem: 3, ficha_data: null },
    { cnes: '1000004', nome: 'CARRETA TOMOGRAFIA', placa: 'ABC1D25', placa_confirmada: true, ordem: 4, ficha_data: '2026-11-01' }
  ];
  const medicos = [
    { id: 'm1', nome: 'MEDICA EXEMPLO UM', cns: '700000000000001', funcao: 'GINECO', obs: '', cbo_manual: '', origem: 'teste',
      medico_vinculos: [{ cnes: '1000001', cbo: '225250', descricao: 'MEDICO GINECOLOGISTA E OBSTETRA', carga_horaria: 20 }] },
    { id: 'm2', nome: 'MEDICO EXEMPLO DOIS', cns: '700000000000002', funcao: 'RADIO', obs: '', cbo_manual: '', origem: 'teste',
      medico_vinculos: [{ cnes: '1000004', cbo: '225320', descricao: 'MEDICO EM RADIOLOGIA E DIAGNOSTICO POR IMAGEM', carga_horaria: 20 }] }
  ];
  const acoes = [{ id: 'a1', local: 'Município Exemplo', data: `${ym}-05`, atualizado_em: `${ym}-01T12:00:00Z`,
    alocacoes: [{ id: 'l1', cnes: '1000001', medico_id: 'm1', cbo: '225250', funcao: 'GINECO', ordem: 0 },
                { id: 'l2', cnes: '1000004', medico_id: 'm2', cbo: '225320', funcao: 'RADIO', ordem: 1 }] }];
  const tabelas = {
    carretas, medicos, acoes,
    auditoria: [{ quando: `${ym}-01T12:00:00Z`, autor_email: 'teste@exemplo.invalid', acao: 'update', entidade: 'acoes', descricao: 'Teste' }],
    perfis_usuarios: () => [{ perfil: cen.perfil, nome: 'Pessoa de Teste', termo_versao: cen.termo }]
  };

  let ouvinte = null;
  const sessao = () => ({ user: usuario, access_token: 'falso' });
  const avisar = (ev, s) => setTimeout(() => ouvinte && ouvinte(ev, s), 0);

  function consulta(tabela) {
    let dados = typeof tabelas[tabela] === 'function' ? tabelas[tabela]() : (tabelas[tabela] || []);
    const q = {
      select: () => q, order: () => q, eq: () => q, gte: () => q, lte: () => q, update: () => q,
      delete: () => { chamadas.push({ tipo: 'delete', tabela }); return q; },
      limit: n => { dados = dados.slice(0, n); return q; },
      maybeSingle: async () => ({ data: dados[0] || null, error: null }),
      single: async () => ({ data: dados[0] || null, error: null }),
      then: (ok, erro) => Promise.resolve({ data: dados, error: null }).then(ok, erro)
    };
    return q;
  }

  window.supabase = {
    createClient: () => ({
      auth: {
        onAuthStateChange: cb => { ouvinte = cb; avisar('INITIAL_SESSION', cen.logado ? sessao() : null); return { data: { subscription: { unsubscribe() {} } } }; },
        getSession: async () => ({ data: { session: cen.logado ? sessao() : null } }),
        signInWithPassword: async ({ password }) => {
          chamadas.push({ tipo: 'login' });
          if (password !== cen.senha) return { data: null, error: { message: 'Invalid login credentials' } };
          cen.logado = true; avisar('SIGNED_IN', sessao()); return { data: { session: sessao() }, error: null };
        },
        signOut: async () => { cen.logado = false; avisar('SIGNED_OUT', null); return { error: null }; }
      },
      from: consulta,
      rpc: async (nome, args) => {
        chamadas.push({ tipo: 'rpc', nome, args });
        if (nome === 'aceitar_termo') { cen.termo = args.p_versao; return { data: true, error: null }; }
        return { data: 'a1', error: null };
      },
      functions: {
        invoke: async (nome, { body } = {}) => {
          chamadas.push({ tipo: 'funcao', nome, acao: body && body.action });
          if (body && body.action === 'list') return { data: { users: [{ id: usuario.id, email: usuario.email, nome: 'Pessoa de Teste', perfil: cen.perfil, last_sign_in_at: `${ym}-01T12:00:00Z`, banned_until: null, eu: true }] }, error: null };
          if (body && body.action === 'list_invites') return { data: { invites: [] }, error: null };
          return { data: {}, error: null };
        }
      }
    })
  };
})();
