# Scan-family stage

The narrow-template stop in [../FRONTIER.md](../FRONTIER.md) stays history. This file is the next stage. OCR autofill is still off. Calibration and audit were each read once after the detector freeze.

## Families

`scan-generate.mjs` builds three splits. A layout name cannot appear in two splits. People and streets do not repeat the intake, stack, holder, or quill sets.

| Split | Layouts | Status |
| --- | --- | --- |
| scan-dev | under, columns, table, beside, boxes, native, vector | Read while changing the detector. |
| scan-cal | row, ladder | Read once after the freeze. |
| scan-audit | margin, above | Read once after the freeze. |

`node research/forms-filler/visual-e2e/scan-score.mjs` refuses every split except `scan-dev`.

## Development result

Chrome, shipped gates. Baseline file: `results/scan-dev-baseline.json`. After the stroke change: `results/scan-dev-strokes.json`.

The deskew search was locking onto −6° whenever no long rule existed, because a zero score at the first angle beat the initial −1. It now stays upright unless a rotated long rule scores higher than the upright page. Thin strokes of at least 80px with paper immediately above and below are extra candidates. That length is the measured underline on the narrow Grove page (about 170px), not a fraction of the page. Intake box edges do not pass that test. A label may also sit just to the left of a stroke.

| | Baseline | After |
| --- | ---: | ---: |
| True field candidates | 6 | 27 |
| False candidates | 4 | 2 |
| Missed gold fields | 26 | 7 |
| Precision | 0.60 | 0.93 |
| Recall | 0.19 | 0.79 |
| Exact label text | 6 | 25 |
| Correct automatic fills | 6 | 6 |
| Wrong fills | 0 | 0 |
| Review suggestions that matched | 2 | 19 |
| Answerable fields with no suggestion | 22 | 5 |

The six automatic fills are still the native and vector pages. Raster matches are review, because OCR autofill is off. Boxed intake stayed 16/22 correct and 0 wrong. The older underline development set moved from 18/22 to 20/22 correct, still 0 wrong. Serif-and-skew, the far-right margin, and the horizontal row of boxes remain mostly missed.

## One look after the freeze

`scan-score.mjs --once` checked the hashes, then read each unread split once. Both are now marked looked in `SCAN-FREEZE.json`.

| Split | Precision | Recall | Wrong fills | Review matched | Notes |
| --- | ---: | ---: | ---: | ---: | --- |
| Calibration | 1.00 (5/5) | 0.63 (5/8) | 0 | 5/5 | The ladder matched. The horizontal row was missed. |
| Audit | 0 (0/5) | 0 (0/6) | 0 | 5/5 | The margin layout was missed. The above-the-label page produced five suggestions that matched the reference values, and none of those boxes overlapped the gold rectangles. |

No detector change was made after these numbers. They do not turn autofill on. Eight answerable fields per split is not a risk bound.

## Routing

A page with positioned text is not sent to OCR just because it has fewer than four detected lines. A page with no text and no image is empty and is not OCR'd. An image-only page is the scan path.

Checked in Chrome, `results/route-check.json`:

| File | Route | Time | Notes |
| --- | --- | ---: | --- |
| CC0 AcroForm | acro | 174 ms | 5 widgets |
| CC0 blank page | empty | 123 ms | Was about 2.8 s when it fell through to OCR |
| CC0 image-only PDF | raster | 8.1 s | No text items. OCR found no fields |
| IRS 4506-T | acro | 1.9 s | 28 widgets. Taxpayer name, both identity-number lines, the spouse line, and both address lines |
| GSA SF 91 | acro | 2.7 s | 178 widgets |

The federal PDFs are not in git. `PUBLIC-FORMS.json` has the official URL, byte size, and SHA-256. VA forms are not fetched and not vendored. The three CC0 files are in `fixtures/cc0/` with `RIGHTS.md`.

A page upload of `grove-native` saved Willa Grove and left Hugo Grove pending as the patient (`results/scan-page.json`). Headed Chromium 131 opened the extension with Ctrl+Shift+Y, filled the empty fields, left secrets and the nonempty email alone, did not submit, kept a confirmed correction across a second read, and left the two-name reference unfiled. A second Activate shortcut in that same session did not open another popup.

## Development baseline

Chrome, shipped gates, one pass before the stroke change. Raw file: `results/scan-dev-baseline.json`.

| | |
| --- | ---: |
| Candidate fields, true positive / false positive / missed | 6 / 4 / 26 |
| Precision | 0.60 |
| Recall | 0.19 |
| Answerable fields | 30 |
| Correct automatic fills | 6 |
| Wrong fills | 0 |
| Review suggestions that matched | 2 |

The six correct fills are the native widgets and the vector lines. The new raster layouts (short rules, two columns, a table, a line beside the label, small boxes, a serif page) were mostly missed. A label-anchored line test was tried on those pages and removed: the OCR tokens split the labels, and loosening the local contrast did not raise recall without dropping fields again. The 45% page-width rule was not changed.

## Routing

A page with positioned text is not sent to OCR just because it has fewer than four detected lines. A page with no text and no image is empty and is not OCR'd. An image-only page is the scan path.

Checked in Chrome, `results/route-check.json`:

| File | Route | Time | Notes |
| --- | --- | ---: | --- |
| CC0 AcroForm | acro | 177 ms | 5 widgets, labels from the field names |
| CC0 blank page | empty | 122 ms | Was about 2.8 s when it fell through to OCR |
| CC0 image-only PDF | raster | 9.0 s | No text items. OCR ran and found no fields |
| IRS 4506-T | acro | 1.9 s | 28 widgets. Not a scan. Labels include the taxpayer name, both social-security lines, the spouse line, and both address lines |
| GSA SF 91 | acro | 2.8 s | 178 widgets. Not a scan |

The federal PDFs are not in git. `PUBLIC-FORMS.json` has the official URL, byte size, and SHA-256. `node research/forms-filler/visual-e2e/fetch-public-form.mjs irs-4506t out.pdf` checks the hash and does not print response headers. VA forms are not fetched and not vendored. The three CC0 files are in `fixtures/cc0/` with `RIGHTS.md`. US public-domain status is not stated as a worldwide license.

Widget rectangles on 4506-T and SF 91 are real, and many field names are technical. Nearby text supplies some labels. Those names are not gold for who a value belongs to. No fictional reference was filled into these blanks in this pass, so there is no fill-accuracy number for them.
