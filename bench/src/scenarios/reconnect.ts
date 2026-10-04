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
import type { BenchConfig, ReconnectResult, Scenario } from '../lib/scenario.js';
import { Histogram, roundSummary } from '../lib/stats.js';

/**
 * Reconnect scenario.
 *
 * `connections` clients join one group conversation; one dedicated sender publishes at `rate`
 * msg/s for `duration` seconds. Mid-run, half of the receivers are forcibly disconnected for
 * `outageMs`, then reconnect and run the gap-recovery path a real client would: fetch
 * `GET /conversations/:id/messages?afterSeq=<last seq seen>` until the local head reaches the
 * server head. We measure reconnect time (socket closed -> session:ready again), gap-recovery
 * time (session:ready -> all seqs up to the server head present locally), loss and duplicates
 * across the live + sync union.
 */
export const reconnectScenario: Scenario = {
  name: 'reconnect',
  async run(config: BenchConfig, log): Promise<ReconnectResult> {
    if (config.dryRun) return synthetic(config);

    const api = new ApiClient(config.url);
    const runId = newRunId();
    const clientCount = Math.max(2, config.connections);
    log(`provisioning ${clientCount} receivers + 1 sender (run ${runId})`);
    const users = await rampUp(clientCount + 1, 2_000, 16, (i) => api.provisionUser(runId, i));
    const sender = users[0]!;
    const receivers = users.slice(1);
    const conversation = await api.createGroup(
      sender,
      `bench-reconnect-${runId}`,
      receivers.map((r) => r.userId),
    );

    interface ReceiverState {
      user: VirtualUser;
      socket: BenchSocket;
      seqs: Set<number>;
      ids: Set<string>;
      live: number;
      synced: number;
      duplicates: number;
      orderingViolations: number;
      lastLiveSeq: number;
    }
    const states: ReceiverState[] = [];
    const reconnectMs = new Histogram();
    const gapRecoveryMs = new Histogram();

    const attach = (state: ReceiverState) => {
      state.socket.on('message:new', ({ message }: { message: Message }) => {
        if (!parseTimedPayload(message)) return;
        if (state.ids.has(message.clientMsgId)) {
          state.duplicates++;
          return;
        }
        state.ids.add(message.clientMsgId);
        state.seqs.add(message.seq);
        if (message.seq <= state.lastLiveSeq) state.orderingViolations++;
        state.lastLiveSeq = Math.max(state.lastLiveSeq, message.seq);
        state.live++;
      });
    };

    await rampUp(receivers.length, config.rampMs, 32, async (i) => {
      const user = receivers[i]!;
      const socket = await connectSocket(config.url, user);
      const state: ReceiverState = {
        user,
        socket,
        seqs: new Set(),
        ids: new Set(),
        live: 0,
        synced: 0,
        duplicates: 0,
        orderingViolations: 0,
        lastLiveSeq: 0,
      };
      attach(state);
      await joinConversation(socket, conversation.id);
      states.push(state);
    });
    const senderSocket = await connectSocket(config.url, sender);
    await joinConversation(senderSocket, conversation.id);

    // Sender loop ---------------------------------------------------------------------
    const intervalMs = 1000 / config.rate;
    const total = Math.floor(config.rate * config.duration);
    let sent = 0;
    const sending = (async () => {
      const start = Date.now();
      for (let n = 0; n < total; n++) {
        const wait = start + n * intervalMs - Date.now();
        if (wait > 0) await sleep(wait);
        const outcome = await sendTimed(senderSocket, conversation.id, n);
        if (!outcome.error) sent++;
      }
    })();

    // Outage: after 1/3 of the run, drop half the receivers for outageMs, then recover.
    await sleep((config.duration * 1000) / 3);
    const victims = states.filter((_, i) => i % 2 === 0);
    log(`disconnecting ${victims.length} receivers for ${config.outageMs} ms`);
    await Promise.all(
      victims.map(async (state) => {
        state.socket.close();
        await sleep(config.outageMs);
        const t0 = Date.now();
        const socket = await connectSocket(config.url, state.user);
        const t1 = Date.now();
        reconnectMs.record(t1 - t0);
        state.socket = socket;
        attach(state);
        const headSeq = await joinConversation(socket, conversation.id);
        // Gap recovery: pull everything after the last seq we hold until we reach the head.
        let cursor = state.seqs.size ? Math.max(...state.seqs) : 0;
        let target = headSeq;
        while (cursor < target) {
          const page = await api.fetchAfter(state.user, conversation.id, cursor);
          for (const m of page.items) {
            if (!parseTimedPayload(m)) continue;
            if (!state.ids.has(m.clientMsgId)) {
              state.ids.add(m.clientMsgId);
              state.seqs.add(m.seq);
              state.synced++;
            }
            cursor = Math.max(cursor, m.seq);
          }
          target = Math.max(target, page.headSeq);
          if (page.items.length === 0) break;
        }
        gapRecoveryMs.record(Date.now() - t1);
      }),
    );

    await sending;
    await sleep(2_000); // drain
    senderSocket.close();
    for (const s of states) s.socket.close();

    const expected = sent * states.length;
    const deliveredLive = states.reduce((n, s) => n + s.live, 0);
    const recoveredViaSync = states.reduce((n, s) => n + s.synced, 0);
    const held = states.reduce((n, s) => n + s.ids.size, 0);
    return {
      kind: 'reconnect',
      clients: states.length,
      disconnected: victims.length,
      expected,
      deliveredLive,
      recoveredViaSync,
      lost: Math.max(0, expected - held),
      duplicates: states.reduce((n, s) => n + s.duplicates, 0),
      orderingViolations: states.reduce((n, s) => n + s.orderingViolations, 0),
      gapRecoveryMs: roundSummary(gapRecoveryMs.summary()),
      reconnectMs: roundSummary(reconnectMs.summary()),
    };
  },
};

function synthetic(config: BenchConfig): ReconnectResult {
  const clients = Math.max(2, config.connections);
  const disconnected = Math.ceil(clients / 2);
  const total = Math.floor(config.rate * config.duration);
  const reconnect = new Histogram();
  const recovery = new Histogram();
  for (let i = 0; i < disconnected; i++) {
    reconnect.record(30 + (i % 7) * 4);
    recovery.record(45 + (i % 11) * 6);
  }
  const missedPerVictim = Math.round((config.outageMs / 1000) * config.rate);
  return {
    kind: 'reconnect',
    clients,
    disconnected,
    expected: total * clients,
    deliveredLive: total * clients - missedPerVictim * disconnected,
    recoveredViaSync: missedPerVictim * disconnected,
    lost: 0,
    duplicates: 0,
    orderingViolations: 0,
    gapRecoveryMs: roundSummary(recovery.summary()),
    reconnectMs: roundSummary(reconnect.summary()),
  };
}
