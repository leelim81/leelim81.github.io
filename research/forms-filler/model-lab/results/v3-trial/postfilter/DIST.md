Distribution copy of the production postfilter runner at commit 9c2d5b8.

`facts.js`, `llm.js`, `sanitize.js`, and `app.js` are byte-identical to that commit. Their hashes are in `VERSION`.

`facts.test.mjs` is the repository synthetic demo card, sha256 `5af8e8e2cd3a017ad9f30825932ddd69b919b0302f6afc4dc733abeaf60ab2b3`. `postfilter.mjs` expects that hash. The self-check runs this file.

The original test file at 9c2d5b8 contained a personal identity-card fixture. Its hash, `39ab2a6a85be943c00196ae6820062dc2241821dc1c5174f8674ec76e46db08c`, stays in `VERSION` as a record only. Do not restore that file. An intermediate copy still had one personal alias line and was not published.

The measurements used this same filter code. The test-file swap does not change `rowsFrom`, `prepareModelValue`, or `allowModelValue`.
