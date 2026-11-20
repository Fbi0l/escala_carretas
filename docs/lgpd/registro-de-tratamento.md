# Registro das operações de tratamento de dados (LGPD, art. 37)

Sistema **Carreta+** (escala médica das carretas) — atualizado em 20/11/2026. Revise sempre que entrar uma tabela, um campo ou um fornecedor novo.

**Papéis.** A **empresa** que opera as carretas é a **controladora**: é ela quem decide montar as escalas e enviar o BPA. O sistema é uma ferramenta interna, usada só pela equipe da empresa (perfis administrador e enfermagem). Não há dados de pacientes.

## Operações

| # | Operação | Dados | Titular | Finalidade | Base legal | Onde fica (tabela) | Quem acessa | Por quanto tempo |
|---|---|---|---|---|---|---|---|---|
| 1 | Contas da equipe | e-mail, senha (só o hash), nome, perfil, último acesso, bloqueio | funcionários | entrar no sistema e controlar o que cada um pode fazer | execução de contrato de trabalho (art. 7º, V) | Supabase Auth (`auth.users`), `perfis_usuarios` | o próprio usuário; administradores | até a exclusão da conta (desligamento) |
| 2 | Cadastro dos médicos | nome, CNS, função, CBO, observação, origem | médicos | escalar nas carretas e informar o BPA | execução de contrato com o médico (art. 7º, V) e cumprimento de obrigação regulatória do SUS (art. 7º, II) | `medicos` | administradores e enfermagem (leitura); administradores (edição) | enquanto o médico atuar nas carretas; depois, pelo prazo de guarda do BPA (definir com a empresa) |
| 3 | Vínculos por CNES | CNES, CBO, descrição e carga horária de cada médico | médicos | conferir se o médico pode atuar naquela carreta | idem | `medico_vinculos` | idem | idem |
| 4 | Escalas | local, data, carreta, médico, CBO, função | médicos | montar a escala e gerar o relatório "Divisão de médicos por CNES" | idem | `acoes`, `alocacoes` | administradores e enfermagem | pelo prazo de guarda do BPA (definir) |
| 5 | Carretas | CNES, nome, placa | — (não é dado pessoal) | identificar as unidades | — | `carretas` | todos os perfis | — |
| 6 | Convites | hash do link, perfil, validade, e-mail de quem usou | funcionários | dar acesso com segurança | legítimo interesse (art. 7º, IX) | `convites_cadastro` | só funções do servidor | até 48 h para o convite; o registro fica como histórico |
| 7 | Auditoria | quando, quem (id e e-mail), o que mudou e cópia do registro | funcionários e médicos | rastrear alterações e prevenir erros ou fraude | legítimo interesse (art. 7º, IX) e segurança (art. 46) | `auditoria` | só administradores | **sem prazo definido**: sugestão 5 anos, alinhado ao BPA |
| 8 | Relatório do mês | nomes dos médicos por carreta e data | médicos | enviar ao operacional para o BPA | idem à operação 2 | arquivo PDF/Word ou texto copiado (WhatsApp) | quem gera e quem recebe | fora do sistema: seguir a política interna da empresa |

## Fornecedores (operadores)

| Fornecedor | O que faz | Onde | Observação |
|---|---|---|---|
| Supabase | banco de dados, login, funções de cadastro e de usuários | São Paulo (sa-east-1) | dados não saem do Brasil |
| GitHub Pages | hospeda o site | Estados Unidos | o site não guarda dados |
| Have I Been Pwned | confere se a senha nova já vazou | global | recebe só os 5 primeiros caracteres do hash da senha |
| WhatsApp (Meta) | canal usado pela equipe para enviar o relatório | global | fora do sistema; enviar só para grupos internos da empresa |

O sistema **não usa** cookies de rastreamento, analytics, pixels, CDN externa nem inteligência artificial.

## Direitos dos titulares (art. 18)

- **Funcionários:** veem e trocam os próprios dados de acesso; o administrador corrige, bloqueia ou exclui a conta.
- **Médicos:** pedidos de acesso, correção ou exclusão vão ao administrador, que edita o cadastro. Um médico que já esteve numa escala não pode ser excluído (o histórico sustenta o BPA); nesse caso, mantém-se o registro pelo prazo de guarda e informa-se o motivo ao médico.
- Prazo de resposta: até 15 dias (art. 19, II).

## Pendências

- [ ] Definir o prazo de guarda das escalas e da auditoria com a empresa (sugestão: 5 anos, prazo usual de documentos do SUS).
- [ ] Indicar o encarregado (DPO) da empresa ou um canal de contato sobre dados.
- [ ] Backup: hoje não existe cópia de segurança do banco.
