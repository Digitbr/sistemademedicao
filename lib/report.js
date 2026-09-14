import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AlignmentType,
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType
} from "docx";
import ExcelJS from "exceljs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const PptxGenJS = require("pptxgenjs");
const TEMPLATE_PATH = path.join(
  __dirname,
  "..",
  "templates",
  "relatorio-template.xlsx"
);
const MAX_ACTIVITIES = 8;
const REPORT_FORMATS = new Set(["excel", "word", "presentation"]);

export async function buildReport(payload) {
  const metadata = normalizeMetadata(payload?.metadata);
  const activities = normalizeActivities(payload?.activities);
  const format = normalizeFormat(payload?.format);

  validateReport(metadata, activities);

  if (format === "word") {
    return buildWordReport(metadata, activities);
  }
  if (format === "presentation") {
    return buildPresentationReport(metadata, activities);
  }
  return buildSpreadsheetReport(metadata, activities);
}

async function buildSpreadsheetReport(metadata, activities) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await fs.readFile(TEMPLATE_PATH));
  const worksheet = workbook.worksheets[0];

  worksheet.getCell("A3").value = "N° Ordem de serviço";
  worksheet.getCell("B2").value = metadata.competencia.toUpperCase();
  worksheet.getCell("E2").value = metadata.contratada.toUpperCase();
  worksheet.getCell("B3").value = metadata.ordemServico;
  worksheet.getCell("D3").value = "TIPO DE MANUTENÇÃO";
  worksheet.getCell("E3").value = metadata.tipoManutencao;

  clearActivityImages(worksheet);

  for (let index = 0; index < MAX_ACTIVITIES; index += 1) {
    const activity = activities[index] || emptyActivity();
    const baseRow = 6 + index * 20;
    worksheet.getCell(`A${baseRow + 17}`).value = formatDateLabel(
      activity.dataAntes
    );
    worksheet.getCell(`G${baseRow + 17}`).value = formatDateLabel(
      activity.dataDepois
    );
    worksheet.getCell(`A${baseRow + 18}`).value =
      activityDescription(activity);

    addSpreadsheetPhoto(
      workbook,
      worksheet,
      activity.fotoAntes,
      `A${baseRow + 1}:E${baseRow + 15}`
    );
    addSpreadsheetPhoto(
      workbook,
      worksheet,
      activity.fotoDepois,
      `G${baseRow + 1}:L${baseRow + 15}`
    );
  }

  return reportResult({
    buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
    filename: `Relatorio Fotografico - ${metadata.competencia}.xlsx`,
    contentType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    format: "excel",
    formatLabel: "Excel",
    metadata,
    activities
  });
}

async function buildWordReport(metadata, activities) {
  const filled = activities.filter((activity) => activity.atividade);
  const children = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: "Relatório Fotográfico de Manutenção",
          bold: true,
          color: "173D36"
        })
      ]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 360 },
      children: [
        new TextRun({
          text: `Competência ${metadata.competencia}`,
          color: "53706A",
          size: 24
        })
      ]
    }),
    wordMetadataTable(metadata),
    new Paragraph({ text: "", spacing: { after: 160 } })
  ];

  filled.forEach((activity, index) => {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        pageBreakBefore: index > 0,
        spacing: { before: 200, after: 120 },
        children: [
          new TextRun({
            text: `${String(index + 1).padStart(2, "0")}  ${activity.atividade}`,
            bold: true,
            color: "173D36"
          })
        ]
      }),
      new Paragraph({
        spacing: { after: 80 },
        children: [
          new TextRun({ text: "Responsável técnico: ", bold: true }),
          new TextRun(activity.responsavel || "Não informado")
        ]
      }),
      new Paragraph({
        spacing: { after: 80 },
        children: [
          new TextRun({ text: "Situação: ", bold: true }),
          new TextRun({
            text:
              activity.status === "em-espera" ? "Em espera" : "Concluída",
            color: activity.status === "em-espera" ? "9A650D" : "197454",
            bold: true
          })
        ]
      }),
      ...wordWaitingReason(activity),
      wordPhotoTable(activity)
    );
  });

  const document = new Document({
    creator: "Medição Pro",
    title: `Relatório Fotográfico - ${metadata.competencia}`,
    description: "Relatório fotográfico de manutenção",
    styles: {
      default: {
        document: {
          run: { font: "Aptos", size: 21, color: "273A40" },
          paragraph: { spacing: { after: 100, line: 276 } }
        }
      }
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 720, right: 720, bottom: 720, left: 720 }
          }
        },
        children
      }
    ]
  });

  return reportResult({
    buffer: await Packer.toBuffer(document),
    filename: `Relatorio Fotografico - ${metadata.competencia}.docx`,
    contentType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    format: "word",
    formatLabel: "Word",
    metadata,
    activities
  });
}

