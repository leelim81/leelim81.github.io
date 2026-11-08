# Release readiness

This is a feature-by-feature reading of the current branch. It is not a claim that every form on the web can be filled, and it is not a speed claim. Scan autofill stays off. Nothing here was merged.

The rerun above sits on commit `98424a3a5590e7acdf7d51693868ba4eecf1d137`. This note is the commit on top of that.

Proposed order, not performed: pull request 12, then 13, then 14.

## What is supported

Native PDF widgets and text-layer pages are read without treating them as scans. An empty page is not sent through OCR. An upright scan can be reviewed. A rotated, cropped, or non-unit page does not get scan positions; the editor can still open it. A missed line can be placed from a confirmed saved value. A blank map can reuse those places for another person on the exact same file. The extension, version 0.1.2, fills only checked fields for the role you choose, and it tells you the site can read those values before submit.

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
