import { requireUser } from "../lib/auth.js";
import { storageBackend, validId } from "../lib/storage.js";

const MAX_RECORD_CHARS = 2 * 1024 * 1024;

export default async function handler(request, response) {
  if (!requireUser(request, response)) return;
  response.setHeader("Cache-Control", "no-store");

  try {
    const storage = await storageBackend();
    const params = new URL(request.url, "http://localhost").searchParams;

    if (request.method === "GET") {
      const id = params.get("id");
      if (id) {
        if (!validId(id)) return response.status(400).json({ error: "Registro inválido." });
        const record = await storage.getRecord(id);
        if (!record) return response.status(404).json({ error: "Registro não encontrado." });
        return response.status(200).json({ record });
      }
      const records = await storage.listRecords();
      records.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
      return response.status(200).json({ records });
    }

    if (request.method === "PUT" || request.method === "POST") {
      const body = typeof request.body === "string" ? JSON.parse(request.body || "{}") : request.body || {};
      const record = body.record || body;
      if (!record || !validId(record.id) || !Array.isArray(record.activities)) {
        return response.status(400).json({ error: "Registro inválido." });
      }
      if (JSON.stringify(record).length > MAX_RECORD_CHARS) {
        return response
          .status(413)
          .json({ error: "Registro grande demais. As fotos devem ser enviadas como arquivos." });
      }
      await storage.putRecord(record);
      return response.status(200).json({ record });
    }

    if (request.method === "DELETE") {
      const id = params.get("id");
      if (!validId(id)) return response.status(400).json({ error: "Registro inválido." });
      await storage.deleteRecord(id);
      return response.status(200).json({ ok: true });
    }

    response.setHeader("Allow", "GET, PUT, POST, DELETE");
    return response.status(405).json({ error: "Método não permitido." });
  } catch (error) {
    console.error("Falha em /api/records:", error);
    return response
      .status(error.statusCode || 500)
      .json({ error: error.statusCode ? error.message : "Falha ao acessar o banco de dados." });
  }
}
