# ChatVerse benchmark report

Generated 2026-10-04T10:07:01.854Z from 9 run(s).

## Fan-out (end-to-end delivery)

| run | label | sha | users | groups×size | rate | dur | delivered | dup | order viol | e2e p50 | e2e p95 | e2e p99 | ack p50 | ack p99 | msg/s |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-04T01:45:12.163Z | docker-2 (cluster lock) | 18951d7 | 200 | 20×10 | 2/s | 30s | 100.00% | 0 | 0 | 3.0 | 85.0 | 338.0 | 3.0 | 366.0 | 4000 |
| 2026-10-04T01:36:22.312Z | native-1 (saturation) | 18951d7 | 500 | 50×10 | 2/s | 30s | 100.00% | 0 | 0 | 349.0 | 784.0 | 1161.0 | 386.0 | 1263.0 | 8879 |
| 2026-10-04T01:40:58.634Z | docker-1 | 18951d7 | 200 | 20×10 | 2/s | 30s | 100.00% | 0 | 0 | 2.0 | 61.0 | 175.0 | 3.0 | 190.0 | 4001 |
| 2026-10-04T01:34:01.469Z | native-1 | 18951d7 | 200 | 20×10 | 2/s | 30s | 100.00% | 0 | 0 | 2.0 | 6.0 | 109.0 | 2.0 | 117.0 | 4000 |
| 2026-10-04T10:01:25.572Z | sweep size=10 | 12adc0c | 200 | 20×10 | 2/s | 30s | 100.00% | 0 | 0 | 2.0 | 7.0 | 78.0 | 3.0 | 93.0 | 4000 |
| 2026-10-04T10:02:47.163Z | sweep size=200 | 12adc0c | 200 | 1×200 | 0.1/s | 30s | 100.00% | 0 | 0 | 16.0 | 133.0 | 359.0 | 21.0 | 365.0 | 3998 |
| 2026-10-04T10:02:05.548Z | sweep size=50 | 12adc0c | 200 | 4×50 | 0.4/s | 30s | 100.00% | 0 | 0 | 3.0 | 14.0 | 42.0 | 5.0 | 54.0 | 3997 |

## HTTP (autocannon)

| run | label | sha | endpoint | conns | dur | req/s | p50 | p95 | p99 | errors |
|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-04T01:35:04.889Z | native-1 | 18951d7 | /health/live | 100 | 15s | 13564 | 6.0 | 12.0 | 17.0 | 0 |
| 2026-10-04T01:35:04.889Z | native-1 | 18951d7 | /api/v1/conversations | 100 | 15s | 3717 | 23.0 | 54.0 | 63.0 | 0 |

## Reconnect & gap recovery

| run | label | sha | clients | outage | live | via sync | lost | dup | reconnect p50 | recovery p50 | recovery p99 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-04T01:35:42.829Z | native-1 | 18951d7 | 50 | 3000ms | 5550 | 400 | 0 | 0 | 34.0 | 40.0 | 53.0 |

## Machines

- darwin/arm64, 10× Apple M5, 24.0 GB RAM, Node v20.20.0

Latencies in milliseconds. See bench/README.md for methodology.
