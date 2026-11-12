# Security status

Kechap 0.1 is an unaudited prototype. Official-provider adapters have mocked contract tests, not live vendor certification. The included PoW is experimental computational work, not proof of humanity. Do not deploy the in-memory store across workers.

ALTCHA and Cap use pinned upstream libraries and have owned local protocol and Chromium form integration tests. That evidence does not establish resistance to automated solvers. The toy replay baseline explicitly permits rule-aware scripts to pass. No biometric model or globally unique human proof is implemented.

For a vulnerability, use GitHub private vulnerability reporting on NomaDamas/Kechap if enabled. If it is unavailable, open a minimal issue requesting a private reporting channel without secrets, personal data, live tokens or exploit details. Maintainers must establish that channel before production release.

See [the threat model](docs/threat-model.md) for scope and [the roadmap](docs/roadmap.md) for production gates.
