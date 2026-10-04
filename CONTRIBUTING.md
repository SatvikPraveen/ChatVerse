# Contributing

Thanks for your interest in ChatVerse. This project aims for research-grade rigour: every
behavioural claim should be backed by a test, every design decision by an ADR, and every
performance claim by a benchmark result.

## Development setup

```bash
corepack enable                      # pnpm 9 is pinned in package.json
pnpm install
cp .env.example .env                 # adjust secrets
docker compose -f infra/docker/docker-compose.dev.yml up -d mongo redis
pnpm --filter @chatverse/api seed    # sample users: alice / bob / carol, password "password123!"
pnpm dev                             # API on :4000, web on :5173
```

## Before opening a pull request

```bash
pnpm lint
pnpm type-check
pnpm test
pnpm build
```

All four must pass. The test suites run without external services (MongoDB and Redis are
replaced by in-memory implementations).

## Conventions

- **Commits** follow Conventional Commits (`feat(api): ...`, `fix(crypto): ...`,
  `docs: ...`). One logical change per commit.
- **Wire changes** go through `packages/protocol` and `docs/PROTOCOL.md` together.
- **Design decisions** get an ADR in `docs/adr/`.
- **Security-relevant changes** update `docs/SECURITY.md` and add a test demonstrating the
  property.
- **Performance changes** include a before/after run of the relevant `bench/` scenario.
- Prettier formats the code; ESLint enforces correctness rules. No `any`.

## Reporting security issues

Please do not open public issues for vulnerabilities; contact the maintainer directly (see the
repository profile).
