import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { gitSha, machineInfo, resultRows, textTable } from './lib/report.js';
import type { BenchConfig, BenchRun, Scenario, ScenarioName } from './lib/scenario.js';
import { fanoutScenario } from './scenarios/fanout.js';
import { httpScenario } from './scenarios/http.js';
import { reconnectScenario } from './scenarios/reconnect.js';

const SCENARIOS: Record<ScenarioName, Scenario> = {
  fanout: fanoutScenario,
  http: httpScenario,
  reconnect: reconnectScenario,
};

const USAGE = `Usage: pnpm bench -- --scenario <fanout|http|reconnect> [options]

Options:
  --url <url>          server base URL                         (default http://localhost:4000)
  --users <n>          fanout: virtual users to provision       (default 100)
  --groups <n>         fanout: group conversations              (default 10)
  --group-size <n>     fanout: members per group                (default 10)
  --rate <n>           messages per second per sender          (default 1)
  --duration <sec>     send phase length                        (default 20)
  --connections <n>    http: concurrent connections; reconnect: receivers (default 50)
  --ramp <ms>          socket connection ramp-up window         (default 5000)
  --outage <ms>        reconnect: time clients stay away        (default 3000)
  --out <file>         JSON result path (default results/<timestamp>-<scenario>.json)
  --no-out             do not write a JSON result
  --dry-run            synthetic data; exercises CLI, stats and report without a server
  --help               this text
`;

function parseConfig(argv: string[]): BenchConfig {
  const { values } = parseArgs({
    args: argv,
    options: {
      scenario: { type: 'string', default: 'fanout' },
      url: { type: 'string', default: 'http://localhost:4000' },
      users: { type: 'string', default: '100' },
      groups: { type: 'string', default: '10' },
      'group-size': { type: 'string', default: '10' },
      rate: { type: 'string', default: '1' },
      duration: { type: 'string', default: '20' },
      connections: { type: 'string', default: '50' },
      ramp: { type: 'string', default: '5000' },
      outage: { type: 'string', default: '3000' },
      out: { type: 'string' },
      'no-out': { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
    strict: true,
  });
  if (values.help) {
    process.stdout.write(USAGE);
    process.exit(0);
  }
  const scenario = values.scenario as ScenarioName;
  if (!(scenario in SCENARIOS)) {
    throw new Error(
      `unknown scenario "${scenario}" (expected ${Object.keys(SCENARIOS).join(', ')})`,
    );
  }
  const int = (name: string, raw: string, min: number) => {
    const n = Number(raw);
    if (!Number.isFinite(n) || n < min) throw new Error(`--${name} must be a number >= ${min}`);
    return n;
  };
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return {
    scenario,
    url: values.url!.replace(/\/+$/, ''),
    users: int('users', values.users!, 1),
    groups: int('groups', values.groups!, 1),
    groupSize: int('group-size', values['group-size']!, 2),
    rate: int('rate', values.rate!, 0.01),
    duration: int('duration', values.duration!, 1),
    connections: int('connections', values.connections!, 1),
    rampMs: int('ramp', values.ramp!, 0),
    outageMs: int('outage', values.outage!, 0),
    out: values['no-out'] ? null : (values.out ?? `results/${stamp}-${scenario}.json`),
    dryRun: values['dry-run']!,
  };
}

async function main(): Promise<void> {
  const config = parseConfig(process.argv.slice(2));
  const scenario = SCENARIOS[config.scenario];
  const log = (line: string) => console.error(`[bench:${scenario.name}] ${line}`);

  log(`${config.dryRun ? 'DRY RUN ' : ''}config ${JSON.stringify(config)}`);
  const startedAt = new Date();
  const result = await scenario.run(config, log);
  const finishedAt = new Date();

  const run: BenchRun = {
    version: 1,
    scenario: scenario.name,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    wallClockMs: finishedAt.getTime() - startedAt.getTime(),
    gitSha: gitSha(),
    config,
    machine: machineInfo(),
    result,
  };

  console.log(`\nChatVerse bench — ${scenario.name}${config.dryRun ? ' (dry run)' : ''}`);
  console.log(
    textTable([
      ['server', config.url],
      ['git sha', run.gitSha ?? '-'],
      ['machine', `${run.machine.cpus}× ${run.machine.cpuModel}, node ${run.machine.node}`],
      ['wall clock', `${(run.wallClockMs / 1000).toFixed(1)} s`],
      ...resultRows(result),
    ]),
  );

  if (config.out) {
    const path = resolve(config.out);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(run, null, 2));
    console.log(`\nresult written to ${path}`);
  }

  // A delivery ratio below 100% or any ordering violation is a correctness failure, not a
  // performance number: make the process exit non-zero so CI can gate on it.
  if (result.kind === 'fanout' && (result.deliveryRatio < 0.999 || result.orderingViolations > 0)) {
    process.exitCode = 2;
  }
  if (result.kind === 'reconnect' && (result.lost > 0 || result.orderingViolations > 0)) {
    process.exitCode = 2;
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  console.error(USAGE);
  process.exit(1);
});
