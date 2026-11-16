# Release verification — 0.5.2-beta.1

Checked 2026-11-17 for `@sanmumu/dsh-bead-studio@0.5.2-beta.1`.

- Runtime used for automated checks: Node.js v26.13.0 on Windows.
- DSH integration version previously verified: 0.2.1-rc.2 only. The declared compatibility range is not an assertion of testing every version in that range.
- Production dependency pinned to `zod` **4.6.7**, with npm lockfile v3 included. The earlier 4.4.3 pin was not retained because it is affected by [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5).
- `npm audit --json --registry=https://registry.npmjs.org/`: **0 reported vulnerabilities** at verification time. Audit data can change and is not a guarantee of complete security.
- `node build.mjs`: succeeded.
- `node --test *.test.mjs`: **227 tests, 227 passed, 0 failed, 0 cancelled, 0 skipped** after the dependency update. Tests use mocks/in-memory services; no paid AI generation was executed.
- Repeated builds preserve byte-identical `client.js`, `core-v2.js` and `host-v4.js` outputs.
- npm package dry-run checked: **37 runtime/documentation files**; no tests, test outputs, vendored test dependencies, local configuration or credentials are included.
- GitHub source publication uses an explicit regular-file allowlist, including the lockfile and this report. The local publishing control manifest is not itself committed.
- Shared storage/route/tool identities are intentionally unchanged; do not enable the public package alongside the legacy local package.

This report records build/test preparation, not a successful npm publish, repository push, marketplace listing, or exhaustive real-provider image compatibility test. Install the Beta channel explicitly using `@sanmumu/dsh-bead-studio@beta` once it is published.
