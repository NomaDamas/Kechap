# Third-party notices

Kechap code is Apache-2.0. Runtime dependency licenses remain applicable:

- `altcha-lib` 2.8.0: MIT, Daniel Regeci, https://github.com/altcha-org/altcha-lib. Distributed via npm with its LICENSE.txt.
- `capjs-core` 0.1.15: Apache-2.0, Tiago Zip, https://github.com/tiagozip/cap. Distributed via npm with its LICENSE.
- `redis` 6.3.1: MIT, Redis/node-redis contributors, https://github.com/redis/node-redis. Redis server itself is a separately deployed component with version-specific licensing.
- `@simplewebauthn/server` 13.3.3 and `@simplewebauthn/browser` 13.3.0: MIT, Matthew Miller and contributors, https://github.com/MasterKale/SimpleWebAuthn. Browser bundle is served from the installed official package; preserve its license and upstream notices.
- `@worldcoin/idkit-server` 1.2.0: MIT, World ID contributors, https://github.com/worldcoin/idkit. Optional disabled-by-default RP signing/verification support; the service and credential issuer have separate terms.
- `express` 5.3.0: MIT, Express contributors, https://github.com/expressjs/express.

Development/research dependencies include Ajv (MIT) and Playwright (Apache-2.0). Transitive dependency licenses are retained in node_modules distributions and pinned by package-lock.json; the above list is not a substitute for reviewing the exact production artifact.

`src/browser-work.js` function `capDerive` re-expresses the FNV-1a/xorshift challenge salt derivation in Cap `packages/core/src/prng.js` / npm `src/prng.js` at the pinned 0.1.15 version. Original copyright belongs to Cap contributors. Modifications: combined state initialization, renamed variables and adapted formatting; no instrumentation or HashWX implementation is copied. License: Apache License 2.0, included in this repository as LICENSE. The surrounding bounded browser solver and integration are Kechap code.

The catalog links to third-party projects and does not redistribute their engines or grant any license to their code. See per-provider evidence and `docs/oss-integrations.md` for current source revisions and license boundaries.
