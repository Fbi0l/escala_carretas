# Carreta+ — guia para o Claude

Sistema **interno da ASBRAS** para montar a escala dos médicos nas 4 carretas de saúde (por CNES) e gerar o relatório mensal "Divisão de médicos por CNES" que vai para o operacional fazer o BPA. Site estático (HTML, CSS e JavaScript puros, sem build) com Supabase para banco, login e regras de acesso, no GitHub Pages, instalável no celular. Mesmo padrão do Avaliação Física e do Inventário. Responda sempre em português do Brasil, em linguagem simples: o dono não é programador.

## Onde fica cada coisa

- Site: https://fbi0l.github.io/escala_carretas/ (GitHub Pages; publica a cada envio para `main`).
- Supabase: projeto `escala-carretas`, ref `nbqepxdoatjemxefgtzz` (São Paulo, `sa-east-1`), na mesma organização do Avaliação Física.
- `config.js`: endereço, chave **publicável** e versão (`versao`). `app.js`: telas e regras. `relatorio.js`: PDF/Word/texto do relatório. `index.html`, `styles.css`, `sw.js`, `manifest.webmanifest`. Bibliotecas em `vendor/` (sem CDN).
- `supabase/migrations/`: banco, numeradas `00N_nome.sql` (007 termo de uso, 008 usuário da auditoria). `supabase/functions/`: `register-user` (cadastro por convite, JWT desligado) e `manage-users`.
- LGPD: `docs/lgpd/registro-de-tratamento.md` e `docs/lgpd/plano-de-incidentes.md`. A **ASBRAS é a controladora**; não há dados de pacientes, só da equipe e dos médicos (nome, CNS, CBO, vínculos, escalas). Prazo de guarda: 5 anos (BPA). Mudou tabela, campo ou fornecedor? Atualize o registro.
- Aviso de privacidade: texto único em `#avisoPrivacidade` no `index.html`. Termo de uso da equipe: `#telaTermo` no `index.html` e `TERMO_VERSAO` no `app.js` (aceite em `perfis_usuarios.termo_versao`, função `aceitar_termo`). **Mudou o texto do termo? Suba `TERMO_VERSAO`**: todos aceitam de novo.
- Backup: `BACKUP.md`, `scripts/backup.sh`, workflow `backup.yml` (desligado até o dono cadastrar as variáveis e `BACKUP_ENABLED=true`).
- Auditoria semanal do Supabase: `AUDITORIA_SUPABASE.md`, `scripts/auditoria-supabase*.{sh,sql}`, workflow `auditoria-supabase.yml` (desligado até definir a senha do `auditoria_leitura` e cadastrar `SUPABASE_AUDIT_DB_PASSWORD` + `AUDITORIA_ENABLED=true`). **Mudou tabela, política, função ou permissão? Atualize `docs/auditoria-supabase-esperado.txt` no mesmo envio** (gerar pelo conector do Supabase com a consulta de `scripts/auditoria-supabase-foto.sql` e conferir por hash).
- Dependabot: `.github/dependabot.yml` (bibliotecas de teste e ações do GitHub, toda segunda).

## Regras que não podem ser quebradas

- Toda tabela com RLS; visitantes sem login (`anon`) não leem nada. Funções das regras no esquema `privado`, `security definer`, `set search_path = ''`.
- No site só a chave publicável; `service_role` nunca no repositório.
- HTML montado em texto: **todo dado passa por `esc()`**. Preferir `textContent` em código novo.
- CSP: só arquivos do próprio site e o Supabase do projeto.
- Toda alteração em ações, médicos e carretas fica na tabela `auditoria`.
- Nomes acessíveis devem conter o texto visível (WCAG 2.5.3); nada de `aria-label` diferente do que aparece na tela.

## Versão

A versão aparece em `config.js` (`versao`), `index.html` (`?v=`), `sw.js` (nome do cache) e `package.json`. Ao publicar mudança visível, suba em todos e registre em **Versões** no `README.md`.

## Testes

- `npm test`: sintaxe e **teste no navegador** (`tests/navegador/`: Playwright + axe WCAG 2.2 AA, Supabase falso, computador e celular). Aqui no ambiente do Claude: `CHROME_PATH=/usr/bin/google-chrome npm test`. Roda no GitHub em "Teste no navegador" (ubuntu-24.04). Tela ou tabela nova? Acrescente em `supabase-falso.js` e `teste.mjs`.
- `tests/rls.sql`: regras de acesso por perfil; colar no SQL Editor (desfaz tudo no fim). Pelo conector, trocar o `select`/`rollback` finais por um `raise exception` com o resultado.

## Pendências

- Ligar o backup e a auditoria semanal (cadastrar variáveis e senhas no GitHub).
- Indicar o encarregado (DPO) ou canal de privacidade da ASBRAS (hoje é o administrador do sistema).
- Ligar no GitHub (Settings → Code security) os alertas e correções do Dependabot.
