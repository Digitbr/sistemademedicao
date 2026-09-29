# Pasta `mysql/`

Esta pasta guarda uma cópia do esquema de banco de dados do sistema, em
**MySQL/MariaDB**, já com os dados de um backup real populados — pronta
para importar em qualquer servidor MySQL 8.0+ ou MariaDB 10.11+.

**Importante:** isso é só documentação/backup, igual ao `schema.sql` que já
existe na raiz do repositório (que é a versão PostgreSQL do mesmo esquema).
O sistema em produção **não lê nem grava** neste banco — ele continua
guardando os dados como sempre guardou:

- Pasta `data/` em disco (arquivos `.json`), quando roda em servidor próprio
  (Hostoo);
- IndexedDB do navegador, quando hospedado na Vercel ou na Netlify.

`lib/storage.js` (o código que decide onde gravar/ler os dados) não foi
alterado. Nada aqui muda o comportamento do site.

## Arquivos

- **`schema.sql`** — cria as 5 tabelas (`users`, `files`, `file_parts`,
  `records`, `activities`), os índices e os triggers de `updated_at`.
  Equivalente ao `schema.sql` da raiz, mas em sintaxe MySQL/MariaDB
  (`CHAR(36)` no lugar de `UUID`, `DATETIME` no lugar de `TIMESTAMPTZ`,
  `LONGBLOB` no lugar de `BYTEA`, etc. — os detalhes da conversão estão
  comentados no topo do arquivo).
- **`data.sql`** — os `INSERT`s com os dados reais exportados de um backup
  do sistema (`Exportar backup` dentro do app): 5 registros, 5 ocorrências
  e 20 anexos (fotos), com o conteúdo binário das fotos incluído via
  `FROM_BASE64(...)`.

## Como importar

```bash
mysql -u SEU_USUARIO -p NOME_DO_BANCO < mysql/schema.sql
mysql -u SEU_USUARIO -p NOME_DO_BANCO < mysql/data.sql
```

(Rode primeiro o `schema.sql`, depois o `data.sql` — nessa ordem, porque o
segundo depende das tabelas do primeiro já existirem.)

## Sobre a tabela `users`

A tabela `users` é criada pelo `schema.sql`, mas **fica vazia** em
`data.sql` — o backup exportado pelo sistema não inclui login/senha (eles
ficam em `data/users.json`, fora do repositório, por segurança). Se quiser
povoar essa tabela também, rode no servidor onde o sistema está instalado:

```bash
node scripts/usuarios.js listar
```

e monte manualmente os `INSERT INTO users (...)` com e-mail, nome e o hash
de senha que esse comando mostrar (a senha em si não existe em texto puro
em lugar nenhum — só o hash `scrypt` já salvo — então não tem como
"recuperá-la", só copiar o hash como está).

## Validação

Este esquema e os dados foram carregados e testados em uma instância real
do MariaDB 10.11 antes de serem publicados: as 5 tabelas foram criadas sem
erros, os 5 registros / 5 ocorrências / 20 arquivos / 20 partes de arquivo
foram inseridos corretamente, os relacionamentos (chaves estrangeiras)
foram conferidos sem nenhum registro órfão, e o conteúdo binário de uma das
fotos foi comparado byte a byte com o arquivo original do backup
(idênticos).

## Diferenças em relação ao `schema.sql` (PostgreSQL) da raiz

| PostgreSQL                  | MySQL/MariaDB (aqui)          |
|------------------------------|--------------------------------|
| `UUID`                       | `CHAR(36)`                     |
| `gen_random_uuid()` (default) | gerado pelo script/aplicação (`UUID()`) |
| `TIMESTAMPTZ`                 | `DATETIME`                     |
| `BYTEA`                       | `LONGBLOB`                     |
| `decode(x, 'base64')`         | `FROM_BASE64(x)`               |
| Trigger em `plpgsql`          | Trigger nativo (`DELIMITER $$ ... END$$`) |
| `CREATE EXTENSION pgcrypto`   | não é necessário               |
