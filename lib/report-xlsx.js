import ExcelJS from "exceljs";

import { BRAND_LOGO_HEIGHT, BRAND_LOGO_PNG_BASE64, BRAND_LOGO_WIDTH } from "./brand-logo.js";
import {
  documentLabel,
  fitInside,
  formatDate,
  imageSize,
  isDocumentEntry,
  orderLabel,
  parsePhoto,
  photoEntry,
  plain
} from "./report.js";

// Planilha Excel: aba "Resumo" com todas as ocorrências e uma aba por
// ocorrência com os dados e as fotos (Antes em cima, Depois embaixo).

const COLOR = {
  blue: "FF2021D4",
  text: "FF212626",
  muted: "FF616B69",
  line: "FFD4DBD9",
  soft: "FFF2F5F4",
  before: "FF2E6D94",
  after: "FF1C6B4A",
  waiting: "FFB86B0D",
  done: "FF1C6B4A",
  white: "FFFFFFFF",
  document: "FF173D35"
};

const FONT = "Arial";
const EMU_PER_PX = 9525;

// Aba da ocorrência: 8 colunas iguais.
const OCC_COLUMNS = 8;
const OCC_COL_WIDTH = 13; // caracteres
const PHOTO_ROW_PT = 190;

export async function buildXlsxBuffer(metadata, activities) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Medição Pro";
  workbook.company = "Grupo Autoglass";
  workbook.title = `Relatório Fotográfico - ${metadata.competencia}`;
  workbook.created = new Date();

  const logoId = workbook.addImage({ base64: BRAND_LOGO_PNG_BASE64, extension: "png" });

  addSummarySheet(workbook, logoId, metadata, activities);
  activities.forEach((activity, index) => {
    addOccurrenceSheet(workbook, logoId, activity._meta || metadata, activity, index, activities.length);
  });

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function addSummarySheet(workbook, logoId, metadata, activities) {
  const sheet = workbook.addWorksheet("Resumo", {
    views: [{ state: "frozen", ySplit: 10, showGridLines: false }],
    pageSetup: {
      paperSize: 9,
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 }
    }
  });

  const widths = [6, 16, 22, 13, 12, 12, 46, 30, 30, 30];
  sheet.columns = widths.map((width) => ({ width }));

  header(sheet, logoId, widths.length, "RELATÓRIO FOTOGRÁFICO DE MANUTENÇÃO", metadata.contratada);

  const info = [
    ["Competência", metadata.competencia],
    ["Contratada", metadata.contratada || "Não informada"],
    ["Tipo de manutenção", metadata.tipoManutencao || "Não informado"],
    ["OS da medição", metadata.ordemServico || "Não informada"],
    ["Ocorrências", String(activities.length)]
  ];
  info.forEach(([label, value], position) => {
    const row = sheet.getRow(4 + position);
    labelCell(row.getCell(1), label);
    sheet.mergeCells(row.number, 1, row.number, 2);
    const cell = row.getCell(3);
    cell.value = plain(value);
    cell.font = { name: FONT, size: 11, bold: true, color: { argb: COLOR.text } };
    sheet.mergeCells(row.number, 3, row.number, 7);
    row.height = 18;
  });

  const titles = [
    "Nº",
    "OS",
    "Responsável técnico",
    "Situação",
    "Entrada",
    "Saída",
    "Problema / descrição do serviço",
    "Motivo da espera",
    "Anexos de antes",
    "Anexos de depois"
  ];
  const headRow = sheet.getRow(10);
  titles.forEach((title, index) => {
    const cell = headRow.getCell(index + 1);
    cell.value = title;
    cell.font = { name: FONT, size: 10, bold: true, color: { argb: COLOR.white } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.blue } };
    cell.alignment = { vertical: "middle", horizontal: index === 0 ? "center" : "left", wrapText: true };
    cell.border = thinBorder();
  });
  headRow.height = 22;

  activities.forEach((activity, index) => {
    const waiting = activity.status === "em-espera";
    const row = sheet.getRow(11 + index);
    const values = [
      index + 1,
      activity.ordemServico || activity._meta?.ordemServico || metadata.ordemServico || "Não informada",
      activity.responsavel || "Não informado",
      waiting ? "Em espera" : "Concluída",
      formatDate(activity.dataAntes) || "—",
      formatDate(activity.dataDepois) || "—",
      activity.atividade || "—",
      waiting ? activity.motivo || "—" : "",
      attachmentSummary(activity, [
        ["fotoAntes", activity.legendaAntes],
        ["fotoAntes2", activity.legendaAntes2]
      ]),
      attachmentSummary(activity, [
        ["fotoDepois", activity.legendaDepois],
        ["fotoDepois2", activity.legendaDepois2]
      ])
    ];
    values.forEach((value, column) => {
      const cell = row.getCell(column + 1);
      cell.value = typeof value === "number" ? value : plain(value);
      cell.font = {
        name: FONT,
        size: 10,
        bold: column === 3,
        color: { argb: column === 3 ? (waiting ? COLOR.waiting : COLOR.done) : COLOR.text }
      };
      cell.alignment = { vertical: "top", horizontal: column === 0 ? "center" : "left", wrapText: true };
      cell.border = thinBorder();
      if (index % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.soft } };
    });
    const longest = Math.max(
      String(values[6]).length / 44,
      String(values[7]).length / 28,
      String(values[8]).split("\n").length,
      String(values[9]).split("\n").length,
      1
    );
    row.height = Math.min(160, Math.max(20, Math.ceil(longest) * 14 + 6));
  });

  if (activities.length) {
    sheet.autoFilter = { from: { row: 10, column: 1 }, to: { row: 10 + activities.length, column: titles.length } };
  }
}

