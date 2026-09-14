const DEFAULT_RECIPIENT = "comercial1@primecsg.com.br";

export default function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    response.status(405).json({ error: "Método não permitido." });
    return;
  }

  response.setHeader("Cache-Control", "public, max-age=60, s-maxage=300");
  response.status(200).json({
    recipient: process.env.REPORT_RECIPIENT || DEFAULT_RECIPIENT,
    emailConfigured: Boolean(process.env.RESEND_API_KEY)
  });
}
