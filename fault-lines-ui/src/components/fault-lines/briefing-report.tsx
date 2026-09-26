"use client";

import * as React from "react";

import { Check, Copy, Download, RotateCcw, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SOURCE_LABEL } from "@/lib/fault-lines/briefing";
import {
  generateReport,
  reportFilename,
  toMarkdown,
  type ReportDoc,
  type ReportScope,
} from "@/lib/fault-lines/report";
import type { ProgramData } from "@/lib/fault-lines/types";
import { cn } from "@/lib/utils";

const WHOLE_PROGRAM = "__program__";

/**
 * The shippable briefing.
 *
 * The document is state, not a string: every paragraph and bullet is a
 * textarea bound to `doc`, and Markdown export serialises that same state. So
 * whatever the lead edits before sending is exactly what leaves the app —
 * there is no separate "source" that can drift from what is on screen.
 */
export function BriefingReport({ data }: { data: ProgramData }) {
  const [scope, setScope] = React.useState<ReportScope>(null);
  const generated = React.useMemo(
    () => generateReport(data, scope),
    [data, scope],
  );
  const [doc, setDoc] = React.useState<ReportDoc>(generated);
  const [dirty, setDirty] = React.useState(false);

  // Switching team regenerates. Edits to the previous team's draft are
  // intentionally dropped — they do not apply to a different audience.
  React.useEffect(() => {
    setDoc(generated);
    setDirty(false);
  }, [generated]);

  const edit = React.useCallback(
    (sectionId: string, blockId: string, text: string) => {
      setDirty(true);
      setDoc((current) => ({
        ...current,
        sections: current.sections.map((section) =>
          section.id !== sectionId
            ? section
            : {
                ...section,
                blocks: section.blocks.map((block) =>
                  block.id === blockId ? { ...block, text } : block,
                ),
              },
        ),
      }));
    },
    [],
  );

  const removeBlock = React.useCallback((sectionId: string, blockId: string) => {
    setDirty(true);
    setDoc((current) => ({
      ...current,
      sections: current.sections.map((section) =>
        section.id !== sectionId
          ? section
          : {
              ...section,
              blocks: section.blocks.filter((block) => block.id !== blockId),
            },
      ),
    }));
  }, []);

  return (
    <div className="flex h-full flex-col lg:min-h-0">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-4 py-2.5">
        <Select
          value={scope ?? WHOLE_PROGRAM}
          onValueChange={(value) =>
            setScope(value === WHOLE_PROGRAM ? null : value)
          }
        >
          <SelectTrigger className="w-56" aria-label="Report audience">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={WHOLE_PROGRAM}>Whole program</SelectItem>
            {data.program.teams.map((team) => (
              <SelectItem key={team} value={team}>
                {team}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="text-muted-foreground text-xs">
          {dirty ? "Edited. Copy and download include your changes." : "Generated draft"}
        </span>

        <div className="ml-auto flex items-center gap-2">
          {dirty && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setDoc(generated);
                setDirty(false);
              }}
            >
              <RotateCcw className="size-3.5" />
              Reset
            </Button>
          )}
          <CopyButton doc={doc} />
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadMarkdown(doc, scope)}
          >
            <Download className="size-3.5" />
            Download .md
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto lg:min-h-0">
        <article className="mx-auto max-w-2xl px-6 py-8">
          <h1 className="font-display text-2xl leading-tight tracking-tight">
            {doc.title}
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">{doc.subtitle}</p>

          {doc.sections.map((section) => (
            <section key={section.id} className="mt-9">
              <h2 className="mb-2.5 text-base tracking-tight">
                {section.heading}
              </h2>
              <div
                className={cn(
                  section.blocks[0]?.kind === "bullet" ? "space-y-1" : "space-y-3",
                )}
              >
                {section.blocks.map((block) => (
                  <EditableBlock
                    key={block.id}
                    block={block}
                    onChange={(text) => edit(section.id, block.id, text)}
                    onRemove={() => removeBlock(section.id, block.id)}
                  />
                ))}
              </div>
            </section>
          ))}
        </article>
      </div>
    </div>
  );
}

function EditableBlock({
  block,
  onChange,
  onRemove,
}: {
  block: ReportDoc["sections"][number]["blocks"][number];
  onChange: (text: string) => void;
  onRemove: () => void;
}) {
  const ref = React.useRef<HTMLTextAreaElement>(null);

  // Auto-grow, so the textarea reads as a paragraph rather than a form field.
  const resize = React.useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  React.useLayoutEffect(resize, [resize, block.text]);

  // Re-fit when the column width changes: the same text wraps to a different
  // number of lines, and a stale height leaves the field scrolling.
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    return () => observer.disconnect();
  }, [resize]);

  return (
    <div className="group relative flex gap-2">
      {block.kind === "bullet" && (
        <span aria-hidden className="text-muted-foreground pt-0.5 select-none">
          •
        </span>
      )}
      <textarea
        ref={ref}
        value={block.text}
        onChange={(event) => {
          onChange(event.target.value);
          resize();
        }}
        rows={1}
        spellCheck
        aria-label={`${block.kind === "bullet" ? "Bullet" : "Paragraph"}${block.source !== "computed" ? `, ${SOURCE_LABEL[block.source].toLowerCase()}` : ""}`}
        className="focus-visible:ring-ring/50 hover:bg-accent/30 focus-visible:bg-accent/30 w-full resize-none overflow-hidden rounded bg-transparent px-1 py-0.5 text-sm leading-relaxed transition-colors focus-visible:ring-2 focus-visible:outline-none"
      />

      <div className="absolute -top-0.5 right-0 flex items-center gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
        {block.source !== "computed" && (
          <span
            title={SOURCE_LABEL[block.source]}
            className="text-muted-foreground bg-background flex items-center gap-1 rounded border px-1 py-px text-[10px]"
          >
            {block.source === "claude" ? "Claude" : "Sample"}
          </span>
        )}
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove this line"
          className="text-muted-foreground hover:text-risk bg-background rounded border p-0.5 transition-colors"
        >
          <X className="size-3" />
        </button>
      </div>
    </div>
  );
}

function CopyButton({ doc }: { doc: ReportDoc }) {
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        await navigator.clipboard.writeText(toMarkdown(doc));
        setCopied(true);
      }}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {copied ? "Copied" : "Copy Markdown"}
    </Button>
  );
}

function downloadMarkdown(doc: ReportDoc, scope: ReportScope) {
  const blob = new Blob([toMarkdown(doc)], {
    type: "text/markdown;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = reportFilename(scope);
  link.click();
  URL.revokeObjectURL(url);
}
