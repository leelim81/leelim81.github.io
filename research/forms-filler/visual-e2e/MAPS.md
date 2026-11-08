# Exact blank maps

A map stores places and semantic keys for one role on one exact file. It does not store values, people, profile ids, source text, signatures, or the file name. The file is identified by SHA-256. A different file, a reordered page, a rotated page, a cropped page, or a page scale other than 1 is refused. Applying it is explicit. It is not scan autofill.

Setup in the browser test placed three lines by hand, then saved the map. Reuse on the same blank was Preview plus Apply for a second person, without placing those lines again. That is a scripted action count, not a measured human time.

Chrome headless, 21 checks, 0 failed, 36 scripted steps. Raw file: `results/template-e3.json`.

Page 1 of the export has the second person’s email. Page 2 has that person’s name. The first person’s values are absent. An unconfirmed phone was left blank. Applying twice did not add a second copy. Undo restored the previous lines. Switching to the next page cancelled an armed placement, and the click on that page added nothing. Two roles were not saved. A revised file and a different blank did not match. Quota, a bad version, and a hostile map failed closed. Deleting a map left the people in place. The narrow screenshot is a 390px viewport, not a phone.

The stored map was checked for the seeded sentinels. None were present.
