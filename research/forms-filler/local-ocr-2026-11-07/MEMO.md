# Better local form filling: three bounded experiments, not another fine-tune

Published with the Forms Filler notes on 7 November 2026. The source list is [sources.json](sources.json) (35 public pages). The experiment plan is [experiment-plan.json](experiment-plan.json). Page snapshots named in that list were not copied into this repository. The sha256 values are the research fetch record, not a second download made while publishing this memo. No private document is in these files.

Accuracy note for this repository: the sentence below that says “14 image-only forms, 79 answerable fields” and “27 of 31 review proposals” describes the holder-sheet split that was already scored once. It is a regression set, not a fresh development measurement, and this publication does not rescore it. The later development pass on four boxed sheets is 16 correct probe fills out of 22 answerable fields, 0 wrong, recorded in [../visual-e2e/LEDGER.md](../visual-e2e/LEDGER.md) at commit `14b8dbc`. PaddleOCR is an optional challenger, not a default download. The 6,318,080 byte figure is the two tiny archives only. Runtime worker, ONNX Runtime, and OpenCV are extra, and mobile memory was not measured.

Research checked **7 November 2026 (SGT)**. Public-source investigation only: no model execution, training, model-weight download, app repository inspection, or mobile measurements. **Verified** means supported by the cited public source; **proposed** means an engineering hypothesis, not a demonstrated improvement. This memo is incremental research, not a replacement for the earlier architecture survey.

## Findings to act on first

1. **There is now a credible small browser-local challenger to Tesseract.** PaddleOCR has a first-party JavaScript SDK, `@paddleocr/paddleocr-js@0.4.2`, and official Vite browser-demo source—not just a Python ONNX example. Its published registry explicitly supports **PP-OCRv6 tiny** detection and recognition. The two official model archives total **6,318,080 bytes**, but the complete feature is substantially larger because ONNX Runtime and OpenCV/worker code are additional. Test behind an optional development switch; do not preload it by default. [S1–S5]
2. **Try recognition on rectified single-line crops, not more full-page threshold combinations.** Tesseract's own guide distinguishes PSM 7 (single line) and 13 (raw line, bypassing Tesseract-specific hacks), recommends deskew/padding, and supports disabling word dictionaries for non-word identifiers. The exact pinned **5.1.1** JavaScript API confirms that dictionary loading flags are **initialization-only**. A later `setParameters` call is not an equivalent experiment. This has not been shown to fix the ambiguous glyphs in this app. [S6–S7]
3. **The strongest alternative workflow is to verify a person-bound fact once, then reuse it locally.** A perfectly read date still belongs to the wrong person if provenance is lost. Keep exact source spans, explicit person/role binding, conflicts, and a user confirmation action; show ambiguous glyph crops rather than guessing an email. This is a proposed product/architecture improvement, not a model claim.

**Conclusion:** this is not all a fine-tune issue. The new evidence supports improving perception, geometry, decision calibration, and the review workflow while retaining the privacy-preserving architecture. It does not justify replacing it with an all-vision generative model.

## What the present evidence actually diagnoses

Supplied holder-sheet results, not independently reproduced in this memo, and not a fresh audit: 14 image-only forms, 79 answerable fields, no calibration-qualified autofills; 27 of 31 review proposals correct. Eighteen correct name examples were insufficient to qualify the relevant confidence rule. Email `1`/`l` confusion survived several resolutions, binarizations, and page segmentation settings, including an OCR confidence of 89. A developmental label-filter change recovered legitimate label candidates; rotated underlined fields remain fragile.

| Failure | Likely layer to isolate | What not to conclude |
|---|---|---|
| Valid label removed by whitelist | Candidate generation / vocabulary policy | A bigger recognizer is necessary |
| Same ambiguous glyph despite preprocessing agreement | Recognition / visual information quality | Agreement or confidence 89 proves correctness |
| Rotated underline / neighbouring-column association | Geometry, crop transform, label–field edges | Text-language fine-tuning repairs missing coordinates |
| Patient fact transferred to applicant | Entity provenance / source authority | OCR exact match establishes person identity |
| Correct names fail confidence qualification | Calibration sample size / acceptance policy | Lower thresholds until existing examples pass |
| Unsupported bank/citizenship or incomplete schema | Evidence contract / output validation | An image model removes hallucinations |

Treat the repeatedly examined “held-out” forms as **development** once their errors influence whitelist, threshold, or preprocessing choices. Keep native PDF widgets/text as the first path; a new OCR engine should not rasterize clean native evidence unnecessarily.

## 1. Small OCR challenger: what is genuinely browser-ready?

