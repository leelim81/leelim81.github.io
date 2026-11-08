# Photo orientation

The line score is unchanged. It is no longer painted into a photo sheet.

## What the score was doing

`bestLineAngle` searches about ±6°. On the upright 400×3000 sheet with a black rectangle, it returned −1.7°. The export’s top edge then measured −1.37°, and the sheet grew from 247×1850 to 302×1857. The border was not cut off; the page was turned, and there was no way back to the upright pixels. A separate upright sheet with colored edges was turned −0.2°. A file saved from a 3° rotation was turned back by +3.0°, which is the score working, and the following background crop tightened around the rules.

EXIF normalization is a different step. `createImageBitmap` still applies orientation before the working size is chosen. Orientation 6 remains a wide sheet.

## Frozen behavior

A photo sheet uses the EXIF-normalized pixels, then the existing working-size cap and the corner-color crop. `frame.angle` is 0. The line score still runs on PDF scans. A sideways PDF is still not turned. No new control was added, because the sheet the user sees is already the original orientation. Scan autofill stays off. Thresholds were not changed.

## Checks

Chrome headless. `orientation.mjs`: 6 checks, 0 failed. Raw file: `results/orientation.json`.

| Check | Result |
| --- | --- |
| Upright 400×3000, four edge colors | Sheet angle 0. Top edge 0°. Red, blue, green, and gold all remain, each on its own side. |
| Rules saved at −2.999° | Export −3.008°. Difference 0.009°. Three rule bands remain. Sheet angle 0. |
| Uniform 500×400 | Angle 0. Output size equals the working size. Not cropped away. |
| Placement of “Ada Page” | Export is 0.00002 pt from the click. |
| Person change while a placement is armed | Cancelled. |
| Replace the tilted file with the blank file | The frame changes from 934×688 to 500×400. |

The same head reran `large-image.mjs` (14 checks, 0 failed), the coordinate ledger, `frame-anchor.mjs` (0 failed), `recover-e2.mjs` (0 failed, 38 steps), and `template-e3.mjs` (0 failed, 36 steps). Surrey’s sheet angle is 0. The food order is still 0/8, Census P5 and P8 are still 0/3 and 0/2, and the food-order glyph still misses the frozen name box by 1 source pixel. Quarter-turn and offset-crop scans still do not receive an automatic fill. Extension and profile files were not changed.

The background crop still drops a surround that matches the corner color. On the tilted rules, that kept all three lines and removed white margin. It is not a rotation.

## Next gap

An upright PDF scan still runs the same line score on a copy and, when the score is not zero, takes field positions from that turned copy. The editor opens the original PDF. Those two geometries are not the same. This cycle did not move a field on that path and did not retune the score.
