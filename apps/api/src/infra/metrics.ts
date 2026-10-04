import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

/** Prometheus metrics. One registry per process; created once in bootstrap and shared by injection. */
export interface Metrics {
  registry: Registry;
  httpRequestDuration: Histogram<'method' | 'route' | 'status'>;
  socketConnections: Gauge<'node'>;
  messagesSent: Counter<'kind'>;
  messageFanoutDuration: Histogram<string>;
  socketEventDuration: Histogram<'event' | 'outcome'>;
}

const LATENCY_BUCKETS = [0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5];

export function createMetrics(nodeId: string, collectDefaults = true): Metrics {
  const registry = new Registry();
  registry.setDefaultLabels({ node: nodeId });
  if (collectDefaults) collectDefaultMetrics({ register: registry });

  return {
    registry,
    httpRequestDuration: new Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request latency by route',
      labelNames: ['method', 'route', 'status'] as const,
      buckets: LATENCY_BUCKETS,
      registers: [registry],
    }),
    socketConnections: new Gauge({
      name: 'socket_connections',
      help: 'Currently connected Socket.IO clients on this node',
      labelNames: ['node'] as const,
      registers: [registry],
    }),
    messagesSent: new Counter({
      name: 'messages_sent_total',
      help: 'Messages accepted by the sequencer',
      labelNames: ['kind'] as const,
      registers: [registry],
    }),
    messageFanoutDuration: new Histogram({
      name: 'message_fanout_duration_seconds',
      help: 'Time from message acceptance to broadcast to the conversation room',
      buckets: LATENCY_BUCKETS,
      registers: [registry],
    }),
    socketEventDuration: new Histogram({
      name: 'socket_event_duration_seconds',
      help: 'Socket.IO event handler latency',
      labelNames: ['event', 'outcome'] as const,
      buckets: LATENCY_BUCKETS,
      registers: [registry],
    }),
  };
}
