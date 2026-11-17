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

  let carregando = null;
  function carregarDocx() {
    if (window.docx) return Promise.resolve();
    return carregando || (carregando = new Promise((ok, falha) => {
      const s = document.createElement('script');
      s.src = 'vendor/docx-9.15.4.js';
      s.onload = () => ok();
      s.onerror = () => { carregando = null; falha(new Error('Não foi possível carregar o gerador de Word. Verifique a conexão.')); };
      document.head.appendChild(s);
    }));
  }
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
    const [y, m] = mes.split('-');
    return { blob, nome: `DIVISAO_DE_MEDICOS_POR_CNES_${MESES[+m - 1]}${y.slice(2)}.docx` };
  }

  window.Relatorio = Object.freeze({ montar, texto, word, titulo, cboNome, nomeMes, dataCurta, MESES, CBO_NOMES });
})();
