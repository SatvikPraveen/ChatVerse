# ChatVerse documentation

| Document                               | What it answers                                                                         |
| -------------------------------------- | --------------------------------------------------------------------------------------- |
| [PROTOCOL.md](./PROTOCOL.md)           | What exactly goes over the wire, and which guarantees clients may rely on (normative)   |
| [ARCHITECTURE.md](./ARCHITECTURE.md)   | How the server and client are structured, the send path, Redis coordination, data model |
| [SECURITY.md](./SECURITY.md)           | Threat model, account security, the E2EE design and its tested properties and limits    |
| [EVALUATION.md](./EVALUATION.md)       | Benchmark methodology, measured results, bottleneck analysis and reproduction steps     |
| [API_REFERENCE.md](./API_REFERENCE.md) | Every REST route with request and response shapes                                       |
| [DEPLOYMENT.md](./DEPLOYMENT.md)       | Local, Docker Compose, Kubernetes and AWS deployment and configuration                  |
| [adr/](./adr/README.md)                | Architecture decision records: why the system is built this way                         |
| [RUNBOOKS/](./RUNBOOKS/)               | What to do when something is wrong, and how to scale                                    |

Related material outside this directory: [`bench/README.md`](../bench/README.md) (load generator),
[`infra/k8s/README.md`](../infra/k8s/README.md), and the root [`README.md`](../README.md).
