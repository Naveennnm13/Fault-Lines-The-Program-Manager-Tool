/**
 * Team -> CSS custom property. The values live in globals.css so both themes
 * are driven by one set of tokens and the graph re-colours on theme change
 * without JavaScript.
 */
const TEAM_VARS: Record<string, string> = {
  Engineering: "--team-engineering",
  Data: "--team-data",
  Design: "--team-design",
  Compliance: "--team-compliance",
  Ops: "--team-ops",
  Marketing: "--team-marketing",
};

/** A `var(...)` reference, usable in SVG fill/stroke or inline styles. */
export function teamColor(team: string): string {
  const cssVar = TEAM_VARS[team];
  return cssVar ? `var(${cssVar})` : "var(--muted-foreground)";
}

export const STATUS_LABEL: Record<string, string> = {
  done: "Done",
  in_progress: "In progress",
  not_started: "Not started",
  blocked: "Blocked",
};
