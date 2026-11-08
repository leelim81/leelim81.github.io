# Release readiness

This is a feature-by-feature reading of the current branch. It is not a claim that every form on the web can be filled, and it is not a speed claim. Scan autofill stays off. Nothing here was merged.

## Latest rerun

This section is the current head. The table and the paragraph under it are earlier passes, not this run.

An upright image-only PDF is no longer replaced by a turned picture. A spot from a private turned copy is mapped back onto the original page and offered only for review. A +5° raster produced an internal angle of −5.1°, and the email box contained the tilted rule within 8 points. A −5° raster produced +5.1° and the same containment. A level page stayed at angle 0. UserUnit 2, an offset crop, and a quarter turn kept the ledger path. Reference text did not autofill, and two people abstained. The checked export kept the original page text `ORIG-NEG`, left the unchecked name off, and the glyph was 0.0004 pt from the ledger origin. Record: `visual-e2e/PDF-RASTER-GEOMETRY.md`. `pdf-raster-geometry.mjs` 8 checks, 0 failed.

The same head also reran: coordinate ledger passed; `orientation.mjs` 6 checks, 0 failed (photo sheets still keep EXIF orientation); `assert_integrity.py` train 12, dev 4, test 6; `route-check.mjs` 5 routes matched, including the CC0 scan as `raster`; `recover-e2.mjs` 0 failed, 38 steps; `template-e3.mjs` 0 failed, 36 steps; `scan-transport.mjs` 0 failed, 16 checks; `frame-anchor.mjs` 0 failed, geometry still 0/13, food-order strict miss still 1 source pixel; `large-image.mjs` 14 checks, 0 failed; `e5-boundary.mjs` 15 checks, 0 failed; `profiles-gesture-e2e.mjs` 37 checks, 0 failed. Chrome’s Load unpacked picker was not clicked. No phone was used.

## Earlier passes

The table below sits on commit `98424a3a5590e7acdf7d51693868ba4eecf1d137`. The coordinate pass is later. Its parent is `084b4fa`. Chrome headless, pdf.js 3.11.174: 45 coordinate checks and the ledger corners passed, then `recover-e2.mjs` (0 failed, 38 steps) and `template-e3.mjs` (0 failed, 36 steps). Review transport of scan spots is recorded in `visual-e2e/SCAN-TRANSPORT.md`: 16 checks, 0 failed, on synthetic pages only. A ward-list page returned Phone and not City. That is one look, not a rate. A separate first look at eight archival blank pages is in `visual-e2e/NATURAL-PAPER.md`. It is development material, not an audit. A photo with no detected lines no longer says the form is ready, and Place a missing line opens the sheet instead of the raw JPEG. The same files were scored again through the deskew, including the 0.3° page: geometry 0/13, and the editor preview now uses the same top anchor as the export. The frozen name box was not widened. That earlier “between the two labels” reading is withdrawn in `NATURAL-PAPER.md`. The Surrey JPEG was later opened as a resource case: it is reduced from 4842×5964 to 1500×1848, with no lines found, and a header above that size or an edge of 32768 is refused before decode. See `visual-e2e/LARGE-IMAGE.md`. The food-order strict miss of 1 source pixel remains a miss. Chrome 156.0.8078.47 still does not deliver a folder picker after Load unpacked is clicked. That click was not repeated.

Proposed order, not performed: pull request 12, then 13, then 14.

## What is supported

A photo keeps the orientation from its EXIF tag. The line score does not turn that sheet. Native PDF widgets and text-layer pages are read without treating them as scans. An empty page is not sent through OCR. An upright scan can be reviewed. A rotated, cropped, or non-unit page does not get an automatic scan fill. When the coordinate ledger accepts the page, an unchanged detector may offer review-only spots that are fractions of the rendered view. A sideways view is not turned. A 45° page and a non-positive UserUnit are refused before the detector runs. A missed line can still be placed by hand on a quarter-turn, an offset crop, and a documented UserUnit. The place is a fraction of the rendered CropBox. A 45° page and a non-positive UserUnit stay refused. A blank map can reuse those places for another person on the exact same file, and it checks the stored rotation, crop, and scale. The extension, version 0.1.2, fills only checked fields for the role you choose, and it tells you the site can read those values before submit. Scan autofill stays off. The coordinate record is `visual-e2e/COORDS.md`.

## What was rerun on this commit

| Check | Result |
| --- | --- |
| Route: AcroForm, empty page, image-only page, IRS 4506-T, GSA SF 91 | Current rerun passed. Times are in `visual-e2e/results/route-check.json`. |
| Rotated and cropped scans refuse positions; native widgets remain | Current rerun passed inside `recover-e2.mjs` and `template-e3.mjs`. |
| Raster reference, confirm a correction, reload, second read, other person left pending | Current rerun passed inside `profiles-gesture-e2e.mjs`. 37 checks. The second Fill in that script reports fields left because they were already written. The first Fill’s values stayed. |
| Saved values collapsed, open, Escape, empty export, bad import, delete | Current rerun passed in that same script. |
| Manual placement, nudge, undo, export, multipage cancel | Current rerun passed in `recover-e2.mjs` and `template-e3.mjs`. |
| Blank map has no seeded person or value, reuse for the second person, mismatch, second Apply, Undo, delete, quota | Current rerun passed in `template-e3.mjs`. |
| Extension 0.1.2 shortcut, role preview, Fill, changed DOM, payment, unchecked phone, autosave, no submit, copy separation | Current rerun passed in `e5-boundary.mjs`. 15 checks. |
| Zip bytes match source, page link, and install note. No detector request | Current rerun passed. SHA-256 `0fe86e4845f8733037c7520df9f93582caae888e6d2af08a1c32ea1e55191080`. |
| Editor panels closed until asked, Escape cancels, narrow width | Current rerun passed in `release-ux.mjs`. |
| `assert_integrity.py` | Current rerun passed. Train 12, dev 4, test 6. |

## Historical only

| Record | Why it is not this commit |
| --- | --- |
| `profiles-gesture-e2e.json` | Extension 0.1.0. |
| `profiles-gesture-e2e-0.1.1.json` | Extension 0.1.1, before role and stale-field checks. |
| Frozen scan calibration and audit | Looked once earlier. Not retuned and not rerun as a new score. |
| E4 nano result | Rejected. Not part of the page. |

## Blocked or not tested

| Item | Why |
| --- | --- |
| Current Chrome stable, load unpacked | Chrome 156.0.8078.47 is installed. `chrome://extensions` opens and the Load unpacked control is in the page. Clicking it did not open a folder picker this environment can complete. The install was not finished. Chromium 131 with `--load-extension` is a different browser and a different path. |
| A phone | No phone was available. A 390px window is not a phone. |
| Scan autofill | Left off. |
| Every website, shadow tree, and frame | The extension counts open shadow and frames and does not fill them. Closed shadow is not visible to the scan. |

## Privacy of this diff

The new and changed fixtures in this pass use fictional labels and sentinel values. A search of the uncommitted diff found no cookies, private keys, or personal mail accounts. Older commits are not rewritten here. An older public GitHub history is a separate support concern and was not acted on.

## Commands

```bash
node research/forms-filler/visual-e2e/route-check.mjs
node research/forms-filler/visual-e2e/recover-e2.mjs
node research/forms-filler/visual-e2e/template-e3.mjs
node research/forms-filler/visual-e2e/e5-boundary.mjs
node research/forms-filler/profiles-gesture-e2e.mjs
node research/forms-filler/visual-e2e/release-ux.mjs
python3 research/forms-filler/scripts/assert_integrity.py
```
