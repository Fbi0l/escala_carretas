# Plano de resposta a incidentes de segurança

Sistema **Carreta+** — atualizado em 20/11/2026.

**Incidente** é qualquer situação em que dados do sistema possam ter sido vistos, copiados, alterados ou apagados por quem não devia: senha de um usuário vazada, conta de ex-funcionário ainda ativa, celular perdido com o sistema aberto, chave do Supabase exposta, relatório enviado para o grupo errado, escala apagada por engano.

**Responsável:** o administrador do sistema, que avisa de imediato a direção da empresa e o encarregado de dados (quando houver). A decisão de comunicar à ANPD é da empresa, como controladora.

## 1. Conter (na primeira hora)

- [ ] Anote **quando** e **como** soube do problema (data, hora, quem avisou).
- [ ] Conta suspeita ou de ex-funcionário: em **Usuários**, bloqueie a conta (o acesso cai na hora) e troque a senha.
- [ ] Chave vazada: no Supabase, *Project Settings → API Keys*, gere uma nova chave secreta e publique de novo as funções `register-user` e `manage-users`. Se foi a senha do banco, troque em *Database → Reset database password*.
- [ ] Convite enviado à pessoa errada: cancele ou deixe vencer (48 h) e confira em **Usuários** se alguém entrou com ele.
- [ ] Relatório enviado ao destino errado: peça a exclusão da mensagem e anote quem recebeu.
- [ ] **Não apague** a tabela `auditoria` nem os logs do Supabase (*Logs*): eles mostram o que aconteceu.

## 2. Avaliar (em até 24 horas)

1. Quais dados foram atingidos? (nomes, CNS, escalas, contas da equipe)
2. De quantas pessoas?
3. Alguém de fato viu ou alterou, ou só poderia ter acessado? Confira a `auditoria`.
4. Que dano isso pode causar? (uso indevido do CNS, escala errada no BPA, exposição de dados da equipe)

**Precisa comunicar** à ANPD e aos titulares se o incidente puder trazer **risco ou dano relevante**. O CNS é um identificador pessoal: vazamento de CNS em volume costuma ser considerado relevante.

## 3. Comunicar (em até 3 dias úteis)

Prazo da Resolução CD/ANPD nº 15/2024, contado de quando a empresa soube que o incidente atingiu dados pessoais.

- [ ] **Direção da empresa e encarregado:** no mesmo dia.
- [ ] **ANPD:** formulário de comunicação de incidente no site da ANPD (gov.br/anpd), enviado pela empresa.
- [ ] **Médicos ou funcionários atingidos:** aviso simples dizendo o que aconteceu, quais dados, o que já foi feito e o que a pessoa pode fazer.

Modelo de aviso:

> Olá, [nome]. Em [data] identificamos [o que aconteceu, em uma frase]. Os dados seus que podem ter sido atingidos são [quais]. Já [medidas tomadas]. Se tiver dúvidas, fale com [contato].

## 4. Registrar e corrigir a causa

- [ ] Preencha o registro abaixo, **mesmo que não tenha sido preciso comunicar**: a ANPD pode pedir o histórico dos últimos 5 anos.
- [ ] Corrija a causa e rode `tests/rls.sql` antes de publicar.

## Registro de incidentes

| Data em que soube | O que aconteceu | Dados e pessoas atingidos | Comunicou ANPD? Quando? | Comunicou titulares? Quando? | Medidas tomadas |
|---|---|---|---|---|---|
| | | | | | |
