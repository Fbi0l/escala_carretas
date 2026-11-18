/* Relatório "Divisão de médicos por CNES": monta o conteúdo do mês e gera texto ou Word (.docx).
   Tudo é gerado no próprio aparelho; nenhum dado vai para outro serviço. */
(function () {
  'use strict';
  const MESES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  const CBO_NOMES = {
    '225125': 'Médico clínico', '225250': 'Médico ginecologista e obstetra', '225255': 'Médico mastologista',
    '225320': 'Médico em radiologia e diagnóstico por imagem', '225124': 'Médico pediatra'
  };
  const cboNome = (cbo, desc) => CBO_NOMES[cbo] || (desc ? desc.charAt(0) + desc.slice(1).toLowerCase() : '');
  const dataCurta = s => { const [y, m, d] = s.split('-'); return `${d}/${m}/${y.slice(2)}`; };
  const nomeMes = ym => { const [y, m] = ym.split('-'); return `${MESES[+m - 1]} ${y}`; };

  // ctx: { acoes, carretas, medicos (Map id → médico com medico_vinculos), opcoes: {placa, nomeCarreta, cbo, funcao} }
  function montar(mes, ctx) {
    const o = ctx.opcoes;
    const acoes = ctx.acoes.filter(a => a.data.slice(0, 7) === mes)
      .sort((a, b) => a.data.localeCompare(b.data) || a.local.localeCompare(b.local, 'pt-BR'));
    return acoes.map(a => ({
      titulo: `DIVISÃO DAS CARRETAS – ${a.local} – DIA ${dataCurta(a.data)}`,
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
  function titulo(mes) { return `DIVISÃO DE MÉDICOS POR CNES – ${nomeMes(mes).toUpperCase()}`; }
  function texto(mes, ctx, whats) {
    const b = t => whats ? `*${t}*` : t;
    const out = [b(titulo(mes)), ''];
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
  const carregarPdf = () => carregar('jspdf-3.0.4.js', () => !!(window.jspdf && window.jspdf.jsPDF), 'PDF');
  const nomeArquivo = (mes, ext) => { const [y, m] = mes.split('-'); return `DIVISAO_DE_MEDICOS_POR_CNES_${MESES[+m - 1]}${y.slice(2)}.${ext}`; };
  async function word(mes, ctx) {
    await carregarDocx();
    const { Document, Packer, Paragraph, TextRun, AlignmentType } = window.docx;
    const font = 'Calibri';
    const P = (text, o = {}) => new Paragraph({
      alignment: o.center ? AlignmentType.CENTER : undefined,
      spacing: { before: o.before || 0, after: o.after ?? 60 },
      indent: o.indent ? { left: o.indent } : undefined,
      children: [new TextRun({ text, bold: !!o.bold, font, size: o.size || 22 })]
    });
    const kids = [P(titulo(mes), { bold: true, center: true, size: 26, after: 240 })];
    montar(mes, ctx).forEach(bl => {
      kids.push(P(bl.titulo, { bold: true, before: 240, after: 120 }));
      bl.carretas.forEach(c => { kids.push(P(`• ${c.cab}`, { bold: true, before: 120 })); c.linhas.forEach(l => kids.push(P(`- ${l}`, { indent: 280 }))); });
    });
    const doc = new Document({ creator: 'Escala das Carretas', title: titulo(mes),
      sections: [{ properties: { page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } }, children: kids }] });
    const blob = await Packer.toBlob(doc);
    return { blob, nome: nomeArquivo(mes, 'docx') };
  }

  // PDF em A4, com o mesmo conteúdo e ordem do Word. Texto real (pesquisável e copiável), não imagem.
  async function pdf(mes, ctx) {
    await carregarPdf();
    const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
    doc.setProperties({ title: titulo(mes), creator: 'Escala das Carretas' });
    const L = 20, W = 170, TOPO = 20, BASE = 282;
    let y = TOPO;
    const quebra = alt => { if (y + alt > BASE) { doc.addPage(); y = TOPO; } };
    const escrever = (txt, { tam = 10.5, negrito = false, recuo = 0, centro = false, antes = 0, depois = 1.2 } = {}) => {
      doc.setFont('helvetica', negrito ? 'bold' : 'normal'); doc.setFontSize(tam);
      const linhas = doc.splitTextToSize(txt, W - recuo), alt = tam * 0.42;
      y += antes; quebra(alt * linhas.length);
      linhas.forEach((l, i) => doc.text(l, centro ? L + W / 2 : L + recuo + (i ? 3 : 0), y + alt * (i + 1) - 0.8, { align: centro ? 'center' : 'left' }));
      y += alt * linhas.length + depois;
    };
    escrever(titulo(mes), { tam: 13, negrito: true, centro: true, depois: 5 });
    montar(mes, ctx).forEach(bl => {
      quebra(18);
      escrever(bl.titulo, { negrito: true, antes: 4, depois: 2 });
      bl.carretas.forEach(c => {
        quebra(10);
        escrever(`• ${c.cab}`, { negrito: true, antes: 1.5, depois: 1 });
        c.linhas.forEach(l => escrever(`- ${l}`, { recuo: 4 }));
      });
    });
    const total = doc.getNumberOfPages(), gerado = new Date().toLocaleDateString('pt-BR');
    for (let i = 1; i <= total; i++) {
      doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(110);
      doc.text(`Gerado em ${gerado}`, L, 290); doc.text(`Página ${i} de ${total}`, L + W, 290, { align: 'right' }); doc.setTextColor(0);
    }
    return { blob: doc.output('blob'), nome: nomeArquivo(mes, 'pdf') };
  }

  window.Relatorio = Object.freeze({ montar, texto, word, pdf, titulo, cboNome, nomeMes, dataCurta, MESES, CBO_NOMES });
})();
