# Assisted journey from an empty store

One fresh browser profile. Every person, value, upload, placement, nudge, correction, map, and export went through a visible control. Nothing was written into IndexedDB ahead of the walk, and no field was injected.

## What the walk did

58 interactions. 33 checks passed and 1 failed.

Saved values start collapsed. The empty list says no one is saved. Add value with nobody chosen asks for a person. A blank prompt adds nobody. Ada Lane, then the confirmed name `Ada Lane` and address `14 Harbour Lane`, are added from the form. Escape closes the panel and returns focus to Saved values.

The food-order photo is the bounded development file. The status is: “No lines were found. Use Place a missing line to put a value where you want it. Nothing was written.” The editor opens on its own onto Place a saved value, and focus is on the person list once Ada Lane is shown. The offered values are the confirmed name and address. Clicking the name line and the address line places those words and labels each mark with the person, the key, and “placed by you.” One nudge and an in-place correction to `Ada L. Lane` both work. The full-quality export contains `Ada L. Lane` and `14 Harbour Lane`.

A blank map named Food lines saves for role applicant and keeps neither the person nor the values. Bea Shore is then created in the person control with `Bea Shore` and `8 Pier Street`. Ada’s values are not on Bea’s list.

Choosing that same photo again still lists Food lines. Preview says 2 places, nothing written, and does not name Ada. Apply writes Bea’s name and address only. Undo removes that apply. Apply again leaves one name and one address. Reload keeps Bea. The export contains Bea and not Ada.

`flat-day-pass.pdf` still has its original 5 text items after it is opened for placement and exported. The status on that file is “Form ready.”

The current-head map integration, `template-e3.mjs`, was rerun after the photo change: 36 steps, 0 failed. That run still skips an unconfirmed phone, refuses a reordered file, and keeps native widgets. The fresh walk’s Add value control only stores confirmed facts, so it did not itself create an unconfirmed read.

## The one change

A photo’s blank map was stored against the generated sheet PDF. Opening the same photo again builds a new sheet, so the map said “No map for this exact file.” The map now uses the SHA-256 of the photo bytes the person chose. A PDF still uses the PDF’s own SHA-256. `read` and `readImage` are unchanged, and scan autofill stays off.

## Glyphs from the new clicks

The name click, plus one nudge down, exported a glyph box of 1341, 1323, 1747, 1399 in original pixels. The frozen name target is 820, 1295, 3040, 1362. The bottom is 29 pixels past the 8 pixel pad. The address glyph is 1403, 1625, 1967, 1700 against 870, 1510, 3040, 1578, and its bottom is 114 pixels past that pad. This is a separate placement from the earlier manual example, which remains a 1 source pixel miss. The gold boxes were not moved. It is not a detector result. The 13 development targets stay at 0 of 13.

## Next failure

Back from the editor returns to Forms Filler with no status and with Place a missing line disabled. The desk draft is written 300 ms after a read and is not flushed when Place a missing line navigates away, so that Back press has no form to restore. Choosing the photo again is the path that finds the map.
