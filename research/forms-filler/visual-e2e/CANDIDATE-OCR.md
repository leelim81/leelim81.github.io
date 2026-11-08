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

The food-order labels are not lost in whole-page segmentation of a picture that is readable in strips. The same working pixels, cut into the eight longest existing lines, are still invisible to this OCR. Local crops of that sheet cannot put back detail discarded when the 3442×5601 file was reduced to 983×1600. The earlier green-ink read could see a name and an address, and those boxes missed the 8px gate. That result stands. This segmentation pass does not replace it.

## Native resolution was not tested

The publisher file is `files/wellcome-food-order.jpg`, 1,888,605 bytes, 3442×5601, SOF marker `0xC2` (progressive). Chrome 156.0.8078.47 has no `ImageDecoder`. `createImageBitmap(blob, sx, sy, sw, sh)` returns only the crop’s dimensions, and on a small progressive JPEG it took 15 ms against 17 ms for a full decode; a small baseline JPEG took 8 ms against 9 ms. The crop call does not skip the decode. A progressive scan cannot yield a region until the whole scan is done. Reading a native crop would therefore decode the full 3442×5601 image. That decode was not run. Native-resolution OCR is untested, not disproven. No second decoder was added.

Census crops are not saved.
