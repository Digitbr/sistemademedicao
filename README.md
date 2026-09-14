# Sistema de Medição

Aplicação web para cadastro, acompanhamento e exportação de medições e relatórios fotográficos.

## Recursos

- Dashboard com filtros por período e tipo de manutenção.
- Visão operacional de pendências, responsáveis e exportações.
- Registros editáveis, pesquisáveis e organizados em caixas.
- Backup e restauração do histórico local em JSON.
- Status de atividades concluídas ou em espera, com motivo obrigatório.
- Exportação de relatórios em Excel, Word e PowerPoint.
- Envio opcional do relatório por e-mail usando a Resend.

## Persistência

As medições ficam armazenadas no IndexedDB do navegador. Use `Exportar backup` na aba Registros para transferir ou proteger o histórico. Uma futura migração para PostgreSQL pode substituir essa camada sem alterar o formato dos registros.

## Variáveis de ambiente

Copie os nomes de `.env.example` para o ambiente da Vercel:

- `REPORT_RECIPIENT`: destinatário do relatório.
- `RESEND_API_KEY`: chave da Resend para ativar o envio.
- `REPORT_FROM_EMAIL`: remetente verificado na Resend.

Sem `RESEND_API_KEY`, o relatório escolhido continua sendo gerado e baixado normalmente.

## Executar localmente

```powershell
npm install
npx vercel dev
```

## Verificação

```powershell
npm run check
```

## Produção

https://sistema-medicao-phi.vercel.app/
