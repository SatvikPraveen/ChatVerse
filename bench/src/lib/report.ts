import { execSync } from 'node:child_process';
import os from 'node:os';
import type { BenchRun, MachineInfo, ScenarioResult } from './scenario.js';
import type { Summary } from './stats.js';

export function machineInfo(): MachineInfo {
  const cpus = os.cpus();
  return {
    platform: os.platform(),
    arch: os.arch(),
    cpus: cpus.length,
    cpuModel: cpus[0]?.model ?? 'unknown',
    totalMemBytes: os.totalmem(),
    node: process.version,
  };
}

export function gitSha(): string | null {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

export function fmtMs(n: number): string {
  return `${n.toFixed(2)} ms`;
}

export function fmtPct(ratio: number): string {
  return `${(ratio * 100).toFixed(2)}%`;
}

export function fmtBytes(n: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/** Fixed-width text table for stdout. */
export function textTable(rows: Array<[string, string]>): string {
  const width = Math.max(...rows.map(([k]) => k.length));
  return rows.map(([k, v]) => `  ${k.padEnd(width)}  ${v}`).join('\n');
}

export function summaryRows(label: string, s: Summary): Array<[string, string]> {
  return [
    [`${label} samples`, String(s.count)],
    [`${label} p50`, fmtMs(s.p50)],
    [`${label} p90`, fmtMs(s.p90)],
    [`${label} p95`, fmtMs(s.p95)],
    [`${label} p99`, fmtMs(s.p99)],
    [`${label} p99.9`, fmtMs(s.p999)],
    [`${label} max`, fmtMs(s.max)],
    [`${label} mean ± sd`, `${fmtMs(s.mean)} ± ${s.stddev.toFixed(2)}`],
  ];
}

export function resultRows(result: ScenarioResult): Array<[string, string]> {
  switch (result.kind) {
    case 'fanout':
      return [
        ['expected deliveries', String(result.expected)],
        ['delivered', `${result.delivered} (${fmtPct(result.deliveryRatio)})`],
        ['duplicates', String(result.duplicates)],
        ['ordering violations', String(result.orderingViolations)],
        ['send errors', String(result.sendErrors)],
        ['sent / s', result.sentPerSec.toFixed(1)],
        ['delivered / s', result.deliveredPerSec.toFixed(1)],
        ...summaryRows('e2e latency', result.endToEndLatencyMs),
        ...summaryRows('ack latency', result.ackLatencyMs),
      ];
    case 'http':
      return result.endpoints.flatMap((e) => [
        [`${e.url} requests`, `${e.requests} (${e.errors} errors, ${e.non2xx} non-2xx)`],
        [`${e.url} req/s`, e.requestsPerSec.toFixed(1)],
        [`${e.url} throughput`, `${fmtBytes(e.bytesPerSec)}/s`],
        ...summaryRows(`${e.url} latency`, e.latencyMs),
      ]);
    case 'reconnect':
      return [
        ['clients', `${result.clients} (${result.disconnected} disconnected mid-run)`],
        ['expected deliveries', String(result.expected)],
        ['delivered live', String(result.deliveredLive)],
        ['recovered via sync', String(result.recoveredViaSync)],
        ['lost', String(result.lost)],
        ['duplicates', String(result.duplicates)],
        ['ordering violations', String(result.orderingViolations)],
        ...summaryRows('reconnect time', result.reconnectMs),
        ...summaryRows('gap recovery', result.gapRecoveryMs),
      ];
  }
}

/** One Markdown table per scenario kind, one row per run, for results/REPORT.md. */
export function markdownReport(runs: BenchRun[]): string {
  const byKind = new Map<string, BenchRun[]>();
  for (const run of runs) {
    const list = byKind.get(run.scenario) ?? [];
    list.push(run);
    byKind.set(run.scenario, list);
  }
  const sections: string[] = [
    '# ChatVerse benchmark report',
    '',
    `Generated ${new Date().toISOString()} from ${runs.length} run(s).`,
    '',
  ];

  const fanout = (byKind.get('fanout') ?? []) as Array<
    BenchRun & { result: Extract<ScenarioResult, { kind: 'fanout' }> }
  >;
  if (fanout.length) {
    sections.push('## Fan-out (end-to-end delivery)', '');
    sections.push(
      '| run | sha | users | groups×size | rate | dur | delivered | dup | order viol | e2e p50 | e2e p95 | e2e p99 | ack p50 | ack p99 | msg/s |',
    );
    sections.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (const r of fanout) {
      const c = r.config;
      const x = r.result;
      sections.push(
        `| ${r.startedAt} | ${r.gitSha ?? '-'} | ${c.users} | ${c.groups}×${c.groupSize} | ${c.rate}/s | ${c.duration}s | ${fmtPct(x.deliveryRatio)} | ${x.duplicates} | ${x.orderingViolations} | ${x.endToEndLatencyMs.p50.toFixed(1)} | ${x.endToEndLatencyMs.p95.toFixed(1)} | ${x.endToEndLatencyMs.p99.toFixed(1)} | ${x.ackLatencyMs.p50.toFixed(1)} | ${x.ackLatencyMs.p99.toFixed(1)} | ${x.deliveredPerSec.toFixed(0)} |`,
      );
    }
    sections.push('');
  }

  const http = (byKind.get('http') ?? []) as Array<
    BenchRun & { result: Extract<ScenarioResult, { kind: 'http' }> }
  >;
  if (http.length) {
    sections.push('## HTTP (autocannon)', '');
    sections.push('| run | sha | endpoint | conns | dur | req/s | p50 | p95 | p99 | errors |');
    sections.push('|---|---|---|---|---|---|---|---|---|---|');
    for (const r of http) {
      for (const e of r.result.endpoints) {
        sections.push(
          `| ${r.startedAt} | ${r.gitSha ?? '-'} | ${e.url} | ${r.config.connections} | ${r.config.duration}s | ${e.requestsPerSec.toFixed(0)} | ${e.latencyMs.p50.toFixed(1)} | ${e.latencyMs.p95.toFixed(1)} | ${e.latencyMs.p99.toFixed(1)} | ${e.errors + e.non2xx} |`,
        );
      }
    }
    sections.push('');
  }

  const reconnect = (byKind.get('reconnect') ?? []) as Array<
    BenchRun & { result: Extract<ScenarioResult, { kind: 'reconnect' }> }
  >;
  if (reconnect.length) {
    sections.push('## Reconnect & gap recovery', '');
    sections.push(
      '| run | sha | clients | outage | live | via sync | lost | dup | reconnect p50 | recovery p50 | recovery p99 |',
    );
    sections.push('|---|---|---|---|---|---|---|---|---|---|---|');
    for (const r of reconnect) {
      const x = r.result;
      sections.push(
        `| ${r.startedAt} | ${r.gitSha ?? '-'} | ${x.clients} | ${r.config.outageMs}ms | ${x.deliveredLive} | ${x.recoveredViaSync} | ${x.lost} | ${x.duplicates} | ${x.reconnectMs.p50.toFixed(1)} | ${x.gapRecoveryMs.p50.toFixed(1)} | ${x.gapRecoveryMs.p99.toFixed(1)} |`,
      );
    }
    sections.push('');
  }

  sections.push('## Machines', '');
  const seen = new Set<string>();
  for (const r of runs) {
    const key = `${r.machine.cpuModel}|${r.machine.cpus}|${r.machine.node}`;
    if (seen.has(key)) continue;
    seen.add(key);
    sections.push(
      `- ${r.machine.platform}/${r.machine.arch}, ${r.machine.cpus}× ${r.machine.cpuModel}, ${fmtBytes(r.machine.totalMemBytes)} RAM, Node ${r.machine.node}`,
    );
  }
  sections.push('', 'Latencies in milliseconds. See bench/README.md for methodology.', '');
  return sections.join('\n');
}
