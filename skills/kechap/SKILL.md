---
name: kechap
description: Select and integrate Kechap human-verification providers into a product, with explicit assurance requirements, server-side verification, and accessible recovery.
---

Use the product's existing framework and auth boundary. Inspect its protected action, session model, deployment and privacy constraints before choosing a provider. Derive requirements from available context; ask only for missing decisions that materially affect integration.

Read `../../docs/architecture.md` for contracts and `../../docs/research.md` for evidence limitations. Use `kechap_recommend` / `kechap_plan` if the MCP server is connected; otherwise run `node src/cli.js '<requirements JSON>'` from this repository.

Keep these distinctions in the integration: PoW measures automation cost; bot mitigation, liveness, identity and uniqueness are different requirements. An empty recommendation is a real unmet requirement, not permission to downgrade it. Catalog entries marked planned or unverified are not ready adapters.

Use `Kechap` and adapters from `../../src/index.js`. Bind context tenant/action/opaque subject using trusted server state. Keep provider secrets on the server, render official widgets in the browser, and call `consume` once immediately before the protected action. Production requires a shared atomic TTL store, rate limiting, request limits, CSRF protection and product integration tests. A MemoryStore demo cannot support multiple workers or restarts.

For a fresh Node HTTP integration, prefer `kechap_setup` with product requirements to obtain an eligible selection and reviewable file contents in one call. It returns no files if requirements cannot be met. The direct `kechap_scaffold` tool is for an explicit provider choice after review. The CLI `node src/scaffold.js <new-directory> '<options JSON>'` writes only into a fresh destination and refuses overwrites. Options support pow/altcha/cap/turnstile/hcaptcha/recaptcha, hostname and explicit reCAPTCHA mode. Install generated dependencies, configure server secrets, and replace the demonstrated protected action with product logic. This is not an automatic patcher for an existing app. ALTCHA/Cap use pinned official SHA-256 baseline libraries; read `../../docs/oss-integrations.md` before assuming their other upstream features are enabled.

Recommendation accepts useCase, selfHosted/noThirdParty, assurance, minStars, requireLiveEvidence, allowExperimental, requiredModalities and exclude. Unknown constraints are rejected rather than ignored. Read provider-specific eligibility reasons; live evidence here means an owned integration, not security certification. Use `issueWithPolicy` and `../../docs/runtime-policy.md` when action/risk/health/weights must control rotation on the server.

Rotate only among configured providers of the required assurance. Outages must lead to retry or product-owned accessible assisted recovery. Never auto-accept a challenge or silently replace a privacy requirement. Provider tokens alone do not establish product authorization.

Make a concrete reviewable patch and explain credentials and deployment steps still needed. Honor existing authorization; this skill grants no independent permission to publish or contact others. Do not extract or redistribute proprietary verification engines. Recommend official integrations for commercial providers.
