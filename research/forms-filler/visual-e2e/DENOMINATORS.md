# Field counts

Version: eligible-v2. A gold field counts in the recall denominator when its kind is not `other`. A detection is a true positive only when its rectangle overlaps that field and the kind matches. A value that matches the gold string counts as a correct fill or a correct review only when that same rectangle overlaps that field. Otherwise it is a wrong place.

scan-dev gold, unchanged file `gold/scan-dev.jsonl`: 40 boxes, 34 eligible, 30 answerable, 6 other (badge tints and the like). The file hash is the one frozen in `SCAN-FREEZE.json`.

The first published development recall divided 6 true positives by 32. Those 32 were true positives plus fields with no overlapping detection. Two more eligible fields overlapped a detection of the wrong kind, so they were in neither number. They stay eligible. Baseline on this definition: 6 true, 4 false, 28 missed, recall 6/34, precision 6/10. The stored pairs are in `results/scan-dev-baseline.json`.

The stroke run’s 27 true and 7 missed already add to 34. It does not need a new denominator. The nearer-rule run is 28 true and 6 missed, same 34. Raw file: `results/scan-dev-e1.json`.
