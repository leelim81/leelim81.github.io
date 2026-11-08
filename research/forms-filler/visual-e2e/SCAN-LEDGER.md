# Scan-family stage

The narrow-template stop in [../FRONTIER.md](../FRONTIER.md) stays history. This file is the next stage. OCR autofill is still off. Calibration and audit pages in `SCAN-FREEZE.json` have not been read.

## Families

`scan-generate.mjs` builds three splits. A layout name cannot appear in two splits. People and streets do not repeat the intake, stack, holder, or quill sets.

| Split | Layouts | Status |
| --- | --- | --- |
| scan-dev | under, columns, table, beside, boxes, native, vector | Read. Baseline below. |
| scan-cal | row, ladder | Unread. |
| scan-audit | margin, above | Unread. |

`node research/forms-filler/visual-e2e/scan-score.mjs` refuses every split except `scan-dev`.

## Development baseline

Chrome, shipped gates, one pass. Raw file: `results/scan-dev-baseline.json`.

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
