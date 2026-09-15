import { fileIdFromRef, storageBackend } from "./storage.js";

export const ATTACHMENT_FIELDS = ["fotoAntes", "fotoAntes2", "fotoDepois", "fotoDepois2"];
const MAX_IMAGE_FOR_REPORT = 8 * 1024 * 1024;

// Troca as referências de arquivos do banco (/api/files?id=...) pelo conteúdo,
// para o gerador de relatório embutir as imagens. Documentos que não são imagem
// seguem só com nome e tipo.
export async function resolveAttachments(activities = []) {
  const list = Array.isArray(activities) ? activities : [];
  const needsStorage = list.some((activity) =>
    ATTACHMENT_FIELDS.some((field) => fileIdFromRef(activity?.[field]))
  );
  if (!needsStorage) return list;

  const storage = await storageBackend();
  const cache = new Map();

  const load = async (id) => {
    if (!cache.has(id)) {
      cache.set(
        id,
        (async () => {
          const meta = await storage.getFileMeta(id);
          if (!meta) return null;
          const isImage = /^image\/(jpeg|jpg|png)$/i.test(meta.type || "");
          if (!isImage || meta.size > MAX_IMAGE_FOR_REPORT) return { meta, dataUrl: "" };
          const buffer = await storage.getFileBuffer(id, meta);
          return { meta, dataUrl: `data:${meta.type.toLowerCase().replace("jpg", "jpeg")};base64,${buffer.toString("base64")}` };
        })()
      );
    }
    return cache.get(id);
  };

  return Promise.all(
    list.map(async (activity = {}) => {
      const copy = { ...activity };
      for (const field of ATTACHMENT_FIELDS) {
        const id = fileIdFromRef(copy[field]);
        if (!id) continue;
        const file = await load(id);
        if (!file) {
          copy[field] = "";
          copy[`${field}Tipo`] = copy[`${field}Tipo`] || "";
          continue;
        }
        copy[field] = file.dataUrl;
        copy[`${field}Nome`] = copy[`${field}Nome`] || file.meta.name;
        copy[`${field}Tipo`] = file.meta.type;
      }
      return copy;
    })
  );
}
