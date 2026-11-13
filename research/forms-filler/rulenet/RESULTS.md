# RuleNet browser check — not adopted

Preregistration: `PREREG.md`, committed before this run. Live main at the branch point is `5cd2002adfb49aa5a061a98408c22df3e106294e`, tree `28e28bfbd4f2c45ea89860d3accf1839bda9b33e`. Scan autofill was read back as off for every kind. The product sources are unchanged. A temporary line override was used for one measurement and then removed.

## What ran

One candidate: the frozen float32 weights and the unchanged fast forward pass, threshold 0.5, plus a pure-JS postprocess checked against OpenCV 5.0.0. The float16 file was not executed. Casting it back to float32 differs from the float32 file by at most 0.00316, so it is not the same candidate. No training, no threshold change, no sealed holdout.

Bytes:

| piece | bytes | loaded when |
| --- | ---: | --- |
| `rulenet_fast.mjs` | 9,249 | harness page open |
| `postprocess.mjs` | 9,502 | harness page open |
| `rulenet.meta.json` | 3,056 | Run |
| `rulenet.f32.bin` | 84,932 | Run |
| float16 file (not shipped, not run) | 42,466 | never |

42,466 bytes is only that untested float16 cast. The executed candidate is float32: forward 9,249 + postprocess 9,502 + metadata 3,056 + weights 84,932 = 106,739 bytes. The heap figures below are `usedJSHeapSize` samples after the call returned. They are not a peak and they are not a phone measurement.

The forward pass stores and accumulates float32. For the 983×1600 food-order working image the fast pass allocates 58,076,800 bytes of float workspace, plus 6,291,200 bytes of input and 6,291,200 bytes of probability output. Chrome’s heap sample is separate and is not process RSS.

## Equivalence

Pure JS and OpenCV produced the same segments on all three development images (maximum coordinate difference 0).

| image | segments | score against the existing rule notes |
| --- | ---: | --- |
| food order | 26 | 22 true, 4 false, 0 missed |
| census page | 15 | 8 true, 7 false, 5 missed |
| Surrey letter | 2, both inside the ignore note | 0, 0, 0 |

Food and Surrey match the recorded scores. The census page does not: the record is 14 segments and 6 false, and this run has 15 and 7. That fails the preregistered reproduction gate. The two implementations agree with each other, so the extra segment is in this probability map or in OpenCV 5, not a JS-only drift.

## Browser

Headless Chrome, precise memory enabled. The harness did not request the weight file until Run. Cancel before the forward pass returned `cancelled` and did not fetch. A 2000×2000 input was refused. Clear dropped the loaded weights in the page. The float16 file was never requested.

Food-order working image, forward plus postprocess:

| run | forward ms | postprocess ms | total ms | heap sample after |
| --- | ---: | ---: | ---: | ---: |
| cold | 1604 | 489 | 2093 | 121 MB |
| warm | 1548 | 462 | 2010 | 159 MB |
| warm | | | 1996 | 136 MB |
| warm | | | 2169 | 123 MB |

Warm median 2010 ms. The adoption bar was 1500 ms, so the timing gate fails. The highest heap sample was 159 MB, under the 200 MB sample bar, taken after the call returned. There is no mid-kernel peak, and this is not a phone or RSS figure. Node on this same image was 1605 ms for the forward pass alone.

## Fields

The unchanged `readImage` path on the existing 13 development targets scored 0 of 13 contained, with the sheet angle at 0. One census page produced two suggestions; neither was inside a target. The food-order sheet produced none.

The same food-order read was repeated with the 26 model segments passed through the existing label-to-line linker. It still returned no fields, so name and address stayed at 0 contained. No export was run, because there was no field to place. The model did not choose segments from the gold.

On the census page the product’s own underline and stroke rules recalled 2 of 13 frozen rules and added no false segment under that score. The model recalled 8 of 13 and added 7 false segments. Recall is higher and precision is worse. It does not replace that heuristic.

A public-domain PDF still reads as native widgets (5 fields). Forms Filler does not reference this harness.

## Verdict

Not adopted. The food-order rules are mostly recovered, and that still does not create a name or address field or an export. The browser pass is slower than the 1500 ms bar, and the census score was not reproduced. The weights are not referenced by the live reader.

Next justified step, as its own preregistered cycle: the label read on the two food-order rules the line finder already returns. Not another line model, and not an automatic page normalization.
