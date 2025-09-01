// apps/api/src/telemetry/metrics.ts
import { Request, Response } from 'express';
import { performance } from 'perf_hooks';

// Simple metrics store (in production, use Prometheus client)
class MetricsStore {
  private metrics: Map<string, any> = new Map();
  private counters: Map<string, number> = new Map();
  private gauges: Map<string, number> = new Map();
  private histograms: Map<string, number[]> = new Map();

  // Counter metrics
  increment(name: string, value: number = 1, labels?: Record<string, string>) {
    const key = this.buildKey(name, labels);
    this.counters.set(key, (this.counters.get(key) || 0) + value);
  }

  // Gauge metrics
  setGauge(name: string, value: number, labels?: Record<string, string>) {
    const key = this.buildKey(name, labels);
    this.gauges.set(key, value);
  }

  // Histogram metrics
  observe(name: string, value: number, labels?: Record<string, string>) {
    const key = this.buildKey(name, labels);
    const values = this.histograms.get(key) || [];
    values.push(value);
    this.histograms.set(key, values);
  }

  // Get all metrics in Prometheus format
  getMetrics(): string {
    let output = '';

    // Counters
    for (const [key, value] of this.counters.entries()) {
      output += `${key} ${value}\n`;
    }

    // Gauges
    for (const [key, value] of this.gauges.entries()) {
      output += `${key} ${value}\n`;
    }

    // Histograms (simplified)
    for (const [key, values] of this.histograms.entries()) {
      const sum = values.reduce((a, b) => a + b, 0);
      const count = values.length;
      const avg = sum / count;

      output += `${key}_sum ${sum}\n`;
      output += `${key}_count ${count}\n`;
      output += `${key}_avg ${avg}\n`;
    }

    return output;
  }

  private buildKey(name: string, labels?: Record<string, string>): string {
    if (!labels) return name;

    const labelStr = Object.entries(labels)
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');

    return `${name}{${labelStr}}`;
  }

  // Clear old histogram data (keep only last 1000 entries per metric)
  cleanup() {
    for (const [key, values] of this.histograms.entries()) {
      if (values.length > 1000) {
        this.histograms.set(key, values.slice(-1000));
      }
    }
  }
}

export const metricsStore = new MetricsStore();

// Cleanup old data every 5 minutes
setInterval(() => {
  metricsStore.cleanup();
}, 5 * 60 * 1000);

// Application metrics
export class AppMetrics {
  // HTTP request metrics
  static recordHttpRequest(method: string, route: string, statusCode: number, duration: number) {
    metricsStore.increment('http_requests_total', 1, {
      method,
      route,
      status_code: statusCode.toString()
    });

    metricsStore.observe('http_request_duration_ms', duration, {
      method,
      route
    });
  }

  // Database metrics
  static recordDatabaseQuery(collection: string, operation: string, duration: number) {
    metricsStore.increment('db_queries_total', 1, {
      collection,
      operation
    });

    metricsStore.observe('db_query_duration_ms', duration, {
      collection,
      operation
    });
  }

  // WebSocket metrics
  static recordWebSocketConnection(event: 'connect' | 'disconnect') {
    metricsStore.increment('websocket_connections_total', 1, { event });
  }

  static setActiveConnections(count: number) {
    metricsStore.setGauge('websocket_active_connections', count);
  }

  // Message metrics
  static recordMessage(type: 'sent' | 'received') {
    metricsStore.increment('messages_total', 1, { type });
  }

  // Error metrics
  static recordError(type: string, operation: string) {
    metricsStore.increment('errors_total', 1, {
      type,
      operation
    });
  }

  // Cache metrics
  static recordCacheOperation(operation: 'hit' | 'miss' | 'set' | 'delete') {
    metricsStore.increment('cache_operations_total', 1, { operation });
  }

  // Authentication metrics
  static recordAuthEvent(event: 'login' | 'register' | 'logout' | 'failed_login') {
    metricsStore.increment('auth_events_total', 1, { event });
  }

  // File upload metrics
  static recordFileUpload(fileType: string, size: number) {
    metricsStore.increment('file_uploads_total', 1, { file_type: fileType });
    metricsStore.observe('file_upload_size_bytes', size, { file_type: fileType });
  }
}

// Middleware to collect HTTP metrics
export const metricsMiddleware = (req: Request, res: Response, next: Function) => {
  const start = performance.now();

  res.on('finish', () => {
    const duration = performance.now() - start;
    const route = req.route?.path || req.path;

    AppMetrics.recordHttpRequest(
      req.method,
      route,
      res.statusCode,
      duration
    );
  });

  next();
};

// Metrics endpoint
export const metricsEndpoint = (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/plain');
  res.send(metricsStore.getMetrics());
};

// System metrics collection
export function startSystemMetricsCollection() {
  setInterval(() => {
    const memUsage = process.memoryUsage();

    metricsStore.setGauge('nodejs_memory_usage_bytes', memUsage.heapUsed, { type: 'heap_used' });
    metricsStore.setGauge('nodejs_memory_usage_bytes', memUsage.heapTotal, { type: 'heap_total' });
    metricsStore.setGauge('nodejs_memory_usage_bytes', memUsage.rss, { type: 'rss' });
    metricsStore.setGauge('nodejs_memory_usage_bytes', memUsage.external, { type: 'external' });

    // CPU usage (simplified)
    const cpuUsage = process.cpuUsage();
    metricsStore.setGauge('nodejs_cpu_usage_seconds', cpuUsage.user / 1000000, { type: 'user' });
    metricsStore.setGauge('nodejs_cpu_usage_seconds', cpuUsage.system / 1000000, { type: 'system' });

    // Event loop lag (simplified)
    const start = performance.now();
    setImmediate(() => {
      const lag = performance.now() - start;
      metricsStore.setGauge('nodejs_eventloop_lag_ms', lag);
    });

  }, 10000); // Every 10 seconds
}
