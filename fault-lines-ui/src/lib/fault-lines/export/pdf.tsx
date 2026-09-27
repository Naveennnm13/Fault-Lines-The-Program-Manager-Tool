/**
 * PDF export. Laid out with @react-pdf/renderer from the same ReportDoc the
 * editor holds, set in DM Sans so the PDF reads as the same product as the
 * site. The library is imported on demand, only when someone exports.
 */
import * as React from "react";

import { sourceTag, type ReportDoc } from "../report";
import type { ExportMeta } from "./meta";

/** Where the DM Sans files live: a URL in the browser, a path in Node. */
export type FontSources = { regular: string; medium: string; semibold: string; italic: string };

export const BROWSER_FONTS: FontSources = {
  regular: "/fonts/pdf/DMSans-Regular.ttf",
  medium: "/fonts/pdf/DMSans-Medium.ttf",
  semibold: "/fonts/pdf/DMSans-SemiBold.ttf",
  italic: "/fonts/pdf/DMSans-Italic.ttf",
};

const INK = "#1a1a1a";
const MUTED = "#6b6b6b";
const RULE = "#d9d9d9";

let fontsRegistered = false;

export async function buildPdf(
  doc: ReportDoc,
  meta: ExportMeta,
  fonts: FontSources = BROWSER_FONTS,
): Promise<Blob> {
  const { Document, Page, Text, View, StyleSheet, Font, pdf } = await import(
    "@react-pdf/renderer"
  );

  if (!fontsRegistered) {
    Font.register({
      family: "DM Sans",
      fonts: [
        { src: fonts.regular, fontWeight: 400 },
        { src: fonts.italic, fontWeight: 400, fontStyle: "italic" },
        { src: fonts.medium, fontWeight: 500 },
        { src: fonts.semibold, fontWeight: 600 },
      ],
    });
    // The default splits words across lines with hyphens, which reads as a
    // machine-set document. Whole words only.
    Font.registerHyphenationCallback((word) => [word]);
    fontsRegistered = true;
  }

  const s = StyleSheet.create({
    page: {
      fontFamily: "DM Sans",
      // DM Sans joins "fi" and "fl" into single glyphs that the PDF text layer
      // can't map back to letters: copying "briefing" out gives "briefng",
      // and searching for it finds nothing. Plain letters keep it searchable.
      fontFeatureSettings: { liga: false, clig: false },
      fontSize: 10.5,
      lineHeight: 1.5,
      color: INK,
      paddingTop: 56,
      paddingBottom: 64,
      paddingHorizontal: 60,
    },
    title: { fontSize: 20, fontWeight: 600, lineHeight: 1.2, marginBottom: 6 },
    subtitle: { fontSize: 9.5, color: MUTED, marginBottom: 3 },
    prepared: { fontSize: 8.5, color: MUTED, marginBottom: 18 },
    rule: { borderBottomWidth: 0.75, borderBottomColor: RULE, marginBottom: 14 },
    heading: { fontSize: 12.5, fontWeight: 600, marginTop: 14, marginBottom: 6 },
    para: { marginBottom: 7 },
    bulletRow: { flexDirection: "row", marginBottom: 4 },
    bulletMark: { width: 12, color: MUTED },
    bulletText: { flex: 1 },
    tag: { fontSize: 8.5, color: MUTED, fontStyle: "italic" },
    footerLeft: { position: "absolute", bottom: 30, left: 60, fontSize: 8, color: MUTED },
  });

  const line = (text: string, source: ReportDoc["sections"][number]["blocks"][number]["source"]) => {
    const tag = sourceTag(source);
    return (
      <Text>
        {text}
        {tag ? <Text style={s.tag}>{`  (${tag})`}</Text> : null}
      </Text>
    );
  };

  const element = (
    <Document title={doc.title} subject={doc.subtitle} creator="Fault Lines" producer="Fault Lines">
      <Page size="A4" style={s.page}>
        <Text style={s.title}>{doc.title}</Text>
        <Text style={s.subtitle}>{doc.subtitle}</Text>
        <Text style={s.prepared}>{meta.preparedLine}</Text>
        <View style={s.rule} />

        {doc.sections.map((section) => {
          const blocks = section.blocks.filter((b) => b.text.trim());
          if (!blocks.length) return null;
          return (
            <View key={section.id}>
              {/* Keep a heading with at least the start of its section. */}
              <Text style={s.heading} minPresenceAhead={40}>
                {section.heading}
              </Text>
              {blocks.map((block) =>
                block.kind === "bullet" ? (
                  <View key={block.id} style={s.bulletRow} wrap={false}>
                    <Text style={s.bulletMark}>•</Text>
                    <View style={s.bulletText}>{line(block.text.trim(), block.source)}</View>
                  </View>
                ) : (
                  <View key={block.id} style={s.para}>
                    {line(block.text.trim(), block.source)}
                  </View>
                ),
              )}
            </View>
          );
        })}

        {/* Repeated on every page. `fixed` has to sit on the Text itself: on
            a wrapping View the footer silently didn't render. No page numbers:
            react-pdf's `render` prop (the only way to get them) drew nothing
            in this version, and a briefing this short reads fine without. */}
        <Text style={s.footerLeft} fixed>
          {meta.programName} risk briefing
        </Text>
      </Page>
    </Document>
  );

  return pdf(element).toBlob();
}
