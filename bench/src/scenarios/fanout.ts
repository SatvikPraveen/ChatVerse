import type { Message } from '@chatverse/protocol';
import {
  ApiClient,
  connectSocket,
  joinConversation,
  newRunId,
  parseTimedPayload,
  rampUp,
  sendTimed,
  sleep,
  type BenchSocket,
  type VirtualUser,
} from '../lib/client.js';
import type {
  BenchConfig,
  FanoutResult,
  Scenario,
  ServerMetricsSnapshot,
} from '../lib/scenario.js';
import { Histogram, roundSummary, throughput } from '../lib/stats.js';

/**
 * Fan-out scenario.
 *
 * `users` virtual users are partitioned into `groups` group conversations of `groupSize`
 * members (users are assigned round-robin, so a user may sit in several groups when
 * groups*groupSize > users). Every member of every group sends `rate` messages per second
 * for `duration` seconds. Each receiver records, per message:
 *   - end-to-end latency: wall clock at `message:new` minus the send timestamp carried in the
 *     message text (sender and receiver are the same process, so clocks are identical)
 *   - ordering: `seq` must be strictly increasing per conversation on every receiver
 *   - duplicates: a `clientMsgId` observed twice on the same receiver
 * The sender records ack latency (emit -> ack).
 */
export const fanoutScenario: Scenario = {
  name: 'fanout',
  async run(config: BenchConfig, log): Promise<FanoutResult> {
    if (config.dryRun) return synthetic(config);

    const api = new ApiClient(config.url);
    const runId = newRunId();
    const metricsBefore = await snapshot(api);

    log(`provisioning ${config.users} users (run ${runId})`);
    const users = await rampUp(config.users, Math.min(config.rampMs, config.users * 20), 16, (i) =>
      api.provisionUser(runId, i),
    );

    log(`creating ${config.groups} groups of ${config.groupSize}`);
    const groups: Array<{ id: string; members: VirtualUser[] }> = [];
    for (let g = 0; g < config.groups; g++) {
      const members: VirtualUser[] = [];
      for (let k = 0; k < config.groupSize; k++) {
        members.push(users[(g * config.groupSize + k) % users.length]!);
      }
      const unique = [...new Map(members.map((m) => [m.userId, m])).values()];
      const owner = unique[0]!;
      const conversation = await api.createGroup(
        owner,
        `bench-${runId}-${g}`,
        unique.slice(1).map((m) => m.userId),
      );
      groups.push({ id: conversation.id, members: unique });
    }

    // Receiver state ------------------------------------------------------------------
    const e2e = new Histogram();
    const ack = new Histogram();
    let delivered = 0;
    let duplicates = 0;
    let orderingViolations = 0;
    let sendErrors = 0;
    const seen = new Map<string, Set<string>>(); // userId -> clientMsgIds
    const lastSeq = new Map<string, number>(); // `${userId}:${conversationId}` -> seq

    const onMessage =
      (user: VirtualUser) =>
      ({ message }: { message: Message }) => {
        const payload = parseTimedPayload(message);
        if (!payload) return;
        const now = Date.now();
        const ids = seen.get(user.userId) ?? new Set<string>();
        if (ids.has(message.clientMsgId)) {
          duplicates++;
          return;
        }
        ids.add(message.clientMsgId);
        seen.set(user.userId, ids);
        const key = `${user.userId}:${message.conversationId}`;
        const prev = lastSeq.get(key) ?? 0;
        if (message.seq <= prev) orderingViolations++;
        lastSeq.set(key, Math.max(prev, message.seq));
        delivered++;
        e2e.record(now - payload.t);
      };

    log(`connecting ${users.length} sockets over ${config.rampMs} ms`);
    const sockets = new Map<string, BenchSocket>();
    await rampUp(users.length, config.rampMs, 32, async (i) => {
      const user = users[i]!;
      const socket = await connectSocket(config.url, user);
      socket.on('message:new', onMessage(user));
      sockets.set(user.userId, socket);
    });

    for (const group of groups) {
      await Promise.all(
        group.members.map((m) => joinConversation(sockets.get(m.userId)!, group.id)),
      );
    }

    // Senders -------------------------------------------------------------------------
    const senders: Array<{ user: VirtualUser; conversationId: string; fanout: number }> = [];
    for (const group of groups) {
      for (const member of group.members) {
        senders.push({ user: member, conversationId: group.id, fanout: group.members.length });
      }
    }
    const intervalMs = 1000 / config.rate;
    const totalPerSender = Math.floor(config.rate * config.duration);
    const expected = senders.reduce((n, s) => n + totalPerSender * s.fanout, 0);
    log(
      `sending: ${senders.length} senders × ${totalPerSender} msgs, expecting ${expected} deliveries`,
    );

    const sendStart = Date.now();
    await Promise.all(
      senders.map(async (sender, idx) => {
        // de-phase senders so they do not all fire on the same tick
        await sleep(Math.random() * intervalMs);
        const socket = sockets.get(sender.user.userId)!;
        for (let n = 0; n < totalPerSender; n++) {
          const target = sendStart + n * intervalMs;
          const wait = target - Date.now();
          if (wait > 0) await sleep(wait);
          const outcome = await sendTimed(socket, sender.conversationId, idx * totalPerSender + n);
          if (outcome.error) sendErrors++;
          else ack.record(outcome.ackAt - outcome.sentAt);
        }
      }),
    );
    const sendEnd = Date.now();

    // Drain: wait for in-flight deliveries, bounded.
    const drainDeadline = Date.now() + 5_000;
    let last = -1;
    while (delivered < expected && Date.now() < drainDeadline) {
      if (delivered === last) await sleep(200);
      last = delivered;
      await sleep(100);
    }
    const drainEnd = Date.now();

    for (const socket of sockets.values()) socket.close();
    const metricsAfter = await snapshot(api);

    return {
      kind: 'fanout',
      expected,
      delivered,
      deliveryRatio: expected > 0 ? delivered / expected : 0,
      duplicates,
      orderingViolations,
      sendErrors,
      endToEndLatencyMs: roundSummary(e2e.summary()),
      ackLatencyMs: roundSummary(ack.summary()),
      sentPerSec: throughput(senders.length * totalPerSender, sendEnd - sendStart),
      deliveredPerSec: throughput(delivered, drainEnd - sendStart),
      serverMetrics: { before: metricsBefore, after: metricsAfter },
    };
  },
};

