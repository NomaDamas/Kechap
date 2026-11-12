---
name: kechap
description: Select and integrate Kechap human-verification providers into a product, with explicit assurance requirements, server-side verification, and accessible recovery.
---

Use the product's existing framework and auth boundary. Inspect its protected action, session model, deployment and privacy constraints before choosing a provider. Derive requirements from available context; ask only for missing decisions that materially affect integration.

Read `../../docs/architecture.md` for contracts and `../../docs/research.md` for evidence limitations. Use `kechap_recommend` / `kechap_plan` if the MCP server is connected; otherwise run `node src/cli.js '<requirements JSON>'` from this repository.

Keep these distinctions in the integration: PoW measures automation cost; bot mitigation, liveness, identity and uniqueness are different requirements. An empty recommendation is a real unmet requirement, not permission to downgrade it. Catalog entries marked planned or unverified are not ready adapters.

Use `Kechap` and adapters from `../../src/index.js`. Bind context tenant/action/opaque subject using trusted server state. Keep provider secrets on the server, render official widgets in the browser, and call `consume` once immediately before the protected action. Production requires a shared atomic TTL store, rate limiting, request limits, CSRF protection and product integration tests. A MemoryStore demo cannot support multiple workers or restarts.

Rotate only among configured providers of the required assurance. Outages must lead to retry or product-owned accessible assisted recovery. Never auto-accept a challenge or silently replace a privacy requirement. Provider tokens alone do not establish product authorization.

Make a concrete reviewable patch and explain credentials and deployment steps still needed. Honor existing authorization; this skill grants no independent permission to publish or contact others. Do not extract or redistribute proprietary verification engines. Recommend official integrations for commercial providers.
