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

  // Fotos: linha de cima "Antes" e linha de baixo "Depois" (até duas em cada)
  const photoRows = [
    {
      title: "ANTES DO SERVIÇO",
      date: activity.dataAntes,
      color: COLOR_BEFORE,
      photos: [
        { dataUrl: activity.fotoAntes, caption: activity.legendaAntes },
        { dataUrl: activity.fotoAntes2, caption: activity.legendaAntes2 }
      ]
    },
    {
      title: "DEPOIS DO SERVIÇO",
      date: activity.dataDepois,
      color: COLOR_AFTER,
      photos: [
        { dataUrl: activity.fotoDepois, caption: activity.legendaDepois },
        { dataUrl: activity.fotoDepois2, caption: activity.legendaDepois2 }
      ]
    }
  ].map((row) => {
    const filled = row.photos.filter((photo) => photo.dataUrl || photo.caption);
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
  if (!dataUrl) return null;

  try {
    let buffer;
    let extension = "jpeg";

    // Se vier uma URL de internet no banco de dados em vez de base64
    if (dataUrl.startsWith("http://") || dataUrl.startsWith("https://")) {
      const response = await fetch(dataUrl);
      if (!response.ok) return null;
      
      const arrayBuffer = await response.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
      const contentType = response.headers.get("content-type") || "";
      extension = contentType.includes("png") ? "png" : "jpeg";
    } else {
      // É Base64 puro
      const photo = parsePhoto(dataUrl);
      if (!photo) return null;
      buffer = photo.buffer;
      extension = photo.extension;
    }

    return extension === "png"
      ? await pdf.embedPng(buffer)
      : await pdf.embedJpg(buffer);
  } catch (error) {
    console.warn("Imagem ignorada durante a geração do relatório.", error);
    return null;
  }
}

function parsePhoto(dataUrl) {
  try {
    if (!dataUrl.includes(",")) return null;
    const [header, base64] = dataUrl.split(",", 2);
    
    // Alerta se não for um formato suportado pelo pdf-lib, mas tenta prosseguir
    if (!header.toLowerCase().includes("jpeg") && 
        !header.toLowerCase().includes("jpg") && 
        !header.toLowerCase().includes("png")) {
        console.warn("Formato pode não ser suportado pelo pdf-lib (Apenas JPG e PNG).");
    }

    // Limpa qualquer sujeira do Base64 (espaços ou quebras de linha)
    let cleanBase64 = base64.replace(/[^A-Za-z0-9+/=]/g, "");
    
    // Força o padding correto (Resolve o erro length % 4 !== 0)
    while (cleanBase64.length % 4 !== 0) {
      cleanBase64 += "=";
    }

    const buffer = Buffer.from(cleanBase64, "base64");
    
    // Aumentado para lidar com imagens de 3.5MB reais
    if (!buffer.length || buffer.length > 3_500_000) return null;

    const extension = header.toLowerCase().includes("png") ? "png" : "jpeg";
    return { buffer, extension };
  } catch {
    return null;
  }
  import pptxgen from "pptxgenjs";

export async function buildPptxReport(metadata, activities) {
  const pptx = new pptxgen();
  
  pptx.author = "Medição Pro";
  pptx.company = metadata.contratada || "Contratada";
  pptx.title = `Relatório Fotográfico - ${metadata.competencia}`;

  const filled = activities.filter((activity) => activity.atividade);
  const list = filled.length ? filled : activities.slice(0, 1);

  for (let index = 0; index < list.length; index += 1) {
    const activity = list[index];
    const slide = pptx.addSlide();

    // Título do Slide (Cabeçalho)
    slide.addText(`Ocorrência ${index + 1}: ${metadata.competencia}`, {
      x: 0.5, y: 0.5, w: "90%", h: 0.5, 
      fontSize: 18, bold: true, color: "003366"
    });

    // Dados do serviço
    slide.addText(`OS: ${activity.ordemServico || "Não informada"} | Responsável: ${activity.responsavel}`, {
      x: 0.5, y: 1.0, w: "90%", h: 0.3, fontSize: 12, color: "666666"
    });

    // Descrição do Problema
    slide.addText(activity.atividade || "Sem descrição", {
      x: 0.5, y: 1.5, w: "90%", h: 1.0, fontSize: 11, fill: { color: "F5F5F5" }
    });

    // Inserindo a Foto do "Antes" (se existir)
    if (activity.fotoAntes) {
      slide.addText("ANTES", { x: 0.5, y: 3.0, w: 4, h: 0.3, bold: true, color: "CC0000" });
      // pptxgenjs aceita o Base64 direto (com o cabeçalho data:image/jpeg;base64,)
      slide.addImage({ data: activity.fotoAntes, x: 0.5, y: 3.4, w: 4, h: 3 }); 
      
      if (activity.legendaAntes) {
         slide.addText(activity.legendaAntes, { x: 0.5, y: 6.5, w: 4, h: 0.4, fontSize: 10 });
      }
    }

    // Inserindo a Foto do "Depois" (se existir)
    if (activity.fotoDepois) {
      slide.addText("DEPOIS", { x: 5.0, y: 3.0, w: 4, h: 0.3, bold: true, color: "006600" });
      slide.addImage({ data: activity.fotoDepois, x: 5.0, y: 3.4, w: 4, h: 3 });
      
      if (activity.legendaDepois) {
         slide.addText(activity.legendaDepois, { x: 5.0, y: 6.5, w: 4, h: 0.4, fontSize: 10 });
      }
    }
  }

  // Gera o buffer final para o Vercel devolver ao cliente
  const buffer = await pptx.write("nodebuffer");

  return reportResult({
    buffer,
    filename: `Relatorio_Fotografico_${metadata.competencia}.pptx`,
    contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    format: "pptx",
    formatLabel: "PowerPoint",
    metadata,
    activities: list
  });
}
}
