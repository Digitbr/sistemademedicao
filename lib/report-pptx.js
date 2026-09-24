import PptxGenJS from "pptxgenjs";

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

// Slide 16:9 (13,33 x 7,5 pol.). Uma ocorrência por slide.
const W = 13.333;
const H = 7.5;
const M = 0.4;

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

export async function buildPptxBuffer(metadata, activities) {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "Medição Pro";
  pptx.company = "Grupo Autoglass";
  pptx.title = `Relatório Fotográfico - ${metadata.competencia}`;

  activities.forEach((activity, index) => {
    drawSlide(pptx.addSlide(), activity._meta || metadata, activity, index, activities.length);
  });

  return Buffer.from(await pptx.write({ outputType: "nodebuffer" }));
}

function drawSlide(slide, metadata, activity, index, total) {
  slide.background = { color: COLOR.white };
  const waiting = activity.status === "em-espera";

  // Cabeçalho
  const logoH = 0.34;
  slide.addImage({
    data: `image/png;base64,${BRAND_LOGO_PNG_BASE64}`,
    x: M,
    y: 0.36,
    w: (BRAND_LOGO_WIDTH / BRAND_LOGO_HEIGHT) * logoH,
    h: logoH
  });
  slide.addText(
    [
      { text: "RELATÓRIO FOTOGRÁFICO DE MANUTENÇÃO", options: { bold: true, fontSize: 15, color: COLOR.text, breakLine: true } },
      { text: plain(metadata.contratada || "Contratada não informada"), options: { fontSize: 10, color: COLOR.muted, breakLine: true } },
      { text: `Ocorrência ${index + 1} de ${total}`, options: { bold: true, fontSize: 10, color: COLOR.blue } }
    ],
    { x: 6.2, y: 0.18, w: W - M - 6.2, h: 0.8, align: "right", valign: "middle", fontFace: FONT, margin: 0 }
  );
  slide.addShape("rect", { x: M, y: 1.05, w: W - M * 2, h: 0.05, fill: { color: COLOR.blue }, line: { color: COLOR.blue, width: 0 } });

  // Painel de dados à esquerda
  const panelX = M;
  const panelY = 1.3;
  const panelW = 3.9;
  const panelH = H - panelY - 0.55;
  slide.addShape("rect", {
    x: panelX,
    y: panelY,
    w: panelW,
    h: panelH,
    fill: { color: COLOR.soft },
    line: { color: COLOR.line, width: 0.75 }
  });

  const meta = [
    ["COMPETÊNCIA", metadata.competencia],
    ["OS DA OCORRÊNCIA", activity.ordemServico || metadata.ordemServico || "Não informada"],
    ["TIPO DE MANUTENÇÃO", metadata.tipoManutencao || "Não informado"],
    ["RESPONSÁVEL TÉCNICO", activity.responsavel || "Não informado"]
  ];
  slide.addText(
    meta.flatMap(([name, value], position) => [
      { text: name, options: { bold: true, fontSize: 8, color: COLOR.muted, breakLine: true } },
      {
        text: plain(value || "—"),
        options: { bold: true, fontSize: 12, color: COLOR.text, breakLine: position < meta.length - 1, paraSpaceAfter: 6 }
      }
    ]),
    { x: panelX + 0.2, y: panelY + 0.15, w: panelW - 0.4, h: 2.3, valign: "top", fontFace: FONT, margin: 0, fit: "shrink" }
  );

  const badgeY = panelY + 2.55;
  slide.addText(waiting ? "EM ESPERA" : "CONCLUÍDA", {
    x: panelX + 0.2,
    y: badgeY,
    w: 1.25,
    h: 0.3,
    fontFace: FONT,
    fontSize: 9,
    bold: true,
    color: COLOR.white,
    align: "center",
    valign: "middle",
    fill: { color: waiting ? COLOR.waiting : COLOR.done },
    margin: 0
  });
  slide.addText(
    [
      { text: `Entrada: ${formatDate(activity.dataAntes) || "—"}`, options: { breakLine: true } },
      { text: `Saída: ${formatDate(activity.dataDepois) || "—"}` }
    ],
    { x: panelX + 1.6, y: badgeY - 0.05, w: panelW - 1.8, h: 0.42, fontFace: FONT, fontSize: 9, color: COLOR.muted, margin: 0, valign: "middle" }
  );

  const description = [
    { text: "PROBLEMA / DESCRIÇÃO DO SERVIÇO", options: { bold: true, fontSize: 8, color: COLOR.muted, breakLine: true } },
    { text: plain(activity.atividade || "—"), options: { fontSize: 11, color: COLOR.text } }
  ];
  if (waiting && activity.motivo) {
    description[1].options.breakLine = true;
    description.push(
      { text: " ", options: { fontSize: 6, breakLine: true } },
      { text: "MOTIVO DA ESPERA", options: { bold: true, fontSize: 8, color: COLOR.waiting, breakLine: true } },
      { text: plain(activity.motivo), options: { fontSize: 10, color: COLOR.text } }
    );
  }
  slide.addText(description, {
    x: panelX + 0.2,
    y: badgeY + 0.5,
    w: panelW - 0.4,
    h: panelY + panelH - (badgeY + 0.5) - 0.15,
    valign: "top",
    fontFace: FONT,
    margin: 0,
    fit: "shrink"
  });

  // Fotos: Antes em cima, Depois embaixo
  const areaX = panelX + panelW + 0.3;
  const areaW = W - M - areaX;
  const rowH = (panelH - 0.15) / 2;
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

  rows.forEach((row, rowIndex) => {
    const top = panelY + rowIndex * (rowH + 0.15);
    const filled = row.photos.filter((photo) => photo.dataUrl || photo.caption || photo.name);
    const photos = filled.length ? filled : [{ dataUrl: "", caption: "" }];

    slide.addShape("rect", { x: areaX, y: top + 0.03, w: 0.05, h: 0.22, fill: { color: row.color }, line: { color: row.color, width: 0 } });
    slide.addText(row.title, { x: areaX + 0.12, y: top, w: 4, h: 0.28, fontFace: FONT, fontSize: 10, bold: true, color: row.color, margin: 0, valign: "middle" });
    if (formatDate(row.date)) {
      slide.addText(formatDate(row.date), { x: areaX + areaW - 2, y: top, w: 2, h: 0.28, fontFace: FONT, fontSize: 9, color: COLOR.muted, align: "right", margin: 0, valign: "middle" });
    }

    const gap = 0.25;
    const columns = photos.length > 1 ? 2 : 1;
    const frameW = columns === 2 ? (areaW - gap) / 2 : areaW;
    const frameY = top + 0.36;
    const captionH = 0.42;
    const frameH = rowH - 0.36 - captionH - 0.04;

    photos.forEach((photo, position) => {
      const frameX = areaX + position * (frameW + gap);
      slide.addShape("rect", { x: frameX, y: frameY, w: frameW, h: frameH, fill: { color: COLOR.soft }, line: { color: COLOR.line, width: 0.75 } });

      const parsed = parsePhoto(photo.dataUrl);
      if (parsed) {
        const size = fitInside(imageSize(parsed.buffer, parsed.extension), frameW - 0.12, frameH - 0.12);
        slide.addImage({
          data: `image/${parsed.extension === "png" ? "png" : "jpeg"};base64,${parsed.buffer.toString("base64")}`,
          x: frameX + (frameW - size.width) / 2,
          y: frameY + (frameH - size.height) / 2,
          w: size.width,
          h: size.height
        });
      } else if (isDocumentEntry(photo)) {
        slide.addText(
          [
            { text: ` ${documentLabel(photo)} `, options: { bold: true, fontSize: 11, color: COLOR.white, highlight: "173D35", breakLine: true } },
            { text: `Documento anexado: ${plain(photo.name)}`, options: { fontSize: 10, color: COLOR.text } }
          ],
          { x: frameX + 0.1, y: frameY, w: frameW - 0.2, h: frameH, fontFace: FONT, align: "center", valign: "middle", margin: 0, fit: "shrink" }
        );
      } else {
        slide.addText("Sem imagem registrada", { x: frameX, y: frameY, w: frameW, h: frameH, fontFace: FONT, fontSize: 10, color: COLOR.muted, align: "center", valign: "middle", margin: 0 });
      }

      slide.addText(plain(photo.caption || "Sem descrição para esta imagem."), {
        x: frameX,
        y: frameY + frameH + 0.04,
        w: frameW,
        h: captionH,
        fontFace: FONT,
        fontSize: 9,
        color: photo.caption ? COLOR.text : COLOR.muted,
        valign: "top",
        margin: 0,
        fit: "shrink"
      });
    });
  });

  // Rodapé
  slide.addText(plain(`${metadata.competencia} · ${orderLabel(activity.ordemServico || metadata.ordemServico)}`), {
    x: M, y: H - 0.38, w: 6, h: 0.25, fontFace: FONT, fontSize: 8, color: COLOR.muted, margin: 0
  });
  slide.addText(`Slide ${index + 1} de ${total}`, {
    x: W - M - 3, y: H - 0.38, w: 3, h: 0.25, fontFace: FONT, fontSize: 8, color: COLOR.muted, align: "right", margin: 0
  });
}
