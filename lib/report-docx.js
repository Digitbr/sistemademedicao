import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  ImageRun,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType
} from "docx";

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

// A4 retrato com margens de 1,27 cm. Medidas em twips (1/1440 pol.) e pixels (96 dpi).
const PAGE_WIDTH = 11906;
const PAGE_HEIGHT = 16838;
const MARGIN = 720;
const CONTENT_TWIPS = PAGE_WIDTH - MARGIN * 2;
const GAP_TWIPS = 240;
const TWIPS_PER_PX = 15;

const COLOR = {
  blue: "2021D4",
  text: "212626",
  muted: "616B69",
  line: "D4DBD9",
  soft: "F2F5F4",
  before: "2E6D94",
  after: "1C6B4A",
  waiting: "B86B0D",
  done: "1C6B4A",
  white: "FFFFFF"
};

const FONT = "Arial";
const NONE = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const NO_BORDERS = { top: NONE, bottom: NONE, left: NONE, right: NONE, insideHorizontal: NONE, insideVertical: NONE };
const THIN = { style: BorderStyle.SINGLE, size: 4, color: COLOR.line };
const BOX_BORDERS = { top: THIN, bottom: THIN, left: THIN, right: THIN };

export async function buildDocxBuffer(metadata, activities) {
  const logo = Buffer.from(BRAND_LOGO_PNG_BASE64, "base64");

  const doc = new Document({
    creator: "Medição Pro",
    title: `Relatório Fotográfico - ${metadata.competencia}`,
    styles: {
      default: { document: { run: { font: FONT, size: 20, color: COLOR.text } } }
    },
    sections: activities.map((activity, index) => ({
      properties: {
        page: {
          size: { width: PAGE_WIDTH, height: PAGE_HEIGHT },
          margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN, footer: 360 }
        }
      },
      footers: { default: footer(metadata, activity) },
      children: occurrencePage(logo, metadata, activity, index, activities.length)
    }))
  });

  return Buffer.from(await Packer.toBuffer(doc));
}

function occurrencePage(logo, metadata, activity, index, total) {
  const waiting = activity.status === "em-espera";
  const children = [
    header(logo, metadata, index, total),
    spacer(120),
    metaTable(metadata, activity),
    spacer(160),
    new Paragraph({
      spacing: { after: 160 },
      children: [
        new TextRun({
          text: waiting ? "  EM ESPERA  " : "  CONCLUÍDA  ",
          bold: true,
          size: 16,
          color: COLOR.white,
          shading: { type: ShadingType.CLEAR, fill: waiting ? COLOR.waiting : COLOR.done, color: "auto" }
        }),
        new TextRun({
          text: `    Entrada: ${formatDate(activity.dataAntes) || "—"}    ·    Saída: ${formatDate(activity.dataDepois) || "—"}`,
          size: 18,
          color: COLOR.muted
        })
      ]
    }),
    label("PROBLEMA / DESCRIÇÃO DO SERVIÇO", COLOR.muted),
    new Paragraph({
      spacing: { after: 160 },
      children: [new TextRun({ text: plain(activity.atividade || "—"), size: 21 })]
    })
  ];

  if (waiting && activity.motivo) {
    children.push(
      label("MOTIVO DA ESPERA", COLOR.waiting),
      new Paragraph({
        spacing: { after: 160 },
        children: [new TextRun({ text: plain(activity.motivo), size: 20 })]
      })
    );
  }

  children.push(
    new Paragraph({
      spacing: { after: 200 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: COLOR.line, space: 1 } },
      children: []
    })
  );

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

  for (const row of rows) {
    const photos = row.photos.filter((photo) => photo.dataUrl || photo.caption || photo.name);
    children.push(
      new Paragraph({
        spacing: { before: 120, after: 100 },
        border: { left: { style: BorderStyle.SINGLE, size: 24, color: row.color, space: 6 } },
        children: [
          new TextRun({ text: row.title, bold: true, size: 17, color: row.color }),
          new TextRun({
            text: formatDate(row.date) ? `    ${formatDate(row.date)}` : "",
            size: 16,
            color: COLOR.muted
          })
        ]
      }),
      photoTable(photos.length ? photos : [{ dataUrl: "", caption: "" }])
    );
  }

  return children;
}

function header(logo, metadata, index, total) {
  const logoHeight = 30;
  const logoWidth = Math.round((BRAND_LOGO_WIDTH / BRAND_LOGO_HEIGHT) * logoHeight);
  const leftWidth = Math.round(CONTENT_TWIPS * 0.45);

  return new Table({
    width: { size: CONTENT_TWIPS, type: WidthType.DXA },
    columnWidths: [leftWidth, CONTENT_TWIPS - leftWidth],
    layout: TableLayoutType.FIXED,
    borders: {
      ...NO_BORDERS,
      bottom: { style: BorderStyle.SINGLE, size: 24, color: COLOR.blue }
    },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: leftWidth, type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            margins: { bottom: 120 },
            children: [
              new Paragraph({
                children: [
                  new ImageRun({
                    type: "png",
                    data: logo,
                    transformation: { width: logoWidth, height: logoHeight }
                  })
                ]
              })
            ]
          }),
          new TableCell({
            width: { size: CONTENT_TWIPS - leftWidth, type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            margins: { bottom: 120 },
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [new TextRun({ text: "RELATÓRIO FOTOGRÁFICO DE MANUTENÇÃO", bold: true, size: 24 })]
              }),
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    text: plain(metadata.contratada || "Contratada não informada"),
                    size: 17,
                    color: COLOR.muted
                  })
                ]
              }),
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({ text: `Ocorrência ${index + 1} de ${total}`, bold: true, size: 16, color: COLOR.blue })
                ]
              })
            ]
          })
        ]
      })
    ]
  });
}

