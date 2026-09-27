/**
 * Word export. Builds a real .docx from the same ReportDoc the editor holds,
 * so edits and deleted lines carry through exactly as they do for Markdown.
 *
 * `docx` is imported on demand: it is only needed when someone exports, so it
 * stays out of the bundle everyone else downloads.
 */
import { sourceTag, type ReportDoc } from "../report";
import type { ExportMeta } from "./meta";

// Word sizes are in half-points; spacing is in twentieths of a point.
const BODY = 22; // 11pt
const INK = "1A1A1A";
const MUTED = "6B6B6B";

export async function buildDocx(doc: ReportDoc, meta: ExportMeta): Promise<Blob> {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import("docx");

  const children = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      spacing: { after: 80 },
      children: [new TextRun({ text: doc.title, bold: true, size: 36, color: INK })],
    }),
    new Paragraph({
      spacing: { after: 60 },
      children: [new TextRun({ text: doc.subtitle, italics: true, size: 20, color: MUTED })],
    }),
    new Paragraph({
      spacing: { after: 240 },
      children: [new TextRun({ text: meta.preparedLine, size: 18, color: MUTED })],
    }),
  ];

  for (const section of doc.sections) {
    const blocks = section.blocks.filter((b) => b.text.trim());
    if (!blocks.length) continue;

    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 280, after: 100 },
        children: [new TextRun({ text: section.heading, bold: true, size: 26, color: INK })],
      }),
    );

    for (const block of blocks) {
      const tag = sourceTag(block.source);
      const runs = [new TextRun({ text: block.text.trim(), size: BODY, color: INK })];
      if (tag) {
        runs.push(new TextRun({ text: `  (${tag})`, italics: true, size: 18, color: MUTED }));
      }
      children.push(
        new Paragraph({
          children: runs,
          spacing: { after: block.kind === "bullet" ? 60 : 140, line: 276 },
          ...(block.kind === "bullet" ? { bullet: { level: 0 } } : {}),
        }),
      );
    }
  }

  const document = new Document({
    creator: "Fault Lines",
    title: doc.title,
    description: doc.subtitle,
    styles: {
      default: { document: { run: { font: "Calibri", size: BODY, color: INK } } },
    },
    sections: [{ children }],
  });

  return Packer.toBlob(document);
}
