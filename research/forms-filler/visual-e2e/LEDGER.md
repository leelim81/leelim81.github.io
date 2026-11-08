# Development ledger (visual-e2e)

Iteration is on development fixtures only. The holder-sheet split was already looked at, so it is a regression set and was not scored again. Gates in `VISUAL-GATES.json` were not loosened. OCR autofill stays off.

Numbers are probe scores: every type is forced on so a wrong fill can be seen. The page does not ship that probe. It still asks before writing an OCR value.

## Baseline, before this ledger

Boxed intake sheets, four forms, 22 answerable fields. Commit `01e4230`.

| | Value |
| --- | --- |
| Fields found | 4, 3, 4, 4 of 7 |
| Correct automatic fills | 10 |
| Wrong automatic fills | 0 |
| Coverage | 0.455 |
| Time | about 12 s per form in Chrome 156 |

The reference text was mostly right. Three labels never became fields: handset, inbox, mailbox.

## Kept: field labels the selector already understands

| | |
| --- | --- |
| Error class | Missing fields. `keepSlot` ignored handset, inbox, and mailbox. |
| Hypothesis | Those words are already field types in `evidence.js`. Letting the line detector keep them will recover phone, email, and mailbox rows. |
| Change | `spots.js` `keepSlot` accepts handset, callback, mobile, inbox, mailbox, premises, dwelling, identity, and identification. |
| Dev result | Same four forms: 7, 6, 7, 7 fields. 16 correct, 0 wrong, 0 wrong-person. Coverage 0.727. All 16 painted values read back inside the detected box. Time still about 12 s. |
| Why kept | Six more correct fills and no new wrong fill. The six remaining misses are the two-person form, whose labels do not say Member or Applicant, so the hard role check abstains. |
| Browser | The review list for `development-intake_sheet-00` now offers name, NRIC, date, phone, email, and address, each with its OCR line. Nothing is written until a box is checked. Native `test-claim_widget-00` still exports Asha Fixture and not another person. |

## Rejected: make the digit 1 by editing the string

| | |
| --- | --- |
| Error class | `suki.sample1@example.com` and `otto.sample1@example.com` were read as `samplel`. A 4× crop of the glyph is a digit 1. |
| Tried | Render scale 3. Binarize at 140 and 180. Page modes 6, 7, and 11. Turn the English word lists off. |
| Result | Every full-word read still said `samplel`, confidence about 89. Scale 3 was not slower in a useful way and did not help. |
| Why rejected | Replacing `l` with `1` would be a guess. The word lists were not the cause. |

## Kept: drop an email when a second read of the same glyph disagrees

| | |
| --- | --- |
| Error class | The same `samplel` error. Isolated, the glyph before `@` read as `1` four times and `T` once. It never read as `l`. `sample0`, `sample3`, and the `1` in `sample21` reread as themselves. |
| Hypothesis | If the single-glyph read disagrees, the email is ambiguous. Drop it. Do not write the second read in its place. |
| Change | `extract.js` crops the character box before `@` and runs one single-character recognition. Disagreement blanks that email. |
| Dev result | Boxed sheets stayed 16 correct and 0 wrong, including three correct emails. Underline sheets: the wrong `samplel` fill disappeared (14 automatic and 1 wrong became 13 automatic and 0 wrong). `tess.sample21` and `wynn.sample23` stayed. Added time was a few milliseconds per email. |
| Why kept | A wrong suggestion was removed and correct emails stayed. The second read is not copied into the form, because it once said `T`. |
| Browser | On `development-stack-00` the review list has the name, NRIC, date, phone, and address. It does not contain `samplel` or `sample1`. |

## Rejected as a layout to rely on: underlines at a small rotation

| | |
| --- | --- |
| Setup | New development template `member_stack`, four forms, labels above a line, people Suki, Tess, Ulf, and Wynn. Not a rerun of the old held-out. |
| Result | Rotation −1.2° found 7 of 7 fields. −0.4° found 6. +0.4° found 1. +1.2° found 3. Reference OCR still read the paragraphs. The role word Member filled the applicant, not Kim. |
| Why not a reader change | Short rotated underlines disappear after deskew. Changing the line detector to invent those rows could add false fields on other forms. The boxed sheets are the layout that stayed stable. |

## Not taken

