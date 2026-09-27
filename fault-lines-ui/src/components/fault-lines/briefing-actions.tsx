"use client";

import * as React from "react";

import {
  ChevronDown,
  Copy,
  Download,
  FileText,
  Mail,
  MessageSquare,
  Send,
  Share2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { exportMeta, type ExportMeta } from "@/lib/fault-lines/export/meta";
import {
  mailtoUrl,
  outlookWebUrl,
  toEmailDraft,
  toSlackText,
} from "@/lib/fault-lines/export/text";
import {
  reportFilename,
  toMarkdown,
  type ExportFormat,
  type ReportDoc,
  type ReportScope,
} from "@/lib/fault-lines/report";

const MIME: Record<ExportFormat, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  md: "text/markdown;charset=utf-8",
};

interface BriefingActionsProps {
  doc: ReportDoc;
  scope: ReportScope;
  programName: string;
  programSlug: string;
}

/**
 * Download and Send menus for the briefing.
 *
 * A web page can't attach a file to an Outlook email or post one into Slack
 * by itself, so "send" here means the nearest thing each channel allows:
 * the device share sheet (which does carry the file, where supported), an
 * email draft opened alongside a downloaded PDF, and Slack-ready text.
 */
export function BriefingActions({
  doc,
  scope,
  programName,
  programSlug,
}: BriefingActionsProps) {
  const [status, setStatus] = React.useState<string | null>(null);
  const [canShareFiles, setCanShareFiles] = React.useState(false);

  React.useEffect(() => {
    const probe = new File([""], "probe.pdf", { type: MIME.pdf });
    setCanShareFiles(Boolean(navigator.canShare?.({ files: [probe] })));
  }, []);

  React.useEffect(() => {
    if (!status) return;
    const timer = setTimeout(() => setStatus(null), 12000);
    return () => clearTimeout(timer);
  }, [status]);

  const meta = React.useCallback(
    (): ExportMeta =>
      exportMeta({ programName, programSlug, scope, origin: window.location.origin }),
    [programName, programSlug, scope],
  );

  // Built files, keyed by the exact document content, so an edit invalidates
  // them and reopening a menu on an unchanged draft costs nothing.
  const cache = React.useRef(new Map<string, Promise<Blob>>());
  const fileFor = React.useCallback(
    (format: "pdf" | "docx"): Promise<Blob> => {
      const key = `${format}:${JSON.stringify(doc)}`;
      let pending = cache.current.get(key);
      if (!pending) {
        pending =
          format === "pdf"
            ? import("@/lib/fault-lines/export/pdf").then((m) => m.buildPdf(doc, meta()))
            : import("@/lib/fault-lines/export/docx").then((m) => m.buildDocx(doc, meta()));
        pending.catch(() => cache.current.delete(key));
        cache.current.set(key, pending);
      }
      return pending;
    },
    [doc, meta],
  );

  const filename = (format: ExportFormat) => reportFilename(programSlug, scope, format);

  const save = (blob: Blob, format: ExportFormat) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename(format);
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const run = async (label: string, task: () => Promise<void>) => {
    try {
      await task();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return; // closed the share sheet
      setStatus(`Couldn't ${label}. Try again, or download the file instead.`);
    }
  };

  const download = (format: "pdf" | "docx") =>
    run(`create the ${format === "pdf" ? "PDF" : "Word document"}`, async () => {
      setStatus(`Preparing the ${format === "pdf" ? "PDF" : "Word document"}…`);
      save(await fileFor(format), format);
      setStatus(`Downloaded ${filename(format)}.`);
    });

  const share = (format: "pdf" | "docx") =>
    run("open the share menu", async () => {
      const blob = await fileFor(format);
      const file = new File([blob], filename(format), { type: MIME[format] });
      await navigator.share({ files: [file], title: doc.title, text: doc.title });
      setStatus(null);
    });

  const email = (target: "desktop" | "web") => {
    const draft = toEmailDraft(doc, meta());
    // Some mail apps open a draft from a mail link with the subject but drop
    // the body. Put the summary on the clipboard too, inside the click (the
    // clipboard needs one), so it can always be pasted in.
    const copied = navigator.clipboard
      ?.writeText(draft.body)
      .then(() => true)
      .catch(() => false);
    // Open the draft first, inside the click: browsers block new windows that
    // open after an async step. The PDF follows a moment later.
    if (target === "web") {
      window.open(outlookWebUrl(draft), "_blank", "noopener");
    } else {
      window.location.href = mailtoUrl(draft);
    }
    void run("create the PDF", async () => {
      save(await fileFor("pdf"), "pdf");
      const pasteHint = (await copied)
        ? " If the email is empty, press Ctrl+V (Cmd+V on a Mac) to paste the summary."
        : "";
      setStatus(
        `Email opened and ${filename("pdf")} downloaded. Drag the PDF into the email to attach it.${pasteHint}`,
      );
    });
  };

  const copy = (text: string, done: string) =>
    run("copy to the clipboard", async () => {
      await navigator.clipboard.writeText(text);
      setStatus(done);
    });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <p
        role="status"
        aria-live="polite"
        className="text-muted-foreground max-w-xs text-xs max-sm:order-last max-sm:basis-full"
      >
        {status}
      </p>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            <Download className="size-3.5" />
            Download
            <ChevronDown className="text-muted-foreground size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => download("docx")}>
            <FileText />
            <span>Word document (.docx)</span>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => download("pdf")}>
            <FileText />
            <span>PDF</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => {
              save(new Blob([toMarkdown(doc)], { type: MIME.md }), "md");
              setStatus(`Downloaded ${filename("md")}.`);
            }}
          >
            <FileText />
            <span>Markdown (.md)</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => copy(toMarkdown(doc), "Copied as Markdown.")}
          >
            <Copy />
            <span>Copy as Markdown</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu
        onOpenChange={(open) => {
          // Start building now, so the file is ready by the time an item is
          // chosen. Sharing only works straight after a click.
          if (open) {
            void fileFor("pdf").catch(() => {});
            if (canShareFiles) void fileFor("docx").catch(() => {});
          }
        }}
      >
        <DropdownMenuTrigger asChild>
          <Button size="sm" className="bg-foreground text-background hover:bg-foreground/90">
            <Send className="size-3.5" />
            Send
            <ChevronDown className="size-3.5 opacity-70" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          {canShareFiles && (
            <>
              <DropdownMenuLabel>With the file attached</DropdownMenuLabel>
              <MenuItem
                icon={<Share2 />}
                title="Share PDF…"
                hint="Opens your device's share menu: Outlook, Slack, Teams, Mail"
                onSelect={() => share("pdf")}
              />
              <MenuItem
                icon={<Share2 />}
                title="Share Word document…"
                hint="The same, as an editable .docx"
                onSelect={() => share("docx")}
              />
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuLabel>Email</DropdownMenuLabel>
          <MenuItem
            icon={<Mail />}
            title="Outlook app"
            hint="Opens a new email with a summary and downloads the PDF to attach. The summary is also copied, in case Outlook leaves it out."
            onSelect={() => email("desktop")}
          />
          <MenuItem
            icon={<Mail />}
            title="Outlook on the web"
            hint="The same, in Outlook for Microsoft 365 in your browser"
            onSelect={() => email("web")}
          />
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Slack</DropdownMenuLabel>
          <MenuItem
            icon={<MessageSquare />}
            title="Copy for Slack"
            hint="Copies the briefing as text to paste into a channel or message"
            onSelect={() =>
              copy(
                toSlackText(doc, meta()),
                "Copied. Paste it into any Slack channel or message.",
              )
            }
          />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function MenuItem({
  icon,
  title,
  hint,
  onSelect,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  onSelect: () => void;
}) {
  return (
    <DropdownMenuItem onSelect={onSelect}>
      {icon}
      <span className="flex flex-col gap-0.5">
        <span>{title}</span>
        <span className="text-muted-foreground text-xs leading-snug">{hint}</span>
      </span>
    </DropdownMenuItem>
  );
}
