/**
 * Latency statistics. Samples are kept in a growable Float64Array and sorted once at
 * summarisation time; for the sample counts a bench run produces (<= a few million) this is
 * cheaper and more exact than a streaming digest.
 */

export interface Summary {
  count: number;
  min: number;
  max: number;
  mean: number;
  stddev: number;
  p50: number;
  p90: number;
  p95: number;
  p99: number;
  p999: number;
}

export class Histogram {
  private buffer = new Float64Array(1024);
  private length = 0;

  record(value: number): void {
    if (!Number.isFinite(value)) return;
    if (this.length === this.buffer.length) {
      const grown = new Float64Array(this.buffer.length * 2);
      grown.set(this.buffer);
      this.buffer = grown;
    }
    this.buffer[this.length++] = value;
  }

  get count(): number {
    return this.length;
  }

  values(): Float64Array {
    return this.buffer.subarray(0, this.length);
  }

  summary(): Summary {
    const n = this.length;
    if (n === 0) {
      return {
        count: 0,
        min: 0,
        max: 0,
        mean: 0,
        stddev: 0,
        p50: 0,
        p90: 0,
        p95: 0,
        p99: 0,
        p999: 0,
      };
    }
    const sorted = Float64Array.from(this.values()).sort();
    let sum = 0;
    for (let i = 0; i < n; i++) sum += sorted[i]!;
    const mean = sum / n;
    let sq = 0;
    for (let i = 0; i < n; i++) {
      const d = sorted[i]! - mean;
      sq += d * d;
    }
    const stddev = Math.sqrt(sq / n);
    return {
      count: n,
      min: sorted[0]!,
      max: sorted[n - 1]!,
      mean,
      stddev,
      p50: percentile(sorted, 0.5),
      p90: percentile(sorted, 0.9),
      p95: percentile(sorted, 0.95),
      p99: percentile(sorted, 0.99),
      p999: percentile(sorted, 0.999),
    };
  }
}

/** Nearest-rank percentile on a sorted array. */
export function percentile(sorted: Float64Array, p: number): number {
  if (sorted.length === 0) return 0;
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[rank]!;
}

export function round(value: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

export function roundSummary(s: Summary, digits = 2): Summary {
  return {
    count: s.count,
    min: round(s.min, digits),
    max: round(s.max, digits),
    mean: round(s.mean, digits),
    stddev: round(s.stddev, digits),
    p50: round(s.p50, digits),
    p90: round(s.p90, digits),
    p95: round(s.p95, digits),
    p99: round(s.p99, digits),
    p999: round(s.p999, digits),
  };
}

/** Throughput in events per second over a wall-clock window. */
export function throughput(events: number, durationMs: number): number {
  return durationMs > 0 ? (events * 1000) / durationMs : 0;
}
