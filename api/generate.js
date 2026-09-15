import { requireUser } from "../lib/auth.js";
import { buildReport } from "../lib/report.js";

const DEFAULT_RECIPIENT = "comercial1@primecsg.com.br";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "50mb"
    }
  }
};

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    response.status(405).json({ error: "Método não permitido." });
    return;
  }

  if (!requireUser(request, response)) return;

  try {
    const payload =
      typeof request.body === "string" ? JSON.parse(request.body) : request.body;
    const report = await buildReport(payload);
    const recipient = reportRecipient(payload);
    const emailStatus = await sendReportEmail(report, recipient);

    response.setHeader("Content-Type", report.contentType);
    response.setHeader("Content-Disposition", `attachment; filename="${report.filename}"`);
    response.setHeader("X-Report-Format", report.format);
    response.setHeader("X-Report-Email", emailStatus);
    response.setHeader("X-Report-Recipient", recipient);
    response.setHeader(
      "Access-Control-Expose-Headers",
      "Content-Disposition, X-Report-Email, X-Report-Recipient, X-Report-Format"
    );
    response.status(200).send(report.buffer);
  } catch (error) {
    console.error(error);
    response.status(400).json({ error: error.message || "Falha ao gerar o relatório." });
  }
}

async function sendReportEmail(report, recipient) {
  if (!process.env.RESEND_API_KEY) return "not-configured";

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from:
          process.env.REPORT_FROM_EMAIL ||
          "Sistema de Medição <onboarding@resend.dev>",
        to: [recipient],
        subject: `Relatório fotográfico - ${report.metadata.competencia}`,
        html: `
          <h2>Relatório fotográfico de manutenção</h2>
          <p><strong>Competência:</strong> ${escapeHtml(report.metadata.competencia)}</p>
          <p><strong>Ordem de serviço:</strong> ${escapeHtml(report.metadata.ordemServico || "Não informada")}</p>
          <p><strong>Tipo de manutenção:</strong> ${escapeHtml(report.metadata.tipoManutencao || "Não informado")}</p>
          <p>O relatório em formato ${escapeHtml(report.formatLabel)} está anexado a esta mensagem.</p>
        `,
        attachments: [
          {
            filename: report.filename,
            content: report.buffer.toString("base64")
          }
        ]
      }),
      signal: AbortSignal.timeout(12000)
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error("Falha ao enviar e-mail:", detail);
      return "failed";
    }
  } catch (error) {
    console.error("Falha ao enviar e-mail:", error);
    return "failed";
  }

  return "sent";
}

function reportRecipient(payload = {}) {
  const requestedRecipient = String(payload.recipient || "").trim();
  if (isValidEmail(requestedRecipient)) return requestedRecipient;

  const configuredRecipient = String(process.env.REPORT_RECIPIENT || "").trim();
  if (isValidEmail(configuredRecipient)) return configuredRecipient;

  return DEFAULT_RECIPIENT;
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
