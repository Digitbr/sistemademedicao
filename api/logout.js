import { clearedSessionCookie } from "../lib/auth.js";

export default function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");

  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    response.status(405).json({ error: "Método não permitido." });
    return;
  }

  response.setHeader("Set-Cookie", clearedSessionCookie(request));
  response.status(200).json({ ok: true });
}
