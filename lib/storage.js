import crypto from "node:crypto";
import fs from "node:fs/promises";
import { existsSync, mkdirSync, accessSync, constants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Banco de dados do sistema.
// - Netlify: Netlify Blobs (consistência forte, para a leitura logo após salvar
//   já enxergar a foto recém-enviada).
// - Servidor Node próprio (Hostoo): pasta data/ no disco.
// - Vercel: sem banco; o navegador continua guardando os registros localmente.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = process.env.AUTH_DATA_DIR || path.join(ROOT, "data");

export const MAX_FILE_BYTES = 15 * 1024 * 1024;
export const MAX_PART_BYTES = 3 * 1024 * 1024;
export const FILE_URL_PREFIX = "/api/files?id=";

let backendPromise = null;

export function storageBackend() {
  if (!backendPromise) backendPromise = createBackend();
  return backendPromise;
}

async function createBackend() {
  const forced = String(process.env.MEDICAO_STORAGE || "").toLowerCase();
  if (forced === "netlify") return netlifyBackend();
  if (forced === "none" || process.env.VERCEL) return noneBackend();
  if (forced === "fs" || isWritable(DATA_DIR)) return fsBackend(DATA_DIR);
  return noneBackend();
}

function isWritable(dir) {
  try {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
    accessSync(dir, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

export function newId() {
  return crypto.randomUUID();
}

export function validId(value) {
  return /^[A-Za-z0-9-]{8,80}$/.test(String(value || ""));
}

export function fileIdFromRef(value) {
  const text = String(value || "");
  if (!text.startsWith(FILE_URL_PREFIX)) return "";
  const id = text.slice(FILE_URL_PREFIX.length).split("&")[0];
  return validId(id) ? id : "";
}

function noneBackend() {
  const unavailable = () => {
    const error = new Error("Banco de dados indisponível neste endereço.");
    error.statusCode = 503;
    throw error;
  };
  return {
    name: "none",
    listRecords: unavailable,
    getRecord: unavailable,
    putRecord: unavailable,
    deleteRecord: unavailable,
    putFilePart: unavailable,
    putFileMeta: unavailable,
    getFileMeta: unavailable,
    getFileBuffer: unavailable
  };
}

async function netlifyBackend() {
  const { getStore } = await import("@netlify/blobs");
  const records = getStore({ name: "medicao-registros", consistency: "strong" });
  const files = getStore({ name: "medicao-arquivos", consistency: "strong" });

  return {
    name: "netlify",
    async listRecords() {
      const keys = [];
      for await (const page of records.list({ paginate: true })) {
        for (const blob of page.blobs) keys.push(blob.key);
      }
      const list = await Promise.all(keys.map((key) => records.get(key, { type: "json" })));
      return list.filter(Boolean);
    },
    getRecord: (id) => records.get(id, { type: "json" }),
    putRecord: (record) => records.setJSON(record.id, record),
    deleteRecord: (id) => records.delete(id),
    putFilePart: (id, index, buffer) => files.set(`${id}/part-${index}`, toArrayBuffer(buffer)),
    putFileMeta: (id, meta) => files.setJSON(`${id}/meta`, meta),
    getFileMeta: (id) => files.get(`${id}/meta`, { type: "json" }),
    async getFileBuffer(id, meta) {
      const parts = [];
      for (let index = 0; index < meta.parts; index += 1) {
        const data = await files.get(`${id}/part-${index}`, { type: "arrayBuffer" });
        if (!data) throw new Error("Arquivo incompleto no banco de dados.");
        parts.push(Buffer.from(data));
      }
      return Buffer.concat(parts);
    }
  };
}

function fsBackend(dir) {
  const recordsDir = path.join(dir, "records");
  const filesDir = path.join(dir, "files");

  const writeAtomic = async (file, data) => {
    await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
    const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(temp, data, { mode: 0o600 });
    await fs.rename(temp, file);
  };
  const readJson = async (file) => {
    try {
      return JSON.parse(await fs.readFile(file, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
  };

  return {
    name: "fs",
    async listRecords() {
      let names = [];
      try {
        names = (await fs.readdir(recordsDir)).filter((name) => name.endsWith(".json"));
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      const list = await Promise.all(names.map((name) => readJson(path.join(recordsDir, name))));
      return list.filter(Boolean);
    },
    getRecord: (id) => readJson(path.join(recordsDir, `${id}.json`)),
    putRecord: (record) => writeAtomic(path.join(recordsDir, `${record.id}.json`), JSON.stringify(record)),
    async deleteRecord(id) {
      await fs.rm(path.join(recordsDir, `${id}.json`), { force: true });
    },
    putFilePart: (id, index, buffer) => writeAtomic(path.join(filesDir, id, `part-${index}`), buffer),
    putFileMeta: (id, meta) => writeAtomic(path.join(filesDir, id, "meta.json"), JSON.stringify(meta)),
    getFileMeta: (id) => readJson(path.join(filesDir, id, "meta.json")),
    async getFileBuffer(id, meta) {
      const parts = [];
      for (let index = 0; index < meta.parts; index += 1) {
        parts.push(await fs.readFile(path.join(filesDir, id, `part-${index}`)));
      }
      return Buffer.concat(parts);
    }
  };
}

function toArrayBuffer(buffer) {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}
