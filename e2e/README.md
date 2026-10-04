# End-to-end tests

Browser-driven tests that run the real API, the real web client and real cryptography in
Chromium. Nothing is mocked; every assertion crosses the wire protocol.

| Spec                  | What it proves                                                                                                                                  |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth.spec.ts`        | Register → app shell; logout; wrong password rejected; login; session survives reload                                                           |
| `direct-chat.spec.ts` | Two browsers establish an X3DH/Double Ratchet session through the UI, exchange messages, show the same safety number; the server has no preview |
| `group-chat.spec.ts`  | Three members in an encrypted group see every message in the same (seq) order; a removed member is cut off after key rotation                   |
| `reconnect.spec.ts`   | An offline client catches up exactly once and in order on reconnect, and its queued outbox message is delivered                                 |

## Running

Playwright starts the API (port 4100, in-process Redis emulator) and the Vite dev server
(port 4173) itself. It only needs a MongoDB:

```bash
docker run -d --rm --name e2e-mongo -p 27017:27017 mongo:7
pnpm --filter @chatverse/e2e exec playwright install chromium   # once
pnpm test:e2e                                                   # from the repo root
pnpm --filter @chatverse/e2e test:headed                        # watch it
```

`E2E_MONGODB_URI` overrides the database (default `mongodb://localhost:27017/chatverse_e2e`).
Every run registers fresh users with a timestamp suffix, so the database never needs cleaning.
The HTML report lands in `e2e/report/`; traces are captured on the first retry in CI.

`pnpm test` at the repository root deliberately skips this package (it needs a browser);
CI runs it as the separate `e2e` job.