### Verified implementation and size

The official [browser guide](https://www.paddleocr.ai/latest/en/version3.x/inference_deployment/cross_platform/browser.html), [SDK README](https://raw.githubusercontent.com/PaddlePaddle/PaddleOCR/main/paddleocr-js/README.md), and [core README](https://raw.githubusercontent.com/PaddlePaddle/PaddleOCR/main/paddleocr-js/packages/core/README.md) describe client-side OCR, a worker option, and line outputs with polygons, text, and scores. The public package contains the ONNX preprocessing, detection postprocessing and CTC decoding, plus explicit model URLs. **No browser demo or mobile device was executed in this research.** Browser source is stronger evidence than “exports ONNX,” but not a compatibility or performance guarantee for this app.

Select `textDetectionModelName: "PP-OCRv6_tiny_det"` and `textRecognitionModelName: "PP-OCRv6_tiny_rec"` explicitly. **`ocrVersion: "PP-OCRv6"` resolves to small, not tiny.** Start with worker mode and an explicitly pinned WASM single-thread configuration; test WebGPU separately rather than relying on automatic backend selection. The published SDK requires both detector and recognizer: there is no verified public recognition-only API in 0.4.2. Feeding it a preselected line crop still runs its pipeline; a detector-bypassing adapter would be additional unproven work.

All bytes below are decimal bytes, not MiB. Archive sizes were verified with HTTP HEAD on the official SDK's URLs; no model archive bodies were fetched. Exact ONNX file sizes and revisions were read from official Hugging Face metadata, not inferred from parameter counts.

| Candidate | Published parameters | Official SDK tar artifacts | Official Hub ONNX files | Why consider it |
|---|---:|---:|---:|---|
| PP-OCRv6 tiny det + rec | 0.43M + 1.1M | 1,792,000 + 4,526,080 = **6,318,080** | 1,780,590 + 4,462,639 = **6,243,229** | First bounded challenger |
| PP-OCRv5 mobile det + rec | Not needed for this decision; not asserted | 4,843,520 + 16,701,440 = **21,544,960** | Not checked here for ONNX pair | Optional later control, not first default |
| PP-OCRv6 small det + rec | Not asserted here | 9,891,840 + 21,319,680 = **31,211,520** | Small recognizer alone 21,159,378 | Larger reserve only after tiny results |

The official tiny cards describe OCR text localization/recognition, **not blank-field localization, label–value linking, checkbox state interpretation, or reference-to-form identity matching**. Polygon outputs ground the recognized text, not necessarily the editable blank beside it. The recognizer card has copy/paste inconsistencies mentioning medium in examples; use the explicit SDK registry and immutable checkpoint revisions, not the example heading. Vendor OCR scores are not form-fill accuracy, selective risk, or proof about `1`/`l`. [S4–S5]

### Do not sell “6 MB weights” as a 6 MB feature

Pinned public package inventories show:

| Additional artifact | Uncompressed published bytes |
|---|---:|
| SDK `dist/index.mjs` | 81,588 |
| SDK worker bundle `worker-entry-C9UNuyOJ.js` | 11,341,486 |
| OpenCV.js 4.10.0-release.1 `dist/opencv.js` | 10,378,215 |
| ORT Web 1.24.3 standard SIMD/threaded WASM | 12,361,745 |
| ORT Web 1.24.3 JSEP WASM alternative | 25,014,754 |
| ORT Web 1.24.3 WASM-only / WebGPU `.min.mjs` entry | 49,997 / 67,100 |

These are **not additive full-download measurements**: bundled worker code may include dependencies, runtime variants are alternatives, and HTTP compression/cache change transfer bytes. The npm package's 23,798,562-byte unpacked size is also not cold browser transfer. Record the actual unique network responses of a pinned build before making a download claim. SDK dependencies allow ORT `^1.22.0`, while its worker CDN fallback names **1.24.3**: pin the lockfile and matching self-hosted runtime assets instead of mixing arbitrary JS/WASM versions. ORT explicitly requires matching builds. [S3, S8]

**RAM and mobile latency remain unknown.** Even tiny weights do not bound image buffers, activations, OpenCV heaps, WASM memory, or simultaneous engines. For scale only, one 2480×3508 RGBA buffer is **34,799,360 bytes**; converting that full image to RGB float32 would be **104,398,080 bytes**. These are arithmetic examples, not observed allocations or peak-memory estimates for this SDK. Process one page/crop at a time, release resources, and avoid keeping Tesseract, Paddle, and a language model active together on a phone.

ORT single-thread WASM avoids the cross-origin-isolation requirement for multithreading; multithread WASM needs the relevant browser isolation support. WebGPU availability and model operator coverage still need a real smoke test. The SDK has worker code requiring ImageBitmap support. ORT's own proxy-worker option does not support WebGPU; do not confuse it with the SDK-owned worker. No claim is made that all Safari/Android versions work, that every WebGPU operator is supported, or that WebGPU universally needs COOP/COEP. [S8]

### Licensing / commercial fit

The npm SDK declares **Apache-2.0**. Official tiny checkpoint cards separately declare **Apache-2.0**, with revisions recorded in the source manifest. Pinned npm metadata separately declares **MIT** for ONNX Runtime Web 1.24.3, **Apache-2.0** for the OpenCV.js wrapper 4.10.0-release.1, and **Apache-2.0** for Tesseract.js 5.1.1. These package declarations do not replace their bundled third-party notices. Preserve licenses/notices for SDK, converted weights and dependencies; confirm the distributed model archive's notices when packaging it. Code license, checkpoint license, and **training-data rights are distinct**. The opened sources do not establish a complete, independently audited license/provenance ledger for all training data; do not claim one. RapidOCR's own model-licensing notice similarly distinguishes its code from Paddle-derived model rights. [S2, S4–S5, S9]

**RapidOCR is not a third independent vote** when using the same Paddle weights. Its specifically named **RapidOCRWeb** project documents a Flask backend, so that project is not evidence of private browser-only inference. This does not imply every RapidOCR-related project is server-based. [S9–S10]

## 2. Geometry and recognition should be separate, testable branches

Proposed pipeline: original page → coordinate transform ledger → geometry-only masks for lines/boxes → field candidates and spatial label edges; original pixels → rectified/padded line crops → OCR evidence. Store inverse transforms back to original page/PDF coordinates, including rotation and crop offsets. Never use reading order as the sole relationship rule across columns, sections or people.

OpenCV's official [morphological line tutorial](https://docs.opencv.org/4.x/dd/dd7/tutorial_morph_lines_detection.html) demonstrates horizontal/vertical extraction with erosion/dilation; it is a real implementable geometric primitive, **not evidence of form semantic accuracy**. Keep geometry masks separate from OCR pixels: blindly erasing underlines can erase crossing glyph strokes. Test small rotation/skew, border touching, labels above/below blanks, narrow boxes, and a line next to two competing labels. Include checked, unchecked, crossed-out and uncertain boxes; uncertain marks stay review-only. [S11]

First try the existing raster/canvas tools for simple projections/components where adequate. OpenCV.js is real browser WASM and supports custom builds, but adding the full published 10.38 MB distribution just for a few operations needs justification; no custom-build size or speed was measured here. Reuse it if the optional Paddle path already loads it. [S12]

Tesseract 5.1.1 supports rectangle recognition and initialization config. Compare the **same crop** under PSM 7 and 13, with dictionary loading disabled in a separately initialized/reinitialized worker, against the current pipeline. Add modest white padding; preserve original glyphs and punctuation. Do not whitelist away valid email characters or normalize `1` into `l`. Tesseract OSD is not a free addition to the current LSTM-only footprint: `worker.detect` requires legacy core/language support. Prefer measured geometry or explicit rotate controls before adding that download. [S6–S7]

## 3. Better workflow: confirmed local facts plus explicit source selection

Proposed evidence contract for every destination field: **exact value + source document/page/span/polygon + source person + destination role + relationship evidence + conflict status + confirmation status**. Entity IDs must be document/session scoped, not inferred from two identical names. An applicant's DOB cannot be filled from a patient's span merely because the date is well read. Conflicting sources remain visible and unselected until resolved. Scores from different engines are not comparable probabilities.

For ambiguous characters, offer a magnified original crop and a user correction/confirmation once, then reuse that verified fact only within its selected person/role scope. A click-source-span → click-destination workflow is a useful fallback when automatic label linking fails. Keep edits/session facts local by default; persistent profiles require deliberate opt-in and deletion controls. Never use silently collected corrections as private training data or telemetry. Confirmation is an explicit action, not simply viewing a prefilled suggestion.

For camera input, local guidance can ask for all page corners, less glare, and adequate text size before OCR. A retake can recover information that no recognizer can infer reliably. This is a workflow hypothesis; measure whether it reduces correction effort. A custom camera flow uses permission-gated HTTPS `getUserMedia`, should request video only, and must stop tracks when done. Existing file upload can remain the simpler fallback. [S13]

## Exactly three next experiments

**Shared protocol first:** use the same lawfully usable visual forms and reference documents for paired comparisons; establish fresh layout/issuer/font/photo and person-disjoint development, calibration and untouched audit partitions. Keep rendered variants of one template and all pages from a document together. Include multi-person role swaps, explicit contradictions, unsupported fields, mixed native/scanned pages, rotation, underlines, checkmarks and long multipage bundles. Publicly redistribute only material with known permission, or publish derived aggregate results and lawful fixture generators; do not publish real identities. Synthetic variants are useful stress tests, not independent evidence about unseen forms.

1. **E1 — Optional independent-family OCR challenger.** Arms: current Tesseract; Tesseract on fixed rectified line crops; explicit Paddle v6 tiny on the same crops (with its internal detection retained), then full-page Paddle on the identical pages. Start with WASM single-thread. Measure exact string match and email/identifier error, missed text, polygon quality, downstream correct-review coverage, wrong-person/wrong-value fills, network bytes and device costs. **Development go:** a paired, positive improvement in exact-match review proposals or error detection without new identity errors; no confidence threshold relaxation. **Production go:** frozen calibrated acceptance meets the predeclared risk target on fresh audit data, and the chosen devices fit a predeclared measured resource envelope. Otherwise retain only an explicit optional review tool or reject. Cost: the 6.318 MB model archives plus measured runtime downloads; extra OCR startup/crop latency and memory are unknown, not free.
2. **E2 — Geometry-first line/box route with bounded crop recognition.** Arms: current route; separate morphology/deskew/transform branch plus fixed PSM7; same branch plus fixed PSM13/no-dictionary init config. Limit preprocessing variants in advance rather than expanding a threshold search after every failure. Measure field-candidate recall/precision, correct label–field edge rate, placement-inside-target rate and text exact match separately. **Go:** improve the targeted rotated/underlined stratum on paired data, do not regress boxed/native fields, and introduce zero new wrong-role or unsupported autofills in the audit. No benefit outside tuned templates, lost glyph strokes, or unacceptable memory/latency means stop. Cost: no new recognition weights for Tesseract arms; OpenCV bundle is optional and must be measured if added.
3. **E3 — Confirm-once person-bound facts versus passive review.** Arms: current review; explicit local source-person/role binding, conflict panel, magnified ambiguous span and confirm-once reuse. Use disjoint role swaps and real ambiguity rather than synthetic synonyms alone. Measure wrong-person transfer and unsupported fills, accurate final completion, remaining corrections, explicit confirmations, and paired task completion time. **Go:** lower median completion time/correction effort without reduced final accuracy, with zero cross-person/conflict bypasses and unchanged offline/no-upload behavior. Do not promote a user-confirmed value as automatically OCR-certified. Cost: no added weights; UI work and user interaction, measured rather than assumed.

All three remain **proposed**, not executed. The resource envelope must be chosen against the current baseline on representative real phones and desktop; no new numeric download/RAM requirement is invented here. Record cold/warm unique transfer bytes, cache behavior, initialization, p50/p95 page and crop latency, page sizes, browser/device/backend, task cancellation, crash/tab reloads and observable process memory. Browser JS heap alone is not total GPU/WASM memory; mark unavailable measurements unknown. Keep the default download unchanged during these experiments.

## Calibration is part of the architecture, not a confidence tweak

Report accepted wrong-fill rate and correct coverage separately, plus review precision, geometric errors and role-confusion counts. At zero accepted autofills the accepted error rate is **undefined**, not demonstrated 0%. Engine agreement is a useful feature to calibrate, not proof of independent errors. Paddle and Tesseract can still misread the same low-information glyph.

For illustration only, with zero errors among **18 independent accepted predictions**, a one-sided 95% binomial upper error bound is `1 - 0.05^(1/18)` = **15.3%**. Certifying a 1% bound with zero errors would require **299** such independent accepted observations. **1% is an illustration, not a chosen requirement.** Eighteen correct examples do not automatically meet the independence/acceptance assumptions, and 79 answerable fields are not 79 accepted predictions. Cluster evaluation by form/person/template; hundreds of fields from a few forms are not hundreds of independent cases. A cluster-level “any unsafe fill” risk can be the auditable unit, but it is a different estimand from field-level risk.

Choose acceptance rules on development/calibration data and evaluate once on untouched audit data. If selecting many thresholds on the same calibration set, use a valid multiple-testing/risk-control procedure or a new independent validation split. The primary [Learn then Test](https://arxiv.org/abs/2110.01052) paper explicitly studies selective error conditional on predicting and threshold multiplicity; it does not promise a guarantee for arbitrary correlated forms or shifted future layouts. Basic conformal risk control's exchangeability/monotone-loss assumptions and marginal guarantees are also not a blanket safety certificate. [S14–S15]

## Retain, change, reject

**Retain:** native PDF-first routing; spatial OCR evidence; conservative source/role guards; deterministic placement/export; editable review; no automatic signature insertion. **Change first:** freeze the evaluation protocol, test explicit crop/geometry arms, and add the optional tiny browser challenger only as a measured experiment; improve explicit confirmation and source selection in parallel. Fine-tuning becomes a later option for a well-defined residual detector/linker error with lawful visual training data—not a substitute for exact evidence or calibration.

**Reject for now:** more arbitrary resolution/threshold sweeps on the same inspected email; majority votes from rewrapped Paddle weights; assuming “ONNX” or “Web” means browser-local; lowering confidence to force coverage; automatic identity/email guess correction; loading larger VLM weights by default. No new concrete evidence here warrants revisiting the generic Donut/Docling list or replacing the app with generative image-to-JSON. **Open questions:** real-phone compatibility, full unique download, peak RAM, troublesome glyph accuracy, checkbox/field-linking quality, and fresh calibrated coverage. Those are the bounded experiments, not established results.

Runtime license metadata: [ORT 1.24.3](https://registry.npmjs.org/onnxruntime-web/1.24.3), [OpenCV.js wrapper](https://registry.npmjs.org/@techstark/opencv-js/4.10.0-release.1), [Tesseract.js 5.1.1](https://registry.npmjs.org/tesseract.js/5.1.1).

## Source map

All links below were opened during this research. Rolling docs are dated by access, not invented publication dates; pinned package metadata and model revisions are recorded in the accompanying source manifest.

- **S1:** [Official Paddle browser deployment guide](https://www.paddleocr.ai/latest/en/version3.x/inference_deployment/cross_platform/browser.html), rolling.
- **S2:** [Official SDK README/demo source](https://raw.githubusercontent.com/PaddlePaddle/PaddleOCR/main/paddleocr-js/README.md); [npm 0.4.2 metadata](https://registry.npmjs.org/@paddleocr/paddleocr-js/0.4.2).
- **S3:** [Core SDK README](https://raw.githubusercontent.com/PaddlePaddle/PaddleOCR/main/paddleocr-js/packages/core/README.md); [architecture](https://raw.githubusercontent.com/PaddlePaddle/PaddleOCR/main/paddleocr-js/docs/architecture.md); [published 0.4.2 model registry/source](https://unpkg.com/@paddleocr/paddleocr-js@0.4.2/dist/index.mjs).
- **S4:** [Official tiny detector card](https://huggingface.co/PaddlePaddle/PP-OCRv6_tiny_det_onnx/raw/main/README.md), 2026 model; revision `2ba1506c0380b8f0b03dd142459aac66d4421f6c`.
- **S5:** [Official tiny recognizer card](https://huggingface.co/PaddlePaddle/PP-OCRv6_tiny_rec_onnx/raw/main/README.md), 2026 model; revision `2612ab37152ae0a677521bae4e1e3d4fb4cf7c30`.
- **S6:** [Tesseract ImproveQuality](https://tesseract-ocr.github.io/tessdoc/ImproveQuality.html), rolling.
- **S7:** [Tesseract.js **v5.1.1** API](https://raw.githubusercontent.com/naptha/tesseract.js/v5.1.1/docs/api.md), pinned.
- **S8:** [ORT Web environment/session options](https://onnxruntime.ai/docs/tutorials/web/env-flags-and-session-options.html); [1.24.3 inventory](https://unpkg.com/onnxruntime-web@1.24.3/?meta).
- **S9:** [RapidOCR model license notice](https://rapidai.github.io/RapidOCRDocs/main/en/model_licenses/), rolling; not a training-data audit.
- **S10:** [RapidOCRWeb README](https://raw.githubusercontent.com/RapidAI/RapidOCRWeb/main/README.md), rolling.
- **S11:** [OpenCV line extraction tutorial](https://docs.opencv.org/4.x/dd/dd7/tutorial_morph_lines_detection.html), rolling 4.x.
- **S12:** [OpenCV.js build instructions](https://docs.opencv.org/4.x/d4/da1/tutorial_js_setup.html); [4.10.0-release.1 inventory](https://unpkg.com/@techstark/opencv-js@4.10.0-release.1/?meta).
- **S13:** [MDN getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia), rolling browser API reference.
- **S14:** [Learn then Test](https://arxiv.org/abs/2110.01052), originally 2021; opened version 5 dated 24 August 2026.
- **S15:** [Conformal Risk Control](https://arxiv.org/abs/2208.02814), originally 2022; opened version 4.
