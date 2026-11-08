# Line-local OCR, one comparison

The field reader already sends the whole working sheet to OCR. `wordBoxes` does not shrink it again. The 480px shrink in `prepareOcr` is only the reference-text path. On the food order that sheet is 913×1516, and the whole-page call returns 0 words.

## Frozen method

Crops come only from ink-mask lines that are already at least 80px, longest first, at most 8. Each crop is 28px above that line and 8px below, at most 420px wide, copied 1:1 from the working sheet. No upscale. PSM 7. Confidence stays 35. Stop at 8 seconds or 250,000 crop pixels. Gold boxes are not used to choose a crop. Quantity, article, price, date, and serial are not given new kinds. A field is correct only if its box sits inside a frozen name or address target within 8px. Any other field is false.

## Result

Not adopted. `candidateReport` is not on the read path.

| Page | Crops | Pixels | OCR | Words by kind | Fields | Inside a frozen name or address box |
| --- | --- | --- | --- | --- | --- | --- |
| Food order | 8 | 123,264 | 1003 ms | none | 0 | 0 |
| Census, 3 targets | 8 | 122,688 | 350 ms | other 40, name 1 | 1 name | 0, so that name is a wrong box |
| Census, 2 targets | 8 | 123,264 | 276 ms | other 4 | 0 | 0 |

The black Email/Name sheet still returns exactly those two labels. Page JavaScript heap during the food run was about 36 MB (`usedJSHeapSize` only). No 19-megapixel or 29-megapixel decode was added.

## Root cause

The food-order labels are not lost in whole-page segmentation of a picture that is readable in strips. The same working pixels, cut into the eight longest existing lines, are still invisible to this OCR. The same rectangles, read from the 3442×5601 pixels, are recorded in the next section. The earlier green-ink read could see a name and an address, and those boxes missed the 8px gate. That result stands. This segmentation pass does not replace it.

## Native resolution, one measurement

The publisher file was decoded in full. SHA-256 `ccfc3b242c83750b92e9fd88812709b246d6bdb06ed6f09bad7bcaeae9d69031`, 1,888,605 bytes, 3442×5601. An RGBA buffer of that size is 77,114,568 bytes. Before the decode, `MemAvailable` was 4,852,124 KiB. The earlier Surrey decode of 115,510,752 RGBA bytes had finished in 490 ms, so this buffer was allocated once. `createImageBitmap` returned 3442×5601 in 270 ms. Eight crop canvases were drawn in 2 ms, the source bitmap was closed, and only then did OCR start. `usedJSHeapSize` was about 28 MB after the decode and about 30 MB after OCR. That counter is the JavaScript heap, not the bitmap.

The eight candidates are the same ink-mask lines as the strip test: width at least 80, longest first. The working frame is 983×1600, crop x 16 y 40, sheet 913×1516, angle 0. A sheet pixel maps by `native = (sheet + crop) × (3442/983, 5601/1600)`. PSM 7, confidence 35, original colors. The frozen cap is 8 crops, 1.5 million OCR pixels, and 15 seconds. Seven crops fit in 1,332,992 pixels and finished in 239 ms. The eighth, native rectangle x 591 y 3728 w 1500 h 127, would have passed 1.5 million and was not read.

| Native crop | Size | Words |
| --- | --- | --- |
| 595, 1669 | 1499×127 | none |
| 595, 2149 | 1499×127 | none |
| 588, 4652 | 1499×127 | none |
| 598, 1827 | 1500×127 | `a`, kind other, confidence 37, box 1038, 1827, 1140, 1954 |
| 588, 3108 | 1499×127 | none |
| 591, 3269 | 1500×127 | none |
| 591, 3423 | 1500×127 | none |
| 591, 3728 | 1500×127 | not read, over the pixel cap |

No field was placed. Correct name or address boxes: 0. Wrong boxes: 0. False fields: 0. The black Email/Name sheet still returns those two labels. The frozen name target is original y 1295–1362 and the address target is y 1510–1578. Every selected crop starts at y 1669 or lower, so this pass did not read a native crop of those two rules. They were not among the eight longest lines, and the gold boxes were not used to add a crop.

Verdict: the selected native candidate-crop pipeline is rejected. That is not a rejection of source-resolution OCR in general. Every crop began at original y 1669 or lower. The frozen Name target is y 1295–1362 and the Address target is y 1510–1578, and neither rule was in the eight longest lines. This measurement gives no evidence that native OCR fails those two labels. The gold boxes were not used to choose a crop, and they are not being used now to force a success. The full-frame decode stays out of the product. `read` and `readImage` are unchanged. Census pages were not upscaled or opened again. The 13 development targets stay misses, and the earlier manual name glyph stays 1 source pixel outside the padded box. No further pixel variant of this pipeline is planned.

Census crops are not saved.
