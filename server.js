import http from "node:http";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import configHandler from "./api/config.js";
import generateHandler from "./api/generate.js";
import healthHandler from "./api/health.js";
import loginHandler from "./api/login.js";
import logoutHandler from "./api/logout.js";
import sessionHandler from "./api/session.js";
import { readSession } from "./lib/auth.js";

const ROOT = path.dirname(fileURLToPath(import.meta.url));

// Carrega variáveis de um .env ao lado do server.js, se existir (Hostoo).
try {
  const envFile = path.join(ROOT, ".env");
  if (typeof process.loadEnvFile === "function" && existsSync(envFile)) {
    process.loadEnvFile(envFile);
  }
} catch (error) {
  console.warn("Não foi possível carregar o .env:", error.message);
}

// Na Hostoo o Apache repassa medicao.argosvig.com.br para 127.0.0.1:3210.
const PORT = Number(process.env.PORT) || 3210;
const HOST = process.env.HOST || "127.0.0.1";
const MAX_BODY_BYTES = 50 * 1024 * 1024;

const API_ROUTES = {
  "/api/config": configHandler,
  "/api/generate": generateHandler,
  "/api/health": healthHandler,
  "/api/login": loginHandler,
  "/api/logout": logoutHandler,
  "/api/session": sessionHandler
};

// Rotas de API acessíveis sem sessão.
const PUBLIC_API = new Set(["/api/health", "/api/login", "/api/logout"]);

const STATIC_FILES = new Set([
  "/index.html",
  "/app.js",
  "/styles.css",
  "/login.html",
  "/login.js",
  "/favicon.ico"
]);

// Arquivos que a tela de login precisa carregar antes de o usuário entrar.
const PUBLIC_STATIC = new Set(["/login.html", "/login.js", "/styles.css", "/favicon.ico"]);

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
    if (!PUBLIC_API.has(pathname) && !readSession(request)) {
      response.setHeader("Cache-Control", "no-store");
      response.status(401).json({ error: "Sessão expirada. Entre novamente." });
      request.resume();
      return;
    }
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

  await serveStatic(pathname, request, response);
});

server.listen(PORT, HOST, () => {
  console.log(`Sistema de Medição rodando em http://${HOST}:${PORT}`);
});

async function serveStatic(pathname, request, response) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.setHeader("Allow", "GET, HEAD");
    response.status(405).json({ error: "Método não permitido." });
    return;
  }

  let requested = pathname === "/" ? "/index.html" : pathname;
  if (requested === "/login") requested = "/login.html";
  if (!STATIC_FILES.has(requested)) requested = "/index.html";

  const user = readSession(request);

  if (requested === "/login.html" && user) {
    redirect(response, "/");
    return;
  }

  if (!PUBLIC_STATIC.has(requested) && !user) {
    redirect(response, "/login");
    return;
  }

  await sendFile(requested, response, 200);
}

function redirect(response, location) {
  response.setHeader("Location", location);
  response.setHeader("Cache-Control", "no-store");
  response.status(302).end();
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
      requested.endsWith(".html") ? "no-store" : "public, max-age=3600"
    );
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "same-origin");
    if (requested.endsWith(".html")) response.setHeader("X-Frame-Options", "DENY");
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
