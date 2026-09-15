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

const HEADER_HEIGHT = 58;
const LOGO_HEIGHT = 24;

export async function buildReport(payload) {
  const metadata = normalizeMetadata(payload?.metadata);
  const activities = normalizeActivities(payload?.activities);

  validateReport(metadata, activities);

  return buildPdfReport(metadata, activities);
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

  // Fotos: até duas de entrada e duas de saída
  const gap = 18;
  const rowGap = 12;
  const photoWidth = (CONTENT_WIDTH - gap) / 2;
  const hasSecondRow = Boolean(
    activity.fotoAntes2 ||
      activity.fotoDepois2 ||
      activity.legendaAntes2 ||
      activity.legendaDepois2
  );
  const rows = hasSecondRow ? 2 : 1;
  const available = cursor - MARGIN;
  const labelArea = 14;
  const captionArea = hasSecondRow ? 32 : 44;
  const rowSpace = (available - rowGap * (rows - 1)) / rows;
  const frameHeight = Math.max(
    110,
    Math.min(rowSpace - labelArea - captionArea, photoWidth * 1.35)
  );

  const photoRows = [
    [
      {
        label: hasSecondRow ? "FOTO DE ENTRADA 1" : "FOTO DE ENTRADA",
        dataUrl: activity.fotoAntes,
        caption: activity.legendaAntes,
        date: activity.dataAntes
      },
      {
        label: hasSecondRow ? "FOTO DE SAÍDA 1" : "FOTO DE SAÍDA",
        dataUrl: activity.fotoDepois,
        caption: activity.legendaDepois,
        date: activity.dataDepois
      }
    ]
  ];

  if (hasSecondRow) {
    photoRows.push([
      {
        label: "FOTO DE ENTRADA 2",
        dataUrl: activity.fotoAntes2,
        caption: activity.legendaAntes2,
        date: activity.dataAntes
      },
      {
        label: "FOTO DE SAÍDA 2",
        dataUrl: activity.fotoDepois2,
        caption: activity.legendaDepois2,
        date: activity.dataDepois
      }
    ]);
  }

  let rowTop = cursor;
  for (const row of photoRows) {
    for (let position = 0; position < row.length; position += 1) {
      const photo = row[position];
      const x = MARGIN + (photoWidth + gap) * position;

      page.drawText(sanitize(photo.label), {
        x,
        y: rowTop - 8,
        size: 7,
        font: fonts.bold,
        color: COLOR_MUTED
      });
      const dateLabel = sanitize(formatDate(photo.date) || "");
      if (dateLabel) {
        page.drawText(dateLabel, {
          x: x + photoWidth - fonts.regular.widthOfTextAtSize(dateLabel, 7),
          y: rowTop - 8,
          size: 7,
          font: fonts.regular,
          color: COLOR_MUTED
        });
      }

      const frameTop = rowTop - labelArea;
      page.drawRectangle({
        x,
        y: frameTop - frameHeight,
        width: photoWidth,
        height: frameHeight,
        color: COLOR_SOFT,
        borderColor: COLOR_LINE,
        borderWidth: 0.6
      });

      const image = await embedPhoto(pdf, photo.dataUrl);
      if (image) {
        const scale = Math.min(
          (photoWidth - 12) / image.width,
          (frameHeight - 12) / image.height
        );
        const drawWidth = image.width * scale;
        const drawHeight = image.height * scale;
        page.drawImage(image, {
          x: x + (photoWidth - drawWidth) / 2,
          y: frameTop - frameHeight + (frameHeight - drawHeight) / 2,
          width: drawWidth,
          height: drawHeight
        });
      } else {
        const emptyText = sanitize("Sem imagem registrada");
        page.drawText(emptyText, {
          x: x + (photoWidth - fonts.regular.widthOfTextAtSize(emptyText, 9)) / 2,
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
          y: frameTop - frameHeight - 8,
          width: photoWidth,
          size: 8.5,
          lineHeight: 11,
          color: photo.caption ? COLOR_TEXT : COLOR_MUTED,
          maxLines: hasSecondRow ? 2 : 3
        }
      );
    }

    rowTop -= labelArea + frameHeight + captionArea + rowGap;
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
    fotoAntes: clean(activity.fotoAntes, 2_000_000),
    fotoDepois: clean(activity.fotoDepois, 2_000_000),
    fotoAntes2: clean(activity.fotoAntes2, 2_000_000),
    fotoDepois2: clean(activity.fotoDepois2, 2_000_000),
    legendaAntes: clean(activity.legendaAntes || activity.descricaoFotoAntes, 300),
    legendaDepois: clean(activity.legendaDepois || activity.descricaoFotoDepois, 300),
    legendaAntes2: clean(activity.legendaAntes2 || activity.descricaoFotoAntes2, 300),
    legendaDepois2: clean(activity.legendaDepois2 || activity.descricaoFotoDepois2, 300)
  }));
}

function parsePhoto(dataUrl) {
  try {
    if (!dataUrl || !dataUrl.includes(",")) return null;
    const [header, base64] = dataUrl.split(",", 2);
    if (!/^data:image\/(?:jpeg|jpg|png);base64$/i.test(header)) return null;
    if (!base64 || base64.length % 4 !== 0) return null;
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) return null;

    const buffer = Buffer.from(base64, "base64");
    if (!buffer.length || buffer.length > 1_500_000) return null;

    const extension = header.toLowerCase().includes("png") ? "png" : "jpeg";
    return { buffer, extension };
  } catch {
    return null;
  }
}

function orderLabel(value) {
  const order = String(value || "").trim();
  if (!order) return "OS não informada";
  return /^os(?:\s|-|\.)?/i.test(order) ? order : `OS ${order}`;
}

function formatDate(value) {
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
