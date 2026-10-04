import type { Summary } from './stats.js';

export type ScenarioName = 'fanout' | 'http' | 'reconnect';

/** Everything that can be set from the CLI. Scenarios ignore what they do not need. */
export interface BenchConfig {
  scenario: ScenarioName;
  url: string;
  users: number;
  groups: number;
  groupSize: number;
  rate: number;
  duration: number;
  connections: number;
  rampMs: number;
  out: string | null;
  dryRun: boolean;
  /** Reconnect scenario: how long each disconnected client stays away. */
  outageMs: number;
  /** Free-form tag describing the environment (e.g. "native-1", "docker-2"), shown in reports. */
  label?: string;
}

export interface MachineInfo {
  platform: string;
  arch: string;
  cpus: number;
  cpuModel: string;
  totalMemBytes: number;
  node: string;
}

export interface ServerMetricsSnapshot {
  /** Raw counter/gauge values keyed by metric name (sum over labels). */
  values: Record<string, number>;
  scrapedAt: string;
}

export interface FanoutResult {
  kind: 'fanout';
  expected: number;
  delivered: number;
  deliveryRatio: number;
  duplicates: number;
  orderingViolations: number;
  sendErrors: number;
  endToEndLatencyMs: Summary;
  ackLatencyMs: Summary;
  sentPerSec: number;
  deliveredPerSec: number;
  serverMetrics: { before: ServerMetricsSnapshot | null; after: ServerMetricsSnapshot | null };
}

export interface HttpEndpointResult {
  url: string;
  requests: number;
  errors: number;
  non2xx: number;
  requestsPerSec: number;
  latencyMs: Summary;
  bytesPerSec: number;
}

export interface HttpResult {
  kind: 'http';
  endpoints: HttpEndpointResult[];
}

export interface ReconnectResult {
  kind: 'reconnect';
  clients: number;
  disconnected: number;
  expected: number;
  deliveredLive: number;
  recoveredViaSync: number;
  lost: number;
  duplicates: number;
  orderingViolations: number;
  gapRecoveryMs: Summary;
  reconnectMs: Summary;
}

export type ScenarioResult = FanoutResult | HttpResult | ReconnectResult;

export interface BenchRun {
  version: 1;
  scenario: ScenarioName;
  startedAt: string;
  finishedAt: string;
  wallClockMs: number;
  gitSha: string | null;
  config: BenchConfig;
  machine: MachineInfo;
  result: ScenarioResult;
}

export interface Scenario {
  name: ScenarioName;
  run(config: BenchConfig, log: (line: string) => void): Promise<ScenarioResult>;
}
