# Where the 13 development targets drop out

Same provisional single-review gold as `NATURAL-PAPER.md`. Denominator 13. It was not edited. This is not an audit. Census images, crops, and wording stay out of this file. Counts below are from the current browser reader, `FormFields.stageReport`, on the working files already used for that gold.

None of the 13 became a contained field. Production was not changed to chase them.

## Stage counts

| Page | Targets | Plain lines | Contrast lines | Underlines | Strokes | Words at the normal cutoff | Words with a known kind | Final fields |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Food order | 8 | 37 | 37 | 0 | 0 | 0 | 0 | 0 |
| Census, 3 targets | 3 | 74 | 118 | 2 | 12 | 409 | 0 | 2, both kind other |
| Census, 2 targets | 2 | 171 | 171 | 1 | 47 | 276 | 0 | 0 |

The two census fields do not sit in the three frozen boxes. They are false suggestions. No value was filled.

Crop did not remove any of the 13 boxes. The food sheet is the same 913×1516 crop as before. The census pages are uncropped.

## What actually stops each target

The darkest row within 8 sheet pixels of each box bottom was measured. A line counts only when it covers at least 30 percent of that box.

Food order. The name row’s best line has a 90th-percentile brightness drop of 30.6 and 118 mask pixels. The address row has 27.7 and 145. The plain ink mask does form a line across those two rules. The long-underline test, which wants a drop above 30 across 45 percent of the page, finds none. The stroke test, which wants a drop above 40, finds none. OCR on the raw sheet returns 0 words even with the confidence cutoff removed, and the same 0 after the existing contrast stretch. With no words, the line layout throws every unlabeled run away. Name and address therefore die at label reading, after a line exists. The six item cells also have a line, but quantity, article, and price are not kinds this reader can label, so they die at the schema even if a word were present.

Census, three lines. Each target has a real line. The date, place, and serial rows have brightness drops of 80, 12, and 17 at the 90th percentile on their best rows, and strokes on the date row. All nearby words are kind other. The schema has no date, place, or serial kind, so the linker drops them. The two emitted fields are kind other and miss the boxes.

Census, two name cells. Both rows have a strong line, drops 84 and 88. Two hundred seventy-six words are read and none has a known kind, including none near those cells. The label is not linked. No field is emitted.

## Rejected experiment

One variant was tried, not a threshold sweep. Pixels whose green channel exceeds the other channels by more than 6, and whose brightness is under 210, were drawn as black and the rest as paper. OCR ran on that picture only.

On the food order it returned 14 words: one kind name, one kind address, twelve other. Wired into the reader, that produced two fields:

| Field | Measured box | Frozen box | Past the 8px pad |
| --- | --- | --- | --- |
| Name | 842, 1316, 2829, 1381 | 820, 1295, 3040, 1362 | 11 px below |
| Address | 927, 1526, 2826, 1591 | 870, 1510, 3040, 1578 | 5 px below |

Both miss the frozen containment gate. The item rows stayed empty. The same preprocess found 0 words on the two-name census page, because that ink is not green. It was removed. The black Email/Name scan still returns exactly those two labels.

The extra OCR, when the first read is empty, took a few hundred milliseconds on the food sheet. The page’s JavaScript heap around the food measurement went from about 5 MB to about 85 MB. That figure is `usedJSHeapSize` only.

## Not claimed

Eight of eight, three of three, and two of two remain misses. No threshold was moved. Scan autofill stays off. No historical demographic or signature was filled.
