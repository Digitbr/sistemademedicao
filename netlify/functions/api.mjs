// Função única do Netlify que atende /api/* reaproveitando os mesmos handlers
// usados pelo servidor Node (server.js) e pela Vercel.
import configHandler from "../../api/config.js";
import filesHandler from "../../api/files.js";
import generateHandler from "../../api/generate.js";
import healthHandler from "../../api/health.js";
import loginHandler from "../../api/login.js";
import logoutHandler from "../../api/logout.js";
import recordsHandler from "../../api/records.js";
import sessionHandler from "../../api/session.js";

// Sem Netlify Blobs, o Netlify fica sem disco gravável persistente: o
// backend cai para "none" (mesmo comportamento da Vercel — os registros
// ficam no IndexedDB do navegador).
process.env.MEDICAO_STORAGE = process.env.MEDICAO_STORAGE || "none";
process.env.MEDICAO_SERVERLESS = "1";

const ROUTES = {
  "/api/config": configHandler,
  "/api/files": filesHandler,
  "/api/generate": generateHandler,
  "/api/health": healthHandler,
  "/api/login": loginHandler,
  "/api/logout": logoutHandler,
  "/api/records": recordsHandler,
  "/api/session": sessionHandler
};

export default async (req, context) => {
  const url = new URL(req.url);
  const handler = ROUTES[url.pathname.replace(/\/+$/, "")];
  if (!handler) return Response.json({ error: "Rota não encontrada." }, { status: 404 });

  const headers = {};
  req.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });

  const request = {
    method: req.method,
    url: url.pathname + url.search,
    headers,
    socket: { remoteAddress: context?.ip || "" },
    rawBody: Buffer.alloc(0),
    body: {}
  };

  if (req.method === "POST" || req.method === "PUT") {
    request.rawBody = Buffer.from(await req.arrayBuffer());
    if (url.pathname !== "/api/files" && request.rawBody.length) {
      try {
        request.body = JSON.parse(request.rawBody.toString("utf8"));
      } catch {
        return Response.json({ error: "JSON inválido." }, { status: 400 });
      }
    }
  }

  const response = createResponse();
  try {
    await handler(request, response);
  } catch (error) {
    console.error(error);
    if (!response.finished) {
      response.status(error.statusCode || 500).json({ error: error.message || "Falha ao processar a requisição." });
    }
  }

  const outHeaders = new Headers();
  for (const [key, value] of Object.entries(response.headers)) {
    if (Array.isArray(value)) value.forEach((item) => outHeaders.append(key, item));
    else outHeaders.set(key, String(value));
  }

  const body = response.body;
  const stream =
    body && body.length
      ? new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(body.buffer, body.byteOffset, body.byteLength));
            controller.close();
          }
        })
      : null;

  return new Response(req.method === "HEAD" ? null : stream, {
    status: response.statusCode,
    headers: outHeaders
  });
};

function createResponse() {
  const response = {
    statusCode: 200,
    headers: {},
    body: null,
    finished: false,
    headersSent: false,
    setHeader(name, value) {
      response.headers[name.toLowerCase()] = value;
    },
    getHeader(name) {
      return response.headers[name.toLowerCase()];
    },
    status(code) {
      response.statusCode = code;
      return response;
    },
    json(data) {
      if (!response.headers["content-type"]) {
        response.headers["content-type"] = "application/json; charset=utf-8";
      }
      return response.end(JSON.stringify(data));
    },
    send(data) {
      return response.end(data);
    },
    end(data) {
      if (data !== undefined && data !== null) {
        response.body = Buffer.isBuffer(data) ? data : Buffer.from(String(data));
      }
      response.finished = true;
      response.headersSent = true;
      return response;
    }
  };
  return response;
}

export const config = {
  path: "/api/*"
};
