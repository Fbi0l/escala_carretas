# Registro das operações de tratamento de dados (LGPD, art. 37)

Sistema **Carreta+** (escala médica das carretas) — atualizado em 20/11/2026. Revise sempre que entrar uma tabela, um campo ou um fornecedor novo.

**Papéis.** A **ASBRAS**, empresa que opera as carretas, é a **controladora**: é ela quem decide montar as escalas e enviar o BPA. O sistema é uma ferramenta interna, usada só pela equipe da empresa (perfis administrador e enfermagem). Não há dados de pacientes.

## Operações

| # | Operação | Dados | Titular | Finalidade | Base legal | Onde fica (tabela) | Quem acessa | Por quanto tempo |
|---|---|---|---|---|---|---|---|---|
| 1 | Contas da equipe | e-mail, senha (só o hash), nome, perfil, último acesso, bloqueio, versão e data do aceite do termo de uso | funcionários | entrar no sistema e controlar o que cada um pode fazer | execução de contrato de trabalho (art. 7º, V) | Supabase Auth (`auth.users`), `perfis_usuarios` | o próprio usuário; administradores | até a exclusão da conta (desligamento) |
| 2 | Cadastro dos médicos | nome, CNS, função, CBO, observação, origem | médicos | escalar nas carretas e informar o BPA | execução de contrato com o médico (art. 7º, V) e cumprimento de obrigação regulatória do SUS (art. 7º, II) | `medicos` | administradores e enfermagem (leitura); administradores (edição) | enquanto o médico atuar nas carretas e, depois, 5 anos (comprovação do BPA) |
| 3 | Vínculos por CNES | CNES, CBO, descrição e carga horária de cada médico | médicos | conferir se o médico pode atuar naquela carreta | idem | `medico_vinculos` | idem | idem |
| 4 | Escalas | local, data, carreta, médico, CBO, função | médicos | montar a escala e gerar o relatório "Divisão de médicos por CNES" | idem | `acoes`, `alocacoes` | administradores e enfermagem | 5 anos (comprovação do BPA) |
| 5 | Carretas | CNES, nome, placa | — (não é dado pessoal) | identificar as unidades | — | `carretas` | todos os perfis | — |
| 6 | Convites | hash do link, perfil, validade, e-mail de quem usou | funcionários | dar acesso com segurança | legítimo interesse (art. 7º, IX) | `convites_cadastro` | só funções do servidor | até 48 h para o convite; o registro fica como histórico |
| 7 | Auditoria | quando, quem (id e e-mail), o que mudou e cópia do registro | funcionários e médicos | rastrear alterações e prevenir erros ou fraude | legítimo interesse (art. 7º, IX) e segurança (art. 46) | `auditoria` | só administradores | 5 anos |
| 8 | Relatório do mês | nomes dos médicos por carreta e data | médicos | enviar ao operacional para o BPA | idem à operação 2 | arquivo PDF/Word ou texto copiado (WhatsApp) | quem gera e quem recebe | fora do sistema: seguir a política interna da empresa |

## Fornecedores (operadores)

| Fornecedor | O que faz | Onde | Observação |
|---|---|---|---|
| Supabase | banco de dados, login, funções de cadastro e de usuários | São Paulo (sa-east-1) | dados não saem do Brasil |
| GitHub Pages | hospeda o site | Estados Unidos | o site não guarda dados |
| Have I Been Pwned | confere se a senha nova já vazou | global | recebe só os 5 primeiros caracteres do hash da senha |
| GitHub Actions | guarda o backup diário do banco, criptografado (age) | Estados Unidos | transferência internacional (art. 33); só abre com a chave do administrador; 30 dias |
| WhatsApp (Meta) | canal usado pela equipe para enviar o relatório | global | fora do sistema; enviar só para grupos internos da empresa |

O sistema **não usa** cookies de rastreamento, analytics, pixels, CDN externa nem inteligência artificial.

## Segurança (art. 46)

- RLS em todas as tabelas; visitantes sem login não leem nada; conta bloqueada perde o acesso na hora.
- Testes no navegador com acessibilidade a cada envio; regras de acesso em `tests/rls.sql`.
- Auditoria semanal da configuração do Supabase com o usuário `auditoria_leitura`, que **não lê nenhum dado** (`AUDITORIA_SUPABASE.md`; começa desligada).
- Dependabot avisa de atualizações e falhas conhecidas nas bibliotecas de teste e nas ações do GitHub.

## Direitos dos titulares (art. 18)

- **Funcionários:** veem e trocam os próprios dados de acesso; o administrador corrige, bloqueia ou exclui a conta.
- **Médicos:** pedidos de acesso, correção ou exclusão vão ao administrador, que edita o cadastro. Um médico que já esteve numa escala não pode ser excluído (o histórico sustenta o BPA); nesse caso, mantém-se o registro pelo prazo de guarda e informa-se o motivo ao médico.
- Prazo de resposta: até 15 dias (art. 19, II).

## Transparência

- **Aviso de privacidade** na tela de entrada e dentro do sistema (Privacidade).
- **Termo de uso** aceito por cada usuário no primeiro acesso e a cada versão (registro em `perfis_usuarios`).

## Pendências

- [x] Prazo de guarda: 5 anos para cadastros, escalas e auditoria (20/11/2026).
- [ ] Indicar o encarregado (DPO) da ASBRAS ou um canal de contato sobre dados. Até lá, o canal é o administrador do sistema.
- [x] Backup preparado (`BACKUP.md`); [ ] ligar, cadastrando as variáveis no GitHub.
- [ ] Rotina de exclusão após 5 anos (hoje manual, pelo administrador).
