# Visual gold scorecard (version visual-gold-1)

This page is the replication guide for the evidence selector in Forms Filler. The numbers below were produced by the commands in [How to rerun](#how-to-rerun) on the committed fixtures. It is a text-and-widget benchmark on synthetic forms. It is not a camera study, not a browser-model study, and not a statement that a fill is safe for a real person.

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

`noisy_photo` in this set means the gold marks geometry untrusted. The PDF is the same vector drawing, not a camera photo. The node scorecard is evidence selection given fields and reference text. It is not an OCR accuracy test.

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
