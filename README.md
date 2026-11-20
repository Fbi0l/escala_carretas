# Carreta+ · Escala médica das carretas

Sistema para montar a escala dos médicos em cada carreta (por CNES) e gerar o relatório mensal
**"Divisão de médicos por CNES"** que vai para o operacional fazer o BPA.

## Versões

### 1.2.2 — Nome acessível do botão da conta (20/11/2026)

- O verificador de acessibilidade novo (axe 4.14, trazido pelo Dependabot) exige que o nome lido pelo leitor de tela
  contenha o texto visível (WCAG 2.5.3). O botão da conta voltou a usar o próprio nome e perfil; no celular eles somem
  da tela, mas continuam para leitores de tela.
- Dependabot (`.github/dependabot.yml`) e auditoria semanal do Supabase (`AUDITORIA_SUPABASE.md`, migração 008,
  começa desligada até cadastrar a senha).

### 1.2.1 — Testes no navegador com acessibilidade (20/11/2026)

- Workflow **Teste no navegador** a cada envio (Playwright + axe, Supabase falso, computador e celular): ver **Testes**.
- Corrigido (achado pelo teste): texto do aviso de privacidade rolável pelo teclado, botão da conta com nome no celular
  e links do rodapé com área de toque de 24px.

### 1.2.0 — Privacidade, termo de uso e backup (20/11/2026)

- **Aviso de privacidade** da ASBRAS na entrada e em **Privacidade** (menu, Mais e rodapé).
- **Termo de uso da equipe:** aceite no primeiro acesso e a cada versão (migração 007, função `aceitar_termo`).
- **Backup diário criptografado** preparado (`BACKUP.md`, começa desligado).
- `docs/lgpd/`: registro das operações de tratamento e plano de resposta a incidentes.
- `tests/rls.sql` corrigido: desde a 006 os usuários de teste precisam de convite reservado; casos novos do termo.

## O que faz

- **Escalas:** para cada ação (local e data), escolhe quais médicos vão em cada uma das 4 carretas.
  O CBO entra sozinho, puxado do cadastro do médico **naquele CNES**. O sistema avisa quando um médico
  não tem vínculo com o CNES da carreta ou foi escalado em duas carretas no mesmo dia.
- **Relatório do mês:** baixa em PDF ou Word (.docx), copia o texto ou copia já formatado para o WhatsApp.
- **Médicos:** cadastro com CNS, CBO e vínculos por carreta (vindos das fichas do CNES).
- **Carretas:** CNES, nome e placa.
- **Usuários:** convites por link (48 horas, uso único), perfis, bloqueio, troca de senha e exclusão.
- Funciona no computador e no celular, e pode ser **instalado** como app.

## Perfis

| Perfil | Pode |
|---|---|
| Administrador | Tudo: usuários e convites, médicos, carretas, escalas e relatório |
| Enfermagem | Montar e editar escalas, ver médicos e carretas, gerar o relatório |

## Segurança

- **Nenhum dado fica neste repositório.** Médicos, CNS, escalas e contas ficam no Supabase,
  protegidos por login e por regras de acesso (RLS) em todas as tabelas. Visitantes sem login não leem nada.
- A chave em `config.js` é a chave **publicável** do Supabase: sozinha não dá acesso a nenhum dado.
- Conta bloqueada perde o acesso na hora (as regras do banco conferem o bloqueio a cada consulta).
- Senhas: mínimo de 8 caracteres e recusa de senhas vazadas (Have I Been Pwned, por k-anonimato).
- Política de segurança (CSP): o site só carrega arquivos dele mesmo e só conversa com o Supabase do projeto.
  As bibliotecas ficam em `vendor/` (Supabase JS 2.119.0, docx 9.15.4 e jsPDF 4.2.1), sem CDN.
- Toda alteração em ações, médicos e carretas fica registrada na **auditoria** (visível ao administrador).
- Backup diário criptografado (age) no GitHub Actions, guardado por 30 dias: ver `BACKUP.md`.
- **Auditoria semanal** da configuração de segurança do Supabase (RLS, políticas, permissões, funções), somente leitura,
  com um usuário que não lê dados: ver `AUDITORIA_SUPABASE.md`. Mudou o banco de propósito? Atualize
  `docs/auditoria-supabase-esperado.txt` no mesmo envio.
