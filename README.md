# Sistema de Medição

Aplicação web para cadastro, acompanhamento e exportação de medições e relatórios fotográficos.

## Recursos

- Dashboard com filtros por período e tipo de manutenção.
- Visão operacional de pendências, responsáveis e exportações.
- Registros editáveis, pesquisáveis e organizados em caixas.
- Ocorrências adicionadas sob demanda pelo botão "+", com edição e exclusão individual.
- Até quatro fotos por ocorrência (duas de entrada e duas de saída), cada uma com descrição editável.
- Backup e restauração do histórico local em JSON.
- Status de atividades concluídas ou em espera, com motivo obrigatório.
- Exportação de relatórios em PDF (uma ocorrência por página).
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

Em ambientes sem disco gravável (Vercel), configure as variáveis `AUTH_USERS` (JSON no mesmo formato de `data/users.json`) e `SESSION_SECRET` (mínimo de 32 caracteres). Sem elas, ninguém consegue entrar.

## Persistência

As medições ficam armazenadas no IndexedDB do navegador. Use `Exportar backup` na aba Registros para transferir ou proteger o histórico. Uma futura migração para PostgreSQL pode substituir essa camada sem alterar o formato dos registros.

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

Acesse http://localhost:3000.

## Verificação

```powershell
npm run check
```

## Produção

- Hostoo (principal): https://medicao.argosvig.com.br — código em `/public_html/medicao/app`, iniciado com `npm start`.
- Vercel (backup): https://sistemademedicao.vercel.app