function addOccurrenceSheet(workbook, logoId, metadata, activity, index, total) {
  const waiting = activity.status === "em-espera";
  const sheet = workbook.addWorksheet(`Ocorrência ${String(index + 1).padStart(2, "0")}`, {
    views: [{ showGridLines: false }],
    pageSetup: {
      paperSize: 9,
      orientation: "portrait",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
      horizontalCentered: true,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 }
    }
  });
  sheet.columns = Array.from({ length: OCC_COLUMNS }, () => ({ width: OCC_COL_WIDTH }));

  header(sheet, logoId, OCC_COLUMNS, "RELATÓRIO FOTOGRÁFICO DE MANUTENÇÃO", `Ocorrência ${index + 1} de ${total}`);

  let rowNumber = 4;
  const field = (label, value, options = {}) => {
    const row = sheet.getRow(rowNumber);
    labelCell(row.getCell(1), label);
    sheet.mergeCells(rowNumber, 1, rowNumber, 2);
    const cell = row.getCell(3);
    cell.value = plain(value || "—");
    cell.font = {
      name: FONT,
      size: options.size || 11,
      bold: options.bold !== false,
      color: { argb: options.color || COLOR.text }
    };
    cell.alignment = { vertical: "top", horizontal: "left", wrapText: true };
    sheet.mergeCells(rowNumber, 3, rowNumber, OCC_COLUMNS);
    const lines = Math.ceil(String(value || "").length / 70) || 1;
    row.height = Math.min(200, Math.max(18, lines * 15 + 4));
    rowNumber += 1;
  };

  field("Competência", metadata.competencia);
  field("Contratada", metadata.contratada || "Não informada");
  field("Tipo de manutenção", metadata.tipoManutencao || "Não informado");
  field("OS da ocorrência", activity.ordemServico || metadata.ordemServico || "Não informada");
  field("Responsável técnico", activity.responsavel || "Não informado");
  field("Situação", waiting ? "EM ESPERA" : "CONCLUÍDA", { color: waiting ? COLOR.waiting : COLOR.done });
  field("Entrada", formatDate(activity.dataAntes) || "—", { bold: false });
  field("Saída", formatDate(activity.dataDepois) || "—", { bold: false });
  field("Problema / descrição", activity.atividade || "—", { bold: false });
  if (waiting && activity.motivo) {
    field("Motivo da espera", activity.motivo, { bold: false, color: COLOR.waiting });
  }

  rowNumber += 1;

  const rows = [
    {
      title: "ANTES DO SERVIÇO",
      date: activity.dataAntes,
      color: COLOR.before,
      photos: [
        photoEntry(activity, "fotoAntes", activity.legendaAntes),
        photoEntry(activity, "fotoAntes2", activity.legendaAntes2)
      ]
    },
    {
      title: "DEPOIS DO SERVIÇO",
      date: activity.dataDepois,
      color: COLOR.after,
      photos: [
        photoEntry(activity, "fotoDepois", activity.legendaDepois),
        photoEntry(activity, "fotoDepois2", activity.legendaDepois2)
      ]
    }
  ];

  const colPx = columnPixels(OCC_COL_WIDTH);

  for (const photoRow of rows) {
    const filled = photoRow.photos.filter((photo) => photo.dataUrl || photo.caption || photo.name);
    const photos = filled.length ? filled : [{ dataUrl: "", caption: "", name: "" }];

    // Título da linha de fotos
    const titleRow = sheet.getRow(rowNumber);
    const titleCell = titleRow.getCell(1);
    titleCell.value = photoRow.title;
    titleCell.font = { name: FONT, size: 11, bold: true, color: { argb: photoRow.color } };
    titleCell.border = { left: { style: "thick", color: { argb: photoRow.color } } };
    titleCell.alignment = { vertical: "middle", indent: 1 };
    sheet.mergeCells(rowNumber, 1, rowNumber, 5);
    const dateCell = titleRow.getCell(6);
    dateCell.value = formatDate(photoRow.date) || "";
    dateCell.font = { name: FONT, size: 10, color: { argb: COLOR.muted } };
    dateCell.alignment = { vertical: "middle", horizontal: "right" };
    sheet.mergeCells(rowNumber, 6, rowNumber, OCC_COLUMNS);
    titleRow.height = 20;
    rowNumber += 1;

    // Molduras das fotos
    const frameRow = sheet.getRow(rowNumber);
    frameRow.height = PHOTO_ROW_PT;
    const captionRow = sheet.getRow(rowNumber + 1);
    captionRow.height = 34;

    const span = photos.length > 1 ? OCC_COLUMNS / 2 : OCC_COLUMNS;
    photos.forEach((photo, position) => {
      const firstCol = 1 + position * span;
      const lastCol = firstCol + span - 1;
      const frame = frameRow.getCell(firstCol);
      frame.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.soft } };
      frame.border = thinBorder();
      frame.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      sheet.mergeCells(rowNumber, firstCol, rowNumber, lastCol);

      const parsed = parsePhoto(photo.dataUrl);
      if (parsed) {
        const imageId = workbook.addImage({ buffer: parsed.buffer, extension: parsed.extension === "png" ? "png" : "jpeg" });
        const boxWidth = colPx * span;
        const boxHeight = pointsToPixels(PHOTO_ROW_PT);
        const size = fitInside(imageSize(parsed.buffer, parsed.extension), boxWidth - 12, boxHeight - 12);
        const left = (firstCol - 1) * colPx + (boxWidth - size.width) / 2;
        const colIndex = Math.min(OCC_COLUMNS - 1, Math.floor(left / colPx));
        sheet.addImage(imageId, {
          tl: {
            nativeCol: colIndex,
            nativeColOff: Math.round((left - colIndex * colPx) * EMU_PER_PX),
            nativeRow: rowNumber - 1,
            nativeRowOff: Math.round(((boxHeight - size.height) / 2) * EMU_PER_PX)
          },
          ext: { width: Math.round(size.width), height: Math.round(size.height) },
          editAs: "oneCell"
        });
      } else if (isDocumentEntry(photo)) {
        frame.value = {
          richText: [
            { text: `${documentLabel(photo)}\n`, font: { name: FONT, size: 12, bold: true, color: { argb: COLOR.document } } },
            { text: `Documento anexado: ${plain(photo.name)}`, font: { name: FONT, size: 10, color: { argb: COLOR.text } } }
          ]
        };
      } else {
        frame.value = "Sem imagem registrada";
        frame.font = { name: FONT, size: 10, color: { argb: COLOR.muted } };
      }

      const caption = captionRow.getCell(firstCol);
      caption.value = plain(photo.caption || "Sem descrição para esta imagem.");
      caption.font = { name: FONT, size: 9, color: { argb: photo.caption ? COLOR.text : COLOR.muted } };
      caption.alignment = { vertical: "top", horizontal: "left", wrapText: true };
      sheet.mergeCells(rowNumber + 1, firstCol, rowNumber + 1, lastCol);
    });

    rowNumber += 3;
  }

  // Rodapé
  const footer = sheet.getRow(rowNumber);
  const left = footer.getCell(1);
  left.value = plain(`${metadata.competencia} · ${orderLabel(activity.ordemServico || metadata.ordemServico)}`);
  left.font = { name: FONT, size: 8, color: { argb: COLOR.muted } };
  sheet.mergeCells(rowNumber, 1, rowNumber, 5);
  const right = footer.getCell(6);
  right.value = `Ocorrência ${index + 1} de ${total}`;
  right.font = { name: FONT, size: 8, color: { argb: COLOR.muted } };
  right.alignment = { horizontal: "right" };
  sheet.mergeCells(rowNumber, 6, rowNumber, OCC_COLUMNS);

  sheet.pageSetup.printArea = `A1:${columnLetter(OCC_COLUMNS)}${rowNumber}`;
}

