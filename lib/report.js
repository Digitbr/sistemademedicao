import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import { BRAND_LOGO_PNG_BASE64 } from "./brand-logo.js";

const MAX_ACTIVITIES = 20;

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 36;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const COLOR_BRAND = rgb(0.09, 0.24, 0.21);
const COLOR_TEXT = rgb(0.13, 0.15, 0.15);
const COLOR_MUTED = rgb(0.38, 0.42, 0.41);
const COLOR_LINE = rgb(0.83, 0.86, 0.85);
const COLOR_SOFT = rgb(0.95, 0.96, 0.96);
const COLOR_WAITING = rgb(0.72, 0.42, 0.05);
const COLOR_DONE = rgb(0.11, 0.42, 0.29);
const COLOR_WHITE = rgb(1, 1, 1);
const COLOR_LOGO_BLUE = rgb(32 / 255, 33 / 255, 212 / 255);
const COLOR_BEFORE = rgb(0.18, 0.43, 0.58);
const COLOR_AFTER = rgb(0.11, 0.42, 0.29);

const HEADER_HEIGHT = 58;
const LOGO_HEIGHT = 24;

export const REPORT_FORMATS = {
  pdf: { label: "PDF", extension: "pdf", contentType: "application/pdf" },
  docx: {
    label: "Word",
    extension: "docx",
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  },
  pptx: {
    label: "PowerPoint",
    extension: "pptx",
    contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  },
  xlsx: {
    label: "Excel",
    extension: "xlsx",
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  }
};

const BUILDERS = {
  docx: async () => (await import("./report-docx.js")).buildDocxBuffer,
  pptx: async () => (await import("./report-pptx.js")).buildPptxBuffer,
  xlsx: async () => (await import("./report-xlsx.js")).buildXlsxBuffer
};

export async function buildReport(payload) {
  const metadata = normalizeMetadata(payload?.metadata);
  const activities = normalizeActivities(payload?.activities);
  const format = REPORT_FORMATS[payload?.format] ? payload.format : "pdf";

  validateReport(metadata, activities);

  if (format === "pdf") return buildPdfReport(metadata, activities);

  const filled = activities.filter((activity) => activity.atividade);
  const list = filled.length ? filled : activities.slice(0, 1);
  const builder = await BUILDERS[format]();
  const info = REPORT_FORMATS[format];

  return reportResult({
    buffer: await builder(metadata, list),
    filename: `Relatorio Fotografico - ${metadata.competencia}.${info.extension}`,
    contentType: info.contentType,
    format,
    formatLabel: info.label,
    metadata,
    activities: list
  });
}

