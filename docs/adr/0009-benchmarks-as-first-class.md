# ADR 0009: Reproducible benchmarks are part of the repository

**Status:** Accepted · **Date:** 2026-10-03

## Context

Claims such as "scales horizontally" or "low latency" are meaningless without a method, a
workload and numbers that someone else can reproduce.

## Decision

`bench/` contains a load generator that drives the real protocol with virtual users, measures
end-to-end latency (receiver clock minus sender clock embedded in the payload), ack latency,
delivery ratio, ordering violations and duplicates, and scrapes the server's Prometheus metrics.
Each run writes a JSON file with the full configuration, git SHA, Node version and machine
description; a report script renders comparisons as Markdown. `docs/EVALUATION.md` records the
methodology and baseline results.

## Alternatives considered

* **k6 / Artillery scripts.** Good HTTP tooling, but modelling the ack-and-fan-out semantics of
  the socket protocol in their DSLs is awkward; a TypeScript harness reuses the protocol types.

## Consequences

* Performance regressions are detectable by re-running the same scenario.
* Numbers in the documentation can be traced to a result file.