async function buildPresentationReport(metadata, activities) {
  const filled = activities.filter((activity) => activity.atividade);
  const presentation = new PptxGenJS();
  presentation.layout = "LAYOUT_WIDE";
  presentation.author = "Medição Pro";
  presentation.company = metadata.contratada;
  presentation.subject = "Relatório fotográfico de manutenção";
  presentation.title = `Relatório Fotográfico - ${metadata.competencia}`;
  presentation.lang = "pt-BR";
  presentation.theme = {
    headFontFace: "Aptos Display",
    bodyFontFace: "Aptos",
    lang: "pt-BR"
  };

  const cover = presentation.addSlide();
  cover.background = { color: "F2F6F7" };
  cover.addShape(presentation.ShapeType.rect, {
    x: 0,
    y: 0,
    w: 3.05,
    h: 7.5,
    line: { color: "173D36", transparency: 100 },
    fill: { color: "173D36" }
  });
  cover.addText("MP", {
    x: 0.65,
    y: 0.7,
    w: 1.4,
    h: 0.7,
    fontFace: "Aptos Display",
    fontSize: 28,
    bold: true,
    color: "FFFFFF",
    margin: 0
  });
  cover.addText("MEDIÇÃO PRO", {
    x: 0.65,
    y: 1.38,
    w: 1.8,
    h: 0.35,
    fontSize: 11,
    bold: true,
    color: "62D2B5",
    charSpacing: 1.3,
    margin: 0
  });
  cover.addText("Relatório Fotográfico\nde Manutenção", {
    x: 3.75,
    y: 1.45,
    w: 8.6,
    h: 1.6,
    fontFace: "Aptos Display",
    fontSize: 30,
    bold: true,
    color: "173D36",
    breakLine: false,
    margin: 0
  });
  cover.addText(
    [
      { text: "Competência\n", options: { bold: true, color: "527068" } },
      { text: metadata.competencia, options: { color: "243A40" } }
    ],
    { x: 3.8, y: 3.45, w: 2.5, h: 0.85, fontSize: 16, margin: 0 }
  );
  cover.addText(
    [
      { text: "Ordem de serviço\n", options: { bold: true, color: "527068" } },
      {
        text: metadata.ordemServico || "Não informada",
        options: { color: "243A40" }
      }
    ],
    { x: 6.55, y: 3.45, w: 2.5, h: 0.85, fontSize: 16, margin: 0 }
  );
  cover.addText(
    [
      { text: "Tipo de manutenção\n", options: { bold: true, color: "527068" } },
      { text: metadata.tipoManutencao, options: { color: "243A40" } }
    ],
    { x: 9.3, y: 3.45, w: 3.2, h: 0.85, fontSize: 16, margin: 0 }
  );
  cover.addText(metadata.contratada, {
    x: 3.8,
    y: 5.65,
    w: 8.7,
    h: 0.5,
    fontSize: 13,
    color: "527068",
    margin: 0
  });

  filled.forEach((activity, index) => {
    const slide = presentation.addSlide();
    slide.background = { color: "F7F9FA" };
    addPresentationHeader(slide, presentation, activity, index);
    addPresentationPhoto(
      slide,
      presentation,
      activity.fotoAntes,
      "ENTRADA",
      0.65,
      1.52
    );
    addPresentationPhoto(
      slide,
      presentation,
      activity.fotoDepois,
      "SAÍDA",
      6.85,
      1.52
    );

    slide.addText(
      `Responsável técnico: ${activity.responsavel || "Não informado"}  |  Período: ${formatActivityDates(activity)}`,
      {
        x: 0.68,
        y: 5.18,
        w: 12,
        h: 0.32,
        fontSize: 10.5,
        color: "527068",
        margin: 0
      }
    );
    slide.addShape(presentation.ShapeType.roundRect, {
      x: 0.65,
      y: 5.65,
      w: 12.05,
      h: 1.05,
      rectRadius: 0.06,
      line: { color: activity.status === "em-espera" ? "E5C57C" : "A8D3C5" },
      fill: {
        color: activity.status === "em-espera" ? "FFF5DA" : "EAF7F2"
      }
    });
    slide.addText(
      presentationStatusText(activity),
      {
        x: 0.9,
        y: 5.91,
        w: 11.55,
        h: 0.48,
        fontSize: 12,
        bold: true,
        color: activity.status === "em-espera" ? "8A5C0A" : "17634F",
        fit: "shrink",
        margin: 0
      }
    );
    slide.addText(`${index + 2} / ${filled.length + 1}`, {
      x: 11.7,
      y: 7.08,
      w: 0.95,
      h: 0.2,
      fontSize: 8,
      color: "7D8C91",
      align: "right",
      margin: 0
    });
  });

  const output = await presentation.write({
    outputType: "nodebuffer",
    compression: true
  });

  return reportResult({
    buffer: Buffer.from(output),
    filename: `Relatorio Fotografico - ${metadata.competencia}.pptx`,
    contentType:
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    format: "presentation",
    formatLabel: "PowerPoint",
    metadata,
    activities
  });
}

