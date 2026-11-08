# Label read on returned rules — rejected

Plan: `PREREG.md`, commit `6635a2ef8fc05b0cb4a56303b1b80f0318d7f087`, before any crop was read. The food-order file is the Wellcome Collection order, CC BY 4.0, hash `ccfc3b242c83750b92e9fd88812709b246d6bdb06ed6f09bad7bcaeae9d69031`. No response headers or cookies were kept. The product sources were not edited. The line finder stayed off.

## Census record

The census file matches the catalog: hash `83e4cce8e0f8f39da4a86e830f5d2574eb1880ceadf358f527c0e8869d0fcd98`, 86,359 bytes, 1200×823, no orientation tag. The port used that frame with no resize and crop 0. OpenCV 5.0.0 and the pure-JS postprocess both returned 15 segments. The written record says 14. The original probability map is not in the handoff. Same file, same frame, unresolved fail. Nothing was tuned.

42,466 bytes remains the untested float16 cast. The float32 stack that ran is 106,739 bytes.

## This pass

Twenty-six rules came back from the frozen finder, in its own top-to-bottom order. The crop is the existing line-local rectangle: 28px above, 8px below, 4px left, at most 420px wide. PSM 7, confidence 35. Cap 12 crops, 1,500,000 pixels, 15 seconds. No gold box was used to add or drop a rule.

| arm | crops read | pixels | OCR | heap sample | words | name or address fields | false fields |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: |
| Working, 983×1600 | 12 of 26 | 161,244 | 1211 ms | 34 MB | `fo.` `ES` `cd`, all kind other | 0 | 0 |
| Native, 3442×5601 | 9 | 1,409,562 | 270 ms | 24 MB | `aed` `:` `:` `gor`, all kind other | 0 | 0 |

The 12-crop cap stopped the working arm. The pixel cap stopped the native arm before a tenth crop. Neither arm hit 15 seconds. The native decode was 3442×5601 and was closed before OCR. The heap numbers are `usedJSHeapSize` after the arm returned, not a peak and not a phone measurement.

The rules at working y 392 and 454 were inside both budgets. Those are the rows the frozen rule notes call name and address. The crops of those rows still did not produce a word of kind name or address. The linker therefore emitted no field. Correct name or address boxes: 0. False fields: 0. No export was run. Quantity, article, price, date, and serial were not relabeled.

The whole-page reader remains 0 of 13. The eight longest ink-mask strips and the green-ink misses of 11px and 5px are unchanged earlier failures, not this result.

## Verdict

Rejected. A readable label is not in the shipping line-local rectangle, even when the rectangle is taken from a returned name or address rule and from the original pixels. That does not justify a wider crop in this pass, and it does not adopt the line finder.

The evidenced weakness left in the product is that a ruled sheet still becomes a field only when someone places it. The detector does not supply the printed label the linker needs.
