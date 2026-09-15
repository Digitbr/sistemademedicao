import { requireUser } from "../lib/auth.js";

export default function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    response.status(405).json({ error: "Método não permitido." });
    return;
  }

  const user = requireUser(request, response);
  if (!user) return;

  response.setHeader("Cache-Control", "no-store");
  response.status(200).json({ user });
}
