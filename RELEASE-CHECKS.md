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

## Source-only line-ending correction — 2026-11-17

A Windows checkout with `core.autocrlf` exposed a build-source defect: the PDF import removal expected LF and could leave an import inside the generated client function when input used CRLF. The published runtime was built from LF sources and is unaffected.

- Every build text read now normalizes CRLF and bare CR to LF, including the generated core and Host copies. `.gitattributes` fixes repository text line endings to LF.
- `build.test.mjs` creates its own temporary directory, supplies LF, CRLF and bare-CR inputs, runs the builder, checks all three runtime outputs with `node --check`, and compares them with the normal published outputs. Cleanup verifies the real path is the exact directory it created.
- Full regression: **228 tests, 228 passed, 0 failed, 0 cancelled, 0 skipped**. The added regression is included in the existing test command.
- This correction only changes build/test/repository attributes and this report; package metadata, README, dependency lock and runtime code are unchanged. No new npm runtime release is required for this source-only fix.
- Unchanged runtime SHA-256 values:
  - `client.js`: `8E67BAFA557830821E63FF9BDAF14F0B46692EF37A72C327C542D173AF56D130`
  - `core-v2.js`: `DB2F406F333A99C3A716174B90242605857CDB07E23989A2247841CDFD211BB6`
  - `host-v4.js`: `90614EF67EF42648A445C1B9AC152AF66BF20D6AC93CE010DA7D8DD7F0D6C767`