function wordMetadataTable(metadata) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      wordMetadataRow(
        "Ordem de serviço",
        metadata.ordemServico || "Não informada",
        "Tipo de manutenção",
        metadata.tipoManutencao
      ),
      wordMetadataRow(
        "Contratada",
        metadata.contratada,
        "Atividades",
        "Até 8 evidências"
      )
    ]
  });
}

function wordWaitingReason(activity) {
  if (activity.status !== "em-espera") return [];
  return [
    new Paragraph({
      spacing: { after: 140 },
      children: [
        new TextRun({ text: "Motivo da espera: ", bold: true }),
        new TextRun(activity.motivo || "Não informado")
      ]
    })
  ];
}

function wordMetadataRow(labelA, valueA, labelB, valueB) {
  return new TableRow({
    children: [
      wordMetadataCell(labelA, valueA),
      wordMetadataCell(labelB, valueB)
    ]
  });
}

function wordMetadataCell(label, value) {
  return new TableCell({
    width: { size: 50, type: WidthType.PERCENTAGE },
    shading: { fill: "EAF4F1" },
    margins: { top: 140, right: 180, bottom: 140, left: 180 },
    children: [
      new Paragraph({
        spacing: { after: 40 },
        children: [
          new TextRun({
            text: label.toUpperCase(),
            bold: true,
            color: "527068",
            size: 17
          })
        ]
      }),
      new Paragraph({
        children: [new TextRun({ text: value, bold: true, color: "173D36" })]
      })
    ]
  });
}

function wordPhotoTable(activity) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          wordPhotoCell("ENTRADA", activity.fotoAntes, activity.dataAntes),
          wordPhotoCell("SAÍDA", activity.fotoDepois, activity.dataDepois)
        ]
      })
    ]
  });
}

function wordPhotoCell(label, dataUrl, date) {
  const photo = parsePhoto(dataUrl);
  const children = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
      children: [
        new TextRun({
          text: `${label}${date ? ` - ${formatDate(date)}` : ""}`,
          bold: true,
          color: "527068",
          size: 18
        })
      ]
    })
  ];

  children.push(
    photo
      ? new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new ImageRun({
              type: photo.extension === "jpeg" ? "jpg" : "png",
              data: photo.buffer,
              transformation: { width: 280, height: 140 }
            })
          ]
        })
      : new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 800, after: 800 },
          children: [
            new TextRun({
              text: "Foto não informada",
              italics: true,
              color: "879398"
            })
          ]
        })
  );

  return new TableCell({
    width: { size: 50, type: WidthType.PERCENTAGE },
    margins: { top: 120, right: 120, bottom: 120, left: 120 },
    children
  });
}

function presentationStatusText(activity) {
  if (activity.status === "em-espera") {
    return `EM ESPERA  |  ${activity.motivo || "Motivo da espera não informado"}`;
  }
  return "CONCLUÍDA";
}

function addPresentationHeader(slide, presentation, activity, index) {
  slide.addShape(presentation.ShapeType.rect, {
    x: 0,
    y: 0,
    w: 13.333,
    h: 0.22,
    line: { color: "1F7A68", transparency: 100 },
    fill: { color: "1F7A68" }
  });
  slide.addText(String(index + 1).padStart(2, "0"), {
    x: 0.65,
    y: 0.54,
    w: 0.56,
    h: 0.43,
    fontSize: 16,
    bold: true,
    color: "1F7A68",
    margin: 0
  });
  slide.addText(activity.atividade, {
    x: 1.35,
    y: 0.47,
    w: 10.9,
    h: 0.58,
    fontFace: "Aptos Display",
    fontSize: 22,
    bold: true,
    color: "173D36",
    fit: "shrink",
    margin: 0
  });
}

