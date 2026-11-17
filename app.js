/* Escala das Carretas — aplicação. Perfis: administrador (tudo) e enfermagem (escalas e relatórios).
   As permissões reais ficam no banco (RLS); aqui a interface só esconde o que o perfil não pode fazer. */
(function () {
  'use strict';
  const C = window.ESCALA_CONFIG, R = window.Relatorio;
  const sb = window.supabase.createClient(C.supabaseUrl, C.supabaseKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'escala-carretas-auth' }
  });

  /* ---------- utilidades ---------- */
  const $ = (s, el = document) => el.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const ic = (n, cls = 'i') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
  const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  const FUNCOES = ['MASTO', 'GINECO', 'USG', 'MAMOGRAFIA', 'TOMOGRAFIA', 'CLÍNICO'];
  const CORES = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)'];
  const PREF_CBO = { MASTO: '225255', GINECO: '225250', USG: '225320', TOMOGRAFIA: '225320', MAMOGRAFIA: '225320', 'CLÍNICO': '225125' };
  const pad = n => String(n).padStart(2, '0');
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const hoje = () => iso(new Date());
  const parseData = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDias = (s, n) => { const d = parseData(s); d.setDate(d.getDate() + n); return iso(d); };
  const addMes = (ym, n) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
  const fimMes = ym => { const [y, m] = ym.split('-').map(Number); return iso(new Date(y, m, 0)); };
  const dataLonga = s => { const d = parseData(s); return `${DIAS[d.getDay()]}, ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`; };
  const dataHora = s => s ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Belem' }).format(new Date(s)) : '—';
  const mesTitulo = ym => { const t = R.nomeMes(ym); return t.charAt(0).toUpperCase() + t.slice(1); };
  const iniciais = s => (String(s || '').trim().split(/\s+/).filter(Boolean).map(p => p[0]).slice(0, 2).join('') || '?').toUpperCase();
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
  const ler = k => { try { return localStorage.getItem(k); } catch (_) { return null; } };
  const gravar = (k, v) => { try { localStorage.setItem(k, v); } catch (_) { /* sem armazenamento */ } };

  let toastT;
  function toast(msg, erro = false) {
    const root = $('#toast-root'); root.innerHTML = '';
    const t = document.createElement('div'); t.className = 'toast' + (erro ? ' err' : ''); t.textContent = msg;
    root.appendChild(t); clearTimeout(toastT); toastT = setTimeout(() => t.remove(), erro ? 6000 : 3200);
  }
  function msgErro(e, padrao = 'Não foi possível concluir. Tente de novo.') {
    const m = String(e?.message || e || '');
    if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Sem conexão com o servidor. Verifique a internet.';
    if (/JWT|session|token/i.test(m) && /expired|invalid/i.test(m)) return 'Sua sessão expirou. Entre novamente.';
    if (e?.code === '42501' || /row-level security|permission denied|Sem permissão|Somente administradores/i.test(m)) return 'Você não tem permissão para isso.';
    if (e?.code === '23503' && /medicos|alocacoes/i.test(m)) return 'Este médico está em escalas salvas e não pode ser excluído.';
    if (e?.code === '23505' && /cns/i.test(m)) return 'Já existe um médico com este CNS.';
    if (e?.code === '23505' && /nome/i.test(m)) return 'Já existe um médico com este nome.';
    if (e?.code === '23514') return 'Algum campo está fora do formato esperado. Confira e tente de novo.';
    return m && m.length < 160 && !/^\{/.test(m) ? m : padrao;
  }

  /* ---------- estado ---------- */
  const S = {
    eu: null, carretas: [], medicos: new Map(), acoes: [], mesesCarregados: new Set(),
    vista: 'escalas', mes: hoje().slice(0, 7), busca: '', filtroMed: 'todos', modal: null,
    rep: { placa: true, nomeCarreta: false, cbo: true, funcao: true }, ultimaCarga: 0
  };
  try { Object.assign(S.rep, JSON.parse(ler('escala.rep') || '{}')); } catch (_) { /* padrão */ }
  const admin = () => S.eu?.perfil === 'administrador';
  const carreta = cnes => S.carretas.find(c => c.cnes === cnes);
  const cor = cnes => CORES[Math.max(0, S.carretas.findIndex(c => c.cnes === cnes)) % 4];
  const curto = c => { const n = (c?.nome || '').toUpperCase(); if (n.includes('TOMOGRAFIA')) return 'Tomografia'; const m = n.match(/MULHER\s+(I{1,3}|\d)/); return m ? `Mulher ${m[1]}` : (c?.nome || c?.cnes || ''); };
  const vinculos = (m, cnes) => (m?.medico_vinculos || []).filter(v => v.cnes === cnes);
  const acoesDoMes = ym => S.acoes.filter(a => a.data.slice(0, 7) === ym).sort((a, b) => b.data.localeCompare(a.data));

  /* ---------- dados ---------- */
  async function carregarBase() {
    const [c, m] = await Promise.all([
      sb.from('carretas').select('cnes,nome,placa,placa_confirmada,ordem,ficha_data').order('ordem'),
      sb.from('medicos').select('id,nome,cns,funcao,obs,cbo_manual,origem,medico_vinculos(cnes,cbo,descricao,carga_horaria)').order('nome')
    ]);
    if (c.error) throw c.error; if (m.error) throw m.error;
    S.carretas = c.data; S.medicos = new Map(m.data.map(x => [x.id, x]));
  }
  async function carregarMes(ym, forcar = false) {
    if (!forcar && S.mesesCarregados.has(ym)) return;
    const { data, error } = await sb.from('acoes').select('id,local,data,atualizado_em,alocacoes(id,cnes,medico_id,cbo,funcao,ordem)')
      .gte('data', ym + '-01').lte('data', fimMes(ym)).order('data', { ascending: false });
    if (error) throw error;
    S.acoes = S.acoes.filter(a => a.data.slice(0, 7) !== ym).concat(data.map(a => ({ ...a, alocacoes: (a.alocacoes || []).sort((x, y) => x.ordem - y.ordem) })));
    S.mesesCarregados.add(ym); S.ultimaCarga = Date.now();
  }
  async function ultimoMesComEscala() {
    const { data } = await sb.from('acoes').select('data').order('data', { ascending: false }).limit(1);
    return data && data[0] ? data[0].data.slice(0, 7) : null;
  }

  /* ---------- problemas de CNES ---------- */
  function problemas(acao, al) {
    const out = []; const m = S.medicos.get(al.medico_id);
    if (!m) return [{ n: 'err', t: 'Médico removido' }];
    const v = vinculos(m, al.cnes);
    if (!v.length) out.push({ n: 'err', t: 'Sem vínculo neste CNES' });
    else if (al.cbo && !v.some(x => x.cbo === al.cbo)) out.push({ n: 'err', t: `CBO ${al.cbo} não está no CNES` });
    if (!al.cbo && v.length) out.push({ n: 'warn', t: 'Sem CBO' });
    const mesmo = acao.alocacoes.filter(x => x.medico_id === al.medico_id);
    if (new Set(mesmo.map(x => x.cnes)).size > 1) out.push({ n: 'warn', t: 'Em 2 carretas no mesmo dia' });
    return out;
  }

  /* ---------- roteamento ---------- */
  const VISTAS = ['escalas', 'relatorio', 'medicos', 'carretas', 'usuarios'];
  function lerHash() {
    const h = decodeURIComponent((location.hash || '').slice(1));
    const [v, mes] = h.split('/');
    return { vista: VISTAS.includes(v) ? v : 'escalas', mes: /^\d{4}-\d{2}$/.test(mes || '') ? mes : null };
  }
  function irPara(vista, mes) {
    const h = '#' + vista + ((vista === 'escalas' || vista === 'relatorio') ? '/' + (mes || S.mes) : '');
    if (location.hash !== h) location.hash = h; else rotear();
  }
  async function rotear() {
    if (!S.eu) return;
    const { vista, mes } = lerHash();
    S.vista = vista === 'usuarios' && !admin() ? 'escalas' : vista;
    if (mes) S.mes = mes;
    document.querySelectorAll('[data-nav]').forEach(a => a.dataset.nav === S.vista ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'));
    fecharMenus();
    try {
      if (S.vista === 'escalas' || S.vista === 'relatorio') await carregarMes(S.mes);
    } catch (e) { toast(msgErro(e), true); }
    render();
  }

  /* ---------- render ---------- */
  function render() {
    const faixa = $('#faixa'), main = $('#conteudo');
    ({ escalas: vEscalas, relatorio: vRelatorio, medicos: vMedicos, carretas: vCarretas, usuarios: vUsuarios })[S.vista](faixa, main);
  }
  function faixaMes(atual) {
    const lista = acoesDoMes(S.mes);
    const n = lista.reduce((t, a) => t + a.alocacoes.length, 0);
    return `<div class="mes-nav">
        <a class="btn icon" href="#${atual}/${addMes(S.mes, -1)}" aria-label="Mês anterior">${ic('left')}</a>
        <h1 aria-live="polite">${esc(mesTitulo(S.mes))}</h1>
        <a class="btn icon" href="#${atual}/${addMes(S.mes, 1)}" aria-label="Próximo mês">${ic('right')}</a>
      </div>
      <span class="resumo num">${plural(lista.length, 'ação', 'ações')} · ${plural(n, 'escala', 'escalas')}</span>
      <nav class="seg" aria-label="Visão do mês">
        <a href="#escalas/${S.mes}" ${atual === 'escalas' ? 'aria-current="page"' : ''}>${ic('cal')}Escalas</a>
        <a href="#relatorio/${S.mes}" ${atual === 'relatorio' ? 'aria-current="page"' : ''}>${ic('doc')}Relatório</a>
      </nav>
      ${atual === 'escalas' ? `<span class="so-desktop"><button class="btn primary" type="button" data-acao="nova-acao">${ic('plus')}Nova escala</button></span>` : ''}`;
  }

  const voltar = () => `<a class="btn ghost so-desktop" href="#escalas/${S.mes}">${ic('left')}Escalas</a>`;
  function vEscalas(faixa, main) {
    faixa.innerHTML = faixaMes('escalas');
    const lista = acoesDoMes(S.mes);
    main.innerHTML = (lista.length ? lista.map(cardAcao).join('') : `<div class="card vazio">
        <h2>Nenhuma escala em ${esc(R.nomeMes(S.mes))}</h2>
        <p>Cadastre a primeira ação do mês para montar a divisão das carretas.</p>
        <p><button class="btn primary" type="button" data-acao="nova-acao">${ic('plus')}Nova escala</button>
        <button class="btn" type="button" data-acao="ultimo-mes">Ver o último mês com escala</button></p></div>`)
      + `<button class="fab" type="button" data-acao="nova-acao" aria-label="Nova escala">${ic('plus')}</button>`;
  }
  function cardAcao(a) {
    const d = parseData(a.data);
    const nErr = a.alocacoes.reduce((n, al) => n + problemas(a, al).filter(p => p.n === 'err').length, 0);
    return `<article class="card acao">
      <div class="acao-h">
        <div class="data-box" aria-hidden="true"><b>${pad(d.getDate())}</b><span>${R.MESES[d.getMonth()].slice(0, 3)}</span></div>
        <div><h2 class="acao-t">${esc(a.local)}</h2>
          <div class="small muted">${esc(dataLonga(a.data))} · ${plural(a.alocacoes.length, 'profissional', 'profissionais')}
          ${nErr ? ` · <span class="chip err">${plural(nErr, 'pendência', 'pendências')} de CNES</span>` : ''}</div></div>
        <div class="acao-btns">
          <button class="btn ghost sm" type="button" data-acao="editar-acao" data-id="${esc(a.id)}">Editar</button>
          <button class="btn ghost sm" type="button" data-acao="duplicar-acao" data-id="${esc(a.id)}" title="Copiar a escala para outro dia">Duplicar</button>
          <button class="btn ghost sm danger" type="button" data-acao="excluir-acao" data-id="${esc(a.id)}">Excluir</button>
        </div>
      </div>
      <div class="cgrid">${S.carretas.map(c => {
        const itens = a.alocacoes.filter(x => x.cnes === c.cnes);
        return `<div class="ccol"><h3><span class="dot" style="background:${cor(c.cnes)}"></span>${esc(curto(c))} <span class="muted" style="font-weight:500">· ${esc(c.cnes)}</span></h3>
          ${itens.length ? `<ul>${itens.map(al => {
            const m = S.medicos.get(al.medico_id);
            return `<li><span class="nm">${esc(m?.nome || '(removido)')}</span><span class="meta">
              ${al.funcao ? `<span class="chip acc">${esc(al.funcao)}</span>` : ''}
              ${al.cbo ? `<span class="chip" title="${esc(R.cboNome(al.cbo))}">CBO ${esc(al.cbo)}</span>` : ''}
              ${problemas(a, al).map(p => `<span class="chip ${p.n}">${esc(p.t)}</span>`).join('')}</span></li>`;
          }).join('')}</ul>` : '<div class="vazio-col">—</div>'}</div>`;
      }).join('')}</div></article>`;
  }

  /* --- Relatório --- */
  function ctxRel() { return { acoes: S.acoes, carretas: S.carretas, medicos: S.medicos, opcoes: S.rep }; }
  function vRelatorio(faixa, main) {
    faixa.innerHTML = faixaMes('relatorio');
    const blocos = R.montar(S.mes, ctxRel());
    const grupos = new Map();
    acoesDoMes(S.mes).forEach(a => a.alocacoes.forEach(al => problemas(a, al).forEach(p => {
      const k = al.medico_id + '|' + p.t;
      if (!grupos.has(k)) grupos.set(k, { n: p.n, nome: S.medicos.get(al.medico_id)?.nome || '?', t: p.t, onde: new Set() });
      grupos.get(k).onde.add(`${R.dataCurta(a.data).slice(0, 5)} CNES ${al.cnes}`);
    })));
    const avisos = [...grupos.values()].sort((a, b) => (a.n === 'err' ? 0 : 1) - (b.n === 'err' ? 0 : 1));
    const opt = (k, t) => `<label class="check"><input type="checkbox" data-rep="${k}" ${S.rep[k] ? 'checked' : ''}> ${t}</label>`;
    const nEsc = blocos.reduce((n, b) => n + b.carretas.reduce((k, c) => k + c.linhas.length, 0), 0);
    main.innerHTML = !blocos.length ? `<div class="card vazio"><h2>Sem escalas em ${esc(R.nomeMes(S.mes))}</h2><p>O relatório aparece quando houver ações cadastradas no mês.</p></div>` : `
      <div class="rel">
        <aside class="card rel-side">
          <span class="lbl">Mostrar no relatório</span>
          ${opt('placa', 'Placa da carreta')}${opt('nomeCarreta', 'Nome da carreta')}${opt('cbo', 'CBO e descrição')}${opt('funcao', 'Função (MASTO, GINECO, USG…)')}
          <button class="btn primary" type="button" data-acao="baixar-word">${ic('down')}Baixar Word (.docx)</button>
          <button class="btn" type="button" data-acao="copiar" data-whats="0">${ic('copy')}Copiar texto</button>
          <button class="btn" type="button" data-acao="copiar" data-whats="1">${ic('copy')}Copiar para WhatsApp</button>
          <span class="small muted num">${plural(blocos.length, 'ação', 'ações')} · ${plural(nEsc, 'escala', 'escalas')}</span>
        </aside>
        <section>
          <div class="avisos">${avisos.length ? avisos.slice(0, 15).map(g => `<div class="aviso ${g.n}">${ic('alert')}<span><b>${esc(g.nome)}</b>: ${esc(g.t)} <span style="opacity:.85">(${esc([...g.onde].join(' · '))})</span></span></div>`).join('')
            + (avisos.length > 15 ? `<p class="small muted">E mais ${avisos.length - 15} avisos.</p>` : '')
            : `<div class="aviso ok">${ic('check')}<span>Todos os médicos estão vinculados ao CNES da carreta em que foram escalados.</span></div>`}</div>
          <div class="papel" id="papel">
            <h2>${esc(R.titulo(S.mes))}</h2>
            ${blocos.map(b => `<h3>${esc(b.titulo)}</h3>${b.carretas.map(c => `<div class="cn">• ${esc(c.cab)}</div>${c.linhas.map(l => `<div class="ln">- ${esc(l)}</div>`).join('')}`).join('')}`).join('')}
          </div>
        </section>
      </div>`;
  }
  async function baixarWord(btn) {
    const rot = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Gerando…';
    try {
      const { blob, nome } = await R.word(S.mes, ctxRel());
      const url = URL.createObjectURL(blob); const a = document.createElement('a');
      a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000); toast('Arquivo Word baixado.');
    } catch (e) { toast(msgErro(e, 'Não foi possível gerar o Word.'), true); }
    finally { btn.disabled = false; btn.innerHTML = rot; }
  }
  async function copiar(whats) {
    const txt = R.texto(S.mes, ctxRel(), whats);
    try { await navigator.clipboard.writeText(txt); toast(whats ? 'Texto copiado. Cole no WhatsApp.' : 'Texto copiado.'); }
    catch (_) {
      abrirModal(`<div class="modal estreito" role="dialog" aria-modal="true" aria-labelledby="cpT"><div class="modal-h"><h2 id="cpT">Copiar texto</h2></div>
        <div class="modal-b"><p class="small muted" style="margin:0">Selecione tudo e copie (Ctrl+C).</p><textarea class="input" rows="16" readonly id="cpTa">${esc(txt)}</textarea></div>
        <div class="modal-f"><button class="btn" type="button" data-acao="fechar">Fechar</button></div></div>`);
      $('#cpTa').select();
    }
  }

  /* --- Médicos --- */
  function vMedicos(faixa, main) {
    faixa.innerHTML = `${voltar()}<h1 class="titulo-pag">Médicos <span class="muted num" style="font-weight:500;font-size:16px">${S.medicos.size}</span></h1>
      ${admin() ? `<button class="btn primary" type="button" data-acao="novo-medico" style="margin-left:auto">${ic('plus')}Novo médico</button>` : ''}`;
    const q = norm(S.busca);
    const usados = new Set(S.acoes.flatMap(a => a.alocacoes.map(x => x.medico_id)));
    let lista = [...S.medicos.values()];
    if (S.filtroMed === 'semvinculo') lista = lista.filter(m => !m.medico_vinculos.length);
    if (S.filtroMed === 'tomografia') lista = lista.filter(m => m.medico_vinculos.some(v => v.cnes === '8121435'));
    if (q) lista = lista.filter(m => norm(m.nome).includes(q) || (m.cns || '').includes(q) || m.medico_vinculos.some(v => v.cbo.includes(q)) || norm(m.funcao).includes(q));
    main.innerHTML = `<div class="barra">
        <input id="buscaMed" class="input" type="search" placeholder="Buscar nome, CNS, CBO ou função…" aria-label="Buscar médico" autocomplete="off" spellcheck="false" value="${esc(S.busca)}">
        <select id="filtroMed" class="input" style="flex:0 1 240px" aria-label="Filtrar médicos">
          <option value="todos" ${S.filtroMed === 'todos' ? 'selected' : ''}>Todos</option>
          <option value="semvinculo" ${S.filtroMed === 'semvinculo' ? 'selected' : ''}>Sem vínculo no CNES</option>
          <option value="tomografia" ${S.filtroMed === 'tomografia' ? 'selected' : ''}>Vinculados à tomografia</option>
        </select>
        <span class="small muted num">${plural(lista.length, 'médico', 'médicos')}</span></div>
      <div class="card tabela cartoes">${lista.length ? `<table><thead><tr><th>Nome</th><th>CNS</th><th>CBO no CNES</th><th>Carretas</th><th>Função</th></tr></thead><tbody>
      ${lista.map(m => {
        const cbos = [...new Map(m.medico_vinculos.map(v => [v.cbo, v])).values()];
        const cars = S.carretas.filter(c => vinculos(m, c.cnes).length);
        return `<tr>
          <td><button type="button" class="linkbtn" data-acao="abrir-medico" data-id="${esc(m.id)}">${esc(m.nome)}</button>${m.obs ? `<div class="small muted">${esc(m.obs)}</div>` : ''}</td>
          <td class="num small" data-rot="CNS">${esc(m.cns || '—')}</td>
          <td data-rot="CBO"><span class="chips">${cbos.length ? cbos.map(v => `<span class="chip" title="${esc(R.cboNome(v.cbo, v.descricao))}">${esc(v.cbo)} · ${esc(R.cboNome(v.cbo, v.descricao))}</span>`).join('') : (m.cbo_manual ? `<span class="chip warn">${esc(m.cbo_manual)} (manual)</span>` : '<span class="chip err">Sem vínculo</span>')}</span></td>
          <td data-rot="Carretas"><span class="chips">${cars.map(c => `<span class="chip"><span class="dot" style="background:${cor(c.cnes)}"></span>${esc(curto(c))}</span>`).join('') || '—'}</span></td>
          <td data-rot="Função">${m.funcao ? `<span class="chip acc">${esc(m.funcao)}</span>` : '<span class="muted">—</span>'}${usados.has(m.id) ? '' : ''}</td></tr>`;
      }).join('')}</tbody></table>` : '<div class="vazio">Nenhum médico encontrado.</div>'}</div>`;
  }

  /* --- Carretas --- */
  function vCarretas(faixa, main) {
    faixa.innerHTML = `${voltar()}<h1 class="titulo-pag">Carretas</h1>`;
    const ro = admin() ? '' : 'readonly';
    main.innerHTML = `<p class="muted" style="margin-top:0">${admin() ? 'O CNES é fixo. Nome e placa aparecem no relatório.' : 'Somente o administrador altera os dados das carretas.'}</p>
      <div class="carretas">${S.carretas.map(c => `
      <form class="card carreta" data-cnes="${esc(c.cnes)}">
        <div class="topo-c"><span class="dot" style="background:${cor(c.cnes)}"></span>CNES <span class="num">${esc(c.cnes)}</span>
          ${c.placa_confirmada ? '<span class="chip ok" style="margin-left:auto">Placa conferida</span>' : '<span class="chip warn" style="margin-left:auto">Placa a confirmar</span>'}</div>
        <label class="field"><span>Nome</span><input class="input" name="nome" value="${esc(c.nome)}" maxlength="80" ${ro} required></label>
        <label class="field"><span>Placa</span><input class="input" name="placa" value="${esc(c.placa)}" maxlength="8" style="text-transform:uppercase" autocomplete="off" spellcheck="false" ${ro}></label>
        <label class="check"><input type="checkbox" name="conferida" ${c.placa_confirmada ? 'checked' : ''} ${admin() ? '' : 'disabled'}> Placa conferida</label>
        <span class="small muted">${plural([...S.medicos.values()].filter(m => vinculos(m, c.cnes).length).length, 'médico vinculado', 'médicos vinculados')}${c.ficha_data ? ` · ficha CNES de ${esc(R.dataCurta(c.ficha_data).slice(0, 5))}/${esc(c.ficha_data.slice(0, 4))}` : ''}</span>
        ${admin() ? '<button class="btn" type="submit">Salvar</button>' : ''}
      </form>`).join('')}</div>`;
  }

  /* --- Usuários (administrador) --- */
  async function chamarGestao(body) {
    const { data, error } = await sb.functions.invoke('manage-users', { body });
    if (error) {
      let m = error.message;
      try { const j = await error.context.json(); m = j.error || m; } catch (_) { /* sem corpo */ }
      throw new Error(m);
    }
    if (data?.error) throw new Error(data.error);
    return data;
  }
  async function vUsuarios(faixa, main) {
    faixa.innerHTML = `${voltar()}<h1 class="titulo-pag">Usuários</h1>`;
    main.innerHTML = `<div class="vazio"><span class="spinner"></span> Carregando usuários…</div>`;
    try {
      const [u, c, a] = await Promise.all([chamarGestao({ action: 'list' }), chamarGestao({ action: 'list_invites' }),
        sb.from('auditoria').select('quando,autor_email,acao,entidade,descricao').order('quando', { ascending: false }).limit(40)]);
      if (S.vista !== 'usuarios') return;
      const nomes = new Map(u.users.map(x => [x.id, x.nome || x.email]));
      const perfilTxt = p => p === 'administrador' ? 'Administrador' : p === 'enfermagem' ? 'Enfermagem' : 'Sem perfil';
      main.innerHTML = `
      <section class="card convite-box" aria-labelledby="convT">
        <h2 id="convT" style="margin:0;font-size:16px">Convidar alguém</h2>
        <p class="small muted" style="margin:0">Gere um link e envie para a pessoa. Ela cria a própria senha. O link vale por 48 horas e funciona uma vez só.</p>
        <div class="barra" style="margin:0"><label class="field" style="flex:0 1 240px"><span>Perfil</span>
          <select id="convPerfil" class="input"><option value="enfermagem">Enfermagem: monta escalas e relatórios</option><option value="administrador">Administrador: acesso total</option></select></label>
          <button class="btn primary" type="button" data-acao="gerar-convite" style="align-self:flex-end">Gerar link de convite</button></div>
        <div id="convResultado"></div>
      </section>
      <h2 class="secao">Contas</h2>
      <div class="card tabela cartoes"><table><thead><tr><th>Pessoa</th><th>Perfil</th><th>Último acesso</th><th>Situação</th><th></th></tr></thead><tbody>
      ${u.users.map(x => {
        const bloq = x.banned_until && new Date(x.banned_until) > new Date();
        return `<tr><td><b>${esc(x.nome || '—')}</b>${x.eu ? ' <span class="chip acc">você</span>' : ''}<div class="small muted">${esc(x.email)}</div></td>
          <td data-rot="Perfil">${x.eu ? esc(perfilTxt(x.perfil)) : `<select class="input" style="min-width:150px" data-perfil-de="${esc(x.id)}" aria-label="Perfil de ${esc(x.nome || x.email)}">
            <option value="enfermagem" ${x.perfil === 'enfermagem' ? 'selected' : ''}>Enfermagem</option>
            <option value="administrador" ${x.perfil === 'administrador' ? 'selected' : ''}>Administrador</option>
            ${!x.perfil ? '<option value="" selected disabled>Sem perfil</option>' : ''}</select>`}</td>
          <td class="small num" data-rot="Último acesso">${esc(dataHora(x.last_sign_in_at))}</td>
          <td data-rot="Situação">${bloq ? '<span class="chip err">Bloqueada</span>' : '<span class="chip ok">Ativa</span>'}</td>
          <td>${x.eu ? '' : `<span class="chips">
            <button class="btn sm" type="button" data-acao="usuario-senha" data-id="${esc(x.id)}" data-nome="${esc(x.nome || x.email)}">Nova senha</button>
            <button class="btn sm" type="button" data-acao="usuario-bloqueio" data-id="${esc(x.id)}" data-bloq="${bloq ? '0' : '1'}" data-nome="${esc(x.nome || x.email)}">${bloq ? 'Desbloquear' : 'Bloquear'}</button>
            <button class="btn sm danger" type="button" data-acao="usuario-excluir" data-id="${esc(x.id)}" data-nome="${esc(x.nome || x.email)}">Excluir</button></span>`}</td></tr>`;
      }).join('')}</tbody></table></div>
      <h2 class="secao">Convites pendentes</h2>
      ${c.invites.length ? `<div class="card tabela"><table><thead><tr><th>Perfil</th><th>Gerado por</th><th>Gerado em</th><th>Vence em</th><th></th></tr></thead><tbody>
        ${c.invites.map(i => `<tr><td>${esc(perfilTxt(i.perfil))}</td><td>${esc(nomes.get(i.criado_por) || '—')}</td><td class="small num">${esc(dataHora(i.criado_em))}</td><td class="small num">${esc(dataHora(i.expira_em))}</td>
          <td><button class="btn sm danger" type="button" data-acao="cancelar-convite" data-id="${esc(i.id)}">Cancelar</button></td></tr>`).join('')}</tbody></table></div>`
        : '<p class="muted">Nenhum convite pendente.</p>'}
      <h2 class="secao">Atividade recente</h2>
      ${a.data?.length ? `<div class="card tabela cartoes"><table><thead><tr><th>Quando</th><th>Quem</th><th>O quê</th></tr></thead><tbody>
        ${a.data.map(r => `<tr><td class="small num">${esc(dataHora(r.quando))}</td><td class="small">${esc(r.autor_email || '—')}</td>
          <td class="small">${esc(r.acao.replace(/_/g, ' '))} ${esc({ acoes: 'ação', medicos: 'médico', carretas: 'carreta', usuario: 'usuário' }[r.entidade] || r.entidade)}${r.descricao ? ': ' + esc(r.descricao) : ''}</td></tr>`).join('')}</tbody></table></div>`
        : '<p class="muted">Nada registrado ainda.</p>'}`;
    } catch (e) {
      main.innerHTML = `<div class="card vazio"><h2>Não foi possível carregar os usuários</h2><p>${esc(msgErro(e))}</p><p><button class="btn" type="button" data-acao="recarregar-usuarios">Tentar de novo</button></p></div>`;
    }
  }

  /* ---------- modais ---------- */
  let focoAnterior = null;
  function abrirModal(html) {
    const root = $('#modal-root');
    if (!root.firstChild) focoAnterior = document.activeElement;
    root.innerHTML = `<div class="overlay" data-overlay>${html}</div>`;
    const f = root.querySelector('[autofocus]') || root.querySelector('input:not([readonly]),select,textarea,button'); f && f.focus();
  }
  function fecharModal() {
    $('#modal-root').innerHTML = ''; S.modal = null;
    if (focoAnterior && document.contains(focoAnterior)) focoAnterior.focus(); focoAnterior = null;
  }
  function confirmar(titulo, textoHtml, rotulo, acao) {
    abrirModal(`<div class="modal estreito" role="alertdialog" aria-modal="true" aria-labelledby="cfT"><div class="modal-h"><h2 id="cfT">${esc(titulo)}</h2></div>
      <div class="modal-b"><p style="margin:0">${textoHtml}</p></div>
      <div class="modal-f"><button class="btn" type="button" data-acao="fechar">Cancelar</button><button class="btn danger-solid" type="button" id="cfOk">${esc(rotulo)}</button></div></div>`);
    $('#cfOk').onclick = async () => {
      const b = $('#cfOk'); b.disabled = true;
      try { await acao(); fecharModal(); } catch (e) { toast(msgErro(e), true); b.disabled = false; }
    };
  }

  /* --- Editor de ação --- */
  function abrirEditor(acao, duplicar) {
    const base = acao ? { local: acao.local, data: acao.data, alocacoes: acao.alocacoes.map(x => ({ cnes: x.cnes, medico_id: x.medico_id, cbo: x.cbo, funcao: x.funcao })) }
      : { local: '', data: S.mes === hoje().slice(0, 7) ? hoje() : S.mes + '-01', alocacoes: [] };
    if (duplicar) base.data = addDias(base.data, 1);
    S.modal = { tipo: 'acao', id: duplicar ? null : (acao?.id || null), draft: base, inicial: '' };
    const locais = [...new Set(S.acoes.map(a => a.local))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    abrirModal(`<div class="modal" role="dialog" aria-modal="true" aria-labelledby="edT">
      <div class="modal-h"><h2 id="edT">${S.modal.id ? 'Editar escala' : duplicar ? 'Duplicar escala' : 'Nova escala'}</h2>
        <button class="btn ghost icon" type="button" data-acao="fechar" aria-label="Fechar">${ic('x')}</button></div>
      <form class="modal-b" id="edForm" novalidate>
        <div class="linha2">
          <label class="field"><span>Local da ação</span><input id="edLocal" class="input" list="locais" autocomplete="off" maxlength="120" placeholder="Ex.: Usina da Paz Bengui…" value="${esc(base.local)}" autofocus></label>
          <label class="field"><span>Data</span><input id="edData" class="input" type="date" value="${esc(base.data)}"></label>
        </div>
        <datalist id="locais">${locais.map(l => `<option value="${esc(l)}">`).join('')}</datalist>
        <datalist id="funcoes">${FUNCOES.map(f => `<option value="${f}">`).join('')}</datalist>
        <div class="ed-grid" id="edGrid"></div>
      </form>
      <div class="modal-f"><span class="resumo" id="edResumo"></span><button class="btn" type="button" data-acao="fechar">Cancelar</button><button class="btn primary" type="button" data-acao="salvar-acao">Salvar escala</button></div>
    </div>`);
    gradeEditor();
    S.modal.inicial = JSON.stringify(base);
  }
  function gradeEditor() {
    const d = S.modal.draft, g = $('#edGrid'); if (!g) return;
    const fake = { alocacoes: d.alocacoes };
    g.innerHTML = S.carretas.map(c => {
      const itens = d.alocacoes.map((al, i) => ({ al, i })).filter(x => x.al.cnes === c.cnes);
      return `<section class="ed-car"><h3><span class="dot" style="background:${cor(c.cnes)}"></span>${esc(curto(c))} <span class="muted" style="font-weight:500">CNES ${esc(c.cnes)}${c.placa ? ' · ' + esc(c.placa) : ''}</span></h3>
        ${itens.map(({ al, i }) => {
          const m = S.medicos.get(al.medico_id), v = vinculos(m, c.cnes);
          const ops = v.map(x => x.cbo); if (al.cbo && !ops.includes(al.cbo)) ops.push(al.cbo);
          return `<div class="ed-item"><span class="nm">${esc(m?.nome || '(removido)')}</span>
            <button class="btn ghost icon sm" type="button" data-acao="rm-al" data-i="${i}" aria-label="Tirar ${esc(m?.nome || '')} desta carreta">${ic('x')}</button>
            <div class="ctrls">
              <select class="input" data-cbo="${i}" aria-label="CBO de ${esc(m?.nome || '')}">${ops.map(cb => `<option value="${esc(cb)}" ${cb === al.cbo ? 'selected' : ''}>CBO ${esc(cb)} · ${esc(R.cboNome(cb, v.find(x => x.cbo === cb)?.descricao))}</option>`).join('')}<option value="" ${!al.cbo ? 'selected' : ''}>Sem CBO</option></select>
              <input class="input" data-func="${i}" list="funcoes" value="${esc(al.funcao || '')}" placeholder="Função" style="width:120px" maxlength="40" aria-label="Função de ${esc(m?.nome || '')}" autocomplete="off">
              ${problemas(fake, al).map(p => `<span class="chip ${p.n}">${esc(p.t)}</span>`).join('')}
            </div></div>`;
        }).join('')}
        <div class="combo"><input class="input" data-combo="${esc(c.cnes)}" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="lb-${esc(c.cnes)}" placeholder="+ Adicionar médico…" autocomplete="off" spellcheck="false" aria-label="Adicionar médico na ${esc(curto(c))}"></div>
      </section>`;
    }).join('');
    const n = d.alocacoes.length;
    $('#edResumo').textContent = plural(n, 'profissional escalado', 'profissionais escalados');
  }
  function editorSujo() {
    const m = S.modal; if (!m || m.tipo !== 'acao') return false;
    const atual = { ...m.draft, local: $('#edLocal')?.value ?? m.draft.local, data: $('#edData')?.value ?? m.draft.data };
    return JSON.stringify(atual) !== m.inicial;
  }
  function fecharEditor() {
    if (!editorSujo()) return fecharModal();
    const st = S.modal; st.draft.local = $('#edLocal').value; st.draft.data = $('#edData').value;
    abrirModal(`<div class="modal estreito" role="alertdialog" aria-modal="true" aria-labelledby="dcT"><div class="modal-h"><h2 id="dcT">Descartar alterações?</h2></div>
      <div class="modal-b"><p style="margin:0">Esta escala tem mudanças que ainda não foram salvas.</p></div>
      <div class="modal-f"><button class="btn" type="button" id="dcVoltar">Continuar editando</button><button class="btn danger-solid" type="button" id="dcOk">Descartar</button></div></div>`);
    $('#dcOk').onclick = () => fecharModal();
    $('#dcVoltar').onclick = () => reabrirEditor(st);
  }
  function reabrirEditor(st) {
    const ini = st.inicial, id = st.id, titulo = st.id ? 'Editar escala' : 'Nova escala';
    abrirEditor({ id, local: st.draft.local, data: st.draft.data, alocacoes: st.draft.alocacoes });
    S.modal.id = id; S.modal.inicial = ini; $('#edT').textContent = titulo;
  }
  function comboAbrir(input) {
    const cnes = input.dataset.combo, q = norm(input.value), d = S.modal.draft;
    let lista = [...S.medicos.values()];
    if (q) lista = lista.filter(m => norm(m.nome).includes(q) || norm(m.funcao) === q);
    lista.sort((a, b) => (vinculos(b, cnes).length > 0) - (vinculos(a, cnes).length > 0) || a.nome.localeCompare(b.nome, 'pt-BR'));
    lista = lista.slice(0, 40);
    let box = input.parentElement.querySelector('.combo-list');
    if (!box) { box = document.createElement('div'); box.className = 'combo-list'; box.id = 'lb-' + cnes; box.setAttribute('role', 'listbox'); input.parentElement.appendChild(box); }
    input.setAttribute('aria-expanded', 'true');
    box.innerHTML = lista.length ? lista.map((m, i) => {
      const v = vinculos(m, cnes), ja = d.alocacoes.find(x => x.medico_id === m.id);
      return `<div class="opt${i === 0 ? ' hi' : ''}" role="option" aria-selected="${i === 0}" data-pick="${esc(m.id)}">
        <span><span class="nm">${esc(m.nome)}</span>${m.funcao ? ` <span class="small muted">${esc(m.funcao)}</span>` : ''}</span>
        <span class="chips" style="flex-wrap:nowrap">${ja ? `<span class="chip warn">${ja.cnes === cnes ? 'já nesta' : 'na ' + esc(curto(carreta(ja.cnes)))}</span>` : ''}
        ${v.length ? `<span class="chip num">${esc(v.map(x => x.cbo).join(' / '))}</span>` : '<span class="chip err">sem vínculo</span>'}</span></div>`;
    }).join('') : `<div class="opt" aria-disabled="true"><span class="muted">Nenhum médico encontrado${admin() ? '. Cadastre em Médicos.' : '. Peça ao administrador para cadastrar.'}</span></div>`;
  }
  function comboFechar() { document.querySelectorAll('.combo-list').forEach(b => b.remove()); document.querySelectorAll('[data-combo]').forEach(i => i.setAttribute('aria-expanded', 'false')); }
  let semAbrir = false;
  function adicionarAlocacao(cnes, medicoId) {
    const m = S.medicos.get(medicoId), d = S.modal.draft;
    if (d.alocacoes.some(x => x.medico_id === medicoId && x.cnes === cnes)) return toast('Este médico já está nesta carreta.');
    const v = vinculos(m, cnes);
    const cbo = (v.find(x => x.cbo === PREF_CBO[m.funcao]) || v[0])?.cbo || m.cbo_manual || '';
    d.alocacoes.push({ cnes, medico_id: medicoId, cbo, funcao: m.funcao || '' });
    gradeEditor();
    const inp = document.querySelector(`[data-combo="${cnes}"]`); if (inp) { semAbrir = true; inp.focus(); semAbrir = false; }
  }
  async function salvarAcao(btn) {
    const d = S.modal.draft; const local = $('#edLocal'), data = $('#edData');
    d.local = local.value.trim().replace(/\s+/g, ' '); d.data = data.value;
    local.removeAttribute('aria-invalid'); data.removeAttribute('aria-invalid');
    if (d.local.length < 2) { local.setAttribute('aria-invalid', 'true'); local.focus(); return toast('Informe o local da ação.', true); }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.data)) { data.setAttribute('aria-invalid', 'true'); data.focus(); return toast('Informe a data da ação.', true); }
    const igual = S.acoes.find(a => a.id !== S.modal.id && a.data === d.data && norm(a.local) === norm(d.local));
    if (igual && !S.modal.okDuplicada) { S.modal.okDuplicada = true; return toast('Já existe uma escala neste local e data. Clique em Salvar de novo para criar outra mesmo assim.'); }
    btn.disabled = true;
    try {
      const { error } = await sb.rpc('salvar_acao', { p_id: S.modal.id, p_local: d.local, p_data: d.data,
        p_alocacoes: d.alocacoes.map(a => ({ cnes: a.cnes, medico_id: a.medico_id, cbo: a.cbo || '', funcao: (a.funcao || '').trim() })) });
      if (error) throw error;
      const mesNovo = d.data.slice(0, 7), mesAntigo = S.mes;
      fecharModal(); toast('Escala salva.');
      await carregarMes(mesNovo, true); if (mesAntigo !== mesNovo) await carregarMes(mesAntigo, true);
      irPara('escalas', mesNovo);
    } catch (e) { toast(msgErro(e), true); btn.disabled = false; }
  }

  /* --- Médico --- */
  function abrirMedico(m) {
    const novo = !m, pode = admin();
    m = m || { nome: '', cns: '', funcao: '', obs: '', cbo_manual: '', origem: '', medico_vinculos: [] };
    S.modal = { tipo: 'medico', id: novo ? null : m.id, vinc: m.medico_vinculos.map(v => ({ ...v })) };
    const usos = S.acoes.filter(a => a.alocacoes.some(x => x.medico_id === m.id)).length;
    const dis = pode ? '' : 'disabled';
    abrirModal(`<div class="modal estreito" role="dialog" aria-modal="true" aria-labelledby="mdT">
      <div class="modal-h"><h2 id="mdT">${novo ? 'Novo médico' : pode ? 'Editar médico' : esc(m.nome)}</h2><button class="btn ghost icon" type="button" data-acao="fechar" aria-label="Fechar">${ic('x')}</button></div>
      <form class="modal-b" id="mdForm" novalidate>
        <label class="field"><span>Nome completo</span><input id="mdNome" class="input" value="${esc(m.nome)}" maxlength="150" style="text-transform:uppercase" autocomplete="off" ${dis} autofocus></label>
        <div class="linha2"><label class="field"><span>CNS</span><input id="mdCns" class="input num" value="${esc(m.cns || '')}" inputmode="numeric" maxlength="15" autocomplete="off" spellcheck="false" ${dis}></label>
          <label class="field"><span>Função padrão</span><input id="mdFunc" class="input" list="funcoes2" value="${esc(m.funcao)}" maxlength="40" placeholder="MASTO, GINECO…" autocomplete="off" ${dis}></label></div>
        <datalist id="funcoes2">${FUNCOES.map(f => `<option value="${f}">`).join('')}</datalist>
        <datalist id="cbos">${Object.entries(R.CBO_NOMES).map(([k, n]) => `<option value="${k}">${esc(n)}</option>`).join('')}</datalist>
        <div class="field"><span>Vínculos no CNES das carretas</span><div id="mdVinc" style="display:flex;flex-direction:column;gap:6px"></div>
          ${pode ? `<div class="linha3" style="align-items:end"><label class="field"><span class="hint">Carreta</span><select id="vCar" class="input">${S.carretas.map(c => `<option value="${esc(c.cnes)}">${esc(curto(c))} · ${esc(c.cnes)}</option>`).join('')}</select></label>
            <label class="field"><span class="hint">CBO</span><input id="vCbo" class="input num" list="cbos" inputmode="numeric" maxlength="6" placeholder="225250" autocomplete="off"></label>
            <button class="btn" type="button" data-acao="add-vinc">${ic('plus')}Adicionar vínculo</button></div>
            <span class="hint">Use os dados da ficha do CNES de cada carreta. Sem vínculo, o médico aparece com alerta nas escalas.</span>` : ''}</div>
        <label class="field"><span>Observações</span><input id="mdObs" class="input" value="${esc(m.obs)}" maxlength="300" autocomplete="off" ${dis}></label>
        ${m.origem ? `<span class="small muted">Origem: ${esc(m.origem)}${usos ? ` · escalado em ${plural(usos, 'ação carregada', 'ações carregadas')}` : ''}</span>` : ''}
      </form>
      <div class="modal-f">${pode && !novo ? `<button class="btn ghost danger" type="button" data-acao="excluir-medico" style="margin-right:auto">Excluir</button>` : ''}
        <button class="btn" type="button" data-acao="fechar">${pode ? 'Cancelar' : 'Fechar'}</button>${pode ? '<button class="btn primary" type="button" data-acao="salvar-medico">Salvar</button>' : ''}</div></div>`);
    listaVinc();
  }
  function listaVinc() {
    const box = $('#mdVinc'); if (!box) return;
    const v = S.modal.vinc;
    box.innerHTML = v.length ? S.carretas.map(c => v.map((x, i) => ({ x, i })).filter(o => o.x.cnes === c.cnes).map(({ x, i }) =>
      `<div class="vinc-row"><span class="dot" style="background:${cor(c.cnes)}"></span><b>${esc(curto(c))}</b><span class="chip num">CBO ${esc(x.cbo)} · ${esc(R.cboNome(x.cbo, x.descricao))}${x.carga_horaria != null ? ` · ${esc(x.carga_horaria)}h` : ''}</span>
        ${admin() ? `<button class="btn ghost icon sm" type="button" data-acao="rm-vinc" data-i="${i}" aria-label="Remover vínculo">${ic('x')}</button>` : ''}</div>`).join('')).join('')
      : '<div class="aviso warn">' + ic('alert') + '<span>Sem vínculo com nenhuma carreta. Para o BPA, o médico precisa estar no CNES da carreta.</span></div>';
  }
  async function salvarMedico(btn) {
    const nome = $('#mdNome').value.trim().replace(/\s+/g, ' ').toUpperCase(), cns = $('#mdCns').value.replace(/\D/g, '');
    if (nome.length < 3) { $('#mdNome').focus(); return toast('Informe o nome completo.', true); }
    if (cns && cns.length !== 15) { $('#mdCns').focus(); return toast('O CNS tem 15 dígitos.', true); }
    btn.disabled = true;
    try {
      const { data: id, error } = await sb.rpc('salvar_medico', { p_id: S.modal.id, p_nome: nome, p_cns: cns, p_funcao: $('#mdFunc').value, p_obs: $('#mdObs').value, p_cbo_manual: '',
        p_vinculos: S.modal.vinc.map(v => ({ cnes: v.cnes, cbo: v.cbo, descricao: v.descricao || (R.CBO_NOMES[v.cbo] || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, ''), carga_horaria: v.carga_horaria ?? null })) });
      if (error) throw error;
      fecharModal(); toast('Médico salvo.');
      await carregarBase(); render();
      return id;
    } catch (e) { toast(msgErro(e), true); btn.disabled = false; }
  }

  /* --- Senhas --- */
  function abrirSenha(alvo) {
    const minha = !alvo;
    abrirModal(`<div class="modal estreito" role="dialog" aria-modal="true" aria-labelledby="snT"><div class="modal-h"><h2 id="snT">${minha ? 'Trocar minha senha' : 'Nova senha para ' + esc(alvo.nome)}</h2></div>
      <form class="modal-b" id="snForm" novalidate>
        <label class="field"><span>Nova senha</span><input id="sn1" class="input" type="password" autocomplete="new-password" minlength="8" maxlength="128" autofocus></label>
        <label class="field"><span>Confirmar</span><input id="sn2" class="input" type="password" autocomplete="new-password"></label>
        <span class="hint">Pelo menos 8 caracteres.${minha ? '' : ' Senhas que já vazaram na internet são recusadas. Avise a pessoa da nova senha por um canal seguro.'}</span>
      </form>
      <div class="modal-f"><button class="btn" type="button" data-acao="fechar">Cancelar</button><button class="btn primary" type="button" id="snOk">Salvar senha</button></div></div>`);
    $('#snOk').onclick = async () => {
      const s1 = $('#sn1').value, s2 = $('#sn2').value, b = $('#snOk');
      if (s1.length < 8 || s1.length > 128) return toast('A senha deve ter de 8 a 128 caracteres.', true);
      if (s1 !== s2) return toast('As senhas não conferem.', true);
      b.disabled = true;
      try {
        if (minha) { const { error } = await sb.auth.updateUser({ password: s1 }); if (error) throw error; }
        else await chamarGestao({ action: 'password', userId: alvo.id, password: s1 });
        fecharModal(); toast('Senha alterada.');
      } catch (e) { toast(msgErro(e), true); b.disabled = false; }
    };
  }

  /* --- Menu "Mais" (celular) --- */
  function abrirMais() {
    abrirModal(`<div class="modal estreito" role="dialog" aria-modal="true" aria-labelledby="maisT"><div class="modal-h"><h2 id="maisT">${esc(S.eu.nome || S.eu.email)}</h2><button class="btn ghost icon" type="button" data-acao="fechar" aria-label="Fechar">${ic('x')}</button></div>
      <div class="modal-b" style="gap:8px">
        <span class="small muted">${esc(S.eu.email)} · ${admin() ? 'Administrador' : 'Enfermagem'}</span>
        <a class="btn" href="#carretas" data-fecha>${ic('truck')}Carretas</a>
        ${admin() ? `<a class="btn" href="#usuarios" data-fecha>${ic('users')}Usuários</a>` : ''}
        <button class="btn" type="button" data-acao="minha-senha">${ic('key')}Trocar minha senha</button>
        ${pedidoInstalar ? `<button class="btn" type="button" data-acao="instalar">${ic('install')}Instalar o app</button>` : ''}
        <button class="btn danger" type="button" data-acao="sair">${ic('out')}Sair</button>
      </div></div>`);
  }

  /* ---------- eventos ---------- */
  function fecharMenus() { $('#contaMenu').classList.add('hidden'); $('#contaBtn').setAttribute('aria-expanded', 'false'); }
  document.addEventListener('click', async e => {
    if (e.target.closest('[data-fecha]')) { fecharModal(); return; }
    if (e.target.matches('[data-overlay]')) { if (S.modal?.tipo === 'acao') fecharEditor(); else fecharModal(); return; }
    const pick = e.target.closest('[data-pick]');
    if (pick) { const inp = pick.closest('.combo').querySelector('[data-combo]'); comboFechar(); adicionarAlocacao(inp.dataset.combo, pick.dataset.pick); return; }
    if (!e.target.closest('.combo')) comboFechar();
    if (e.target.closest('#contaBtn')) { const m = $('#contaMenu'), ab = m.classList.toggle('hidden'); $('#contaBtn').setAttribute('aria-expanded', String(!ab)); return; }
    if (!e.target.closest('#contaMenu')) fecharMenus();
    if (e.target.closest('#maisBtn')) { abrirMais(); return; }
    const el = e.target.closest('[data-acao]'); if (!el) return;
    const ac = el.dataset.acao, id = el.dataset.id;
    switch (ac) {
      case 'fechar': if (S.modal?.tipo === 'acao') fecharEditor(); else fecharModal(); break;
      case 'nova-acao': abrirEditor(null); break;
      case 'editar-acao': abrirEditor(S.acoes.find(a => a.id === id)); break;
      case 'duplicar-acao': abrirEditor(S.acoes.find(a => a.id === id), true); break;
      case 'excluir-acao': { const a = S.acoes.find(x => x.id === id);
        confirmar('Excluir escala', `Excluir a escala de <b>${esc(a.local)}</b> em ${esc(dataLonga(a.data))}? Isso não pode ser desfeito.`, 'Excluir', async () => {
          const { error } = await sb.from('acoes').delete().eq('id', id); if (error) throw error;
          S.acoes = S.acoes.filter(x => x.id !== id); toast('Escala excluída.'); render();
        }); break; }
      case 'salvar-acao': salvarAcao(el); break;
      case 'rm-al': S.modal.draft.alocacoes.splice(+el.dataset.i, 1); gradeEditor(); break;
      case 'ultimo-mes': { const m = await ultimoMesComEscala(); if (m) irPara('escalas', m); else toast('Ainda não há escalas cadastradas.'); break; }
      case 'baixar-word': baixarWord(el); break;
      case 'copiar': copiar(el.dataset.whats === '1'); break;
      case 'abrir-medico': abrirMedico(S.medicos.get(id)); break;
      case 'novo-medico': abrirMedico(null); break;
      case 'salvar-medico': salvarMedico(el); break;
      case 'add-vinc': { const cnes = $('#vCar').value, cbo = $('#vCbo').value.replace(/\D/g, '');
        if (cbo.length !== 6) { $('#vCbo').focus(); return toast('O CBO tem 6 dígitos.', true); }
        if (S.modal.vinc.some(v => v.cnes === cnes && v.cbo === cbo)) return toast('Esse vínculo já está na lista.');
        S.modal.vinc.push({ cnes, cbo, descricao: '', carga_horaria: null }); $('#vCbo').value = ''; listaVinc(); break; }
      case 'rm-vinc': S.modal.vinc.splice(+el.dataset.i, 1); listaVinc(); break;
      case 'excluir-medico': { const mid = S.modal.id, m = S.medicos.get(mid);
        confirmar('Excluir médico', `Excluir <b>${esc(m.nome)}</b> do cadastro? Médicos que já estão em escalas não podem ser excluídos.`, 'Excluir', async () => {
          const { error } = await sb.from('medicos').delete().eq('id', mid); if (error) throw error;
          S.medicos.delete(mid); toast('Médico excluído.'); render();
        }); break; }
      case 'gerar-convite': { el.disabled = true;
        try {
          const r = await chamarGestao({ action: 'invite', perfil: $('#convPerfil').value });
          const link = `${location.origin}${location.pathname}#convite=${r.token}`;
          $('#convResultado').innerHTML = `<div class="aviso ok">${ic('check')}<span>Link gerado para o perfil <b>${r.perfil === 'administrador' ? 'Administrador' : 'Enfermagem'}</b>. Ele aparece só agora: copie e envie para a pessoa.</span></div>
            <div class="convite-link"><code id="convLink">${esc(link)}</code><button class="btn" type="button" data-acao="copiar-convite">${ic('copy')}Copiar link</button></div>`;
        } catch (er) { toast(msgErro(er), true); } finally { el.disabled = false; } break; }
      case 'copiar-convite': try { await navigator.clipboard.writeText($('#convLink').textContent); toast('Link copiado.'); } catch (_) { toast('Selecione o link e copie manualmente.', true); } break;
      case 'cancelar-convite': confirmar('Cancelar convite', 'O link deste convite vai parar de funcionar na hora.', 'Cancelar convite', async () => {
          await chamarGestao({ action: 'revoke_invite', inviteId: id }); toast('Convite cancelado.'); vUsuarios($('#faixa'), $('#conteudo')); }); break;
      case 'usuario-senha': abrirSenha({ id, nome: el.dataset.nome }); break;
      case 'usuario-bloqueio': { const bloq = el.dataset.bloq === '1';
        confirmar(bloq ? 'Bloquear conta' : 'Desbloquear conta', bloq ? `<b>${esc(el.dataset.nome)}</b> perde o acesso na hora, inclusive se estiver com o sistema aberto.` : `<b>${esc(el.dataset.nome)}</b> volta a ter acesso.`, bloq ? 'Bloquear' : 'Desbloquear', async () => {
          const r = await chamarGestao({ action: 'access', userId: id, blocked: bloq }); toast(r.message); vUsuarios($('#faixa'), $('#conteudo')); }); break; }
      case 'usuario-excluir': confirmar('Excluir conta', `Excluir a conta de <b>${esc(el.dataset.nome)}</b>? A pessoa perde o acesso e a conta não pode ser recuperada. As escalas que ela montou continuam salvas.`, 'Excluir conta', async () => {
          await chamarGestao({ action: 'delete', userId: id }); toast('Conta excluída.'); vUsuarios($('#faixa'), $('#conteudo')); }); break;
      case 'recarregar-usuarios': vUsuarios($('#faixa'), $('#conteudo')); break;
      case 'minha-senha': fecharMenus(); abrirSenha(null); break;
      case 'instalar': fecharMenus(); fecharModal(); if (pedidoInstalar) { pedidoInstalar.prompt(); await pedidoInstalar.userChoice.catch(() => null); pedidoInstalar = null; atualizarInstalar(); } break;
      case 'sair': fecharMenus(); fecharModal(); await sb.auth.signOut(); break;
    }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if ($('.combo-list')) return comboFechar();
      if (!$('#contaMenu').classList.contains('hidden')) { fecharMenus(); $('#contaBtn').focus(); return; }
      if (S.modal?.tipo === 'acao') return fecharEditor();
      if ($('#modal-root').firstChild) return fecharModal();
    }
    if (e.key === 'Tab' && $('#modal-root').firstChild) {
      const f = [...$('#modal-root').querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea')].filter(x => x.offsetParent);
      if (f.length) { const i = f.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); } }
    }
    const inp = e.target.closest?.('[data-combo]');
    if (inp) {
      const box = inp.parentElement.querySelector('.combo-list'); if (!box) { if (e.key === 'ArrowDown') comboAbrir(inp); return; }
      const ops = [...box.querySelectorAll('.opt[data-pick]')]; let i = ops.findIndex(o => o.classList.contains('hi'));
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!ops.length) return; ops[i]?.classList.remove('hi'); ops[i]?.setAttribute('aria-selected', 'false'); i = (i + (e.key === 'ArrowDown' ? 1 : -1) + ops.length) % ops.length; ops[i].classList.add('hi'); ops[i].setAttribute('aria-selected', 'true'); ops[i].scrollIntoView({ block: 'nearest' }); }
      if (e.key === 'Enter') { e.preventDefault(); ops[i]?.click(); }
    }
  });
  document.addEventListener('focusin', e => { if (e.target.matches('[data-combo]')) { comboFechar(); if (!semAbrir) comboAbrir(e.target); } });
  document.addEventListener('input', e => {
    const t = e.target;
    if (t.matches('[data-combo]')) comboAbrir(t);
    else if (t.id === 'buscaMed') { S.busca = t.value; const p = t.selectionStart; render(); const n = $('#buscaMed'); n.focus(); n.setSelectionRange(p, p); }
    else if (t.matches('[data-func]')) S.modal.draft.alocacoes[+t.dataset.func].funcao = t.value.toUpperCase();
  });
  document.addEventListener('change', async e => {
    const t = e.target;
    if (t.id === 'filtroMed') { S.filtroMed = t.value; render(); }
    else if (t.matches('[data-rep]')) { S.rep[t.dataset.rep] = t.checked; gravar('escala.rep', JSON.stringify(S.rep)); render(); }
    else if (t.matches('[data-cbo]')) { S.modal.draft.alocacoes[+t.dataset.cbo].cbo = t.value; gradeEditor(); }
    else if (t.matches('[data-perfil-de]')) {
      const id = t.dataset.perfilDe; t.disabled = true;
      try { await chamarGestao({ action: 'role', userId: id, perfil: t.value }); toast('Perfil alterado.'); }
      catch (er) { toast(msgErro(er), true); vUsuarios($('#faixa'), $('#conteudo')); }
      finally { t.disabled = false; }
    }
  });
  document.addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    if (f.matches('form.carreta')) {
      const b = f.querySelector('button[type=submit]'); b.disabled = true;
      try {
        const { error } = await sb.from('carretas').update({ nome: f.nome.value.trim().toUpperCase(), placa: f.placa.value.toUpperCase().replace(/[^A-Z0-9]/g, ''), placa_confirmada: f.conferida.checked }).eq('cnes', f.dataset.cnes);
        if (error) throw error; await carregarBase(); render(); toast('Carreta atualizada.');
      } catch (er) { toast(msgErro(er), true); b.disabled = false; }
    }
  });
  window.addEventListener('hashchange', () => { if (S.eu) rotear(); });
  window.addEventListener('beforeunload', e => { if (editorSujo()) { e.preventDefault(); e.returnValue = ''; } });
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible' || !S.eu || S.modal || Date.now() - S.ultimaCarga < 60000) return;
    try { await carregarBase(); S.mesesCarregados.clear(); if (S.vista === 'escalas' || S.vista === 'relatorio') await carregarMes(S.mes, true); if (S.vista !== 'usuarios') render(); } catch (_) { /* tenta na próxima */ }
  });

  /* ---------- entrada, cadastro e sessão ---------- */
  const telas = ['telaLogin', 'telaCadastro', 'app'];
  function mostrar(id) { telas.forEach(t => $('#' + t).classList.toggle('hidden', t !== id)); $('#carregando').classList.add('hidden'); }
  let tokenConvite = null;

  $('#formLogin').addEventListener('submit', async e => {
    e.preventDefault();
    const b = e.target.querySelector('button'), msg = $('#loginMsg'); msg.textContent = '';
    const email = $('#loginEmail').value.trim(), senha = $('#loginSenha').value;
    if (!email || !senha) { msg.textContent = 'Informe e-mail e senha.'; return; }
    b.disabled = true; b.textContent = 'Entrando…';
    const { error } = await sb.auth.signInWithPassword({ email, password: senha });
    b.disabled = false; b.textContent = 'Entrar';
    if (error) { msg.textContent = /invalid/i.test(error.message) ? 'E-mail ou senha incorretos.' : /banned/i.test(error.message) ? 'Esta conta está bloqueada. Fale com o administrador.' : msgErro(error); $('#loginSenha').select(); }
  });
  $('#formCadastro').addEventListener('submit', async e => {
    e.preventDefault();
    const b = e.target.querySelector('button'), msg = $('#cadMsg'); msg.textContent = '';
    const nome = $('#cadNome').value.trim(), email = $('#cadEmail').value.trim(), s1 = $('#cadSenha').value, s2 = $('#cadSenha2').value;
    if (nome.length < 3) { msg.textContent = 'Informe seu nome completo.'; $('#cadNome').focus(); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { msg.textContent = 'Informe um e-mail válido.'; $('#cadEmail').focus(); return; }
    if (s1.length < 8) { msg.textContent = 'A senha precisa ter pelo menos 8 caracteres.'; $('#cadSenha').focus(); return; }
    if (s1 !== s2) { msg.textContent = 'As senhas não conferem.'; $('#cadSenha2').focus(); return; }
    b.disabled = true; b.textContent = 'Criando conta…';
    try {
      const { data, error } = await sb.functions.invoke('register-user', { body: { token: tokenConvite, name: nome, email, password: s1 } });
      if (error) { let m = error.message; try { m = (await error.context.json()).error || m; } catch (_) { /* sem corpo */ } throw new Error(m); }
      tokenConvite = null;
      const { error: le } = await sb.auth.signInWithPassword({ email, password: s1 });
      if (le) { mostrar('telaLogin'); $('#loginEmail').value = email; $('#loginMsg').textContent = data?.message || 'Conta criada. Entre com seu e-mail e senha.'; }
    } catch (er) { msg.textContent = msgErro(er); }
    finally { b.disabled = false; b.textContent = 'Criar conta'; }
  });

  async function entrar(session) {
    const { data: p, error } = await sb.from('perfis_usuarios').select('perfil,nome').eq('usuario_id', session.user.id).maybeSingle();
    if (error || !p) {
      await sb.auth.signOut();
      mostrar('telaLogin'); $('#loginMsg').textContent = error ? msgErro(error) : 'Sua conta não tem acesso a este sistema. Fale com o administrador.';
      return;
    }
    S.eu = { id: session.user.id, email: session.user.email, perfil: p.perfil, nome: p.nome || session.user.user_metadata?.full_name || '' };
    $('#avatar').textContent = iniciais(S.eu.nome || S.eu.email);
    $('#contaNome').textContent = S.eu.nome || S.eu.email;
    $('#contaPerfil').textContent = admin() ? 'Administrador' : 'Enfermagem';
    document.querySelectorAll('.so-admin').forEach(x => x.classList.toggle('hidden', !admin()));
    $('#versao').textContent = 'versão ' + C.versao;
    try { await carregarBase(); } catch (e) { mostrar('app'); $('#conteudo').innerHTML = `<div class="card vazio"><h2>Não foi possível carregar os dados</h2><p>${esc(msgErro(e))}</p></div>`; return; }
    mostrar('app');
    const h = lerHash();
    if (!h.mes && (h.vista === 'escalas' || h.vista === 'relatorio')) {
      await carregarMes(S.mes).catch(() => null);
      if (!acoesDoMes(S.mes).length) { const ult = await ultimoMesComEscala().catch(() => null); if (ult && ult < S.mes) S.mes = ult; }
      history.replaceState(null, '', `#${h.vista}/${S.mes}`);
    }
    rotear();
  }
  function sairDaTela() {
    S.eu = null; S.acoes = []; S.mesesCarregados.clear(); S.medicos = new Map(); fecharModal();
    $('#conteudo').innerHTML = ''; $('#faixa').innerHTML = '';
    $('#loginSenha').value = ''; mostrar('telaLogin');
  }

  // Convite: o token fica só na memória e sai da barra de endereço na hora.
  const m = (location.hash || '').match(/^#convite=([A-Za-z0-9_-]{43})$/);
  if (m) { tokenConvite = m[1]; history.replaceState(null, '', location.pathname + location.search); }

  // As chamadas ao Supabase saem do callback (setTimeout), como a biblioteca recomenda, para não travar a sessão.
  let entrando = false;
  sb.auth.onAuthStateChange((ev, session) => {
    setTimeout(async () => {
      if (ev === 'SIGNED_OUT') return sairDaTela();
      if (ev === 'INITIAL_SESSION' && tokenConvite) return mostrar('telaCadastro');
      if (session && !S.eu && !entrando && (ev === 'INITIAL_SESSION' || ev === 'SIGNED_IN')) {
        entrando = true;
        try { await entrar(session); } finally { entrando = false; }
      } else if (!session && ev === 'INITIAL_SESSION') mostrar('telaLogin');
    }, 0);
  });

  /* ---------- app instalável ---------- */
  let pedidoInstalar = null;
  function atualizarInstalar() { document.querySelectorAll('.instalar-item').forEach(x => x.classList.toggle('hidden', !pedidoInstalar)); }
  window.addEventListener('beforeinstallprompt', ev => { ev.preventDefault(); pedidoInstalar = ev; atualizarInstalar(); });
  window.addEventListener('appinstalled', () => { pedidoInstalar = null; atualizarInstalar(); });
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(er => console.warn('Service worker não registrado:', er && er.message));
  }
})();
