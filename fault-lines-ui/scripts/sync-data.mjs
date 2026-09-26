/**
 * sync-data.mjs — regenerate the analysis JSON from the Python pipeline.
 *
 * The critical path method, bottleneck scoring and delay simulation all live in
 * `fault-lines/analyze.py`. This script re-runs that pipeline for every program
 * and copies its output into `src/data/programs/` so the UI never renders a
 * stale snapshot.
 *
 *   node scripts/sync-data.mjs          mock narratives; what predev/prebuild run
 *   node scripts/sync-data.mjs --live   Claude-written narratives; needs ANTHROPIC_API_KEY
 *
 * The default never calls the API, even with a key in the environment, so
 * starting the dev server can't quietly spend money. narrative.py also refuses
 * to let a mock run overwrite a live narrative whose analysis hasn't changed,
 * so running --live once and committing the result is safe.
 *
 * Wired to `predev` / `prebuild`, so it has to degrade gracefully: if Python
 * (or networkx, or the pipeline directory) is missing, it warns and leaves the
 * committed JSON in place rather than failing the build. That is the path a
 * Vercel build takes.
 *
 * Override the pipeline location with FAULT_LINES_PY=/path/to/fault-lines.
 */
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEST_DIR = join(APP_ROOT, "src", "data", "programs");
const FILES = ["tasks.json", "analysis.json", "narrative.json"];
const LIVE = process.argv.includes("--live");

const CANDIDATES = [
  process.env.FAULT_LINES_PY,
  join(APP_ROOT, "..", "fault-lines", "fault-lines"),
  join(APP_ROOT, "..", "fault-lines"),
].filter(Boolean);

// An explicit --live request that can't be honoured is an error; an implicit
// predev/prebuild regeneration that can't run is not.
const skip = (why) => {
  if (LIVE) {
    console.error(`[sync-data] ${why}`);
    process.exit(1);
  }
  console.warn(`[sync-data] ${why}`);
  console.warn(
    "[sync-data] Keeping the committed JSON in src/data/programs/. Regenerate manually with:\n" +
      "            cd fault-lines && python run_pipeline.py --mock",
  );
  process.exit(0);
};

if (LIVE && !process.env.ANTHROPIC_API_KEY) {
  skip("--live needs ANTHROPIC_API_KEY set in the environment.");
}

const pipelineDir = CANDIDATES.find((dir) =>
  existsSync(join(dir, "run_pipeline.py")),
);
if (!pipelineDir) skip("No run_pipeline.py found; set FAULT_LINES_PY.");

const python = ["python3", "python", "py"].find(
  (bin) => spawnSync(bin, ["--version"], { stdio: "ignore" }).status === 0,
);
if (!python) skip("Python is not on PATH.");

const args = ["run_pipeline.py", ...(LIVE ? [] : ["--mock"])];
console.log(`[sync-data] ${python} ${args.join(" ")}  (cwd: ${pipelineDir})`);
const run = spawnSync(python, args, { cwd: pipelineDir, stdio: "inherit" });
if (run.status !== 0) {
  skip(`Pipeline exited with code ${run.status ?? "unknown"}.`);
}

const srcRoot = join(pipelineDir, "data", "programs");
const indexPath = join(srcRoot, "index.json");
if (!existsSync(indexPath)) skip("Pipeline did not produce data/programs/index.json.");
const index = JSON.parse(readFileSync(indexPath, "utf8"));
const slugs = index.programs.map((p) => p.slug);

mkdirSync(DEST_DIR, { recursive: true });

// Drop programs that no longer exist upstream, so a deleted program doesn't
// linger as a dead route.
for (const entry of readdirSync(DEST_DIR, { withFileTypes: true })) {
  if (entry.isDirectory() && !slugs.includes(entry.name)) {
    rmSync(join(DEST_DIR, entry.name), { recursive: true, force: true });
  }
}

for (const slug of slugs) {
  mkdirSync(join(DEST_DIR, slug), { recursive: true });
  for (const file of FILES) {
    const src = join(srcRoot, slug, file);
    if (!existsSync(src)) skip(`Pipeline did not produce data/programs/${slug}/${file}.`);
    JSON.parse(readFileSync(src, "utf8")); // fail loudly on truncated output
    copyFileSync(src, join(DEST_DIR, slug, file));
  }
}
copyFileSync(indexPath, join(DEST_DIR, "index.json"));

console.log(
  `[sync-data] Copied ${slugs.length} programs (${slugs.join(", ")}) -> src/data/programs/`,
);
