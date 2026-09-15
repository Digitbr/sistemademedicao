import { requireUser } from "../lib/auth.js";
import { MAX_FILE_BYTES, MAX_PART_BYTES, storageBackend, validId } from "../lib/storage.js";

export const config = { api: { bodyParser: false } };

export default async function handler(request, response) {
  if (!requireUser(request, response)) return;

  try {
    const storage = await storageBackend();
    const params = new URL(request.url, "http://localhost").searchParams;
    const id = params.get("id");
    if (!validId(id)) return response.status(400).json({ error: "Arquivo inválido." });

    if (request.method === "POST" || request.method === "PUT") {
      const part = Number(params.get("part"));
      const parts = Number(params.get("parts"));
      const size = Number(params.get("size"));
      const body = Buffer.isBuffer(request.rawBody) ? request.rawBody : Buffer.alloc(0);

      if (!Number.isInteger(parts) || parts < 1 || parts > Math.ceil(MAX_FILE_BYTES / MAX_PART_BYTES) + 1) {
        return response.status(400).json({ error: "Envio de arquivo inválido." });
      }
      if (!Number.isInteger(part) || part < 0 || part >= parts) {
        return response.status(400).json({ error: "Parte do arquivo inválida." });
      }
      if (!body.length || body.length > MAX_PART_BYTES) {
        return response.status(413).json({ error: "Parte do arquivo com tamanho inválido." });
      }
      if (!Number.isFinite(size) || size <= 0 || size > MAX_FILE_BYTES) {
        return response.status(413).json({ error: "O arquivo passa de 15 MB." });
      }

      await storage.putFilePart(id, part, body);

      if (part === parts - 1) {
        const meta = {
          id,
          name: String(params.get("name") || "arquivo").slice(0, 200),
          type: String(params.get("type") || "application/octet-stream").slice(0, 120),
          size,
          parts,
          createdAt: new Date().toISOString()
        };
        await storage.putFileMeta(id, meta);
        // Confere se o arquivo ficou completo antes de confirmar ao navegador.
        const saved = await storage.getFileBuffer(id, meta);
        if (saved.length !== size) {
          return response.status(500).json({ error: "O arquivo não foi gravado por completo. Tente de novo." });
        }
      }

      response.setHeader("Cache-Control", "no-store");
      return response.status(200).json({ id, part, parts, url: `/api/files?id=${id}` });
    }

    if (request.method === "GET" || request.method === "HEAD") {
      const meta = await storage.getFileMeta(id);
      if (!meta) return response.status(404).json({ error: "Arquivo não encontrado." });
      const buffer = await storage.getFileBuffer(id, meta);
      response.setHeader("Content-Type", meta.type || "application/octet-stream");
      response.setHeader("Content-Length", String(buffer.length));
      response.setHeader("Cache-Control", "private, max-age=31536000, immutable");
      response.setHeader(
        "Content-Disposition",
        `inline; filename*=UTF-8''${encodeURIComponent(meta.name || "arquivo")}`
      );
      return response.status(200).send(request.method === "HEAD" ? undefined : buffer);
    }

    response.setHeader("Allow", "GET, HEAD, POST, PUT");
    return response.status(405).json({ error: "Método não permitido." });
  } catch (error) {
    console.error("Falha em /api/files:", error);
    return response
      .status(error.statusCode || 500)
      .json({ error: error.statusCode ? error.message : "Falha ao acessar o arquivo." });
  }
}
