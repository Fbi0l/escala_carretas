// Testes no navegador do Carreta+ (Playwright + axe-core), sem internet e sem dados reais.
// Abre o site num servidor local, troca o Supabase por um falso (supabase-falso.js) e confere:
//  - entrada, aviso de privacidade, senha errada, termo de uso e cada tela do sistema;
//  - nenhum erro de JavaScript;
//  - acessibilidade (axe, WCAG 2.2 AA): falha com problemas sérios ou críticos;
//  - no computador e no celular. Prints em test-results/navegador/.
// Uso: npm run test:navegador   (CHROME_PATH=/caminho/do/chrome para usar um Chrome já instalado)
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const require = createRequire(import.meta.url);
const axeFonte = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const supabaseFalso = fs.readFileSync(path.join(raiz, 'tests/navegador/supabase-falso.js'), 'utf8');
const termoVersao = fs.readFileSync(path.join(raiz, 'app.js'), 'utf8').match(/TERMO_VERSAO = '([^']+)'/)[1];
const prints = path.join(raiz, 'test-results/navegador');
fs.mkdirSync(prints, { recursive: true });

// Servidor estático mínimo, só com os arquivos do site.
const tipos = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
const servidor = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const arq = path.join(raiz, p.endsWith('/') ? p + 'index.html' : p);
  if (!arq.startsWith(raiz) || !fs.existsSync(arq) || fs.statSync(arq).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': tipos[path.extname(arq)] || 'application/octet-stream' });
  fs.createReadStream(arq).pipe(res);
});
await new Promise(r => servidor.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${servidor.address().port}/`;

const navegador = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const problemasA11y = [];
let passos = 0;
const ok = msg => { passos++; console.log('  ✓ ' + msg); };

async function abrir(cenario, tamanho = { width: 1280, height: 860 }) {
  // bypassCSP só para injetar o axe; o site em si continua com a política normal no ar.
  const ctx = await navegador.newContext({ viewport: tamanho, serviceWorkers: 'block', bypassCSP: true, locale: 'pt-BR', timezoneId: 'America/Fortaleza' });
  await ctx.route(/vendor\/supabase-[\d.]+\.js/, r => r.fulfill({ contentType: 'text/javascript', body: supabaseFalso }));
  await ctx.route(/supabase\.co/, r => r.abort()); // nenhum pedido ao Supabase real
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) erros.push(m.text()); });
  await page.addInitScript(c => { window.__cenario = c; }, cenario);
  await page.goto(base);
  return { ctx, page, erros };
}

async function acessibilidade(page, onde) {
  await page.addScriptTag({ content: axeFonte });
  const r = await page.evaluate(async () => {
    const res = await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'], resultTypes: ['violations'] });
    return res.violations.map(v => ({ id: v.id, impacto: v.impact, ajuda: v.help, alvos: v.nodes.slice(0, 3).map(n => n.target.join(' ')) }));
  });
  for (const v of r) if (['serious', 'critical'].includes(v.impacto)) problemasA11y.push({ onde, ...v });
  const leves = r.filter(v => !['serious', 'critical'].includes(v.impacto));
  if (leves.length) console.log(`    (aviso, ${onde}) ` + leves.map(v => `${v.id}: ${v.ajuda}`).join(' | '));
}

async function foto(page, nome) { await page.screenshot({ path: path.join(prints, nome + '.png'), fullPage: true }); }

try {
  // 1. Entrada
  console.log('Entrada');
  let { ctx, page, erros } = await abrir({ logado: false, termo: null });
  await page.locator('#telaLogin').waitFor({ state: 'visible' });
  await page.locator('.aviso-priv summary').click();
  assert.match(await page.locator('#avisoPrivacidade').innerText(), /ASBRAS/);
  ok('tela de entrada com aviso de privacidade da ASBRAS');
  await acessibilidade(page, 'entrada'); await foto(page, 'entrada');
  await page.fill('#loginEmail', 'teste@exemplo.invalid'); await page.fill('#loginSenha', 'errada');
  await page.click('#formLogin button[type=submit]');
  await page.locator('#loginMsg', { hasText: 'E-mail ou senha incorretos' }).waitFor();
  ok('senha errada mostra a mensagem certa');

  // 2. Termo de uso no primeiro acesso
  console.log('Termo de uso');
  await page.fill('#loginSenha', 'senha-correta'); await page.click('#formLogin button[type=submit]');
  await page.locator('#telaTermo').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#app').isVisible(), false);
  assert.equal(await page.locator('#termoVersao').innerText(), termoVersao);
  ok('primeiro acesso mostra o termo antes do sistema');
  await acessibilidade(page, 'termo de uso'); await foto(page, 'termo-de-uso');
  await page.click('#formTermo button[type=submit]');
  await page.locator('#termoMsg', { hasText: 'marque que leu e aceita' }).waitFor();
  assert.equal((await page.evaluate(() => window.__chamadas)).filter(c => c.nome === 'aceitar_termo').length, 0);
  ok('sem marcar a caixa, não registra o aceite');
  await page.check('#termoAceite'); await page.click('#formTermo button[type=submit]');
  await page.locator('#app').waitFor({ state: 'visible' });
  const aceite = (await page.evaluate(() => window.__chamadas)).find(c => c.nome === 'aceitar_termo');
  assert.equal(aceite.args.p_versao, termoVersao);
  ok('aceite registrado com a versão atual e sistema aberto');

  // 3. Cada tela do sistema (administrador, computador)
  console.log('Telas (administrador)');
  for (const [vista, texto] of [['escalas', 'Município Exemplo'], ['relatorio', 'MEDICA EXEMPLO UM'], ['medicos', 'MEDICO EXEMPLO DOIS'],
    ['carretas', '1000004'], ['usuarios', 'Pessoa de Teste'], ['sobre', 'Introdução'], ['privacidade', 'Quem é responsável']]) {
    await page.evaluate(v => { location.hash = '#' + v; }, vista);
    await page.locator('#conteudo', { hasText: texto }).waitFor({ timeout: 8000 });
    await page.waitForTimeout(150);
    ok(`${vista}: abre e mostra "${texto}"`);
    await acessibilidade(page, vista); await foto(page, 'pc-' + vista);
  }
  assert.deepEqual(erros, [], 'erros de JavaScript: ' + erros.join(' | '));
  ok('nenhum erro de JavaScript');
  await ctx.close();

  // 4. Enfermagem: não vê Usuários
  console.log('Perfil enfermagem');
  ({ ctx, page, erros } = await abrir({ logado: true, perfil: 'enfermagem', termo: termoVersao }));
  await page.locator('#app').waitFor({ state: 'visible' });
  assert.equal(await page.locator('.so-admin').first().isVisible(), false);
  ok('enfermagem entra direto (termo já aceito) e não vê Usuários');
  await ctx.close();

  // 5. Celular
  console.log('Celular');
  ({ ctx, page, erros } = await abrir({ logado: false }, { width: 390, height: 844 }));
  await page.locator('#telaLogin').waitFor({ state: 'visible' });
  await acessibilidade(page, 'entrada (celular)'); await foto(page, 'celular-entrada');
  await ctx.close();
  ({ ctx, page, erros } = await abrir({ logado: true, termo: termoVersao }, { width: 390, height: 844 }));
  await page.locator('#app').waitFor({ state: 'visible' });
  for (const vista of ['escalas', 'relatorio', 'medicos']) {
    await page.evaluate(v => { location.hash = '#' + v; }, vista);
    await page.waitForTimeout(400);
    const largura = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(largura <= 392, `${vista} no celular não pode ter rolagem para o lado (largura ${largura})`);
    await acessibilidade(page, vista + ' (celular)'); await foto(page, 'celular-' + vista);
  }
  ok('celular: telas sem rolagem lateral');
  assert.deepEqual(erros, [], 'erros de JavaScript no celular: ' + erros.join(' | '));
  await ctx.close();

  if (problemasA11y.length) {
    console.error('\nProblemas de acessibilidade (sérios ou críticos):');
    for (const p of problemasA11y) console.error(`  - [${p.onde}] ${p.id} (${p.impacto}): ${p.ajuda} → ${p.alvos.join(' ; ')}`);
    throw new Error(`${problemasA11y.length} problema(s) de acessibilidade`);
  }
  console.log(`\nNavegador aprovado: ${passos} verificações, acessibilidade sem problemas sérios. Prints em test-results/navegador/.`);
} finally {
  await navegador.close();
  servidor.close();
}
