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

The numbers in this table are the first published ones. Recall used 32 because two wrong-kind overlaps were left out of both the true and the missed counts. The gold file has 34 eligible fields. The comparable figures are in [DENOMINATORS.md](DENOMINATORS.md) and in the later table: baseline 6/34, stroke result 27/34.

| | Baseline, as first published | After strokes, as first published |
| --- | ---: | ---: |
| True field candidates | 6 | 27 |
| False candidates | 4 | 2 |
| Missed gold fields | 26 | 7 |
| Precision | 0.60 | 0.93 |
| Recall | 0.19 on the published 32 | 0.79 on 34 |
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

## Placement, same denominator

The audit row above is the historical one-look. It is not reopened as a pass. The five above-label suggestions had the right strings and the wrong rules. Each caption is drawn under its own line, and the matcher only looked above a line, so every caption stuck to the next line. Page rotation was 0, deskew was 0, and the view box origin was 0. It was not a CropBox or deskew shift. A right value on the wrong line is a wrong place.

Eligible gold on scan-dev is 34 fields whose kind is not `other`. The first published recall used 6 true positives over 32, because two gold fields overlapped a detection of the wrong kind and dropped out of both the true and the missed counts. On this definition that baseline is 6/34 recall and 6/10 precision. The stroke result was already 27/34. Count notes: `DENOMINATORS.md`.

A caption now stays with the nearer rule. Development, same gold, Chrome: `results/scan-dev-e1.json`.

| | Baseline, this definition | Stroke result | After nearer-rule |
| --- | ---: | ---: | ---: |
| True / false / missed | 6 / 4 / 28 | 27 / 2 / 7 | 28 / 2 / 6 |
| Precision | 0.60 | 0.93 | 0.93 |
| Recall | 0.18 | 0.79 | 0.82 |
| Automatic fills correct / wrong | 6 / 0 | 6 / 0 | 6 / 0 |
| Review on the gold rectangle | not scored this way | not scored this way | 19 |
| Right value, wrong rectangle | not scored this way | not scored this way | 1 |

The one wrong rectangle is the serif page: one suggestion matches a value and misses every gold box. The six automatic fills are still the native and vector pages. OCR autofill stays off.

On the already-viewed above-label page, the five rules now sit on their own gold lines, about 4 points above the gold box, with deskew 0. That file had already been read. It is a regression check, not a new audit, and the margin page was not re-qualified. Green boxes in `results/screenshots/placement-above-label.png` are gold. Red boxes are the detector.

Export of a drawn string comes back within 1 point on an unrotated page whose crop is the page. A 90 degree page and a CropBox that starts at (20, 20) were recorded in `results/placement-e1.json`. The installed pdf.js viewport did not expose `userUnit`. Raster export rebuilds a page from the rendered view, so a crop offset is not preserved as MediaBox coordinates. These fixtures do not use that case. Timings in the score files are script wall clocks, not observed human use. No phone was tested.

`node research/forms-filler/visual-e2e/placement-e1.mjs` reruns the round trip and the viewed above-label check. `node research/forms-filler/visual-e2e/scan-score.mjs scan-dev e1` reruns development only.

## Placement holdout, one look

The caption rule and the page-frame gate were hashed in `PLACE-FREEZE.json` before this look. The people are Eden Moss and Lars Moss. The street is MYRTLE ROW. None of those were in the Grove, Fenn, or Bent sets. Three forms, five answerable fields each. That is a small sample, not a reliability rate. OCR autofill stayed off. A matching value counted only on its own gold rectangle. Export text came back on the same point it was drawn. Raw file: `results/place-holdout-once.json`.

| Form | Result |
| --- | --- |
| Labels above the line | 5 placed, 0 wrong place, 0 missed |
| Labels under the line | 5 placed, 0 wrong place, 0 missed |
| Mixed above and under | 5 placed, 0 wrong place, 0 missed |
| Same sheet rotated 90 degrees | No positions. The page says to place values by hand |
| Same sheet with an offset crop | No positions |
| Same sheet with page scale 2 | No positions |
| Native widgets, including a rotated page | The widgets are still returned |

A rotated or cropped scan, or a page whose scale is not 1, no longer produces line suggestions. The installed pdf.js page object does expose `userUnit`. When that value is missing, the scan is also refused rather than given a guessed scale. Native widgets are not refused. `app.js` was adjusted after the look so the explanation is not replaced by “Form ready.” The detector was not edited again and the holdout was not re-run.

## Optional nano detector

A browser run of the pinned Nutrient nano checkpoint is in [e4/README.md](e4/README.md). It is not on the product page. The preregistered gate failed, so it was not adopted. Thresholds were not refit.

## Exact blank maps

A saved map is places and keys for one role on one exact file. It does not keep the person or the values. Notes: [MAPS.md](MAPS.md). Switching pages cancels an armed placement. The detector was not retuned.

## Missed-line placement

A confirmed saved value can be placed in Edit and Sign when the reader misses a line. It is not an automatic fill. A later pass places that value on a quarter-turn, an offset crop, and a documented UserUnit. The scan still offers no positions on those pages. Notes are in [RECOVER.md](RECOVER.md) and [COORDS.md](COORDS.md). The detector was not retuned.

## Extension 0.1.1

The 32 headed checks stay in `results/profiles-gesture-e2e.json` and belong to zip 0.1.0. Zip 0.1.1 was checked on its own: 37 checks, 0 failed, Chromium 131.0.6778.33, not current Chrome stable, no phone. The file is `results/profiles-gesture-e2e-0.1.1.json`. SHA-256 `09cee1247b6f86d3c96b3f383e7ae9f8d4da73bd64f467a9425f88af29468964`. The zip matches the extension source. Fill tells the person the website receives the checked values immediately and that the page is not submitted. Screenshots for this run use the `v011-` prefix.
