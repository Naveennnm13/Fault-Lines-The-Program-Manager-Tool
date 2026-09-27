/** Context every export format needs beyond the document itself. */
export interface ExportMeta {
  /** e.g. "Prepared 27 Sep 2026 with Fault Lines". */
  preparedLine: string;
  /** Link back to the live program page, for emails and Slack. */
  url: string;
  /** e.g. "Ops" or "the whole program". */
  audienceLabel: string;
  programName: string;
}

export function exportMeta(args: {
  programName: string;
  programSlug: string;
  scope: string | null;
  origin: string;
  now?: Date;
}): ExportMeta {
  const date = (args.now ?? new Date()).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return {
    preparedLine: `Prepared ${date} with Fault Lines`,
    url: `${args.origin}/${args.programSlug}`,
    audienceLabel: args.scope ?? "the whole program",
    programName: args.programName,
  };
}
