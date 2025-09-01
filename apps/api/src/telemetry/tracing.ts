// apps/api/src/telemetry/tracing.ts
import { Request, Response, NextFunction } from 'express';
import { performance } from 'perf_hooks';
import { logger } from '../utils/logger.js';
import { generateUUID } from '../utils/crypto.js';

export interface TraceContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  operation: string;
  startTime: number;
  tags: Record<string, any>;
}

export class Tracer {
  private activeSpans: Map<string, TraceContext> = new Map();
  private completedSpans: TraceContext[] = [];
  private maxSpans = 10000; // Keep last 10k spans

  // Start a new span
  startSpan(operation: string, parentContext?: TraceContext): TraceContext {
    const spanId = generateUUID();
    const traceId = parentContext?.traceId || generateUUID();

    const context: TraceContext = {
      traceId,
      spanId,
      parentSpanId: parentContext?.spanId,
      operation,
      startTime: performance.now(),
      tags: {}
    };

    this.activeSpans.set(spanId, context);
    return context;
  }

  // Finish a span
  finishSpan(spanId: string, tags: Record<string, any> = {}) {
    const span = this.activeSpans.get(spanId);
    if (!span) {
      logger.warn({ spanId }, 'Attempted to finish non-existent span');
      return;
    }

    const duration = performance.now() - span.startTime;

    const completedSpan = {
      ...span,
      tags: { ...span.tags, ...tags, duration_ms: duration }
    };

    this.activeSpans.delete(spanId);
    this.completedSpans.push(completedSpan);

    // Keep only recent spans
    if (this.completedSpans.length > this.maxSpans) {
      this.completedSpans = this.completedSpans.slice(-this.maxSpans);
    }

    // Log slow operations
    if (duration > 1000) { // > 1 second
      logger.warn({
        traceId: span.traceId,
        spanId,
        operation: span.operation,
        duration,
        tags: completedSpan.tags
      }, 'Slow operation detected');
    }

    return completedSpan;
  }

  // Add tags to active span
  setTag(spanId: string, key: string, value: any) {
    const span = this.activeSpans.get(spanId);
    if (span) {
      span.tags[key] = value;
    }
  }

  // Get traces by trace ID
  getTrace(traceId: string): TraceContext[] {
    return this.completedSpans.filter(span => span.traceId === traceId);
  }

  // Get recent spans
  getRecentSpans(limit: number = 100): TraceContext[] {
    return this.completedSpans.slice(-limit);
  }

  // Get spans by operation
  getSpansByOperation(operation: string, limit: number = 100): TraceContext[] {
    return this.completedSpans
      .filter(span => span.operation === operation)
      .slice(-limit);
  }

  // Get performance statistics
  getStats(): Record<string, any> {
    const operationStats = new Map<string, { count: number; totalTime: number; minTime: number; maxTime: number }>();

    for (const span of this.completedSpans) {
      const duration = span.tags.duration_ms || 0;
      const operation = span.operation;

      const stats = operationStats.get(operation) || {
        count: 0,
        totalTime: 0,
        minTime: Infinity,
        maxTime: 0
      };

      stats.count++;
      stats.totalTime += duration;
      stats.minTime = Math.min(stats.minTime, duration);
      stats.maxTime = Math.max(stats.maxTime, duration);

      operationStats.set(operation, stats);
    }

    const result: Record<string, any> = {};
    for (const [operation, stats] of operationStats.entries()) {
      result[operation] = {
        ...stats,
        avgTime: stats.totalTime / stats.count,
        minTime: stats.minTime === Infinity ? 0 : stats.minTime
      };
    }

    return result;
  }

  // Clear old data
  cleanup() {
    const cutoff = performance.now() - (60 * 60 * 1000); // 1 hour ago

    this.completedSpans = this.completedSpans.filter(
      span => (span.startTime + (span.tags.duration_ms || 0)) > cutoff
    );
  }
}

export const tracer = new Tracer();

// Cleanup old traces every 30 minutes
setInterval(() => {
  tracer.cleanup();
}, 30 * 60 * 1000);

// Express middleware for automatic HTTP tracing
export const tracingMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const traceId = (req.headers['x-trace-id'] as string) || generateUUID();
  const operation = `${req.method} ${req.route?.path || req.path}`;

  const span = tracer.startSpan(operation);

  // Add trace ID to request and response headers
  req.headers['x-trace-id'] = traceId;
  res.setHeader('X-Trace-Id', traceId);

  // Store span context in request
  (req as any).span = span;

  // Set initial tags
  tracer.setTag(span.spanId, 'http.method', req.method);
  tracer.setTag(span.spanId, 'http.url', req.originalUrl);
  tracer.setTag(span.spanId, 'http.user_agent', req.headers['user-agent']);
  tracer.setTag(span.spanId, 'user.id', (req as any).user?.id);

  res.on('finish', () => {
    tracer.setTag(span.spanId, 'http.status_code', res.statusCode);
    tracer.setTag(span.spanId, 'http.content_length', res.get('content-length'));

    const isError = res.statusCode >= 400;
    tracer.finishSpan(span.spanId, {
      error: isError,
      http_status: res.statusCode
    });
  });

  next();
};

// Database operation tracing helper
export function traceDbOperation<T>(
  operation: string,
  collection: string,
  fn: () => Promise<T>,
  parentSpan?: TraceContext
): Promise<T> {
  const span = tracer.startSpan(`db.${operation}`, parentSpan);

  tracer.setTag(span.spanId, 'db.operation', operation);
  tracer.setTag(span.spanId, 'db.collection', collection);

  return fn()
    .then(result => {
      tracer.finishSpan(span.spanId, { success: true });
      return result;
    })
    .catch(error => {
      tracer.finishSpan(span.spanId, {
        error: true,
        error_message: error.message
      });
      throw error;
    });
}

// External API call tracing helper
export function traceExternalCall<T>(
  service: string,
  operation: string,
  fn: () => Promise<T>,
  parentSpan?: TraceContext
): Promise<T> {
  const span = tracer.startSpan(`external.${service}`, parentSpan);

  tracer.setTag(span.spanId, 'external.service', service);
  tracer.setTag(span.spanId, 'external.operation', operation);

  return fn()
    .then(result => {
      tracer.finishSpan(span.spanId, { success: true });
      return result;
    })
    .catch(error => {
      tracer.finishSpan(span.spanId, {
        error: true,
        error_message: error.message
      });
      throw error;
    });
}

// Manual span creation for custom operations
export function withSpan<T>(
  operation: string,
  fn: (span: TraceContext) => Promise<T>,
  parentSpan?: TraceContext
): Promise<T> {
  const span = tracer.startSpan(operation, parentSpan);

  return fn(span)
    .then(result => {
      tracer.finishSpan(span.spanId, { success: true });
      return result;
    })
    .catch(error => {
      tracer.finishSpan(span.spanId, {
        error: true,
        error_message: error.message
      });
      throw error;
    });
}