function header(sheet, logoId, columns, title, subtitle) {
  const row = sheet.getRow(1);
  row.height = 40;
  const logoHeight = 30;
  sheet.addImage(logoId, {
    tl: { nativeCol: 0, nativeColOff: 4 * EMU_PER_PX, nativeRow: 0, nativeRowOff: 12 * EMU_PER_PX },
    ext: { width: Math.round((BRAND_LOGO_WIDTH / BRAND_LOGO_HEIGHT) * logoHeight), height: logoHeight },
    editAs: "oneCell"
  });

  const titleStart = Math.max(4, columns - 4);
  const cell = row.getCell(titleStart);
  cell.value = {
    richText: [
      { text: `${title}\n`, font: { name: FONT, size: 12, bold: true, color: { argb: COLOR.text } } },
      { text: plain(subtitle || ""), font: { name: FONT, size: 9, bold: true, color: { argb: COLOR.blue } } }
    ]
  };
  cell.alignment = { vertical: "middle", horizontal: "right", wrapText: true };
  sheet.mergeCells(1, titleStart, 1, columns);

  const line = sheet.getRow(2);
  line.height = 4;
  for (let column = 1; column <= columns; column += 1) {
    line.getCell(column).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.blue } };
  }
}

function labelCell(cell, label) {
  cell.value = label.toUpperCase();
  cell.font = { name: FONT, size: 8, bold: true, color: { argb: COLOR.muted } };
  cell.alignment = { vertical: "top", horizontal: "left" };
}

function attachmentSummary(activity, fields) {
  return fields
    .map(([field, caption]) => {
      const name = activity[`${field}Nome`];
      const hasImage = Boolean(parsePhoto(activity[field]));
      if (!hasImage && !name && !caption) return "";
      const kind = hasImage ? "Foto" : name ? "Documento" : "Sem anexo";
      return [kind, name, caption].filter(Boolean).join(" · ");
    })
    .filter(Boolean)
    .join("\n");
}

function thinBorder() {
  const side = { style: "thin", color: { argb: COLOR.line } };
  return { top: side, left: side, bottom: side, right: side };
}

function columnPixels(width) {
  return Math.trunc(((256 * width + Math.trunc(128 / 7)) / 256) * 7);
}

function pointsToPixels(points) {
  return (points * 96) / 72;
}

function columnLetter(number) {
  let result = "";
  let value = number;
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}
