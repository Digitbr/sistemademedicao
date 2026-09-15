import { requireUser } from "../lib/auth.js";
import { storageBackend } from "../lib/storage.js";

const DEFAULT_RECIPIENT = "comercial1@primecsg.com.br";

export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    response.status(405).json({ error: "Método não permitido." });
    return;
  }

  if (!requireUser(request, response)) return;

  response.setHeader("Cache-Control", "private, no-store");
  let storage = "none";
  try {
    storage = (await storageBackend()).name;
  } catch (error) {
    console.error("Banco de dados indisponível:", error);
  }

  response.status(200).json({
    recipient: process.env.REPORT_RECIPIENT || DEFAULT_RECIPIENT,
    emailConfigured: Boolean(process.env.RESEND_API_KEY),
    storage
  });
}
