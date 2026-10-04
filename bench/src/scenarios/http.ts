import autocannon from 'autocannon';
import { ApiClient, newRunId } from '../lib/client.js';
import type { BenchConfig, HttpEndpointResult, HttpResult, Scenario } from '../lib/scenario.js';
import { Histogram, roundSummary } from '../lib/stats.js';

/**
 * HTTP scenario: autocannon against an unauthenticated endpoint (health) and an authenticated
 * one (conversation listing) to separate framework overhead from auth + database cost.
 */
export const httpScenario: Scenario = {
  name: 'http',
  async run(config: BenchConfig, log): Promise<HttpResult> {
    if (config.dryRun) return synthetic(config);

    const api = new ApiClient(config.url);
    const user = await api.provisionUser(newRunId(), 0);
    const targets: Array<{ url: string; headers?: Record<string, string> }> = [
      { url: `${config.url}/health/live` },
      {
        url: `${config.url}/api/v1/conversations`,
        headers: { authorization: `Bearer ${user.accessToken}` },
      },
    ];

    const endpoints: HttpEndpointResult[] = [];
    for (const target of targets) {
      log(`autocannon ${target.url} (${config.connections} conns, ${config.duration}s)`);
      const result = await autocannon({
        url: target.url,
        connections: config.connections,
        duration: config.duration,
        headers: target.headers ?? {},
      });
      endpoints.push({
        url: target.url.replace(config.url, ''),
        requests: result.requests.total,
        errors: result.errors,
        non2xx: result.non2xx,
        requestsPerSec: result.requests.average,
        bytesPerSec: result.throughput.average,
        latencyMs: {
          count: result.requests.total,
          min: result.latency.min,
          max: result.latency.max,
          mean: result.latency.average,
          stddev: result.latency.stddev,
          p50: result.latency.p50,
          p90: result.latency.p90,
          p95: result.latency.p97_5, // autocannon exposes p97.5 rather than p95
          p99: result.latency.p99,
          p999: result.latency.p99_9,
        },
      });
    }
    return { kind: 'http', endpoints };
  },
};

function synthetic(config: BenchConfig): HttpResult {
  const make = (url: string, base: number): HttpEndpointResult => {
    const h = new Histogram();
    for (let i = 0; i < 2000; i++) h.record(base + Math.exp((i % 97) / 30));
    const requests = Math.round(config.connections * config.duration * (1000 / base));
    return {
      url,
      requests,
      errors: 0,
      non2xx: 0,
      requestsPerSec: requests / config.duration,
      bytesPerSec: requests * 180,
      latencyMs: roundSummary(h.summary()),
    };
  };
  return { kind: 'http', endpoints: [make('/health/live', 1), make('/api/v1/conversations', 4)] };
}
