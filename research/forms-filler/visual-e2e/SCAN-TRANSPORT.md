# Review transport of scan spots

Hypothesis: an unchanged line detector can offer review-only spots on pages whose metadata the coordinate ledger already accepts, if the spot is a fraction of the rendered view and not a pixel treated as a PDF point.

Parent `dc1fdcb`. Scan autofill stays off. Line thresholds, the recognizer, and the person gates were not edited. Prior viewed audits were not re-scored.

## Gates, fixed before the fresh look

A page may be transported only when the ledger accepts it: rotation 0, 90, 180, or 270, a finite CropBox with positive width and height, and a file UserUnit in `(0, 75000]` that matches what pdf.js 3.11.174 reports.

These stay refused before the detector runs:

| Case | Why |
| --- | --- |
| Rotation other than a quarter turn | The ledger has no inverse. |
| UserUnit missing, non-positive, or different from the reader | A zero UserUnit used to be reported as 1. It is now refused. |
| Crop width or height not positive | No view to measure. |

If the ledger accepts the page, the existing detector runs on the pdf.js viewport at scale 2. If `bestLineAngle` is not 0, the page is sideways in that view. It is not turned. If the detector returns no spot, nothing is invented. Both cases keep the manual fallback.

An upright page whose crop equals the media box and whose UserUnit is 1 stays on the old raster path, including its own small deskew. Native widgets stay on the AcroForm path.

Transported spots are marked `viewport-review`. A text-layer reference cannot autofill them. The person gate is unchanged: two roles on an unspecified line abstain.

## Baseline, before this change

Same gold drawing. Chrome headless. The detector was not started on the blocked pages except UserUnit 0.

| Page | Time | Result |
| --- | --- | --- |
| Upright | 2445 ms | Raster. Labels Email and Name. |
| Rotation 90 | 254 ms | Refused. No spots. |
| Offset crop | 245 ms | Refused. No spots. |
| UserUnit 2 | 246 ms | Refused. No spots. |
| Rotation 45 | 244 ms | Refused. No spots. |
| UserUnit 0 | 2378 ms | Not refused. pdf.js reported 1, and the detector returned 2 spots. |

## Result

Chrome headless. 16 checks, 0 failed. Raw file: `results/scan-transport.json`. Times below are script wall clocks for these pages, not a reliability rate.

| Page | Time | Result |
| --- | --- | --- |
| Upright unit | 2385 ms | Still `raster`. Email above Name. Not marked for transport. |
| UserUnit 2 | 1919 ms | `raster-review`. Email above Name. |
| Offset crop (36, 44) | 1893 ms | `raster-review`. Email above Name. |
| View-upright 90° | 1884 ms | `raster-review`. Email above Name. The image was drawn so the rendered view is upright. |
| Sideways 90° | 1513 ms | No spot. The page was not turned. |
| Rotation 45 | 357 ms | Refused before the detector. |
| UserUnit 0 | 356 ms | Refused before the detector. |
| One native widget | — | Route `acro`. One field. No scan estimate. |
| Applicant plus spouse | — | Both lines abstain. Bea’s email is not offered. |

The checked review carried only `ada.gold@example.com`. The name line stayed blank. The stored fraction matched `convertToPdfPoint` with corner error 0. The export text origin was 0.0002 by 0.0003 user units from the ledger point, and that point was nearer the email rule than the name rule. User units here are the PDF’s default user space, not pixels and not a success rate.

A second layout, drawn once, is not a variant of the gold form. It is a ward list: Phone with a rule underneath, City with a rule above it, on an offset crop. The detector returned Phone and did not return City. No threshold was changed. That one miss is not coverage.

The existing Moss rasters were read as a regression of those files, not as a new audit. The turned page produced no spot in 2355 ms and was not rotated to force a reading. The cropped page produced one review label, “MOSS applicant email”, in 1773 ms. That label was not scored against a drawn rule, so it is not counted as a correct placement.

Manual placement was rerun after this change: the coordinate ledger, `coords-manual.mjs`, `recover-e2.mjs`, and `template-e3.mjs` passed. The extension zip was not changed.

## Rights

The forms are synthetic drawings made in the test. The reference says Applicant, `ada.gold@example.com`, and Ada Gold. No private upload and no camera photo. SHA-256 values are in `results/scan-transport.json`.

Screenshots: `results/screenshots/scan-review-estimates.png` and `results/screenshots/scan-review-export.png`.

## Not claimed

This does not say how often a scan line is right. A sideways page with unreadable text stays a manual placement. Chrome 156.0.8078.47 still does not deliver a folder picker after Load unpacked; that click was not repeated. A 390px window is not a phone. No phone was used.
