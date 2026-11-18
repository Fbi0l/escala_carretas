/* "Relatório de escala médica das carretas" (divisão de médicos por CNES): monta o conteúdo do mês e gera texto ou Word (.docx).
   Tudo é gerado no próprio aparelho; nenhum dado vai para outro serviço. */
(function () {
  'use strict';
  const MESES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  const CBO_NOMES = {
    '225125': 'Médico clínico', '225250': 'Médico ginecologista e obstetra', '225255': 'Médico mastologista',
    '225320': 'Médico em radiologia e diagnóstico por imagem', '225124': 'Médico pediatra'
  };
  const cboNome = (cbo, desc) => CBO_NOMES[cbo] || (desc ? desc.charAt(0) + desc.slice(1).toLowerCase() : '');
  const dataLonga = s => { const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; };
  const dataCurta = s => { const [y, m, d] = s.split('-'); return `${d}/${m}/${y.slice(2)}`; };
  const nomeMes = ym => { const [y, m] = ym.split('-'); return `${MESES[+m - 1]} ${y}`; };

  // ctx: { acoes, carretas, medicos (Map id → médico com medico_vinculos), opcoes: {placa, nomeCarreta, cbo, funcao} }
  function montar(mes, ctx) {
    const o = ctx.opcoes;
    const acoes = ctx.acoes.filter(a => a.data.slice(0, 7) === mes)
      .sort((a, b) => a.data.localeCompare(b.data) || a.local.localeCompare(b.local, 'pt-BR'));
    return acoes.map(a => ({
      titulo: `DIVISÃO DAS CARRETAS – ${a.local.toLocaleUpperCase('pt-BR')} – DIA ${dataLonga(a.data)}`,
      carretas: ctx.carretas.map(c => {
        const itens = (a.alocacoes || []).filter(x => x.cnes === c.cnes).sort((x, y) => x.ordem - y.ordem);
        if (!itens.length) return null;
        let cab = `CNES ${c.cnes}`;
        if (o.nomeCarreta && c.nome) cab += ` – ${c.nome}`;
        if (o.placa && c.placa) cab += ` – Placa ${c.placa}`;
        return { cab, linhas: itens.map(al => linha(al, ctx)) };
      }).filter(Boolean)
    }));
  }
  function linha(al, ctx) {
    const m = ctx.medicos.get(al.medico_id);
    let s = (m ? m.nome : '(médico removido)').toUpperCase();
    if (ctx.opcoes.cbo && al.cbo) {
      const v = (m?.medico_vinculos || []).find(x => x.cnes === al.cnes && x.cbo === al.cbo);
      s += ` (CBO ${al.cbo} - ${cboNome(al.cbo, v?.descricao)})`;
    }
    if (ctx.opcoes.funcao && al.funcao) s += ` – ${al.funcao}`;
    return s + ';';
  }
  const TITULO = 'RELATÓRIO DE ESCALA MÉDICA DAS CARRETAS';
  function titulo(mes) { return `DIVISÃO DE MÉDICOS POR CNES – ${nomeMes(mes).toUpperCase()}`; }
  function texto(mes, ctx, whats) {
    const b = t => whats ? `*${t}*` : t;
    const out = [b(TITULO), b(titulo(mes)), ''];
    montar(mes, ctx).forEach(bl => {
      out.push(b(bl.titulo), '');
      bl.carretas.forEach(c => { out.push(`• ${c.cab}`); c.linhas.forEach(l => out.push(`- ${l}`)); out.push(''); });
    });
    return out.join('\n').trim() + '\n';
  }

  // Bibliotecas pesadas só carregam quando o arquivo é pedido (Word ou PDF).
  const carregando = {};
  function carregar(arquivo, pronto, nome) {
    if (pronto()) return Promise.resolve();
    return carregando[arquivo] || (carregando[arquivo] = new Promise((ok, falha) => {
      const s = document.createElement('script');
      s.src = 'vendor/' + arquivo;
      s.onload = () => ok();
      s.onerror = () => { delete carregando[arquivo]; falha(new Error(`Não foi possível carregar o gerador de ${nome}. Verifique a conexão.`)); };
      document.head.appendChild(s);
    }));
  }
  const carregarDocx = () => carregar('docx-9.15.4.js', () => !!window.docx, 'Word');
  const carregarPdf = () => carregar('jspdf-4.2.1.js', () => !!(window.jspdf && window.jspdf.jsPDF), 'PDF');
  const nomeArquivo = (mes, ext) => { const [y, m] = mes.split('-'); return `DIVISAO_DE_MEDICOS_POR_CNES_${MESES[+m - 1]}${y.slice(2)}.${ext}`; };
  /* Formatação ABNT (NBR 14724) aplicada ao Word e ao PDF:
     A4; margens superior e esquerda 3 cm, inferior e direita 2 cm; fonte Arial 12 (Helvetica no PDF, de mesmas medidas);
     espaçamento 1,5 entre linhas; título centralizado em negrito e maiúsculas; seções em negrito e maiúsculas;
     numeração em algarismos arábicos no rodapé, à direita (pedido do usuário; a NBR 14724 indica o canto superior). */
  const ABNT = { topo: 30, esq: 30, base: 20, dir: 20, fonte: 12, entrelinha: 1.5, recuo: 12.5, pagina: 10 };
  /* Papel timbrado: logo da ASBRAS centralizada no topo de todas as páginas, dentro da margem superior
     (de 0,4 cm a 2,8 cm do topo). O texto continua começando a 3 cm. */
  const TIMBRE = { topo: 4, arq: 'assets/logo-timbre.jpg', alt: 24, prop: 900 / 837 };
  let logoCache = null;
  async function carregarLogo() {
    if (logoCache) return logoCache;
    const r = await fetch(TIMBRE.arq, { cache: 'force-cache' });
    if (!r.ok) throw new Error('Não foi possível carregar a logo do papel timbrado.');
    logoCache = { dados: new Uint8Array(await r.arrayBuffer()), alt: TIMBRE.alt, larg: TIMBRE.alt * TIMBRE.prop };
    return logoCache;
  }
  const mmTwip = mm => Math.round(mm * 56.6929);

  async function word(mes, ctx) {
    await carregarDocx();
    const { Document, Packer, Paragraph, TextRun, AlignmentType, Header, Footer, PageNumber, ImageRun } = window.docx;
    const logo = await carregarLogo(), px = mm => Math.round(mm * 3.7795);
    const cabecalho = new Header({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [
      new ImageRun({ type: 'jpg', data: logo.dados, transformation: { width: px(logo.larg), height: px(logo.alt) }, altText: { name: 'ASBRAS', description: 'Logo ASBRAS – Associação Brasileira de Atenção à Assistência em Saúde', title: 'ASBRAS' } })
    ] })] });
    const font = 'Arial', meia = ABNT.fonte * 2, linha = Math.round(240 * ABNT.entrelinha);
    const P = (text, o = {}) => new Paragraph({
      alignment: o.center ? AlignmentType.CENTER : AlignmentType.LEFT,
      spacing: { line: linha, before: o.before || 0, after: o.after || 0 },
      indent: o.indent ? { left: mmTwip(ABNT.recuo), hanging: mmTwip(3) } : undefined,
      keepNext: !!o.keepNext,
      children: [new TextRun({ text, bold: !!o.bold, font, size: meia })]
    });
    const kids = [P(TITULO, { bold: true, center: true }), P(titulo(mes), { bold: true, center: true, after: linha })];
    montar(mes, ctx).forEach(bl => {
      kids.push(P(bl.titulo, { bold: true, before: linha, after: 120, keepNext: true }));
      bl.carretas.forEach(c => {
        kids.push(P(`• ${c.cab}`, { bold: true, before: 120, keepNext: true }));
        c.linhas.forEach(l => kids.push(P(`- ${l}`, { indent: true })));
      });
    });
    const rodape = new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT,
      children: [new TextRun({ children: [PageNumber.CURRENT], font, size: ABNT.pagina * 2 })] })] });
    const doc = new Document({
      creator: 'Escala das Carretas', title: `${TITULO} – ${titulo(mes)}`,
      styles: { default: { document: { run: { font, size: meia } } } },
      sections: [{
        properties: { page: { size: { width: 11906, height: 16838 },
          margin: { top: mmTwip(ABNT.topo), left: mmTwip(ABNT.esq), bottom: mmTwip(ABNT.base), right: mmTwip(ABNT.dir), header: mmTwip(TIMBRE.topo), footer: mmTwip(10) } } },
        headers: { default: cabecalho }, footers: { default: rodape }, children: kids
      }]
    });
    const blob = await Packer.toBlob(doc);
    return { blob, nome: nomeArquivo(mes, 'docx') };
  }

  // PDF A4 com a mesma formatação ABNT do Word. Texto real (pesquisável e copiável), não imagem.
  async function pdf(mes, ctx) {
    const [, logo] = await Promise.all([carregarPdf(), carregarLogo()]);
    const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
    doc.setProperties({ title: `${TITULO} – ${titulo(mes)}`, creator: 'Escala das Carretas' });
    const L = ABNT.esq, W = 210 - ABNT.esq - ABNT.dir, TOPO = ABNT.topo, BASE = 297 - ABNT.base;
    const pt = 0.3528, lh = ABNT.fonte * pt * ABNT.entrelinha; // altura de uma linha com entrelinha 1,5 (≈ 6,35 mm)
    let y = TOPO;
    const quebra = alt => { if (y + alt > BASE) { doc.addPage(); y = TOPO; } };
    const escrever = (txt, { negrito = false, recuo = 0, centro = false, antes = 0, depois = 0, junto = 0 } = {}) => {
      doc.setFont('helvetica', negrito ? 'bold' : 'normal'); doc.setFontSize(ABNT.fonte);
      const linhas = doc.splitTextToSize(txt, W - recuo - (recuo ? 3 : 0));
      if (y !== TOPO) y += antes;
      quebra(lh * (linhas.length + junto));
      linhas.forEach((l, i) => doc.text(l, centro ? L + W / 2 : L + recuo + (recuo && i ? 3 : 0), y + lh * i + ABNT.fonte * pt * 0.85, { align: centro ? 'center' : 'left' }));
      y += lh * linhas.length + depois;
    };
    escrever(TITULO, { negrito: true, centro: true });
    escrever(titulo(mes), { negrito: true, centro: true, depois: lh });
    montar(mes, ctx).forEach(bl => {
      escrever(bl.titulo, { negrito: true, antes: lh, depois: 2, junto: 3 });
      bl.carretas.forEach(c => {
        escrever(`• ${c.cab}`, { negrito: true, antes: 2, junto: 2 });
        c.linhas.forEach(l => escrever(`- ${l}`, { recuo: ABNT.recuo }));
      });
    });
    const total = doc.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
      doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(ABNT.pagina);
      doc.text(String(i), 210 - ABNT.dir, 297 - 10, { align: 'right' });
      doc.addImage(logo.dados, 'JPEG', (210 - logo.larg) / 2, TIMBRE.topo, logo.larg, logo.alt);
    }
    return { blob: doc.output('blob'), nome: nomeArquivo(mes, 'pdf') };
  }

  window.Relatorio = Object.freeze({ TITULO, montar, texto, word, pdf, titulo, cboNome, nomeMes, dataCurta, dataLonga, MESES, CBO_NOMES });
})();
