# Manual placement coordinates

Hypothesis: a person can place a saved value on a page the scan still refuses, if the editor converts the click with the page’s CropBox, quarter-turn rotation, and UserUnit. That does not require a change to the line detector.

Baseline, parent `084b4fa`, before this change. Chrome headless opened each synthetic page and asked to place a confirmed value.

| Page | Result |
| --- | --- |
| Rotation 90, 180, 270, and 45 | Refused. “This page is rotated in the file.” |
| CropBox origin (20, 40) | Refused. “This page is cropped.” |
| UserUnit 2 | Refused. “This page uses a scale other than 1.” |
| Upright, crop equal to the media box, UserUnit 1 | Armed for a click. |

The refusal was the same rule the scan uses. The editor’s export multiplied the visual fraction by `getSize()`, which is the MediaBox, and flipped Y as if the page were upright. That matches only the last row.

## Ledger

pdf.js 3.11.174. The rendered view is the CropBox. At scale 1, a viewport point `(vx, vy)` from the top left maps to default user space:

| Rotation | x | y | View size |
| --- | --- | --- | --- |
| 0 | `crop.x + vx` | `crop.y + crop.height - vy` | crop width × height |
| 90 | `crop.x + vy` | `crop.y + vx` | crop height × width |
| 180 | `crop.x + crop.width - vx` | `crop.y + vy` | crop width × height |
| 270 | `crop.x + crop.width - vy` | `crop.y + crop.height - vx` | crop height × width |

pdf-lib then rotates the type or the box so it stays upright in that view: 0°, 90°, 180°, −90°. The first baseline stays 0.85×font size below the top of the box and 1 unit in from the left. That is the upright export this desk already used. Zoom and device pixel ratio change the CSS box only. The stored place is a fraction of that box.

UserUnit must be a finite number in `(0, 75000]`, and the file’s value must match what this pdf.js reports. A missing UserUnit is 1. This build reports UserUnit and does not scale the viewport by it. pdf-lib draws in that same default user space, so the fraction lands on the click. A reader that honors UserUnit scales the whole page, including the new type. Zero, a negative value, or a mismatch is refused. Rotation other than a quarter turn is refused. Nothing unsupported is given a guessed point.

Scan suggestions on an upright unit page are unchanged. A later pass can carry an unchanged detector spot through this ledger for review only, when the ledger accepts the page and the spot is a fraction of that rendered view. A sideways view is not turned. The record is [SCAN-TRANSPORT.md](SCAN-TRANSPORT.md).

A map for these pages stores the media width and height plus rotation, UserUnit, and the CropBox. An older map has none of those extra fields and still applies only to an upright unit page whose crop equals its media box. The file must still match by SHA-256. Editor rotation and a reordered page are still refused. The map does not store the value, the person, or the profile id.

## Rights

The gold pages are 200×400 synthetic sheets made in the test. The fresh sheet is a letter page, CropBox `(36, 48, 540, 700)`, rotation 270, UserUnit 1.5, with the word `FRESH` already on it. Moss pages are the existing synthetic rasters. The placed token is `Ada90`. No private upload.

| File | SHA-256 |
| --- | --- |
| rot0 | `f9fa523b808f22a51ae09679a8792812a4653343b251b5b1c98d197d31d54b97` |
| rot90 | `9c67a35ffd852a6d9c1ffa7cc57f3776b28ada15c3a9534a578ab140c487f403` |
| rot180 | `d91c67675abc8ead20c7bb3097c5fc305bb569378a4e67f23bc0fd81da431c5b` |
| rot270 | `2d1eeb5572e1d24569e50602472d5b3437b54f92a0b816020c35acb642689b97` |
| crop | `c1a0a3f34d82c26d8faf70dea05a2a96b0920fc7719be9f0836e4420da96e8ba` |
| mediaOff | `2bcb50d84594bf22a054089a4e24e1e05b5a4f021f35b0f048bcdeb045242978` |
| unit2 | `2d879432124aee1e66039ca0923faccc9ec96078ef3a1478a3cee524eeaa2c76` |
| rot45 | `7d13133393336b70338ea5205d2048c21daae2473d9254fd4832af0adc1abdd2` |
| unit0 | `1586423e1e9fbd79cc8f4e5a800983200f8a9e678e9ed2f4cf2fa5624e2b58cf` |
| freshLetter | `84259e0b2e797292b2917fff101dc1987de86e9a111f82dc64afea04ff187515` |
| moss-turned | `8f4f681f36e0cab9c6f65464f86f489c009991a7e11bbc4f206b720b1b7ef0f8` |
| moss-crop | `de18b128da74b84def291fbd68b45a03189b97506bef86bf65c2085711026c63` |

## Result

Chrome headless. `coords-ledger.test.mjs` matched the frozen corners. `coords-manual.mjs` then checked those corners against `convertToPdfPoint` and stopped before the fresh sheet if that failed. It did not fail. 45 checks, 0 failed. Raw file: `results/coords-manual.json`.

The exported text origin was within 0.001 user units of the frozen point on rotation 0/90/180/270, an offset crop, a MediaBox and CropBox that share an offset, UserUnit 2, an editor quarter-turn, device pixel ratio 2, the fresh letter page, and both Moss pages. A nudge and an arrow, then two undos, returned the line to the click, and the download used that place. Changing page or person cancelled the armed click. A whiteout on a 90° page covered its box (0 of 2112 sampled pixels stayed dark). A rotated page kept its one native widget. A 45° page and UserUnit 0 stayed refused and gained no line.

Scan on a raster with rotation, an offset crop, or UserUnit 2 still returned no fields and said line positions are not offered. An upright unit page was not blocked.

`recover-e2.mjs` rerun: 0 failed, 38 scripted steps. The rotated and cropped scans still offer no positions. The editor then accepts a placed value. `template-e3.mjs` rerun: 0 failed, 36 scripted steps. Upright maps, the second person, undo, and the widget still behave as before. An editor reorder is still refused.

Screenshots: `results/screenshots/coords-rot90-placed.png` is the desk after the click, at device pixel ratio 2. `results/screenshots/coords-rot90-export.png` is the downloaded 90° page rendered again. `results/screenshots/recover-rotated-placed.png` is the Moss page.

## Not claimed

This is one click on each of these pages, not a reliability rate. No phone was used. Chrome 156.0.8078.47 opened `chrome://extensions`. Developer mode could be switched on, and Load unpacked could be clicked. No folder picker was delivered to the test, so the documented install was not finished. `--load-extension` was not used as a substitute. Scan autofill stays off.

## Next

The coordinate path is in. The separate question is whether an unchanged scan detector’s boxes can be sent through this same ledger after the page is rendered, without retuning thresholds. That is a new measurement, not a reason to loosen the current scan refusal. The Chrome folder picker is still the blocker for a real install, and it is not a reason to pause the coordinate result.
