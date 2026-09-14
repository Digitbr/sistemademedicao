import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import configHandler from "./api/config.js";
import generateHandler from "./api/generate.js";
import healthHandler from "./api/health.js";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const MAX_BODY_BYTES = 50 * 1024 * 1024;

const API_ROUTES = {
  "/api/config": configHandler,
  "/api/generate": generateHandler,
  "/api/health": healthHandler
};

const STATIC_FILES = new Set([
  "/index.html",
  "/app.js",
  "/styles.css",
  "/favicon.ico"
]);

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml"
};

const server = http.createServer(async (request, response) => {
  decorateResponse(response);

  let pathname = "/";
  try {
    pathname = new URL(request.url, "http://localhost").pathname;
  } catch {
    response.status(400).json({ error: "Requisição inválida." });
    return;
  }

  const apiHandler = API_ROUTES[pathname];
  if (apiHandler) {
    try {
      if (request.method === "POST" || request.method === "PUT") {
        request.body = await readJsonBody(request);
      }
      await apiHandler(request, response);
    } catch (error) {
      console.error(error);
      if (!response.headersSent) {
        response
          .status(error.statusCode || 400)
          .json({ error: error.message || "Falha ao processar a requisição." });
      }
    }
    return;
  }

  if (pathname.startsWith("/api/")) {
    response.status(404).json({ error: "Rota não encontrada." });
    return;
  }

  await serveStatic(pathname, response);
});

server.listen(PORT, HOST, () => {
  console.log(`Sistema de Medição rodando em http://${HOST}:${PORT}`);
});

async function serveStatic(pathname, response) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  if (!STATIC_FILES.has(requested)) {
    await sendFile("/index.html", response, 200);
    return;
  }
  await sendFile(requested, response, 200);
}

async function sendFile(requested, response, statusCode) {
  const filePath = path.join(ROOT, requested);
  if (!filePath.startsWith(ROOT)) {
    response.status(403).json({ error: "Acesso negado." });
    return;
  }

  try {
    const body = await fs.readFile(filePath);
    const type = CONTENT_TYPES[path.extname(filePath)] || "application/octet-stream";
    response.setHeader("Content-Type", type);
    response.setHeader(
      "Cache-Control",
      requested === "/index.html" ? "no-cache" : "public, max-age=3600"
    );
    response.status(statusCode).end(body);
  } catch {
    response.status(404);
    response.setHeader("Content-Type", "text/plain; charset=utf-8");
    response.end("Arquivo não encontrado.");
  }
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        const error = new Error("Conteúdo enviado excede o limite de 50 MB.");
        error.statusCode = 413;
        request.destroy();
        reject(error);
        return;
      }
      chunks.push(chunk);
    });

    request.on("error", reject);

    request.on("end", () => {
      if (!chunks.length) {
        resolve({});
        return;
      }
      const raw = Buffer.concat(chunks).toString("utf8");
      try {
        resolve(JSON.parse(raw));
      } catch {
        const error = new Error("JSON inválido.");
        error.statusCode = 400;
        reject(error);
      }
    });
  });
}

function decorateResponse(response) {
  response.status = (code) => {
    response.statusCode = code;
    return response;
  };
  response.json = (data) => {
    if (!response.headersSent) {
      response.setHeader("Content-Type", "application/json; charset=utf-8");
    }
    response.end(JSON.stringify(data));
    return response;
  };
  response.send = (body) => {
    if (body === undefined || body === null) {
      response.end();
      return response;
    }
    response.end(Buffer.isBuffer(body) ? body : String(body));
    return response;
  };
  return response;
}
