# Development ledger (visual-e2e)

Iteration is on development fixtures only. The holder-sheet split was already looked at, so it is a regression set and was not scored again. Gates in `VISUAL-GATES.json` were not loosened. OCR autofill stays off.

Numbers are probe scores: every type is forced on so a wrong fill can be seen. The page does not ship that probe. It still asks before writing an OCR value.

## Baseline, before this ledger

Boxed intake sheets, four forms, 22 answerable fields. Commit `01e4230`.

| | Value |
| --- | --- |
| Fields found | 4, 3, 4, 4 of 7 |
| Correct automatic fills | 10 |
| Wrong automatic fills | 0 |
| Coverage | 0.455 |
| Time | about 12 s per form in Chrome 156 |

The reference text was mostly right. Three labels never became fields: handset, inbox, mailbox.

## Kept: field labels the selector already understands

| | |
| --- | --- |
| Error class | Missing fields. `keepSlot` ignored handset, inbox, and mailbox. |
| Hypothesis | Those words are already field types in `evidence.js`. Letting the line detector keep them will recover phone, email, and mailbox rows. |
| Change | `spots.js` `keepSlot` accepts handset, callback, mobile, inbox, mailbox, premises, dwelling, identity, and identification. |
| Dev result | Same four forms: 7, 6, 7, 7 fields. 16 correct, 0 wrong, 0 wrong-person. Coverage 0.727. All 16 painted values read back inside the detected box. Time still about 12 s. |
| Why kept | Six more correct fills and no new wrong fill. The six remaining misses are the two-person form, whose labels do not say Member or Applicant, so the hard role check abstains. |
| Browser | The review list for `development-intake_sheet-00` now offers name, NRIC, date, phone, email, and address, each with its OCR line. Nothing is written until a box is checked. Native `test-claim_widget-00` still exports Asha Fixture and not another person. |

## Rejected: make the digit 1 by editing the string

| | |
| --- | --- |
| Error class | `suki.sample1@example.com` and `otto.sample1@example.com` were read as `samplel`. A 4× crop of the glyph is a digit 1. |
| Tried | Render scale 3. Binarize at 140 and 180. Page modes 6, 7, and 11. Turn the English word lists off. |
| Result | Every full-word read still said `samplel`, confidence about 89. Scale 3 was not slower in a useful way and did not help. |
| Why rejected | Replacing `l` with `1` would be a guess. The word lists were not the cause. |

## Kept: drop an email when a second read of the same glyph disagrees

| | |
| --- | --- |
| Error class | The same `samplel` error. Isolated, the glyph before `@` read as `1` four times and `T` once. It never read as `l`. `sample0`, `sample3`, and the `1` in `sample21` reread as themselves. |
| Hypothesis | If the single-glyph read disagrees, the email is ambiguous. Drop it. Do not write the second read in its place. |
| Change | `extract.js` crops the character box before `@` and runs one single-character recognition. Disagreement blanks that email. |
| Dev result | Boxed sheets stayed 16 correct and 0 wrong, including three correct emails. Underline sheets: the wrong `samplel` fill disappeared (14 automatic and 1 wrong became 13 automatic and 0 wrong). `tess.sample21` and `wynn.sample23` stayed. Added time was a few milliseconds per email. |
| Why kept | A wrong suggestion was removed and correct emails stayed. The second read is not copied into the form, because it once said `T`. |
| Browser | On `development-stack-00` the review list has the name, NRIC, date, phone, and address. It does not contain `samplel` or `sample1`. |

## Rejected as a layout to rely on: underlines at a small rotation

| | |
| --- | --- |
| Setup | New development template `member_stack`, four forms, labels above a line, people Suki, Tess, Ulf, and Wynn. Not a rerun of the old held-out. |
| Result | Rotation −1.2° found 7 of 7 fields. −0.4° found 6. +0.4° found 1. +1.2° found 3. Reference OCR still read the paragraphs. The role word Member filled the applicant, not Kim. |
| Why not a reader change | Short rotated underlines disappear after deskew. Changing the line detector to invent those rows could add false fields on other forms. The boxed sheets are the layout that stayed stable. |

## Not taken

OCR autofill stays off. Eighteen name fills on the earlier calibration were already below the minimum of 59, and this round did not create a new calibration or a new held-out. The old holder-sheet numbers were not used to choose these changes.

## Next experiment that is still reasonable

A line finder that keeps a short underline after a measured deskew, checked on `development-stack` and on the existing `spots.test.mjs` pages, without touching the holder-sheet split. Cost is a geometry change with a real chance of extra fields. It is the main unused local step. Another OCR model would be a new download and is out of scope.
