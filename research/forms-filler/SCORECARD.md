# Forms Filler scorecard

Two benchmarks are in this folder. They are not the same measurement.

| | Parser fixture benchmark | End-to-end visual benchmark |
| --- | --- | --- |
| Version | visual-gold-1 | visual-e2e-1 |
| What the program read | The generator's `reference_text` string, plus a `geometry_trusted` flag | Pixels in an image-only PDF, through pdf.js and Tesseract in Chrome |
| Forms | Vector PDFs, including a copy labeled clean-scan or noisy | Raster pages with rotation, blur, and noise. No text layer |
| Held-out automatic fills | 112 correct out of 183 answerable fields on 32 forms. Wrong-fill 0. 95% upper bound 0.026 | 0 automatic fills. The gate stayed off |
| What it does not say | It does not establish a 2% wrong-fill gate, and it is not an OCR result | It does not establish reliability for OCR autofill |

Human edits, human time, phones, Safari, and Firefox were not measured in either benchmark.

## End-to-end visual benchmark (visual-e2e-1)

The parser benchmark fed the scorer two pieces of oracle data: the reference text the generator had just drawn, and a flag that marked a vector page "untrusted" without photographing it. The filler page never read that JSON. A native widget PDF was a real text-layer read. A file that only changed a flag was not an OCR test. That boundary is now explicit, and the visual benchmark does not use those inputs.

Committed files under [visual-e2e/fixtures](visual-e2e/fixtures) are image-only PDFs. A check of one development form with pdf.js returned 0 text items. The browser renders the page, deskews it, reads words with Tesseract (LSTM, English), and finds boxes from the ink. Role comes from an OCR'd heading such as `Applicant` or `Patient`, not from a column in the answer key. The answer key is applied only after the browser returns. `run-split.mjs` passes PDF bytes and the gate. It does not pass gold text, rotation, or a person id.

The gate was written in [visual-e2e/VISUAL-GATES.json](visual-e2e/VISUAL-GATES.json) before the held-out look. Identity autofill needs at least 59 calibration fills and a 95% upper bound of at most 0.05. Other types need 29 fills and a bound of at most 0.10. Zero errors on a smaller sample do not clear it. A 2% bound would need 149 zero-error fills. This set is not that large.

Calibration probe, 22 raster forms, types forced on so the error rate can be seen. This probe is not what the page ships.

| Kind | Automatic | Wrong | 95% upper | Minimum n | Enabled |
| --- | ---: | ---: | ---: | ---: | --- |
| name | 18 | 0 | 0.153 | 59 | no |
| date of birth | 9 | 0 | 0.283 | 59 | no |
| email | 18 | 3 | 0.377 | 29 | no |
| NRIC, phone, address, postal, mailbox | 0 | 0 | undefined | 29 or 59 | no |

Name had no wrong fill and no wrong-person fill. Eighteen fills are not enough, and the upper bound is 15.3%, above 5%. Email had three wrong fills. In those, Tesseract read a digit `1` as `l`. The page leaves OCR values as review. [FROZEN-e2e.json](visual-e2e/FROZEN-e2e.json) records that. [thresholds.js](../tools/forms-filler/thresholds.js) keeps `ocrAutofill` false. Text-layer autofill for the six types from the parser benchmark is unchanged, so a native widget PDF still fills.

Held-out look after the freeze, 14 raster forms, 79 answerable fields. The shipped gate wrote 0 automatic fills. Wrong-fill is undefined, not zero. Thirty-one values were review suggestions. Twenty-seven of those matched the answer key. Suggestion precision on this look is 0.871. That is not coverage and it was not used to turn a type on. The same OCR text scored with the old `fromText` mapper wrote 13 automatic fills, 9 correct and 4 wrong (wrong-fill 0.308, 0 wrong-person). Raw rows: [visual-e2e/results/test-score.json](visual-e2e/results/test-score.json) and [calibration-probe.json](visual-e2e/results/calibration-probe.json).

On the four development forms, which were not the held-out look, the probe placed 10 values and all 10 read back inside the detected box. That is a placement check on the development set. Held-out autofill placement was not measured, because the frozen gate exported none.

One native widget PDF, `test-claim_widget-00`, still goes through the text layer. Chrome 156 wrote six values. The name baseline was at x=182, y=764, in the name box. The mailbox stayed empty. A development raster, after OCR, showed a review list (`Nia Sample`, the NRIC, the date, the address, each with the OCR line). Leaving the boxes unchecked exported a PDF that did not contain that name. Screenshots: [raster-review.png](visual-e2e/results/screenshots/raster-review.png), [raster-skipped-export.png](visual-e2e/results/screenshots/raster-skipped-export.png), [native-text-layer-export.png](visual-e2e/results/screenshots/native-text-layer-export.png).

