/**
 * Plain-text renderings of a briefing for email and Slack.
 *
 * Neither channel can receive a file from a web page, so these carry the
 * substance of the briefing as text, and the email version points at the PDF
 * the user attaches.
 */
import { sourceTag, type ReportBlock, type ReportDoc } from "../report";
import type { ExportMeta } from "./meta";

function blockText(block: ReportBlock): string {
  const tag = sourceTag(block.source);
  return block.text.trim() + (tag ? ` (${tag})` : "");
}

function section(doc: ReportDoc, id: string) {
  return doc.sections.find((s) => s.id === id)?.blocks.filter((b) => b.text.trim()) ?? [];
}

/**
 * Slack text. Slack shows pasted *asterisks* literally unless the user has
 * turned on markup formatting, so this is plain text: headings on their own
 * line, bullets as "•".
 */
export function toSlackText(doc: ReportDoc, meta: ExportMeta): string {
  const out: string[] = [doc.title, doc.subtitle, ""];
  for (const s of doc.sections) {
    const blocks = s.blocks.filter((b) => b.text.trim());
    if (!blocks.length || s.id === "provenance") continue;
    out.push(s.heading);
    for (const b of blocks) out.push(b.kind === "bullet" ? `• ${blockText(b)}` : blockText(b));
    out.push("");
  }
  out.push(`Full briefing and live dependency graph: ${meta.url}`);
  return out.join("\n");
}

export interface EmailDraft {
  subject: string;
  body: string;
}

/** A short covering email. The full briefing travels as the attached PDF. */
export function toEmailDraft(doc: ReportDoc, meta: ExportMeta, maxActions = 5): EmailDraft {
  const subject =
    meta.audienceLabel === "the whole program"
      ? `Risk briefing: ${meta.programName}`
      : `Risk briefing: ${meta.audienceLabel} (${meta.programName})`;

  const bottom = section(doc, "bottom-line").map(blockText);
  const actions = section(doc, "actions").map((b) => `• ${blockText(b)}`);

  const build = (n: number) =>
    [
      "Hi,",
      "",
      `Here's the latest risk briefing for ${meta.audienceLabel} on ${meta.programName}. The full briefing is attached as a PDF.`,
      "",
      ...bottom.flatMap((p) => [p, ""]),
      ...(n > 0 ? ["What needs doing:", ...actions.slice(0, n), ""] : []),
      `You can explore the dependency graph here: ${meta.url}`,
    ].join("\n");

  // Mail links fail silently past roughly 2,000 characters in some clients,
  // so drop action points (they are all in the PDF) until it fits.
  let n = Math.min(maxActions, actions.length);
  let body = build(n);
  while (n > 0 && mailtoUrl({ subject, body }).length > 1900) body = build(--n);
  return { subject, body };
}

/**
 * Opens the default mail app. Line breaks are CRLF, as RFC 6068 specifies for
 * mailto bodies; Outlook is the client most likely to mishandle bare LFs.
 */
export function mailtoUrl({ subject, body }: EmailDraft): string {
  const crlf = body.replace(/\r?\n/g, "\r\n");
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(crlf)}`;
}

/** Opens a compose window in Outlook on the web (Microsoft 365 accounts). */
export function outlookWebUrl({ subject, body }: EmailDraft): string {
  return (
    "https://outlook.office.com/mail/deeplink/compose" +
    `?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  );
}