async function snapshot(api: ApiClient): Promise<ServerMetricsSnapshot | null> {
  const values = await api.scrapeMetrics();
  return values ? { values, scrapedAt: new Date().toISOString() } : null;
}

/** Deterministic synthetic result so the CLI, stats and report paths can be exercised offline. */
function synthetic(config: BenchConfig): FanoutResult {
  const e2e = new Histogram();
  const ack = new Histogram();
  const senders = config.groups * config.groupSize;
  const perSender = Math.floor(config.rate * config.duration);
  const expected = senders * perSender * config.groupSize;
  let seed = 42;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  for (let i = 0; i < Math.min(expected, 50_000); i++) {
    // log-normal-ish latencies: mostly ~8 ms with a long tail
    e2e.record(4 + Math.exp(rnd() * 2.2));
    ack.record(2 + Math.exp(rnd() * 1.6));
  }
  return {
    kind: 'fanout',
    expected,
    delivered: expected,
    deliveryRatio: 1,
    duplicates: 0,
    orderingViolations: 0,
    sendErrors: 0,
    endToEndLatencyMs: roundSummary(e2e.summary()),
    ackLatencyMs: roundSummary(ack.summary()),
    sentPerSec: senders * config.rate,
    deliveredPerSec: senders * config.rate * config.groupSize,
    serverMetrics: { before: null, after: null },
  };
}
