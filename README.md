# Carreta+ · Escala médica das carretas

Sistema para montar a escala dos médicos em cada carreta (por CNES) e gerar o relatório mensal
**"Divisão de médicos por CNES"** que vai para o operacional fazer o BPA.

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

## Uso interno e LGPD

- **Sistema interno** desenvolvido para a empresa que opera as carretas. Só a equipe da empresa usa
  (administrador e enfermagem), e o acesso é por convite. Não é vendido nem aberto ao público.
- A **empresa é a controladora** dos dados. Os dados pessoais são os da equipe (contas) e os dos médicos
  (nome, CNS, CBO, vínculos e escalas), usados para montar a escala e enviar o BPA. **Não há dados de pacientes.**
- Base legal: contrato de trabalho (equipe); contrato com o médico e obrigação regulatória do SUS (médicos);
  legítimo interesse e segurança (convites e auditoria).
- Os dados ficam no Supabase em **São Paulo**. O site (GitHub Pages) não guarda dados. Sem cookies de
  rastreamento, analytics, CDN externa ou inteligência artificial.
- Documentos em `docs/lgpd/`:
  - `registro-de-tratamento.md`: o que é guardado, para quê, base legal, quem acessa e por quanto tempo;
  - `plano-de-incidentes.md`: o que fazer se houver vazamento ou acesso indevido.
- Pendências: definir com a empresa o prazo de guarda das escalas e da auditoria e o encarregado (DPO)
  ou canal de contato; criar o backup do banco; aviso de privacidade e aceite do termo de uso pela equipe.

## Estrutura

```
index.html, styles.css, app.js, relatorio.js, config.js   site
sw.js, manifest.webmanifest, assets/                     app instalável, ícones e fonte Inter (OFL)
vendor/                                                  bibliotecas locais
supabase/migrations/                                     banco: tabelas, regras e funções (em ordem)
supabase/functions/                                      register-user (cadastro por convite) e manage-users
tests/rls.sql                                            teste das regras de acesso (roda e desfaz tudo)
```

## Publicação

O site é publicado pelo **GitHub Pages** a partir da branch `main` (pasta raiz).
As funções do Supabase são publicadas com:

```bat
npx supabase functions deploy register-user --no-verify-jwt
npx supabase functions deploy manage-users
```

Para testar as regras de acesso, cole `tests/rls.sql` no SQL Editor do Supabase: todas as linhas devem vir com `ok = true`.
O script cria usuários de teste e **desfaz tudo** no final.