async function buildPdfReport(metadata, activities) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Relatório Fotográfico - ${metadata.competencia}`);
  pdf.setProducer("Medição Pro");
  pdf.setCreator("Medição Pro");

  const fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold)
  };

  const logo = await embedBrandLogo(pdf);

  const filled = activities.filter((activity) => activity.atividade);
  const list = filled.length ? filled : activities.slice(0, 1);

  for (let index = 0; index < list.length; index += 1) {
    await drawOccurrencePage(pdf, fonts, logo, metadata, list[index], index, list.length);
  }

  return reportResult({
    buffer: Buffer.from(await pdf.save()),
    filename: `Relatorio Fotografico - ${metadata.competencia}.pdf`,
    contentType: "application/pdf",
    format: "pdf",
    formatLabel: "PDF",
    metadata,
    activities: list
  });
}

async function drawOccurrencePage(pdf, fonts, logo, metadata, activity, index, total) {
  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let cursor = PAGE_HEIGHT - MARGIN;

  // Cabeçalho: logo da empresa à esquerda, identificação do relatório à direita
  let logoWidth = 0;
  if (logo) {
    logoWidth = (logo.width / logo.height) * LOGO_HEIGHT;
    page.drawImage(logo, {
      x: MARGIN,
      y: cursor - HEADER_HEIGHT / 2 - LOGO_HEIGHT / 2,
      width: logoWidth,
      height: LOGO_HEIGHT
    });
  }

  const rightEdge = PAGE_WIDTH - MARGIN;
  const textMaxWidth = CONTENT_WIDTH - logoWidth - 28;
  const drawRight = (text, y, size, font, color) => {
    const value = truncateToWidth(sanitize(text), font, size, textMaxWidth);
    page.drawText(value, {
      x: rightEdge - font.widthOfTextAtSize(value, size),
      y,
      size,
      font,
      color
    });
  };

  drawRight("RELATÓRIO FOTOGRÁFICO DE MANUTENÇÃO", cursor - 19, 11, fonts.bold, COLOR_TEXT);
  drawRight(
    metadata.contratada || "Contratada não informada",
    cursor - 33,
    8.5,
    fonts.regular,
    COLOR_MUTED
  );
  drawRight(`Ocorrência ${index + 1} de ${total}`, cursor - 46, 8, fonts.bold, COLOR_LOGO_BLUE);

  page.drawRectangle({
    x: MARGIN,
    y: cursor - HEADER_HEIGHT - 3,
    width: CONTENT_WIDTH,
    height: 3,
    color: COLOR_LOGO_BLUE
  });
  cursor -= HEADER_HEIGHT + 3 + 14;

  // Dados do serviço
  const metaItems = [
    ["Competência", metadata.competencia],
    ["OS da ocorrência", activity.ordemServico || metadata.ordemServico || "Não informada"],
    ["Tipo de manutenção", metadata.tipoManutencao || "Não informado"],
    ["Responsável técnico", activity.responsavel || "Não informado"]
  ];
  const metaBoxHeight = 46;
  page.drawRectangle({
    x: MARGIN,
    y: cursor - metaBoxHeight,
    width: CONTENT_WIDTH,
    height: metaBoxHeight,
    color: COLOR_SOFT,
    borderColor: COLOR_LINE,
    borderWidth: 0.6
  });
  const columnWidth = CONTENT_WIDTH / metaItems.length;
  metaItems.forEach(([label, value], position) => {
    const x = MARGIN + columnWidth * position + 12;
    page.drawText(sanitize(label.toUpperCase()), {
      x,
      y: cursor - 18,
      size: 6.5,
      font: fonts.bold,
      color: COLOR_MUTED
    });
    page.drawText(
      sanitize(truncateToWidth(String(value || "—"), fonts.bold, 9, columnWidth - 20)),
      { x, y: cursor - 32, size: 9, font: fonts.bold, color: COLOR_TEXT }
    );
  });
  cursor -= metaBoxHeight + 16;

  // Situação + datas
  const waiting = activity.status === "em-espera";
  const badgeText = sanitize(waiting ? "EM ESPERA" : "CONCLUÍDA");
  const badgeWidth = fonts.bold.widthOfTextAtSize(badgeText, 8) + 18;
  page.drawRectangle({
    x: MARGIN,
    y: cursor - 16,
    width: badgeWidth,
    height: 16,
    color: waiting ? COLOR_WAITING : COLOR_DONE
  });
  page.drawText(badgeText, {
    x: MARGIN + 9,
    y: cursor - 11.5,
    size: 8,
    font: fonts.bold,
    color: COLOR_WHITE
  });
  page.drawText(
    sanitize(
      `Entrada: ${formatDate(activity.dataAntes) || "—"}    ·    Saída: ${
        formatDate(activity.dataDepois) || "—"
      }`
    ),
    {
      x: MARGIN + badgeWidth + 12,
      y: cursor - 11.5,
      size: 9,
      font: fonts.regular,
      color: COLOR_MUTED
    }
  );
  cursor -= 16 + 16;

  // Descrição do problema / serviço
  page.drawText(sanitize("PROBLEMA / DESCRIÇÃO DO SERVIÇO"), {
    x: MARGIN,
    y: cursor - 9,
    size: 7,
    font: fonts.bold,
    color: COLOR_MUTED
  });
  cursor -= 20;
  cursor = drawParagraph(page, fonts.regular, activity.atividade || "—", {
    x: MARGIN,
    y: cursor,
    width: CONTENT_WIDTH,
    size: 10.5,
    lineHeight: 14,
    color: COLOR_TEXT,
    maxLines: 4
  });

  if (waiting && activity.motivo) {
    cursor -= 8;
    page.drawText(sanitize("MOTIVO DA ESPERA"), {
      x: MARGIN,
      y: cursor - 9,
      size: 7,
      font: fonts.bold,
      color: COLOR_WAITING
    });
    cursor -= 20;
    cursor = drawParagraph(page, fonts.regular, activity.motivo, {
      x: MARGIN,
      y: cursor,
      width: CONTENT_WIDTH,
      size: 10,
      lineHeight: 13,
      color: COLOR_TEXT,
      maxLines: 3
    });
  }

  cursor -= 14;
  page.drawLine({
    start: { x: MARGIN, y: cursor },
    end: { x: PAGE_WIDTH - MARGIN, y: cursor },
    thickness: 0.6,
    color: COLOR_LINE
  });
  cursor -= 18;

  // Fotos: linha de cima "Antes" e linha de baixo "Depois" (até duas em cada)
  const photoRows = [
    {
      title: "ANTES DO SERVIÇO",
      date: activity.dataAntes,
      color: COLOR_BEFORE,
      photos: [
        photoEntry(activity, "fotoAntes", activity.legendaAntes),
        photoEntry(activity, "fotoAntes2", activity.legendaAntes2)
      ]
    },
    {
      title: "DEPOIS DO SERVIÇO",
      date: activity.dataDepois,
      color: COLOR_AFTER,
      photos: [
        photoEntry(activity, "fotoDepois", activity.legendaDepois),
        photoEntry(activity, "fotoDepois2", activity.legendaDepois2)
      ]
    }
  ].map((row) => {
    const filled = row.photos.filter((photo) => photo.dataUrl || photo.caption || photo.name);
    return { ...row, photos: filled.length ? filled : [{ dataUrl: "", caption: "" }] };
  });

  const gap = 18;
  const rowGap = 14;
  const titleArea = 18;
  const captionArea = 30;
  const halfWidth = (CONTENT_WIDTH - gap) / 2;
  const rowBudget =
    (cursor - MARGIN - rowGap * (photoRows.length - 1)) / photoRows.length -
    titleArea -
    captionArea;

  let rowTop = cursor;
  for (const row of photoRows) {
    const columns = row.photos.length > 1 ? 2 : 1;
    const frameWidth = columns === 2 ? halfWidth : CONTENT_WIDTH;
    const frameHeight = Math.max(
      100,
      Math.min(rowBudget, columns === 2 ? frameWidth * 0.75 : frameWidth * 0.5 + 12)
    );

    // Título da linha
    page.drawRectangle({ x: MARGIN, y: rowTop - 11, width: 3, height: 11, color: row.color });
    page.drawText(sanitize(row.title), {
      x: MARGIN + 8,
      y: rowTop - 9.5,
      size: 8,
      font: fonts.bold,
      color: row.color
    });
    const dateLabel = sanitize(formatDate(row.date) || "");
    if (dateLabel) {
      page.drawText(dateLabel, {
        x: PAGE_WIDTH - MARGIN - fonts.regular.widthOfTextAtSize(dateLabel, 8),
        y: rowTop - 9.5,
        size: 8,
        font: fonts.regular,
        color: COLOR_MUTED
      });
    }

    const frameTop = rowTop - titleArea;
    for (let position = 0; position < row.photos.length; position += 1) {
      const photo = row.photos[position];
      const x = MARGIN + (frameWidth + gap) * position;

      page.drawRectangle({
        x,
        y: frameTop - frameHeight,
        width: frameWidth,
        height: frameHeight,
        color: COLOR_SOFT,
        borderColor: COLOR_LINE,
        borderWidth: 0.6
      });

      const image = await embedPhoto(pdf, photo.dataUrl);
      if (image) {
        const scale = Math.min(
          (frameWidth - 12) / image.width,
          (frameHeight - 12) / image.height
        );
        const drawWidth = image.width * scale;
        const drawHeight = image.height * scale;
        page.drawImage(image, {
          x: x + (frameWidth - drawWidth) / 2,
          y: frameTop - frameHeight + (frameHeight - drawHeight) / 2,
          width: drawWidth,
          height: drawHeight
        });
      } else if (isDocumentEntry(photo)) {
        const badge = sanitize(documentLabel(photo));
        const badgeWidth = fonts.bold.widthOfTextAtSize(badge, 9) + 14;
        page.drawRectangle({
          x: x + (frameWidth - badgeWidth) / 2,
          y: frameTop - frameHeight / 2 + 6,
          width: badgeWidth,
          height: 16,
          color: COLOR_BRAND
        });
        page.drawText(badge, {
          x: x + (frameWidth - badgeWidth) / 2 + 7,
          y: frameTop - frameHeight / 2 + 10.5,
          size: 9,
          font: fonts.bold,
          color: COLOR_WHITE
        });
        const docName = truncateToWidth(
          sanitize(`Documento anexado: ${photo.name || "sem nome"}`),
          fonts.regular,
          9,
          frameWidth - 20
        );
        page.drawText(docName, {
          x: x + (frameWidth - fonts.regular.widthOfTextAtSize(docName, 9)) / 2,
          y: frameTop - frameHeight / 2 - 12,
          size: 9,
          font: fonts.regular,
          color: COLOR_TEXT
        });
      } else {
        const emptyText = sanitize("Sem imagem registrada");
        page.drawText(emptyText, {
          x: x + (frameWidth - fonts.regular.widthOfTextAtSize(emptyText, 9)) / 2,
          y: frameTop - frameHeight / 2,
          size: 9,
          font: fonts.regular,
          color: COLOR_MUTED
        });
      }

      drawParagraph(
        page,
        fonts.regular,
        photo.caption || "Sem descrição para esta imagem.",
        {
          x,
          y: frameTop - frameHeight - 6,
          width: frameWidth,
          size: 8.5,
          lineHeight: 11,
          color: photo.caption ? COLOR_TEXT : COLOR_MUTED,
          maxLines: 2
        }
      );
    }

    rowTop -= titleArea + frameHeight + captionArea + rowGap;
  }

  const footer = sanitize(
    `${metadata.competencia} · ${orderLabel(
      activity.ordemServico || metadata.ordemServico
    )}`
  );
  page.drawText(footer, {
    x: MARGIN,
    y: MARGIN - 14,
    size: 7,
    font: fonts.regular,
    color: COLOR_MUTED
  });
  const pageNumber = sanitize(`Página ${index + 1} de ${total}`);
  page.drawText(pageNumber, {
    x: PAGE_WIDTH - MARGIN - fonts.regular.widthOfTextAtSize(pageNumber, 7),
    y: MARGIN - 14,
    size: 7,
    font: fonts.regular,
    color: COLOR_MUTED
  });
}

function drawParagraph(page, font, text, options) {
  const { x, y, width, size, lineHeight, color, maxLines = 6 } = options;
  const lines = wrapText(sanitize(text), font, size, width, maxLines);
  let currentY = y;
  for (const line of lines) {
    page.drawText(line, { x, y: currentY - size, size, font, color });
    currentY -= lineHeight;
  }
  return currentY;
}

function wrapText(text, font, size, maxWidth, maxLines) {
  const paragraphs = String(text || "").split(/\r?\n/);
  const lines = [];

  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push("");
      continue;
    }
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        current = candidate;
        continue;
      }
      if (current) lines.push(current);
      current = font.widthOfTextAtSize(word, size) > maxWidth
        ? truncateToWidth(word, font, size, maxWidth)
        : word;
    }
    if (current) lines.push(current);
  }

  if (lines.length <= maxLines) return lines;
  const trimmed = lines.slice(0, maxLines);
  trimmed[maxLines - 1] = truncateToWidth(
    `${trimmed[maxLines - 1]}...`,
    font,
    size,
    maxWidth
  );
  return trimmed;
}

function truncateToWidth(text, font, size, maxWidth) {
  let value = sanitize(text);
  if (font.widthOfTextAtSize(value, size) <= maxWidth) return value;
  while (value.length > 1 && font.widthOfTextAtSize(`${value}...`, size) > maxWidth) {
    value = value.slice(0, -1);
  }
  return `${value}...`;
}

async function embedBrandLogo(pdf) {
  try {
    return await pdf.embedPng(Buffer.from(BRAND_LOGO_PNG_BASE64, "base64"));
  } catch (error) {
    console.warn("Logo não pôde ser incluída no relatório.", error);
    return null;
  }
}

async function embedPhoto(pdf, dataUrl) {
  const photo = parsePhoto(dataUrl);
  if (!photo) return null;
  try {
    return photo.extension === "png"
      ? await pdf.embedPng(photo.buffer)
      : await pdf.embedJpg(photo.buffer);
  } catch (error) {
    console.warn("Imagem ignorada durante a geração do relatório.", error);
    return null;
  }
}

function validateReport(metadata, activities) {
  if (!metadata.competencia) throw new Error("Informe a competência.");
  if (!metadata.contratada) throw new Error("Informe a contratada.");
  if (!activities.some((activity) => activity.atividade)) {
    throw new Error("Cadastre ao menos um problema ou serviço executado.");
  }
  if (
    activities.some(
      (activity) =>
        activity.atividade &&
        activity.status === "em-espera" &&
        !activity.motivo
    )
  ) {
    throw new Error("Informe o motivo dos problemas que estão em espera.");
  }
}

function normalizeMetadata(metadata = {}) {
  return {
    competencia: clean(metadata.competencia, 80),
    ordemServico: clean(metadata.ordemServico || metadata.ordemCompra, 80),
    contratada: clean(metadata.contratada, 160),
    tipoManutencao: clean(metadata.tipoManutencao || metadata.escopo, 80)
  };
}

function normalizeActivities(activities = []) {
  const list = Array.isArray(activities) ? activities : [];
  return list.slice(0, MAX_ACTIVITIES).map((activity = {}) => ({
    dataAntes: clean(activity.dataAntes, 20),
    dataDepois: clean(activity.dataDepois, 20),
    ordemServico: clean(activity.ordemServico || activity.os, 80),
    responsavel: clean(activity.responsavel, 120),
    atividade: clean(
      activity.atividade || activity.problema || activity.descricao,
      1000
    ),
    status: activity.status === "em-espera" ? "em-espera" : "concluida",
    motivo: clean(activity.motivo || activity.conclusao, 500),
    fotoAntes: clean(activity.fotoAntes, MAX_PHOTO_CHARS),
    fotoDepois: clean(activity.fotoDepois, MAX_PHOTO_CHARS),
    fotoAntes2: clean(activity.fotoAntes2, MAX_PHOTO_CHARS),
    fotoDepois2: clean(activity.fotoDepois2, MAX_PHOTO_CHARS),
    legendaAntes: clean(activity.legendaAntes || activity.descricaoFotoAntes, 300),
    legendaDepois: clean(activity.legendaDepois || activity.descricaoFotoDepois, 300),
    legendaAntes2: clean(activity.legendaAntes2 || activity.descricaoFotoAntes2, 300),
    legendaDepois2: clean(activity.legendaDepois2 || activity.descricaoFotoDepois2, 300),
    fotoAntesNome: clean(activity.fotoAntesNome, 200),
    fotoAntes2Nome: clean(activity.fotoAntes2Nome, 200),
    fotoDepoisNome: clean(activity.fotoDepoisNome, 200),
    fotoDepois2Nome: clean(activity.fotoDepois2Nome, 200),
    fotoAntesTipo: clean(activity.fotoAntesTipo, 120),
    fotoAntes2Tipo: clean(activity.fotoAntes2Tipo, 120),
    fotoDepoisTipo: clean(activity.fotoDepoisTipo, 120),
    fotoDepois2Tipo: clean(activity.fotoDepois2Tipo, 120)
  }));
}

// Limites da foto embutida (bytes da imagem e tamanho do texto base64).
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const MAX_PHOTO_CHARS = Math.ceil(MAX_PHOTO_BYTES / 3) * 4 + 40;

export function parsePhoto(dataUrl) {
  try {
    if (!dataUrl || !dataUrl.includes(",")) return null;
    const [header, base64] = dataUrl.split(",", 2);
    if (!/^data:image\/(?:jpeg|jpg|png);base64$/i.test(header)) return null;
    if (!base64 || base64.length % 4 !== 0) return null;
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) return null;

    const buffer = Buffer.from(base64, "base64");
    if (!buffer.length || buffer.length > MAX_PHOTO_BYTES) return null;

    const extension = header.toLowerCase().includes("png") ? "png" : "jpeg";
    return { buffer, extension };
  } catch {
    return null;
  }
}

export function orderLabel(value) {
  const order = String(value || "").trim();
  if (!order) return "OS não informada";
  return /^os(?:\s|-|\.)?/i.test(order) ? order : `OS ${order}`;
}

export function formatDate(value) {
  if (!value) return "";
  const [year, month, day] = String(value).slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : String(value);
}

function clean(value, maxLength = 1000) {
  return String(value ?? "").trim().slice(0, maxLength);
}

const CP1252_EXTRA = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";

function sanitize(value) {
  return String(value ?? "")
    .replace(/ /g, " ")
    .split("")
    .map((character) => {
      const code = character.charCodeAt(0);
      if (code === 10 || code === 13) return character;
      if (code >= 32 && code <= 126) return character;
      if (code >= 160 && code <= 255) return character;
      if (CP1252_EXTRA.includes(character)) return character;
      return "";
    })
    .join("");
}

function reportResult(report) {
  return {
    ...report,
    filename: safeFilename(report.filename)
  };
}

function safeFilename(value) {
  return value.replace(/[\\/:*?"<>|]/g, "-");
}

// Largura e altura (em pixels) de um JPEG ou PNG.
export function imageSize(buffer, extension) {
  try {
    if (extension === "png") {
      return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
    }
    let offset = 2;
    while (offset < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5) };
      }
      offset += 2 + length;
    }
  } catch {
    // Cai no tamanho padrão abaixo.
  }
  return { width: 900, height: 450 };
}

// Encaixa uma imagem dentro de uma caixa mantendo a proporção.
export function fitInside(size, maxWidth, maxHeight) {
  const scale = Math.min(maxWidth / size.width, maxHeight / size.height);
  return { width: size.width * scale, height: size.height * scale };
}

// Texto seguro para Word/PowerPoint (remove caracteres de controle).
export function plain(value) {
  return String(value ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

export function photoEntry(activity, field, caption) {
  return {
    dataUrl: activity[field],
    caption,
    name: activity[`${field}Nome`] || "",
    type: activity[`${field}Tipo`] || ""
  };
}

// Anexo que não é imagem: aparece no relatório só com o nome do arquivo.
// Inclui fotos em formato que o relatório não embute (ex.: HEIC não convertido).
export function isDocumentEntry(photo) {
  return Boolean(photo.name) && !parsePhoto(photo.dataUrl);
}

export function documentLabel(photo) {
  const fromName = String(photo.name || "").match(/\.([A-Za-z0-9]{1,5})$/);
  if (fromName) return fromName[1].toUpperCase();
  const fromType = String(photo.type || "").split("/")[1];
  return (fromType || "ARQUIVO").slice(0, 8).toUpperCase();
}