OCR autofill stays off. Eighteen name fills on the earlier calibration were already below the minimum of 59, and this round did not create a new calibration or a new held-out. The old holder-sheet numbers were not used to choose these changes.

## Rejected: bridge six-pixel gaps in horizontal rules

| | |
| --- | --- |
| Error class | Rotated underlines. Before this try, `development-stack` found 7, 6, 1, and 3 fields. |
| Hypothesis | Allowing a six-pixel gap inside a horizontal ink run would reconnect a rotated underline after deskew. |
| Change | `rasterGeometry` treated up to six white pixels as part of the same run, and lowered the dark-pixel fraction from 0.6 to 0.45. |
| Dev result | Underlines rose to 7, 7, 4, and 3 fields. Probe coverage on that set went from 13/22 to 17/22, still 0 wrong. The original four boxed sheets fell from 16/22 to 12/22 correct, also 0 wrong. Time stayed about 12 s. |
| Why rejected | The boxed development set got worse. The change was reverted. The holder-sheet split was not scored. |

## Kept: a separate long-rule detector on the already deskewed page

| | |
| --- | --- |
| Error class | Rotated underlines. The shared ink mask still missed them. The six-pixel gap bridge was not put back. |
| Hypothesis | Rules longer than 45% of the page width can be found with their own contrast test, including an eight-pixel bridge only inside that test. A label sitting just above the rule can add a field whose kind is not already present. Boxed edges on the intake sheets are shorter, so they stay on the old mask. |
| Change | `underlineRules` in `fields.js`. `rasterGeometry` is unchanged. |
| Dev result | Underline sheets: fields 7, 6, 4, 7 (was 7, 6, 1, 3). Correct probe fills 19/22, was 13/22. Wrong 0. Wrong-person 0. All 19 painted values sat inside the detected rule. Boxed intake sheets stayed 16/22 correct, 0 wrong, same 7, 6, 7, 7 fields. Native `development-desk_widget-00` is still an AcroForm with 7 widgets. `spots.test.mjs` still finds 6 fields. About 12 s per form. |
| Why kept | The gain is on the underline set only. Identity gates and the boxed path did not move. Autofill stays off. The holder-sheet split was not scored. |

## Kept, with a correction: geometry dedup, not kind dedup

The 19/22 underline figure dropped a second field when that kind was already present. That hides a second person or a second phone. The rule now skips a line only when an existing field already occupies it, or when the same label text already sits on that line. Two different labels of the same kind both stay. Two known labels on one line, or two stacked labels of the same kind, add nothing.

| Set | Correct | Wrong | Wrong person |
| --- | ---: | ---: | ---: |
| Underline development, kind dedup (previous commit) | 19/22 | 0 | 0 |
| Underline development, geometry dedup | 18/22 | 0 | 0 |
| Boxed intake development | 16/22 | 0 | 0 |

New development sheets, not used to move the 45% cutoff:

| Sheet | Candidates | Wrong association | What was left out |
| --- | ---: | ---: | --- |
| Repeated roles, long rules | 3 | 0 | Applicant name was not detected. Patient name and both phones stayed. The miss is geometry, not a role swap. |
| Two columns, each rule under 45% of the width | 3 | 0 | Applicant name. No column swap. |
| Narrow rules | 0 | 0 | All three. The long-rule path abstains. |
| Box next to a long rule | 2 | 0 | Nothing. |
| Two labels on one rule | 0 | 0 | The rule stayed empty. |

`node research/forms-filler/visual-e2e/geometry-check.mjs` reads those PDFs. `python3 generate.py geometry` rewrites the PNGs from seed 20261141. Autofill stays off. The holder-sheet split was not scored.

## Ran once: PP-OCRv6 tiny, not installed

`@paddleocr/paddleocr-js` 0.4.2, Apache-2.0. Models `PP-OCRv6_tiny_det` and `PP-OCRv6_tiny_rec`, 1,792,000 and 4,526,080 bytes, sha256 in `results/paddle-tiny-dev.json`. The app does not download them.

The worker was asked for WASM and `numThreads: 1`. It fetched `ort-wasm-simd-threaded.jsep.wasm`, 25,014,754 bytes. ONNX Runtime Web 1.24.3 does not publish a non-threaded `ort-wasm-simd.wasm`. The 12,361,745-byte non-JSEP file was not used. SharedArrayBuffer was available because this trial server sent `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`. That is a requirement of this threaded build, not a claim that every WASM file needs isolation. Cold localhost responses were 54,140,625 bytes, including the 11,341,486-byte worker. Startup was 1,070 ms. Full-page predict times were 1,544, 909, and 968 ms. A crop of the same reference was 397 ms. Tesseract on those same images was 1,060, 503, 572, and 251 ms.

