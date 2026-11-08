# Preregistration — RuleNet browser harness, one candidate

Written before any image was passed through this port. Live main at the start of the branch is `5cd2002adfb49aa5a061a98408c22df3e106294e`, tree `28e28bfbd4f2c45ea89860d3accf1839bda9b33e`. The earlier release heads stay where they are.

This is a feasibility check of one already-trained line finder. It is not a new training run, not a threshold sweep, and not a resolution change.

## Frozen candidate

- Weights: `rulenet.f32.bin`, sha256 `7555fd6895fb3eea9284ae12da06dc7f87cf9013cfc5dc51ad83d666daf1a878`, 84,932 bytes, 21,233 little-endian float32 values. Batch-norm is already folded into those values.
- The float16 file is the same vector cast to float16, sha256 `44ea2027513589daad90c77efb7d37a5b333903d481e844c95b0af1dfd794aaf`, 42,466 bytes. Casting it back to float32 differs from the float32 file by at most 0.00316. Inference uses the float32 file only. A float16 forward pass is a different candidate and is not run.
- Forward pass: `rulenet_fast.mjs`, sha256 `880b2c4534e590cffd73ba79551a44aad6c8c99c95301369c66f1a87bb9743c6`, copied unchanged. Threshold 0.5.
- Postprocess: the archived `segments_from_mask` and `page_mask` (opening length `max(15, width//40)`, 8-connected components, merge gap 12 px and `|dy|<=4`, page mask from the 4× median background). No new constants.
- Input for the equivalence check: Pillow Lanczos resize to the recorded working sizes. That is the input the frozen scores used. A browser canvas resize is a different resample and is not substituted for it.

## What is not allowed

No retraining, no threshold or resolution change, no gold box used to drop or keep a candidate, no sealed holdout opened or rendered, no Census or VA bytes committed, no OpenCV or ONNX Runtime shipped to the page, no phone claim. Scan autofill stays off.

## Gates, fixed before the run

The product reader is unchanged unless every adoption gate below passes. A failure removes any product hook and leaves scan autofill off.

1. Equivalence. On the three development images, the pure-JS postprocess emits the same segment list as OpenCV running the archived postprocess on the same probability map: same count, and each segment agrees within 1e-3 px. The scores against the existing rule gold must also be the recorded ones: food 22/4/0, census page 8/6/5, Surrey 0/0/0, with 26, 14, and 2 segments. If the JS postprocess cannot match OpenCV, the port is declined and is not wired in.
2. Browser budget, food-order working image only (983×1600). Cold time and the median of three warm times are both reported. Adoption needs the warm median under 1500 ms. Memory is Chrome’s `performance.memory.usedJSHeapSize` with precise memory enabled, peak during that run, plus the byte size of the float arrays this code allocates. Those are not process RSS and are not a phone measurement. A missing memory API is reported and is not a pass. Adoption also needs the heap peak under 200 MB.
3. Field benefit. The unchanged `readImage` path is scored on the existing 13 development targets with the existing 8 px pad. Separately, the frozen segments are mapped into that sheet and passed through the existing label-to-line linker, without dropping any segment because of the gold. Adoption needs at least one name or address field on the food-order sheet inside its frozen target. An export glyph check is run only if that field exists. Zero such fields is no benefit.
4. Do not replace the black-line rules. On the census development page, model recall of the frozen rules must be at least the recall of the product’s own underline and stroke rules, scored with the same `|dy|<=6` and half-width overlap after both are mapped into the model’s working pixels. A lower recall rejects replacement.
5. Isolation. The forms filler and the editor do not fetch the weights unless a development harness asks them to. The harness does not fetch weights until its run control is used. Pages over 2,200,000 pixels or an edge over 1600 are refused before inference. A new run or a clear abandons the previous result. Native-widget reading, manual placement, maps, and profiles are not pointed at this code.

## Budget

One candidate. Stop at 45 minutes of wall clock from the start of implementation, or when a gate fails closed. Report the completed evidence or the exact stop.
