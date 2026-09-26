import { notFound } from "next/navigation";

import type { Metadata } from "next";

import { Footer } from "@/components/blocks/footer";
import { Navbar } from "@/components/blocks/navbar";
import { DashedLine } from "@/components/dashed-line";
import { ProgramConsole } from "@/components/fault-lines/program-console";
import { getProgramData, getProgramIndex } from "@/lib/fault-lines/data";

// One static page per program the pipeline produced, rendered at build time.
// Anything else is a 404 rather than an on-demand render, so the deployed app
// never needs filesystem access at request time.
export const dynamicParams = false;

export function generateStaticParams() {
  return getProgramIndex().programs.map((p) => ({ program: p.slug }));
}

type Props = { params: Promise<{ program: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { program } = await params;
  const data = getProgramData(program);
  return { title: data?.program.name ?? "Program not found" };
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0 px-4 py-2 lg:px-6">
      <dt className="text-muted-foreground text-[11px] leading-tight">
        {label}
      </dt>
      <dd className="tabular truncate text-sm leading-tight">{value}</dd>
    </div>
  );
}

export default async function ProgramPage({ params }: Props) {
  const { program: slug } = await params;
  const data = getProgramData(slug);
  if (!data) notFound();

  const programs = getProgramIndex().programs;
  const { cpm, bottleneck_scores, team_bottleneck_load } = data.analysis;

  const atRisk = bottleneck_scores.filter((s) => s.at_risk).length;
  const heaviest = Object.entries(team_bottleneck_load).sort(
    ([, a], [, b]) => b.total_blast_radius - a.total_blast_radius,
  )[0];

  return (
    // Desktop: the shell is exactly one viewport tall and the right pane
    // scrolls on its own. Below lg it becomes an ordinary stacked page.
    <div className="flex min-h-svh flex-col lg:h-svh lg:min-h-0 lg:overflow-hidden">
      <Navbar
        programs={programs}
        currentSlug={slug}
        taskCount={data.tasks.length}
        teamCount={data.program.teams.length}
      />

      <main className="flex flex-1 flex-col lg:min-h-0 lg:overflow-hidden">
        {/* The headline numbers analyze.py produced. Vertical dashed rules
            are the template's divider motif doing real work as a separator. */}
        <dl className="grid shrink-0 grid-cols-2 border-b sm:flex sm:items-stretch max-sm:[&>div:nth-child(-n+2)]:border-b max-sm:[&>div:nth-child(odd)]:border-r">
          <Stat label="Program length" value={`${cpm.program_length_days} days`} />
          <DashedLine orientation="vertical" className="max-sm:hidden" />
          <Stat
            label="Critical path"
            value={`${cpm.critical_path.length} of ${data.tasks.length} tasks`}
          />
          <DashedLine orientation="vertical" className="max-sm:hidden" />
          <Stat
            label="Flagged at risk"
            value={
              <span className={atRisk > 0 ? "text-risk" : undefined}>
                {atRisk} {atRisk === 1 ? "task" : "tasks"}
              </span>
            }
          />
          <DashedLine orientation="vertical" className="max-sm:hidden" />
          <Stat
            label="Heaviest downstream load"
            value={
              heaviest
                ? `${heaviest[0]} · ${heaviest[1].total_blast_radius}`
                : "—"
            }
          />
        </dl>

        <div className="flex-1 lg:min-h-0">
          {/* Keyed by program: without it, React keeps the console's state
              (selected task, slider, filters) across programs, and a task
              id from one program would be "selected" in another. */}
          <ProgramConsole key={slug} data={data} />
        </div>
      </main>

      <Footer
        narrativeMode={data.narrative.mode}
        startDate={data.program.start_date}
      />
    </div>
  );
}
