import {
  authenticate,
  clientKey,
  createSessionToken,
  sessionCookie
} from "../lib/auth.js";

export default function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");

  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    response.status(405).json({ error: "Método não permitido." });
    return;
  }

  try {
    const body =
      typeof request.body === "string" ? JSON.parse(request.body || "{}") : request.body || {};
    const email = String(body.email || "").trim();
    const password = String(body.password || "");

    if (!email || !password) {
      response.status(400).json({ error: "Informe e-mail e senha." });
      return;
    }

    const user = authenticate(email, password, clientKey(request));
    const token = createSessionToken(user);
    response.setHeader("Set-Cookie", sessionCookie(request, token));
    response.status(200).json({ user });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode >= 500) console.error("Falha no login:", error);
    response
      .status(statusCode)
      .json({ error: error.statusCode ? error.message : "Não foi possível entrar agora." });
  }
}
