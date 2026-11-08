# Placing a missed line

Hypothesis: a confirmed saved value can be put on a line the reader missed, without retyping it and without turning automatic fill on.

Scope: the existing Edit and Sign desk. Forms Filler opens that desk with the original file. The desk lists confirmed values for the chosen person. Place, click, nudge, undo, cancel, and download use the desk that was already there. Template maps are not in this pass. The detector and the frozen audit were not changed.

Baseline: a missed line stayed blank unless someone typed into Text. Typing the email would be one click plus one key per character. This path does not type the saved characters. That comparison is a scripted action count, not a measured human time, and not a claim that a person is faster.

Rights: the pages are the synthetic margin, table, and short-rule fixtures already in this repo, plus the synthetic Moss pages. The names Ada Recover and Bea Recover are fictional.

Result, Chrome headless, 24 checks, 0 failed, 36 scripted steps. Raw file: `results/recover-e2.json`.

A margin page, a table page, and a short-rule page each accepted Ada Recover’s confirmed email by a click. The line is marked as placed by Ada, not as an automatic fill. Left, Right, Up, and Down move it without a drag. Arrow keys do the same when the cursor is not in the text. Undo puts it back. Cancel adds nothing. Download drew the email inside the page and did not draw Bea’s email. Editing the placed text updated only Ada, and the origin is the PDF edit. Reload kept the line. Two people with an email are listed separately. An extracted phone and a conflicting pending email are not offered. With nobody saved, placement stays off.

A rotated page and a cropped page refuse the placement and explain why. An upright native form still exports its widgets. The narrow screenshot is a 390px viewport, not a phone. Current Chrome stable was not used.

The extension was not changed. Zip 0.1.1 is still `tools/forms-filler/extension/forms-filler-profiles-0.1.1.zip`, SHA-256 `09cee1247b6f86d3c96b3f383e7ae9f8d4da73bd64f467a9425f88af29468964`. The earlier gesture file remains the extension evidence.