OCR assets and their sha256 are in [tools/forms-filler/vendor/tesseract/OCR-ASSETS.json](../tools/forms-filler/vendor/tesseract/OCR-ASSETS.json). pdf.js 3.11.174 and pdf-lib 1.17.1 are in [vendor/pdf/PDF-ASSETS.json](../tools/forms-filler/vendor/pdf/PDF-ASSETS.json). The core file requires WebAssembly SIMD. This run used Chrome 156.0.8078.47, Node v22.23.4, and Linux. No model was downloaded. A phone was not used.

## Parser fixture benchmark (visual-gold-1)

The numbers below were produced by the commands in [How to rerun](#how-to-rerun) on the committed vector fixtures. Read them as a text-and-widget selector test. The 112/183 figure is not a visual OCR result and does not establish a 2% gate.

Baseline behavior is `fromText` plus `mapFactsToFields` as published on commit `56ec0d8e83c67a87d756bebce807fec3eb7ec6f2`. The candidate selector, fixtures, and scored files were committed as `506b9106a1f996fc868e3b06738913d181e8cb38`. Types are turned on or off by [visual-gold/FROZEN.json](visual-gold/FROZEN.json). That file was written from the calibration split only. The test split was scored after the file existed.

Code in `tools/forms-filler/` and `visual-gold/*.mjs` is Apache-2.0. The generated forms, references, and gold JSONL are CC0, same as [FIXTURES-CC0.txt](FIXTURES-CC0.txt). No private document and no identity-card fixture is in this set.

## What is an automatic fill

| Decision | Written into the exported PDF without a click | Counted in wrong-fill |
| --- | --- | --- |
| `autofill` | Yes | Yes, the value is an automatic fill |
| `review` | No. The page lists it with the source line. It is exported only if that box is checked | No |
| `abstain` | No | No |

A review suggestion can be correct and still must not be called an automatic success. An all-blank run has no automatic fills. Its wrong-fill rate is undefined, not zero, and it is not a win.

## Formulas

Let a row be one field on one form.

- **Answerable.** The gold says this field has one legitimate value (`answerable: true` and a non-empty gold string). Conflicts, missing facts, and mailbox fields are not answerable.
- **Automatic fill.** `decision` is `autofill` and the value is non-empty.
- **Correct automatic fill.** Automatic, the normalized value equals that field's gold, the value is not another person's value, and the field is the right destination. A correct string in the wrong field is wrong.
- **Wrong automatic fill.** Every other automatic fill. This includes a wrong person, an unsupported value, a type error, and a wrong destination.
- **Correct-fill coverage** = correct automatic fills / answerable fields.
- **Wrong-fill rate** = wrong automatic fills / automatic fills. If there are no automatic fills, the rate is null.
- **Wrong-person count.** Automatic fills whose value matches another person's gold for that kind and not this field's gold. The rate uses automatic fills as the denominator. Identity kinds (name, NRIC, date of birth) are also reported alone.
- **Unsupported autofill rate** = automatic fills on fields that are not answerable / automatic fills.
- **Abstentions.** `decision` is `abstain`. They stay in the field count. They are not correct fills and they are not wrong fills.
- **Parse-failure fields.** Answerable fields on a reference that produced no facts. None of the committed references are empty, so this count is 0 here. They would count against coverage and would not count as correct abstentions.
- **Hard-gate violations.** Automatic fills that broke a hard rule (wrong person, or a type the selector itself marked as a hard block). Gate firings that stopped a fill are not violations.
- **Review suggestion precision** = review rows whose value would have matched gold / review rows. This is not coverage.
- **Per-form all-correct rate** = forms where every answerable field is a correct automatic fill / forms that have an answerable field. This is secondary. Fields inside one form are not independent samples. The form-level count is the clustered one.
- **Wrong-fill upper bound.** One-sided 95% Clopper-Pearson upper bound on the automatic-fill error rate. With zero errors in `n` fills it is `1 - 0.05^(1/n)`. It is a bound on this sample's rate, not a proof that the real rate is zero.

Human edits, human confirmation time, and a user study were **not measured**. Do not read a zero. The confirmation burden below is an automated proxy: review rows / all rows. Browser wall-clock times are automated Playwright timings on this machine.

## Worked synthetic example

These five rows are invented for the scorer test in [visual-gold/score.test.mjs](visual-gold/score.test.mjs). They are not a real form.

| Field | Gold | Decision | Value | How it counts |
| --- | --- | --- | --- | --- |
| name | Mina Fixture | autofill | Mina Fixture | Correct automatic fill |
| date of birth | 02/02/1992 | autofill | 01/01/1980 | Wrong automatic fill, and a wrong-person fill |
| mailbox | empty, not answerable | autofill | 10 NORTH QUAY | Wrong automatic fill, unsupported, and a wrong destination |
| email | mina.fixture@example.com | review | the same address | Not an automatic fill. The suggestion would have been correct |
| phone | 81234567 | abstain | empty | Not an automatic fill |

Answerable fields = 4. Automatic fills = 3. Correct = 1. Wrong = 2. Coverage = 1/4 = 0.25. Wrong-fill = 2/3. The mailbox error is also unsupported and a wrong destination. The date error is also a wrong-person error. Those categories overlap. Do not add the rates together. The review row is not in the wrong-fill denominator. One abstention is not a success.

## Overlap rules

1. Start from automatic fills only when computing wrong-fill, wrong-person rate, and unsupported rate.
2. Wrong-person fills are a subset of wrong fills.
3. Unsupported fills are a subset of wrong fills.
4. Wrong-destination fills are a subset of wrong fills.
5. One fill may sit in more than one subset.
6. Review rows and abstentions are outside those rates.
7. Coverage uses answerable fields, not automatic fills, so a cautious system can have a low wrong-fill rate and a low coverage at the same time.

## Splits

Seed `20261111`. Generator: [visual-gold/generate.mjs](visual-gold/generate.mjs).

| Split | Records | People | Template | Label family | Used for |
| --- | ---: | ---: | --- | --- | --- |
| development | 8 | 8 | desk_widget | D | Extractor tests only |
| calibration | 36 | 36 | gate_widget | C | Thresholds only |
| test | 32 | 16 | claim_widget | T | One look after the freeze |

No person id, template id, or label string is shared across splits. The v3 text test was not read. Test records 0–7 also have a `clean_scan` and a `noisy_photo` twin. Those twins share a person, so the form-level rates cluster on `template:person` via `cluster` in the gold. The field-level rates still count each row and are labeled as not independent.

`noisy_photo` in this set means the gold marks geometry untrusted. The PDF is the same vector drawing, not a camera photo. The node scorecard passes that flag and the generator's reference text into the selector. It is not an OCR accuracy test. The raster benchmark above is the OCR measurement.

Hashes of the gold files are in [visual-gold/MANIFEST.json](visual-gold/MANIFEST.json).

## Frozen gate

Written in [visual-gold/GATES.json](visual-gold/GATES.json) before the test look.

A kind is allowed to autofill only when, on calibration automatic fills for that kind:

- wrong fills = 0
- wrong-person fills = 0
- hard violations = 0
- the 95% upper bound is at most 0.10 for name, NRIC, and date of birth, and at most 0.15 for other kinds

Otherwise the kind stays review-only. Coverage is not used to loosen this. Zero observed errors with a bound above the cap stays review-only. The 2% figure from the text-model trial is not this gate.

[visual-gold/FROZEN.json](visual-gold/FROZEN.json) is the calibration result. Name, NRIC, date of birth, phone, email, and address passed. Postal and mailbox did not fire as automatic fills, so they stay off. The page copy is [tools/forms-filler/thresholds.js](../tools/forms-filler/thresholds.js).

## Held-out test, same cases

Source: [visual-gold/results/scorecard.json](visual-gold/results/scorecard.json). Row file: [visual-gold/results/decisions.jsonl](visual-gold/results/decisions.jsonl) and [decisions.csv](visual-gold/results/decisions.csv). Each row has the case id, field id, fact id, quote, gold, and decision.

| System | Answerable | Automatic | Correct | Wrong | Wrong person | Unsupported | Abstain | Review | Coverage | Wrong-fill | 95% upper | Forms all correct |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Candidate | 183 | 112 | 112 | 0 | 0 | 0 | 76 | 36 | 0.612 | 0 | 0.026 | 19/32 = 0.594 |
| Baseline | 183 | 156 | 144 | 12 | 7 | 5 | 68 | 0 | 0.787 | 0.077 | 0.122 | 0/32 = 0 |

Identity fields on the test split, candidate: 58 automatic fills, 0 wrong, 0 wrong person, coverage 0.637, upper bound 0.050. Other fields: 54 automatic, 0 wrong, coverage 0.587.

Layout breakout for the candidate:

| Layout | Answerable | Automatic | Correct | Wrong | Coverage | Wrong-fill |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| native_widget | 91 | 76 | 76 | 0 | 0.835 | 0 |
| clean_scan | 46 | 36 | 36 | 0 | 0.783 | 0 |
| noisy_photo | 46 | 0 | 0 | 0 | 0 | null |

The noisy rows are review or abstain because geometry is flagged untrusted. Coverage 0 there is incomplete coverage, not a blank-page victory. The 36 review suggestions on the test split would all have matched gold if someone confirmed them (`suggestionPrecision` 1 on this sample). They were not exported. That precision is not a safety proof. `n` for those suggestions is 36, and they were not in the calibration count that turned types on.

The baseline still writes 7 wrong-person values and 12 wrong automatic fills on these same rows, including on the noisy flag, because it does not look at role headings or geometry.

Calibration (not a second test): candidate coverage 0.853 on 204 answerable fields, 174 automatic fills, 0 wrong, upper bound 0.017. Baseline wrong-fill 0.087 with 6 wrong-person fills.

## Browser export

Two native test PDFs were filled in headless Chrome 156.0.8078.47 on this Linux machine with Playwright. No model was downloaded. Wall time was 1389 ms and 1089 ms. Those times are script time, not a person using the page.

On `test-claim_widget-00`, six values landed inside the widget boxes (`x` about 182, baseline `y` four points above the box bottom). None of the measured glyph widths exceeded the 250 point box. The PO mailbox box had no value. Detail: [visual-gold/results/browser-export.json](visual-gold/results/browser-export.json). Screenshots: [native-export.png](visual-gold/results/screenshots/native-export.png), [other-export.png](visual-gold/results/screenshots/other-export.png).

On `test-claim_widget-01` the reference also has another person. Only the claimant name was exported. The other person's name was not in the PDF. The remaining fields were left blank because their labels do not name a role.

Pixel clipping beyond glyph width, memory, and a phone were not measured. Safari, Firefox, iOS, Android, and WebGPU were not run.

## What the page does

Filled values are the automatic ones. Review values stay off the PDF until the checkbox on the form page is used. The text model is not asked, so nothing is downloaded for this path. Paper theme, the separate editor database, and adding or removing references are unchanged.

Postal codes and mailbox fields are review-only or abstain under the frozen gate. A date or name that belongs to a patient is not written into an applicant field unless the reference says the patient is the applicant. Two different applicant names abstain. An untrusted geometry flag forces review even when the string is eligible.

## How to rerun

From a fresh checkout, with Node 22 (this run used v22.23.4) and no API key:

```bash
cd research/forms-filler/visual-gold
npm install
node score.test.mjs
node calibrate.mjs
node score-all.mjs
node ../../tools/forms-filler/evidence.test.mjs
node ../../tools/forms-filler/facts.test.mjs
```

`npm install` downloads `pdf-lib@1.17.1` only if you regenerate PDFs (`node generate.mjs`). Scoring uses the committed JSONL and does not download a model.

Expected scorer line: `score tests ok`.

Expected calibration: `name`, `nric`, `dob`, `phone`, `email`, and `address` enabled, `postal` and `mailbox` not enabled.

Expected test print from `score-all.mjs`: candidate coverage about 0.612, wrong-fill 0, wrong-person 0, automatic 112; baseline wrong-fill about 0.077 and wrong-person 7.

Re-running `calibrate.mjs` rewrites `FROZEN.json` from the calibration file. Do not edit [GATES.json](visual-gold/GATES.json) after looking at [gold/test.jsonl](visual-gold/gold/test.jsonl).

The browser export is not part of `score-all.mjs`. It needs Chrome and the static files served from the repo root. This run used `http://127.0.0.1:8765` and Chrome 156.

### Replay the raster benchmark

From a checkout that already contains `visual-e2e/fixtures` and `visual-e2e/results`, the arithmetic does not need Chrome:

```bash
cd research/forms-filler/visual-e2e
node join.mjs calibration probe
node join.mjs test score
```

A fresh OCR run needs Chrome, a static server at the repo root, and the vendored files. It does not need a network if those files are present. `pdf-lib` for regenerating PDFs is pinned in `visual-e2e/package.json` at 1.17.1.

```bash
cd research/forms-filler/visual-e2e
npm install
python3 generate.py
node embed.mjs
# serve the repo root at http://127.0.0.1:8765
node run-split.mjs calibration probe
node calibrate-e2e.mjs
node run-split.mjs test score
```

`run-split.mjs test` exits if `FROZEN-e2e.json` is missing. Do not edit `VISUAL-GATES.json` after reading `gold/test.jsonl`. Regenerating the PDFs changes the pixels, so the committed `results/` would no longer match until you rerun OCR. The held-out numbers in this file are from the committed PDFs, not from a later regeneration.
