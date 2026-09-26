"use client";

import { useTransition } from "react";

import { useRouter } from "next/navigation";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ProgramIndex } from "@/lib/fault-lines/types";
import { cn } from "@/lib/utils";

/**
 * Each program is its own statically generated URL, so switching is a plain
 * navigation. That also makes every program shareable as a link.
 */
export function ProgramSwitcher({
  programs,
  currentSlug,
}: {
  programs: ProgramIndex["programs"];
  currentSlug: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const current = programs.find((p) => p.slug === currentSlug);

  return (
    <Select
      value={currentSlug}
      onValueChange={(slug) => startTransition(() => router.push(`/${slug}`))}
    >
      <SelectTrigger
        aria-label="Program"
        className={cn(
          "h-8 max-w-[min(20rem,55vw)] gap-2 border-transparent bg-transparent px-2 text-sm font-medium shadow-none hover:bg-accent dark:bg-transparent dark:hover:bg-accent",
          pending && "opacity-60",
        )}
      >
        {/* Explicit children: otherwise the trigger repeats the item's task
            count, which the bar already shows beside it. */}
        <SelectValue>{current?.name}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {programs.map((p) => (
          <SelectItem key={p.slug} value={p.slug}>
            <span>{p.name}</span>
            <span className="text-muted-foreground font-mono ml-2 text-[11px]">
              {p.task_count} tasks
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