function metaTable(metadata, activity) {
  const items = [
    ["COMPETÊNCIA", metadata.competencia],
    ["OS DA OCORRÊNCIA", activity.ordemServico || metadata.ordemServico || "Não informada"],
    ["TIPO DE MANUTENÇÃO", metadata.tipoManutencao || "Não informado"],
    ["RESPONSÁVEL TÉCNICO", activity.responsavel || "Não informado"]
  ];
  const columnWidth = Math.floor(CONTENT_TWIPS / items.length);

  return new Table({
    width: { size: columnWidth * items.length, type: WidthType.DXA },
    columnWidths: items.map(() => columnWidth),
    layout: TableLayoutType.FIXED,
    borders: { ...NO_BORDERS, top: THIN, bottom: THIN, left: THIN, right: THIN },
    rows: [
      new TableRow({
        children: items.map(
          ([name, value]) =>
            new TableCell({
              width: { size: columnWidth, type: WidthType.DXA },
              shading: { type: ShadingType.CLEAR, fill: COLOR.soft, color: "auto" },
              margins: { top: 100, bottom: 100, left: 160, right: 120 },
              children: [
                new Paragraph({ children: [new TextRun({ text: name, bold: true, size: 13, color: COLOR.muted })] }),
                new Paragraph({ children: [new TextRun({ text: plain(value || "—"), bold: true, size: 19 })] })
              ]
            })
        )
      })
    ]
  });
}

function photoTable(photos) {
  const columns = photos.length > 1 ? 2 : 1;
  const cellWidth = columns === 2 ? Math.floor((CONTENT_TWIPS - GAP_TWIPS) / 2) : CONTENT_TWIPS;
  const boxWidthPx = Math.floor(cellWidth / TWIPS_PER_PX) - 16;
  const boxHeightPx = columns === 2 ? 190 : 250;

  const cells = [];
  photos.forEach((photo, position) => {
    if (position > 0) {
      cells.push(
        new TableCell({
          width: { size: GAP_TWIPS, type: WidthType.DXA },
          borders: NO_BORDERS,
          children: [new Paragraph({ children: [] })]
        })
      );
    }
    cells.push(photoCell(photo, cellWidth, boxWidthPx, boxHeightPx));
  });

  return new Table({
    width: { size: CONTENT_TWIPS, type: WidthType.DXA },
    columnWidths: columns === 2 ? [cellWidth, GAP_TWIPS, cellWidth] : [CONTENT_TWIPS],
    layout: TableLayoutType.FIXED,
    borders: NO_BORDERS,
    rows: [new TableRow({ children: cells })]
  });
}

function photoCell(photo, cellWidth, boxWidthPx, boxHeightPx) {
  const parsed = parsePhoto(photo.dataUrl);
  let imageParagraph;

  if (parsed) {
    const size = fitInside(imageSize(parsed.buffer, parsed.extension), boxWidthPx, boxHeightPx);
    imageParagraph = new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 80, after: 80 },
      children: [
        new ImageRun({
          type: parsed.extension === "png" ? "png" : "jpg",
          data: parsed.buffer,
          transformation: { width: Math.round(size.width), height: Math.round(size.height) }
        })
      ]
    });
  } else if (isDocumentEntry(photo)) {
    imageParagraph = new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 520, after: 520 },
      children: [
        new TextRun({
          text: `  ${documentLabel(photo)}  `,
          bold: true,
          size: 18,
          color: COLOR.white,
          shading: { type: ShadingType.CLEAR, fill: "173D35", color: "auto" }
        }),
        new TextRun({ text: `Documento anexado: ${plain(photo.name)}`, size: 18, break: 1 })
      ]
    });
  } else {
    imageParagraph = new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 600, after: 600 },
      children: [new TextRun({ text: "Sem imagem registrada", size: 18, color: COLOR.muted })]
    });
  }

  return new TableCell({
    width: { size: cellWidth, type: WidthType.DXA },
    borders: NO_BORDERS,
    children: [
      new Table({
        width: { size: cellWidth, type: WidthType.DXA },
        columnWidths: [cellWidth],
        layout: TableLayoutType.FIXED,
        borders: { ...NO_BORDERS, ...BOX_BORDERS },
        rows: [
          new TableRow({
            children: [
              new TableCell({
                width: { size: cellWidth, type: WidthType.DXA },
                shading: { type: ShadingType.CLEAR, fill: COLOR.soft, color: "auto" },
                verticalAlign: VerticalAlign.CENTER,
                borders: BOX_BORDERS,
                children: [imageParagraph]
              })
            ]
          })
        ]
      }),
      new Paragraph({
        spacing: { before: 80, after: 80 },
        children: [
          new TextRun({
            text: plain(photo.caption || "Sem descrição para esta imagem."),
            size: 17,
            color: photo.caption ? COLOR.text : COLOR.muted
          })
        ]
      })
    ]
  });
}

function label(text, color) {
  return new Paragraph({
    spacing: { after: 60 },
    children: [new TextRun({ text, bold: true, size: 14, color })]
  });
}

function spacer(after) {
  return new Paragraph({ spacing: { after }, children: [] });
}

function footer(metadata, activity) {
  return new Footer({
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text: plain(`${metadata.competencia} · ${orderLabel(activity.ordemServico || metadata.ordemServico)}`),
            size: 14,
            color: COLOR.muted
          })
        ]
      })
    ]
  });
}
