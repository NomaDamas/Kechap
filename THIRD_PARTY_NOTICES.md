# Third-party notices

Kechap code is Apache-2.0. Runtime dependency licenses remain applicable:

- `altcha-lib` 2.8.0: MIT, Daniel Regeci, https://github.com/altcha-org/altcha-lib. Distributed via npm with its LICENSE.txt.
- `capjs-core` 0.1.15: Apache-2.0, Tiago Zip, https://github.com/tiagozip/cap. Distributed via npm with its LICENSE.

`src/browser-work.js` function `capDerive` re-expresses the FNV-1a/xorshift challenge salt derivation in Cap `packages/core/src/prng.js` / npm `src/prng.js` at the pinned 0.1.15 version. Original copyright belongs to Cap contributors. Modifications: combined state initialization, renamed variables and adapted formatting; no instrumentation or HashWX implementation is copied. License: Apache License 2.0, included in this repository as LICENSE. The surrounding bounded browser solver and integration are Kechap code.

The catalog links to third-party projects and does not redistribute their engines or grant any license to their code. See per-provider evidence and `docs/oss-integrations.md` for current source revisions and license boundaries.