function addPresentationPhoto(
  slide,
  presentation,
  dataUrl,
  label,
  x,
  y
) {
  slide.addText(label, {
    x,
    y: y - 0.28,
    w: 1,
    h: 0.2,
    fontSize: 9,
    bold: true,
    color: "527068",
    margin: 0
  });
  const photo = parsePhoto(dataUrl);
  if (photo) {
    slide.addImage({ data: photo.dataUrl, x, y, w: 5.82, h: 2.91 });
    return;
  }
  slide.addShape(presentation.ShapeType.rect, {
    x,
    y,
    w: 5.82,
    h: 2.91,
    line: { color: "C7D2D5", dash: "dash" },
    fill: { color: "EEF2F3" }
  });
  slide.addText("Foto não informada", {
    x,
    y: y + 1.27,
    w: 5.82,
    h: 0.3,
    fontSize: 12,
    color: "7D8C91",
    italic: true,
    align: "center",
    margin: 0
  });
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

function normalizeFormat(format) {
  return REPORT_FORMATS.has(format) ? format : "excel";
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
  return Array.from({ length: MAX_ACTIVITIES }, (_, index) => {
    const activity = activities[index] || {};
    return {
      dataAntes: clean(activity.dataAntes, 20),
      dataDepois: clean(activity.dataDepois, 20),
      responsavel: clean(activity.responsavel, 120),
      atividade: clean(activity.atividade || activity.problema || activity.descricao, 1000),
      status: activity.status === "em-espera" ? "em-espera" : "concluida",
      motivo: clean(activity.motivo || activity.conclusao, 500),
      fotoAntes: clean(activity.fotoAntes, 2_000_000),
      fotoDepois: clean(activity.fotoDepois, 2_000_000)
    };
  });
}

function emptyActivity() {
  return {
    dataAntes: "",
    dataDepois: "",
    responsavel: "",
    atividade: "",
    status: "concluida",
    motivo: "",
    fotoAntes: "",
    fotoDepois: ""
  };
}

function activityDescription(activity) {
  if (!activity.atividade) return "PROBLEMA / DESCRIÇÃO DO SERVIÇO:";
  const date = compactDate(activity.dataAntes);
  const responsible = activity.responsavel
    ? `${activity.responsavel} - `
    : "";
  const status =
    activity.status === "em-espera" ? "EM ESPERA" : "CONCLUÍDA";
  const reason = activity.motivo ? ` | MOTIVO DA ESPERA: ${activity.motivo}` : "";
  return `PROBLEMA / SERVIÇO: ${date}${responsible}${activity.atividade} | STATUS: ${status}${reason}`;
}

function addSpreadsheetPhoto(workbook, worksheet, dataUrl, range) {
  const photo = parsePhoto(dataUrl);
  if (!photo) return;

  try {
    const imageId = workbook.addImage({
      buffer: photo.buffer,
      extension: photo.extension
    });
    worksheet.addImage(imageId, range);
  } catch (error) {
    console.warn("Imagem ignorada durante a geração do relatório.", error);
  }
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
    return {
      buffer,
      extension,
      dataUrl: `data:image/${extension};base64,${base64}`
    };
  } catch {
    return null;
  }
}

function clearActivityImages(worksheet) {
  const existingImages = worksheet.getImages();
  for (const image of existingImages) {
    const top = image.range?.tl?.nativeRow ?? -1;
    if (top >= 5) {
      worksheet._media = worksheet._media.filter((item) => item !== image);
    }
  }
}

function formatDateLabel(value) {
  return value ? `DATA: ${formatDate(value)}` : "DATA:";
}

function formatDate(value) {
  const [year, month, day] = String(value).slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function formatActivityDates(activity) {
  const before = activity.dataAntes ? formatDate(activity.dataAntes) : "sem data";
  const after = activity.dataDepois
    ? formatDate(activity.dataDepois)
    : "sem data";
  return `${before} a ${after}`;
}

function compactDate(value) {
  if (!value) return "";
  const [, month, day] = String(value).slice(0, 10).split("-");
  return day && month ? `${day}-${month} ` : "";
}

function clean(value, maxLength = 1000) {
  return String(value ?? "").trim().slice(0, maxLength);
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
