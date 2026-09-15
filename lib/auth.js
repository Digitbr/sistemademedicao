import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const SESSION_COOKIE = "medicao_session";
export const SESSION_TTL_SECONDS = 12 * 60 * 60;

const DATA_DIR = process.env.AUTH_DATA_DIR || path.join(ROOT, "data");
const USERS_FILE = process.env.AUTH_USERS_FILE || path.join(DATA_DIR, "users.json");
const SECRET_FILE = path.join(DATA_DIR, "session-secret");

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;

const MAX_FAILURES = 5;
const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const failures = new Map();

// Hash usado quando o e-mail não existe, para o tempo de resposta não revelar
// quais contas estão cadastradas.
const DUMMY_HASH = hashPassword(crypto.randomBytes(18).toString("hex"));

let cachedSecret = null;

export function normalizeEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(String(password), salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P
  });
  return [
    "scrypt",
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString("base64url"),
    derived.toString("base64url")
  ].join("$");
}

export function verifyPassword(password, stored) {
  const parts = String(stored || "").split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltText, hashText] = parts;
  try {
    const expected = Buffer.from(hashText, "base64url");
    const derived = crypto.scryptSync(
      String(password),
      Buffer.from(saltText, "base64url"),
      expected.length,
      { N: Number(n), r: Number(r), p: Number(p) }
    );
    return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

export function loadUsers() {
  const raw = process.env.AUTH_USERS || readFileIfExists(USERS_FILE);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : parsed.users;
    return (Array.isArray(list) ? list : [])
      .filter((user) => user && user.email && user.hash)
      .map((user) => ({
        email: normalizeEmail(user.email),
        name: String(user.name || user.email).trim(),
        role: String(user.role || "usuario").trim(),
        hash: String(user.hash)
      }));
  } catch (error) {
    console.error("Não foi possível ler a lista de usuários:", error.message);
    return [];
  }
}

export function saveUsers(users) {
  fs.mkdirSync(path.dirname(USERS_FILE), { recursive: true, mode: 0o700 });
  fs.writeFileSync(USERS_FILE, `${JSON.stringify({ users }, null, 2)}\n`, {
    mode: 0o600
  });
  return USERS_FILE;
}

export function authenticate(email, password, clientKey = "") {
  const normalized = normalizeEmail(email);
  const limiterKey = `${clientKey}|${normalized}`;

  if (isLocked(limiterKey)) {
    const error = new Error(
      "Muitas tentativas sem sucesso. Aguarde alguns minutos e tente novamente."
    );
    error.statusCode = 429;
    throw error;
  }

  const users = loadUsers();
  if (!users.length) {
    const error = new Error(
      "Nenhum usuário cadastrado neste servidor. Cadastre os acessos antes de entrar."
    );
    error.statusCode = 503;
    throw error;
  }

  const user = users.find((item) => item.email === normalized);
  const valid = verifyPassword(password, user ? user.hash : DUMMY_HASH) && Boolean(user);

  if (!valid) {
    registerFailure(limiterKey);
    const error = new Error("E-mail ou senha incorretos.");
    error.statusCode = 401;
    throw error;
  }

  failures.delete(limiterKey);
  return { email: user.email, name: user.name, role: user.role };
}

