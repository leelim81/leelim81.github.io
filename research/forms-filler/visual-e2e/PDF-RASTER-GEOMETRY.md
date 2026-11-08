# Upright PDF scan geometry

An upright image-only PDF used to be replaced by a turned picture when the line score was not zero. The editor then opened that picture. The original file is kept now. A spot found on the private turned copy is mapped back through the same rotation, including the grown canvas, and offered only as a review estimate. A spot that does not land on the original page is dropped. If nothing lands, the page asks for a hand placement and does not invent a field. The line score itself is unchanged. Photo sheets still keep the EXIF orientation from `9070ae7`.

## Frozen gate

The rule position is computed from the drawing and the known rotation before the detector runs. An offered box is a hit only when it contains that point within 8 PDF points. A box nearer a different line is not a hit. No box means manual placement. Original page text must still be present after export. These fixtures are one synthetic layout, not an audit.

## What was measured

Chrome headless. `pdf-raster-geometry.mjs`: 8 checks, 0 failed. Raw file: `results/pdf-raster-geometry.json`.

| Check | Result |
| --- | --- |
| Dot rotated +4° and −4° | Comes back within 2 px. The canvas grows. |
| Level upright scan | Internal angle 0. Original file kept. The email spot is nearer the email rule than the name rule. |
| Page 1, content rotated +5° | Internal angle −5.1°. The email box contains the tilted rule. Page 0 stays at angle 0. |
| Content rotated −5° | Internal angle +5.1°. The box contains that rule within 8 pt. The file is not replaced. |
| UserUnit 2, offset crop, quarter turn | Review or manual, original file kept. The quarter turn is not given a spot. |
| Two people in the reference | Both lines abstain. Bea is not chosen. The decision is not autofill. |
| One applicant reference | The value waits for a check. The name box was left unchecked. |
| Export | `ORIG-NEG` remains. `Ada Gold` is absent. The checked glyph is 0.0004 pt from the ledger origin, and its box contains the known tilted rule. |

## Next gap

The mapped box is axis-aligned. On a 5° rule it contains the rule, and the glyph sits at the top of that box rather than along the slant. A slanted rule still has no slanted writing line.