- **Dependabot** (`.github/dependabot.yml`): toda segunda confere atualizações das bibliotecas de teste e das ações do GitHub.

## Uso interno e LGPD

- **Sistema interno da ASBRAS**, empresa que opera as carretas. Só a equipe da empresa usa
  (administrador e enfermagem), e o acesso é por convite. Não é vendido nem aberto ao público.
- A **ASBRAS é a controladora** dos dados. Os dados pessoais são os da equipe (contas) e os dos médicos
  (nome, CNS, CBO, vínculos e escalas), usados para montar a escala e enviar o BPA. **Não há dados de pacientes.**
- Base legal: contrato de trabalho (equipe); contrato com o médico e obrigação regulatória do SUS (médicos);
  legítimo interesse e segurança (convites e auditoria).
- **Aviso de privacidade** na tela de entrada ("Aviso de privacidade") e dentro do sistema (menu da conta,
  "Mais" e rodapé → Privacidade). O texto fica só no `index.html` (`#avisoPrivacidade`).
- **Termo de uso da equipe:** cada usuário aceita no primeiro acesso e de novo a cada versão
  (`TERMO_VERSAO` no `app.js`; texto em `#telaTermo` no `index.html`). A versão e a data do aceite ficam
  em `perfis_usuarios` (migração 007, função `aceitar_termo`). Mudou o texto? Suba a data em `TERMO_VERSAO`.
- Prazo de guarda: contas até o desligamento; cadastros, escalas e auditoria por 5 anos (comprovação do BPA).
- Os dados ficam no Supabase em **São Paulo**. O site (GitHub Pages) não guarda dados. Sem cookies de
  rastreamento, analytics, CDN externa ou inteligência artificial.
- **Backup** diário criptografado no GitHub Actions: ver `BACKUP.md` (começa desligado até cadastrar as variáveis).
- Documentos em `docs/lgpd/`:
  - `registro-de-tratamento.md`: o que é guardado, para quê, base legal, quem acessa e por quanto tempo;
  - `plano-de-incidentes.md`: o que fazer se houver vazamento ou acesso indevido.
- Pendências: indicar o encarregado (DPO) da ASBRAS ou um canal de contato sobre dados (hoje é o
  administrador do sistema); ligar o backup.

## Estrutura

```
index.html, styles.css, app.js, relatorio.js, config.js   site
sw.js, manifest.webmanifest, assets/                     app instalável, ícones e fonte Inter (OFL)
vendor/                                                  bibliotecas locais
supabase/migrations/                                     banco: tabelas, regras e funções (em ordem)
supabase/functions/                                      register-user (cadastro por convite) e manage-users
tests/rls.sql                                            teste das regras de acesso (roda e desfaz tudo)
```

## Testes

- **No navegador (automático):** a cada envio ao GitHub, o workflow **Teste no navegador** abre o site num Chrome
  de teste com um Supabase **falso** (`tests/navegador/supabase-falso.js`, sem internet e sem dados reais) e confere
  a entrada, o aviso de privacidade, a senha errada, o termo de uso, todas as telas (administrador e enfermagem),
  no computador e no celular, sem erro de JavaScript e sem rolagem lateral. Também roda o **axe** e falha se houver
  problema de acessibilidade sério ou crítico (WCAG 2.2 AA). Os prints das telas ficam nos artefatos do workflow.
- No computador: `npm install`, `npx playwright install chromium` e `npm test`
  (ou `CHROME_PATH=/caminho/do/chrome npm test` para usar um Chrome já instalado).
- **Regras de acesso do banco:** `tests/rls.sql` (ver abaixo).
- Mudou uma tela? Acrescente a verificação em `tests/navegador/teste.mjs` e, se a tela usar uma tabela nova,
  os dados fictícios em `supabase-falso.js`.

## Publicação

O site é publicado pelo **GitHub Pages** a partir da branch `main` (pasta raiz).
As funções do Supabase são publicadas com:

```bat
npx supabase functions deploy register-user --no-verify-jwt
npx supabase functions deploy manage-users
```

Para testar as regras de acesso, cole `tests/rls.sql` no SQL Editor do Supabase: todas as linhas devem vir com `ok = true`.
O script cria usuários de teste e **desfaz tudo** no final.
