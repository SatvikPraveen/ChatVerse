import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { markdownReport } from './lib/report.js';
import type { BenchRun } from './lib/scenario.js';

/**
 * Render results/*.json into results/REPORT.md.
 *   pnpm --filter @chatverse/bench report [-- <resultsDir>]
 */
function main(): void {
  const dir = resolve(process.argv[2] ?? 'results');
  const runs: BenchRun[] = [];
  for (const file of readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()) {
    try {
      const parsed = JSON.parse(readFileSync(join(dir, file), 'utf8')) as BenchRun;
      if (parsed.version === 1 && parsed.result) runs.push(parsed);
    } catch (err) {
      console.error(`skipping ${file}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (runs.length === 0) {
    console.error(`no result files in ${dir}`);
    process.exit(1);
  }
  const out = join(dir, 'REPORT.md');
  writeFileSync(out, markdownReport(runs));
  console.log(`wrote ${out} (${runs.length} runs)`);
}

main();