export function createSessionToken(user) {
  const payload = {
    email: user.email,
    name: user.name,
    role: user.role,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function readSession(request) {
  const token = parseCookies(request.headers?.cookie)[SESSION_COOKIE];
  if (!token || !token.includes(".")) return null;

  const [body, signature] = token.split(".", 2);
  let expected;
  try {
    expected = sign(body);
  } catch {
    return null;
  }
  const given = Buffer.from(String(signature));
  const wanted = Buffer.from(expected);
  if (given.length !== wanted.length || !crypto.timingSafeEqual(given, wanted)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;

    // A sessão só vale enquanto o usuário continuar cadastrado.
    const user = loadUsers().find((item) => item.email === normalizeEmail(payload.email));
    if (!user) return null;
    return { email: user.email, name: user.name, role: user.role };
  } catch {
    return null;
  }
}

export function sessionCookie(request, token) {
  return serializeCookie(request, token, SESSION_TTL_SECONDS);
}

export function clearedSessionCookie(request) {
  return serializeCookie(request, "", 0);
}

export function requireUser(request, response) {
  const user = readSession(request);
  if (user) return user;
  response.setHeader("Cache-Control", "no-store");
  response.status(401).json({ error: "Sessão expirada. Entre novamente." });
  return null;
}

export function clientKey(request) {
  const forwarded = String(request.headers?.["x-forwarded-for"] || "")
    .split(",")[0]
    .trim();
  return forwarded || request.socket?.remoteAddress || "";
}

function sign(value) {
  return crypto.createHmac("sha256", sessionSecret()).update(value).digest("base64url");
}

function sessionSecret() {
  if (cachedSecret) return cachedSecret;

  const fromEnv = String(process.env.SESSION_SECRET || "").trim();
  if (fromEnv.length >= 32) {
    cachedSecret = fromEnv;
    return cachedSecret;
  }

  // Em funções serverless (Netlify/Vercel) cada instância tem seu próprio disco
  // temporário; a chave precisa ser igual em todas, então é sempre derivada.
  const serverless = Boolean(process.env.MEDICAO_SERVERLESS || process.env.VERCEL);

  const fromFile = serverless ? "" : String(readFileIfExists(SECRET_FILE) || "").trim();
  if (fromFile.length >= 32) {
    cachedSecret = fromFile;
    return cachedSecret;
  }

  // Primeira execução no servidor: gera a chave e guarda fora do repositório.
  if (!serverless) try {
    const generated = crypto.randomBytes(48).toString("base64url");
    fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
    fs.writeFileSync(SECRET_FILE, `${generated}\n`, { mode: 0o600, flag: "wx" });
    cachedSecret = generated;
    return cachedSecret;
  } catch (error) {
    const existing = String(readFileIfExists(SECRET_FILE) || "").trim();
    if (existing.length >= 32) {
      cachedSecret = existing;
      return cachedSecret;
    }
  }

  // Disco somente leitura (Vercel): deriva a chave dos hashes guardados em
  // AUTH_USERS, que só existem na configuração do servidor. Trocar a senha
  // encerra as sessões abertas.
  const users = loadUsers();
  if (users.length) {
    return crypto
      .createHash("sha256")
      .update(`medicao-session|${users.map((user) => `${user.email}:${user.hash}`).join("|")}`)
      .digest("base64url");
  }

  throw new Error(
    "Chave de sessão não configurada. Defina SESSION_SECRET com pelo menos 32 caracteres."
  );
}

function serializeCookie(request, value, maxAge) {
  const parts = [
    `${SESSION_COOKIE}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`
  ];
  if (isSecureRequest(request)) parts.push("Secure");
  return parts.join("; ");
}

function isSecureRequest(request) {
  const host = String(request.headers?.host || "").toLowerCase();
  if (/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host)) return false;
  return true;
}

function parseCookies(header) {
  const cookies = {};
  for (const part of String(header || "").split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const name = part.slice(0, index).trim();
    if (name) cookies[name] = part.slice(index + 1).trim();
  }
  return cookies;
}

function isLocked(key) {
  const entry = failures.get(key);
  if (!entry) return false;
  if (Date.now() - entry.first > FAILURE_WINDOW_MS) {
    failures.delete(key);
    return false;
  }
  return entry.count >= MAX_FAILURES;
}

function registerFailure(key) {
  const now = Date.now();
  const entry = failures.get(key);
  if (!entry || now - entry.first > FAILURE_WINDOW_MS) {
    failures.set(key, { count: 1, first: now });
  } else {
    entry.count += 1;
  }
  if (failures.size > 5000) failures.clear();
}

function readFileIfExists(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}
