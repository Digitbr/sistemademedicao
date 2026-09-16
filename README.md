# Sistema de Medição

Aplicação web para cadastro, acompanhamento e exportação de medições e relatórios fotográficos.

## Recursos

- Dashboard com filtros por período e tipo de manutenção.
- Visão operacional de pendências, responsáveis e exportações.
- Registros editáveis, pesquisáveis e organizados em caixas.
- Ocorrências adicionadas sob demanda pelo botão "+", com edição e exclusão individual.
- Até quatro anexos por ocorrência: dois de "Antes" (em cima) e dois de "Depois" (embaixo), cada um com descrição editável. Aceita fotos ou qualquer tipo de documento.
- Backup e restauração do histórico local em JSON.
- Status de atividades concluídas ou em espera, com motivo obrigatório.
- Exportação do relatório em PDF, Excel (.xlsx), PowerPoint (.pptx) ou Word (.docx): uma ocorrência por página, slide ou aba (no Excel há também a aba "Resumo").
- Envio opcional do relatório por e-mail usando a Resend.
- Tela de login: o sistema e a API só funcionam para usuários autenticados.
- Logo do Grupo Autoglass no cabeçalho de cada página do PDF.

## Acesso (login)

As senhas não ficam no repositório. Cada servidor guarda os usuários em `data/users.json` (ignorado pelo Git), com a senha em hash scrypt. A chave que assina a sessão é criada automaticamente em `data/session-secret` na primeira execução.

```bash
node scripts/usuarios.js adicionar <email> <senha> [nome]
node scripts/usuarios.js remover <email>
node scripts/usuarios.js listar
```

Depois de adicionar ou remover usuários não é preciso reiniciar o servidor. A sessão dura 12 horas; após 5 tentativas erradas o login daquele e-mail fica bloqueado por 15 minutos.

Em ambientes sem disco gravável (Netlify, Vercel), configure a variável `AUTH_USERS` com o JSON no mesmo formato de `data/users.json` (gere com `node scripts/usuarios.js adicionar ...` e copie o conteúdo do arquivo). `SESSION_SECRET` é opcional; sem ela, a chave de sessão é derivada de `AUTH_USERS`. Sem `AUTH_USERS`, ninguém consegue entrar.

## Banco de dados

O lugar onde as medições ficam guardadas depende de onde o sistema está hospedado:

- **Netlify**: banco no Netlify Blobs (stores `medicao-registros` e `medicao-arquivos`). Registros e anexos ficam no servidor e aparecem em qualquer aparelho.
- **Servidor Node próprio** (`npm start`): pasta `data/` do servidor (`data/records` e `data/files`).
- **Vercel**: sem banco; os registros ficam no IndexedDB do navegador.

Cada anexo (foto ou documento) é enviado separadamente para `/api/files` em partes de 2 MB e o registro guarda só a referência. Fotos são convertidas para JPG no navegador antes do envio; qualquer outro tipo de arquivo (PDF, Word, planilha, texto etc., até 15 MB) é guardado como está e aparece no relatório pelo nome. Quando o sistema passa a usar o banco, os registros que estavam só no navegador são enviados uma vez automaticamente. `Exportar backup` na aba Registros continua disponível.

### Netlify

O `netlify.toml` já traz a configuração: build `npm run build:netlify`, publicação da pasta `dist` e a função `netlify/functions/api.mjs`, que atende `/api/*` com os mesmos handlers do servidor Node. No painel do site, cadastre a variável `AUTH_USERS` (veja "Acesso").

## Variáveis de ambiente

Configure no ambiente do servidor (opcional):

- `REPORT_RECIPIENT`: destinatário do relatório.
- `RESEND_API_KEY`: chave da Resend para ativar o envio.
- `REPORT_FROM_EMAIL`: remetente verificado na Resend.

Sem `RESEND_API_KEY`, o relatório em PDF continua sendo gerado e baixado normalmente.

## Executar localmente

```bash
npm install
node scripts/usuarios.js adicionar voce@empresa.com suaSenha
npm start
```

Acesse http://localhost:3210.

## Verificação

```powershell
npm run check
```

## Produção

- Hostoo (principal): https://medicao.argosvig.com.br — código em `/public_html/medicao/app`, iniciado com `npm start`.
- Vercel (backup): https://sistemademedicao.vercel.app