Chrome RSS peaked at 1,799,744 KB. That sum includes the browser and its other processes. `usedJSHeapSize` went from 186,498,489 to 193,182,737 after `dispose()` and does not include WASM linear memory. The heap not returning to the start is not proof the model stayed allocated. A phone was not tested. Paddle stays out of the app.

On `development-stack-00` the printed email is `suki.sample1@example.com`. Paddle read `sample1`. Tesseract read `samplel`. The disagreement stays a review flag. It is not a vote and it does not enable OCR autofill. Paddle's polygons are text lines, not blank fields.

## Rejected: dictionary flags at worker creation

Tesseract.js 5.1.1 passes the fourth `createWorker` argument to `Init`. `setParameters` prints a warning and does not apply `load_system_dawg` or the other `*_INIT_MEMBER` flags. This run set those flags in the init config, one worker at a time.

| Image | Dictionaries on | Dictionaries off |
| --- | --- | --- |
| `development-stack-00` reference | `suki.samplel@example.com` | `suki.samplel@example.com` |
| Email line crop of that page | `suki.samplel@example.com` | `suki.samplel@example.com` |
| Drawn line `sample1@example.com` | `samplel@example.com` | `samplel@example.com` |
| Drawn `S2000346D`, `+65 80000020`, `21/09/1990`, `O'Neil, Jr.` | unchanged | unchanged |

About 720 ms for the three reads. The production worker is unchanged. Raw text is `results/dict-init.json`. Rerun: `node research/forms-filler/visual-e2e/dict-trial.mjs`.

## Kept: a headed person keeps their own values

`FormFacts.fromText` used to return the first full name in the file. A patient block before the applicant became the saved name. It now uses the heading. One applicant name is kept. Two applicant names set `conflict` and no name. A spouse, witness, guardian, parent, sibling, or doctor heading does not become the applicant. `FormEvidence.extract` records `start` and `end` offsets. The quote slice is the value. Unknown keys such as `Favorite color` are not facts. Repeated applicant phones conflict. The fill path already abstained on two applicant names. Profiles still put the other person in `pending` and do not create a profile when two applicant names disagree.

The missing applicant name on the repeated-role and two-column sheets is `not_detected` in `results/development-geometry.json`. That label is a dev oracle, not a production score. The role checks did not swap the people who were detected.

## Where this stops

| Option | Evidence | Cost | Decision |
| --- | --- | --- | --- |
| Move the 45% line cutoff | Would be fitted to these 22 answers. The earlier global gap bridge hurt boxed forms. | Low, and the boxed path moves with it. | Stop. |
| Dictionary init flags | On and off matched, including the `1`/`l` email. | One browser run. Done. | Stop. |
| Turn Paddle on by default | Correct digit on one email. 54,140,625 bytes, slower than Tesseract, about 1.8 GB Chrome RSS. | Large runtime. | Keep dev-only. |
| A larger model | Not measured. | Download and memory above this batch. | Out of scope. |
| New disjoint family, then one held-out look | Needed before any fresh test. The holder sheets were already seen. Same-template copies are not new samples. | A frozen family and a protocol, then one look. | Next scope choice, not this batch. |

Development frontier after this batch: underline sheets 18/22 correct, boxed sheets 16/22 correct, 0 wrong, 0 wrong-person. OCR autofill stays off. Synthetic pages and a desktop browser do not establish broad reliability. A phone was not tested.

## What can be qualified while scan autofill is off

Native AcroForm reading and filling is the existing path. This batch did not change it. `spots.test.mjs` still finds 6 fields. OCR suggestions stay review-only. The profile store keeps confirmed corrections, sends another person to pending, and does not treat a signature as a fact. The extension package is still `forms-filler-profiles-0.1.0.zip` because those sources did not change.

Pull request 13 depends on pull request 12. Neither is a release merge. The one audit family and the stopping point are in [../FRONTIER.md](../FRONTIER.md). That family has been looked at. It is a regression set. The holder-sheet split stays unscored.
