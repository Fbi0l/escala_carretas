# Backup automático criptografado

Todo dia às **06h17 (Fortaleza)**, o GitHub faz uma cópia do banco do Carreta+, confere se ela pode ser lida por inteiro, **criptografa** com a chave do administrador e guarda por **30 dias** em *Actions → Backup criptografado*. A conexão diária também evita que o Supabase pause o projeto gratuito por falta de uso. É o mesmo modelo do Avaliação Física.

O banco tem dados pessoais dos médicos (nome e CNS) e da equipe (LGPD): o arquivo só sai do GitHub criptografado e só abre com a chave privada, que fica no computador do administrador. Como o repositório é público, isso é obrigatório.

**Começa desligado.** Só passa a rodar depois do passo 3 abaixo (`BACKUP_ENABLED = true`).

São dois arquivos por dia:

- `carretas_dados_…dump.age`: perfis, carretas, médicos, vínculos, ações, escalas, convites, auditoria, regras de acesso e funções (esquemas `public` e `privado`).
- `carretas_auth_…dump.age`: as contas de login (e-mail e hash da senha), para recriar o acesso num projeto novo.

Ficam de fora as configurações do login no painel do Supabase, as funções `register-user` e `manage-users` (estão em `supabase/functions`) e o gatilho em `auth.users` que exige convite (está nas migrações 005 e 006).

## Configurar (uma vez)

### 1. Chave de criptografia

Pode usar a mesma chave do Financeiro e do Avaliação Física. Mostre a parte pública no PowerShell:

```powershell
age-keygen -y "$HOME\BackupsFinanceiro\chave-privada-backup-age.txt"
```

A linha que começa com `age1…` é a chave pública (pode ser colada no chat). A chave privada **nunca** vai para o GitHub nem para o chat.

### 2. Dados de conexão

No Supabase, abra o projeto **escala-carretas** → botão **Connect** → **Session pooler**. Anote o host e o usuário (`postgres.nbqepxdoatjemxefgtzz`).

Se a senha do banco não estiver guardada, gere uma nova em *Project Settings → Database → Reset database password*. O site não usa essa senha, então trocá-la não afeta nada.

### 3. Cadastrar no GitHub

Em *Settings → Secrets and variables → Actions* do repositório `escala_carretas`:

| Aba | Nome | Valor |
|---|---|---|
| Variables | `SUPABASE_DB_HOST` | Host do *Session pooler* |
| Variables | `SUPABASE_DB_PORT` | `5432` |
| Variables | `SUPABASE_DB_USER` | `postgres.nbqepxdoatjemxefgtzz` |
| Variables | `BACKUP_AGE_RECIPIENT` | Chave pública `age1…` |
| Variables | `BACKUP_ENABLED` | `true` |
| **Secrets** | `SUPABASE_DB_PASSWORD` | Senha do banco (só você digita, nunca no chat) |

### 4. Primeiro teste

*Actions → Backup criptografado → Run workflow*. Ao terminar verde, baixe o artefato e teste a abertura:

```powershell
age --decrypt -i "$HOME\BackupsFinanceiro\chave-privada-backup-age.txt" `
  -o "$HOME\BackupsFinanceiro\carretas-teste.dump" "$HOME\Downloads\carretas_dados_DATA.dump.age"
```

O arquivo aberto tem nomes e CNS dos médicos: apague-o depois do teste e nunca o publique.

## Restaurar (em caso de perda)

1. Crie um projeto Supabase novo. **Não** aplique as migrações: o backup já recria tabelas, regras de acesso, permissões e funções.
2. Restaure primeiro as contas de login e depois os dados, pulando só o item `SCHEMA public`, que já existe:

```bash
pg_restore --no-owner --no-acl -d "$URL_DO_BANCO" carretas_auth.dump
pg_restore -l carretas_dados.dump | grep -vE ' SCHEMA - public ' > lista.txt
pg_restore --no-owner --exit-on-error -L lista.txt -d "$URL_DO_BANCO" carretas_dados.dump
```

3. Recrie o gatilho em `auth.users` que exige convite (migrações 005 e 006) e desligue o cadastro aberto (*Authentication → Sign In / Providers*).
4. Publique as funções: `register-user` (verificação de JWT desligada) e `manage-users`.
5. Troque o endereço e a chave publicável no `config.js`, e o endereço na política de segurança do `index.html`.
