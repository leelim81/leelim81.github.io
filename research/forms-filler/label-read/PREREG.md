# Preregistration — label read on returned rules

Written and committed before any crop from this plan is read. Wall clock for the measurement after this commit: 30 minutes. One pipeline. No training, no threshold sweep, no second normalization, no second crop shape.

Main stays `5cd2002adfb49aa5a061a98408c22df3e106294e`. The line finder stays off the product. Pull request 18 stays unmerged. `tools/forms-filler` and `tools/pdf-editor` are not edited.

## Census 14 versus 15, read only

The census development file hashes to `83e4cce8e0f8f39da4a86e830f5d2574eb1880ceadf358f527c0e8869d0fcd98`, 86,359 bytes, 1200×823, no EXIF orientation. That matches the catalog. The rule notes use working size 1200×823 at scale 1, so the earlier port did not resize it. The sheet frame was crop 0,0 and output 1200×823. OpenCV 5.0.0 and the pure-JS postprocess returned the same 15 segments (8 true, 7 false, 5 missed). The written record is 14 segments and 6 false. The original probability map and the original OpenCV build are not in the handoff. The file and the frame match. The extra segment is an unresolved fail. No constant is changed to force 14.

The food-order file hashes to `ccfc3b242c83750b92e9fd88812709b246d6bdb06ed6f09bad7bcaeae9d69031`, 1,888,605 bytes, 3442×5601, no EXIF orientation. Same file as the earlier native-crop note.

42,466 bytes is only the untested float16 cast. The executed float32 stack is 106,739 bytes.

## Question

The whole-page reader is already 0 of 13. The eight longest ink-mask strips, on the working sheet and at native size, did not include the name or address rules and are not rerun. The green-ink boxes that missed by 11px and 5px stay misses. This pass asks a different question: if the crop is the existing line-local rectangle on every rule the frozen line finder actually returned, does the existing OCR read a label, and does the existing linker then put a name or address field inside the original strict target.

## One pipeline

Region proposal is the frozen float32 line finder, threshold 0.5, the postprocess already checked against OpenCV. It is not enabled in the product. Segments are taken in the order that postprocess already emits: increasing rounded y, then x. No segment is added, dropped, or reordered because of a gold box, a target word, or a hand-picked rule. If the pixel cap is hit, later segments in that order are not read.

The crop is the existing line-local rectangle, not a new one: 28px above the rule, 8px below, 4px to the left, and at most 420px to the right of the rule start, clipped to the image (`lineCropReport`).

Two rasters of that same rectangle, and no third:

1. Working pixels: the 983×1600 Lanczos working image, copied 1:1. No upscale.
2. One native configuration: the same rectangle multiplied by 3442/983 in x and 5601/1600 in y, taken from the original JPEG. One decode. The bitmap is released before OCR. No upscale, no background normalization, no green mask, original colors.

OCR is the page's Tesseract, PSM 7, confidence at least 35, one pass. Stop at 12 crops, 1,500,000 OCR pixels, or 15 seconds, whichever comes first. Working and native share that cap separately. Census pages are not opened.

The linker is the existing rule in `fieldsOnSheet`: a word beside, above, or below the rule under the current distances, kept only when `FormEvidence.fieldKind` is not `other`. The field rectangle stays height 16 in the 595-wide page. Publisher pixels use the existing frame mapping with pad 8. Quantity, article, price, date, and serial are not given new kinds.

## Gates

- A label is read when a kept word's kind is `name` or `address`. The string is reported. It is not used to choose a crop.
- A field is correct only when that kind's box sits inside the frozen name or address target, pad 8. The other 11 development targets are not newly scored; the whole-page baseline remains 0 of 13.
- Any other emitted field, or a name or address box outside that pad, is a false field.
- A win requires at least one correct name or address field and zero false fields. Only then is one fictional value exported and the glyph box checked against the same pad. Otherwise there is no export.
- A win does not adopt the line finder and does not lower the 1500 ms runtime bar. The finder is only a region proposal. A product change would need a proposal the shipping reader already has, and the full non-regression set, before any merge. This pass does not edit the product.
- No win: reject the pipeline, keep this note, and do not open another crop or threshold.

Heap, if read, is `usedJSHeapSize` only. It is not a peak and not a phone result.

Wellcome Collection food-order attribution stays CC BY 4.0. No response headers or cookies are stored.
