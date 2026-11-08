# A practical path to usable, private form completion

**Research date: 8 November 2026 (SGT).** Public primary-source research; no application repository inspection, implementation, inference, training, deployment, account access or private upload. Model metadata, not weights, was fetched. Recommendations are hypotheses to test, not measured improvements. Source dates, immutable model revisions and limitations are in `sources.json` and `sources/*-metadata.json`.

## Decision: stop making universal scan autofill the prerequisite for usefulness

**Recommended product:** a private **assisted form-completion workspace**, with reliable native-PDF support, a quick recovery path for every missing field, person-bound reusable facts, and private reusable template maps. Retain OCR as an evidence-producing tool, not the authority that decides where or whose fact to write. Keep automatic scan filling disabled until separately validated. A correct value at the wrong location is a wrong fill.

The most materially different research finding is a **field detector rather than another text recognizer**: Nutrient's Apache-2.0 YOLOX-Nano checkpoint is 0.90M parameters and its actual fp32 ONNX artifact is **3,728,816 bytes**. It detects blank text/choice/signature destinations; it does not recognize their labels, determine checked state, or link people. Its published demo runs on a server, so browser performance and operator compatibility remain unverified. This merits a bounded optional experiment, not adoption or a small-RAM promise. [S10–S14]

The highest-value change needs **no model**: let a user bind a fact to a destination once, save a private map, then reuse it only when template identity/alignment checks pass. pdfme already implements the browser Designer → template JSON → Form → PDF pattern; this is implementation evidence, not a reason to replace the existing editor wholesale. [S01]

### What the supplied project results diagnose

These are **project reports, not independently reproduced external evidence**; PR12/13/14 remain unmerged.

| Reported observation | Layer to isolate | Consequence |
|---|---|---|
| Five above-label audit suggestions had correct values; **none** of their placement boxes overlapped gold | Coordinates / label-to-destination association | Do not count them as five correct fills; repair/test placement independently of recognition |
| Grove development: reported precision .60→.93, recall .19→.79; latest 27 true, 2 false, 7 missed | Candidate coverage and evaluation bookkeeping | Latest positive denominator is 34; earlier denominator was 32. Reconcile annotation versions and eligible-field rules before comparative claims |
| Six automatic fills, all native/vector, zero observed wrong | Narrow native path | Encouraging observation, not a zero-error guarantee or evidence for scan auto |
| Frozen calibration: five candidates, precision 1, recall .63; far-margin audit miss | Sparse calibration / coverage | Do not lower confidence thresholds merely to make current examples pass |
| Paddle tiny: 6.3 MB archives, **54.1 MB cold payload**, whole-Chrome peak about **1.8 GB**, slower than Tesseract desktop; phone untested | Full system cost | Do not repackage this already-tried engine as a new 6 MB solution or call Chrome memory model-only RAM |
| Dictionary, resolution, threshold and crop changes plateau; email 1/l ambiguity persists | Recognition / capture information | Agreement among correlated passes is not independent evidence of correctness |
| Patient-to-applicant DOB transfer; unsupported facts in earlier model outputs | Entity binding / evidence authority | Better OCR or vision alone does not repair whose fact it is |

Long-underline development gains (18/22→20/22), boxes 16/22, and repeatedly examined layouts remain development evidence. Prompt/LoRA failures justify pausing that track, not declaring learning-based perception impossible.

## 1. Make the assisted path excellent first

### Proposed interaction contract

1. **Select person and role first.** Show separate applicant, patient, spouse, representative and other source entities. Let the user explicitly bind a target section to a person. Missing or conflicting evidence means “not provided / needs confirmation,” not a plausible invented value.
2. **Present a completion queue, not just detected boxes.** Show accepted, needs review, unanswered, deliberately skipped and manual-only fields separately. Never describe a detector's output count as all required fields. A page-by-page “anything missing?” review and an always-available Add field action recover detector false negatives.
3. **One action connects evidence and destination.** Selecting a suggested field highlights the target and the exact source crop/span plus person/role. Ambiguous email characters remain visibly ambiguous until the user types/confirms them. Corrections create explicit local provenance, not a silent global substitution rule.
4. **Click/tap to place; drag/resize is optional.** Add keyboard nudges, position/size controls and a two-click/two-tap corner alternative. WCAG 2.2's dragging criterion explicitly requires a non-drag single-pointer alternative; keyboard support alone does not meet that touch requirement. [S03]
5. **Separate value acceptance from placement acceptance.** Bulk accept only a visibly reviewed, same-person group whose destinations are already trusted. Uncertain locations stay separate even when the source value is certain. Provide undo/redo, next/previous field, skip, manual checkbox choice, and an export preview with unresolved counts.
6. **Offer a mobile questionnaire view after mapping.** Instead of precision-editing every PDF box on a phone, enter/review facts in ordinary accessible HTML inputs, then render them into the reviewed map. pdfme's browser Form/Designer/generator demonstrates this split is implementable. No claim of its bundle size or app integration cost is made. [S01]

**Empirical UX evidence, narrowly scoped:** FormA11y reports a within-subject study of 20 participants and 2.8× faster PDF accessibility **remediation** than Acrobat, using structured review/remediation aids. It did not measure this app or personal form-filling speed. Its review queue, missing-field trail and section restriction are useful design evidence; the speed ratio is not a forecast. PubMed/other publication-year metadata are inconsistent, so use the DOI/record rather than an invented definitive year. [S02]

**New workflow alternative:** reference OCR need not be on the critical path for repeat users. A user can verify a compact structured profile once, retain source/confirmation provenance privately, and reuse those exact facts. A verified profile answers “what”; the reviewed template answers “where”; a section/person binding answers “for whom.” Keep these three separate. Do not store personal values in a reusable blank template.

## 2. Make geometry a tested subsystem, not incidental OCR arithmetic

### Native PDF routing

Use page-level capabilities: editable native widgets; visible native text/vector geometry; XFA with or without fallback widgets; raster/scan; mixed pages; and genuinely empty/non-form pages. A missing widget result is not proof of a scan. Prior lawful-source inspection found all ten acquired official government PDFs had **XFA plus extractable text**, whereas the CC0 controls independently cover AcroForm, image-only non-form and empty paper. This is prior local structural research, not a browser test or universal statement about government forms.

PDF.js documents `view`, `rotate`, `userUnit`, `getViewport`, `getTextContent`, `getOperatorList`, nullable `getStructTree`, `isPureXfa` and `getXfa`. These supply useful evidence, not ready-made blank-field semantics. Its XFA renderer representation is not a supported XFA editing/export API. pdf-lib explicitly does **not** read, modify or create XFA fields. `deleteXFA()` merely disconnects XFA to force existing fallback fields; it is not a converter. Preserve originals; do not delete XFA blindly. [S04, S06]

Use native field names/types/rectangles/options and structural groups first, but do not treat opaque field names as semantic truth. Use text with its transforms and vector line/rectangle operations to build layout blocks, table cells and section boundaries. `getOperatorList()` is a low-level path stream; extracting fields from it remains engineering work. Pure nearest-line or nearest-label matching ignores spanning cells, two columns, above-label layouts and repeated role sections.

### A coordinate ledger with executable invariants

**Proposed design:** persist explicit transforms between CSS-local pointer coordinates, rendered viewport, original image pixels, OCR/detector crop pixels, rectified image and PDF user space. Record page, units, origin, CropBox/MediaBox, rotation, userUnit, zoom and device pixel ratio; invert the exact preprocessing transform, not an independently reconstructed approximation.

PDF.js's viewport API exposes the forward/inverse conversions; current typed API confirms viewBox/userUnit/scale/rotation/offsets. This research checked PDF.js 6.2.108 types, **not the app's installed version**. pdf-lib `getSize()` follows MediaBox; CropBox may be smaller and offset. Mixing those boxes can shift correct values. PDF text baseline/font metrics also differ from a UI rectangle's top-left. [S04–S07]

Transform all four corners when perspective or arbitrary scan rotation is involved. Retain polygons until the PDF/editor rectangle approximation is explicitly chosen. Test original PDF → viewport → pointer/OCR → PDF round trips and **render the exported PDF again**: an internally correct JSON bbox does not prove correctly drawn output.

### Repeated forms: template registration before general vision

Start with an exact blank-file hash and an explicit saved map. Next consider a map signature incorporating page count, dimensions, stable native text anchors and reviewed geometry. For camera/re-rendered copies, offer manual four-corner registration, then consider text/grid-anchor registration with outlier rejection. OpenCV.js documents affine and perspective transforms; four non-collinear point pairs determine a projective transform. [S08]

The OpenCV feature/homography tutorial illustrates matched features plus RANSAC, but its SURF/C++/Python example is **not proof those features are compiled into a browser build**. Prefer existing simple geometry or a verified minimal module over importing all OpenCV by default. A custom anchor matcher must verify its actual browser operations. [S09]

Fail closed on wrong revision, missing/reordered pages, insufficient independent anchors, large residuals, implausible scale/skew, or a changed local field neighborhood. A global homography describes a planar sheet, not arbitrary folds/curvature. Request a retake/manual adjustment rather than automatically accepting a curved-page approximation. Template registration reuses geometry; it must never reuse last person's values or bypass entity gates.

## 3. Replace the brittle part with a compact detector—only if the measured experiment wins

**Architectural split:** locate blank destinations → associate labels/sections → bind source facts → decide/review → export. A detector can replace many line-threshold rules without replacing OCR or identity checks. Segmentation can trace arbitrary regions but adds mask handling and still does not identify whose value belongs there; box detection is the more direct first experiment for editable text/choice fields.

All byte counts below are **actual public artifact metadata**, not network transfer, total package size, RAM or an int4 estimate. No model was downloaded/run. Parameter counts are model-card or safetensors metadata as specified.

| Candidate | Verified task and size | Browser / license evidence | Decision |
|---|---|---|---|
| **Nutrient form-field-v1-nano** | YOLOX-Nano, card says **0.90M**; fp32 ONNX **3,728,816 B**, fp16 **1,918,066 B**. Text destination, choice-button destination, signature destination | Apache-2.0 checkpoint; YOLOX code Apache-2.0. Card has Python ORT usage, not a verified app/browser runner. Its demo is Gradio on **ZeroGPU**, not local-browser proof | **First optional detector experiment**, fp32 WASM first; test exact graph/operators, accuracy, runtime and complete payload. Signature remains manual |
| **FFDNet-S CPU ONNX** | Card says **6M**, ONNX **38,370,092 B**. Text/choice/signature destinations | Real CommonForms browser demo and ORT Web implementation exist, but the CPU card does not declare a license; upstream issue explicitly distinguishes Apache code from unresolved YOLO weight licensing. Paper/card parameter descriptions differ | Browser feasibility reference, **not adoptable merely because a demo exists**; resolve checkpoint/license lineage first |
| **FFDetr / DocSpring ONNX export** | Genuine RF-DETR field detector. Original checkpoint **134,960,879 B**; fixed-1024 ONNX **125,093,295 B**. No verified parameter count needed for this decision | Both original card and converter declare Apache-2.0; converter includes LICENSE. ONNX/Python parity claimed by converter; **no inspected runnable local-browser demo for this exact export** | Larger reserve/desktop comparison, not default. CommonForms underlying source-document rights remain distinct from checkpoint license |
| **Docling heron** | **42,889,979** safetensors parameters; **171,658,996 B** weights. Classes include **selected/unselected checkbox**, Form and Key-Value Region | Apache-2.0 card; Python RT-DETRv2 example. Training report includes proprietary data. No inspected exact-browser deployment | More relevant than “Markdown OCR,” but coarse region labels do not prove exact writable subfields or person linking; not first mobile choice |
| **SmolDocling-256M preview** | **256,484,928** safetensors parameters. q4 decoder **86,894,835 B** + q4 embeddings **113,541,438 B** + q4 vision **63,784,944 B** = **264,221,217 B**, before tokenizer/runtime | A real third-party demo page claims Transformers.js **4.2.0**, q4 WebGPU, ~265MB; not executed here. Model-card license metadata says **CDLA-Permissive-2.0**, prose summary says Apache: reconcile before integration | Useful browser-vision counterexample, **not “vision cannot run in browser.”** DocTags layout/OCR/table conversion ≠ blank-field/person-to-reference filler; generation, image tiles/KV cache and memory remain costs |

[S10–S20; exact revisions/hashes in metadata files.]

**Important task distinctions:** Nutrient, FFDNet and FFDetr locate a checkbox/radio destination but do not classify checked state. Heron explicitly has selected/unselected classes, but a Form/Key-Value Region box does not establish label-to-writable-blank linking. SmolDocling emits bounding-box tokens for document elements; those are not automatically accurate editor coordinates. None of these cited cards establishes reference-to-form identity matching. Do not infer such capability from DocVQA, document conversion, table extraction or generic layout mAP.

Nutrient's current vendor empty-form mAP50–95 is .378, with signature .179; these are not production acceptance rates. Its card reports different aggregate/variant numbers and another benchmark revision reported different figures: do not mix scorer/version/split definitions. Its synthetic-training/no-PII statement is not an independently audited fonts/template rights ledger. The vendor's approximately 90 pages/sec laptop-CPU claim lacks enough setup detail to forecast this app's performance. [S10]

**A useful concrete export lesson:** DocSpring's FFDetr conversion fixes the input at 1024 and precomputes positional-embedding resizing because antialiased bicubic interpolation cannot be expressed in that ONNX export. It specifies normalization and outputs. This is stronger evidence than “any PyTorch model exports,” but still not WebGPU/WASM operator validation. Their 91.5% fields-found figure uses **IoU .3** and is neither an exact placement score nor an app benchmark. [S17]

**Another evaluation warning:** Docling's report shows large effects from label taxonomies, annotation omissions and postprocessing, and describes a docling-eval procedure that skips samples when predicted and gold counts differ. That is unsuitable as this app's completion score: missing fields must remain in the denominator. Its public benchmarks include proprietary data and GPU/server timing; none predicts phone speed. [S19]

### How a small learned detector would be trained, if later justified

Do not start with another text LoRA. Define geometry labels for text destinations, choice controls and manual-only signatures; separately annotate label-to-field and section/person-role edges. Generate lawfully owned form layouts with exact renderer gold and randomized fonts (with rights), line styles, whitespace, labels above/beside/below, columns, repeated people, page sizes, negative pages, cropping, rotation, blur and perspective. Hold out **entire template/generator families**, not merely different names or raster scales. Add independently reviewed real lawful blank-form annotations. Synthetic glyph/template success alone is not generalization.

First test an existing permissive tiny detector; train only if its error taxonomy shows a learnable domain gap and enough independently annotated real validation exists. Keep model/dataset/code/font licenses and provenance separate. Public accessibility or an Apache dataset wrapper does not grant rights to every crawled original. No CommonForms corpus, FUNSD or XFUND product evaluation/training is authorized by this memo.

## 4. Recognition: bounded crop assistance, not guessing identities

Keep the current browser OCR as the baseline. The pinned Tesseract.js 5.1.1 API supports worker reuse, region recognition and cleanup; dictionary loading switches are initialization-only. These capabilities are verified but already-explored parameter sweeps are not a new strategy. [S24]

The next recognition use is **only on selected uncertain source/label crops**, after geometry is trustworthy. Preserve original pixels, rectify the crop with invertible coordinates, recognize, and show any disagreement to the user. A type constraint can reject an invalid date/email, not silently decide `1` versus `l`, invent a missing character or transfer a patient fact. Scores and syntax validators are not calibrated truth. Only a materially independent recognizer whose conditional error/latency is measured should join an ensemble; repeated Tesseract preprocessing passes are correlated. Handwritten facts and signatures remain manual confirmation scope unless separately evaluated.

**Runtime discipline:** ORT Web documents separate JS, WASM and model assets; WASM-only conditional imports/custom kernel builds can reduce footprint, but this memo has no measured savings for the proposed detector. Matching JS/WASM builds are required. Single-thread WASM avoids the multithreading isolation requirement; multithreading requires browser support and cross-origin isolation. WebGPU requires a secure context; the ORT proxy-worker flag does not work with WebGPU, so worker architecture must be deliberate. Do not load all engines concurrently or promise that a 3.7MB model means 3.7MB RAM. [S13–S14]

For scale only, the nano input tensor at fp32 is 1×3×640×640×4 = **4,915,200 bytes**, and its documented output is 268,800 bytes; these are arithmetic tensor sizes, **not peak memory**. Large full-page raster buffers, activations, WASM heaps, browser/GPU allocations and repeated pages matter. Process one page/crop at a time, cap concurrency, cancel promptly and release it. Full cold payload, peak browser-process memory and actual phone behavior are unknown for all new candidates.

**Explicit constraint-change alternatives:** Apple Vision's 2025 RecognizeDocumentsRequest runs on-device and returns table/cell structure, lists, text and detected contact data; it is a native-platform API, not a browser API or proof of a blank-form filler. Google ML Kit's Android bundled text library documents about **4MB per script per architecture** (approximate app-size increase, not exact weight bytes), with text/line/symbol coordinates and confidence. Its current instructions require API23+, despite an inconsistent API21 summary. Both could motivate a separately maintained native companion if web-only proves limiting; SDK/platform terms are separate, and neither is an open-weight browser replacement. [S33–S34]

An opt-in cloud VLM could be a separately consented comparative upper bound on difficult visual reasoning, but changes the privacy/no-upload contract, adds service/cost dependencies and still needs coordinate/entity checks. It is **not the recommended default**, and no cloud call/upload was made. Likewise, current Surya 2.5 is 689M with Python/native serving and qualified commercial weight terms, not a tiny browser drop-in; LayoutLMv3's upstream card is CC-BY-NC-SA4.0 and not an OCR-free ready filler. Docling converts structured documents; conversion alone is not the missing target-field/person authority. [S21–S23]

## 5. Extension filling needs semantic adapters and an honest privacy boundary

Prioritize explicit HTML `autocomplete` semantics, associated labels/accessibility names, form ownership, fieldset/legend/section context and user-selected person. WHATWG defines `section-*`, billing/shipping and contact scopes, **but section IDs are opaque**: the standard explicitly says not to infer child/spouse meaning from the literal section identifier. `section-spouse` alone must not authorize a spouse fact. Repeated sections need a user binding or genuine surrounding role evidence. [S25]

Accessible-name computation is richer than nearest visible text: native labels, ARIA references and even referenced hidden text can contribute. AccName 1.2 is currently a **4 November 2026 Working Draft**, not a final Recommendation. Treat it as implementation guidance alongside stable native semantics, not as evidence that an extension automatically has a full accessibility-tree API. [S26]

Retain user-gesture `activeTab`, preview, selected facts only and no-submit. Chrome documents temporary origin-scoped access, an isolated script world but a **shared DOM**, and frame matching requirements. Do not quietly expand to broad hosts. For inaccessible/cross-origin frames, ordinary closed shadow roots or restricted pages, show a manual/copy fallback rather than treating absence as permission to inject farther. Open roots and permitted frames need their own adapter tests. [S27–S28, S31]

React controlled inputs can revert direct DOM assignments; programmatic `.value` does not itself fire an `input` event. Dispatch/readback may integrate with a particular site, but is not a universal framework guarantee. Maintain small tested site/form adapters, verify values after a render cycle and after relevant DOM mutations, reject stale mappings, and never invoke private framework internals as a general fix. Do not click default buttons or simulate submission. [S29–S30]

**Critical privacy distinction (inference from shared DOM and event behavior): no Submit is not no transmission.** Once values enter a remote page's DOM, that site's scripts can read them or autosave before Submit. Preview must say that Fill shares the selected facts with **that site now**. Offline PDF mode can have a local/no-document-egress contract; remote-site extension mode cannot make the same promise merely by avoiding Submit. Do not send the full private profile/provenance graph to the page.

IndexedDB is local storage, not a backup or an encryption claim. Best-effort data can be evicted; persistent-storage requests may be denied, and private-browsing data is usually cleared. Handle quota failure, provide deliberate export/import/deletion and explain loss/recovery. Storage is origin-scoped: different application paths on the same origin are not an independent privacy boundary; review same-origin scripts and dependencies. [S32]

## 6. Five finite experiments, with stop/go gates

These are **proposed gates**, not existing product guarantees or user-imposed numeric budgets. Effort ranges are rough single-engineer planning estimates, exclude integration surprises and study recruitment, and are not measured. The machine-readable plan is `experiment-plan.json`.

| Priority | Experiment / baseline | Falsifiable gate | Estimated effort / incremental cost |
|---|---|---|---|
| **E1 first** | Coordinate/export contract + reconciled gold; no recognizer change | 100% of enumerated transform fixtures round-trip within agreed numeric tolerance; exported rendered anchors within **1 PDF point**; zero wrong-page/rotation cases. Existing above-label failure must be diagnosed, not relabeled as correct. Reconcile 32/34 denominator in a versioned ledger before A/B claims | **2–4 engineering days**; no new weights |
| **E2 immediate** | Assisted queue + click placement vs existing manual Edit+Sign, matched lawful forms | Proposed usability gate: at least **25% lower paired median completion time**, no lower completion rate, no higher residual wrong fills; every missing field recoverable; source/person provenance visible. Include first-use and repeat tasks, mouse/keyboard/touch, and unassisted residual-error inspection | **3–7 days** prototype/instrumentation; no new weights; human study effort additional |
| **E3 next** | Private exact-template map, then anchor/manual-corner alignment vs repeated manual placement | Repeat-task time lower including amortized setup; at least **50% fewer placement actions** on repeats; **all seeded changed-revision/page/role traps rejected**; no previous-person values carried over. Report template-authoring time and break-even reuse count | **3–6 days**; no model weights; optional geometry-module payload must be measured |
| **E4 bounded optional** | Nano detector vs existing field candidates; retain the same value/person layer | First exact-graph browser smoke test, Apache notices/provenance and actual device resource gate. On frozen family-disjoint scan set: at least **+10 percentage points target-field recall at precision ≥.95**, using declared IoU≥.5 one-to-one matching; no identity automatic fills. Then placement/export and human-time benefit must also win. Fail → no adoption | **2–5 days** feasibility plus annotation/device testing; fp32 model **3,728,816 B**; full runtime/download/RAM unknown |
| **E5 before extension launch** | Semantic adapters and disclosure, synthetic local/controlled site fixtures vs current preview/fill | All seeded multi-person/stale-DOM/controlled-input/allowed-frame/open-vs-closed-root cases either correctly fill+read back or visibly abstain. Zero submits; no unselected facts exposed. Verify autosave-on-input fixture demonstrates why fill is disclosure. No permission expansion | **3–5 days**; no model weights; device/site maintenance ongoing |

**Cross-cutting device gate:** before each optional engine experiment, freeze device/browser/version, page/crop resolution, full cold unique network bytes, cached startup, p50/p95 page and task latency, peak browser/process/GPU-memory methodology where observable, cancellation responsiveness, repeated 20-page behavior and offline behavior. Use at least one actual constrained Android phone and one supported iPhone/Safari plus desktop; emulation/desktop Chrome alone is insufficient. If process/GPU memory cannot be measured, state the blind spot and record OS/app termination and memory-pressure symptoms instead of claiming a number. Agree resource ceilings from actual target devices before adoption; this memo does **not invent a fixed download budget**.

### Benchmark validity and release evidence

- Reuse lawful blank forms under the **per-item** rights catalog, not a blanket “all .gov public domain” claim. Prior curation opened the [IRS reuse policy](https://www.irs.gov/about-irs/use-of-content-from-irsgov), [GSA policy](https://www.gsa.gov/website-information/website-policies) and [VA copyright policy](https://department.va.gov/copyright-policy/); these are scoped evidence, not blanket worldwide clearance. CC0 controls can be included now; IRS/GSA items remain conditional on documented reuse/asset/jurisdiction caveats; VA payloads retain publication holds. Two natural paper scans returned403 and were not acquired. The current batch is not adequate natural-camera-scan coverage. Scanning/photographing owned or cleared blank originals is a lawful next collection route subject to the originals' conditions, not proof of model improvement.
- Split by issuer/template/generator family and revision; keep alternate renderings, fonts, synthetic identities and camera captures of the same template in one family. Report ordinary forms, tables, narrow underlines, above-label, multi-column, repeated roles, multipage, empty/non-form negatives and mixed native/raster separately.
- Gold needs independently checked target destination boxes/polygons, label regions, source spans, role edges, page units/origin/box/rotation and reviewer provenance. Existing widget rectangles can be useful but are not infallible gold: official-use fields, duplicate/stray widgets and signatures-as-text need adjudication. Unfilled source text is not itself a source of personal facts; populate **fictional identities only** for tests.
- Use separate denominators for localization precision/recall, label-link accuracy, exact value correctness, person linkage, valid placement/export and completed task. Score end-to-end fill correct only if **all** hold. IoU of a destination box and rendered-value containment/legibility should both be reported; a correct string with zero target overlap fails.
- Treat suggestion accuracy and automatic-fill risk/coverage separately. Count missing/rejected proposals, manual corrections, completion rate, elapsed time and user actions. Stratify wrong-person, invented-value and wrong-location errors rather than averaging them away.
- Freeze development, calibration and audit artifacts with hashes. Repeated peeking converts audit data into development; create a genuinely new audit rather than retuning until the old audit passes. Annotation revisions need changelogs, not hidden denominator changes.
- Finite-sample risk calibration is possible in principle without refitting; Learn then Test explicitly requires a held-out i.i.d. calibration sample, controls stated risks and warns that guarantees are marginal. Correlated fields from a few templates are not hundreds of independent trials. Calibrate/evaluate at document or family units, report clustered uncertainty, predeclare threshold searches and do not claim distribution-shift immunity. [S35]
- As an arithmetic illustration only, zero errors in **five independent accepted trials** gives a one-sided 95% binomial error upper bound of **45.1%** (`1 - .05^(1/5)`); even this illustration's independence does not hold automatically for same-form fields. Zero observed errors is a launch observation, not universal safety proof.
- Validate no document/value egress after local-mode asset warmup, separately audit initial asset requests, and test offline cache failures, storage eviction, undo/export/import and rendered export. Remote-site Fill is a different disclosure boundary, as above.

## Immediate / next / later, and what not to pursue

**Immediate:** reconcile gold and geometry; make missing-field recovery/source review fast; retain manual signature actions; launch only the actually supported native-widget/vector subset plus **assisted scans**, clearly labeled experimental where appropriate. Preserve original and editable output; pdf-lib flatten removes fields and should be a separate explicit export option. Validate fonts/non-Latin appearance rather than assuming default WinAnsi handles every profile. [S06]

**Next:** private template maps and repeat-use questionnaire; semantic extension adapters with explicit disclosure; independent real-layout/device usability evaluation. The best feature is fewer manual actions with a complete, visibly correct document—not the largest auto-fill count.

**Later, only if the frozen tests justify it:** optional tiny field detector; targeted recognition challenger; lawful small-detector training with real annotations. Fine-tuning shifts from forcing a small text model to invent spatial truth toward supervised destination/relationship prediction. Evidence authority, person binding and export remain deterministic constraints even after learning.

**Do not prioritize:** another broad Tesseract threshold sweep; re-running the already-costly Paddle pipeline as a novel idea; default full-page generative VLM replacement; SAM-style masks without a demonstrated destination task win; larger model downloads before resource measurements; NC datasets in product evaluation; confidence threshold relaxation on five cases; or universal scan auto as the launch promise. A larger cloud model is a consent/privacy-changing comparator, not the solution to the current product contract.

**Bottom line:** usability is achievable as a narrower product hypothesis now—native automation plus excellent assisted scans and reusable private maps. General scan automation remains an empirical research objective. The new detector evidence is promising, but the immediate blocker shown by the supplied audit is trustworthy placement and recovery, not simply recognizing more text.

## Primary references

Sources were opened/read during this research; dates and caveats are in `sources.json`. A rolling page without an explicit publication/update date is marked undated rather than assigned a fabricated date. Vendor/model/demo claims were not independently benchmarked.

- **S01** [pdfme browser template/Designer/Form/generator](https://pdfme.com/docs/getting-started); [MIT license](https://raw.githubusercontent.com/pdfme/pdfme/main/LICENSE.md).
- **S02** [FormA11y empirical study record](https://pubmed.ncbi.nlm.nih.gov/41307077/) (initial read succeeded; a later repeat returned429; DOI10.1145/3702317).
- **S03** [W3C WCAG2.2 dragging alternatives](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html).
- **S04** [PDF.js PDFPageProxy API](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib-PDFPageProxy.html).
- **S05** [PDF.js6.2.108 viewport types](https://cdn.jsdelivr.net/npm/pdfjs-dist@6.2.108/types/src/display/page_viewport.d.ts).
- **S06** [pdf-lib PDFForm: XFA, flatten, font limitations](https://pdf-lib.js.org/docs/api/classes/pdfform).
- **S07** [pdf-lib PDFPage: page boxes/rotation](https://pdf-lib.js.org/docs/api/classes/pdfpage).
- **S08** [OpenCV.js geometric transforms](https://docs.opencv.org/4.x/dd/d52/tutorial_js_geometric_transformations.html).
- **S09** [OpenCV feature matching/homography tutorial](https://docs.opencv.org/4.13.0/d7/dff/tutorial_feature_homography.html).
- **S10** [Nutrient nano model card](https://huggingface.co/nutrientdocs/form-field-v1-nano/raw/main/README.md).
- **S11** [Nutrient demo's server execution declaration](https://huggingface.co/spaces/nutrientdocs/form-field-v1-demo/raw/main/README.md).
- **S12** [YOLOX Apache2.0 code license](https://raw.githubusercontent.com/Megvii-BaseDetection/YOLOX/main/LICENSE).
- **S13** [ORT Web deployment/assets](https://onnxruntime.ai/docs/tutorials/web/deploy.html).
- **S14** [ORT environment flags/runtime requirements](https://onnxruntime.ai/docs/tutorials/web/env-flags-and-session-options.html).
- **S15** [CommonForms browser demo](https://commonforms.simplepdf.com/); [implementation README](https://raw.githubusercontent.com/SimplePDF/commonforms-web/master/README.md).
- **S16** [FFDNet-S CPU card](https://huggingface.co/jbarrow/FFDNet-S-cpu/raw/main/README.md); [original model card](https://huggingface.co/jbarrow/FFDNet-S/raw/main/README.md); [maintainer license discussion](https://github.com/jbarrow/commonforms/issues/9).
- **S17** [FFDetr upstream card](https://huggingface.co/jbarrow/FFDetr/raw/main/README.md); [fixed-1024 ONNX converter documentation](https://huggingface.co/docspring/ffdetr-onnx/raw/main/README.md).
- **S18** [CommonForms paper](https://arxiv.org/abs/2509.16506).
- **S19** [Heron card/classes](https://huggingface.co/docling-project/docling-layout-heron/raw/main/README.md); [training, evaluation, runtime report](https://arxiv.org/abs/2509.11720).
- **S20** [SmolDocling current card](https://huggingface.co/docling-project/SmolDocling-256M-preview/raw/main/README.md); [third-party browser implementation/demo](https://webai.show/models/smoldocling-document/).
- **S21** [Surya current runtime/weight terms](https://raw.githubusercontent.com/datalab-to/surya/master/README.md).
- **S22** [LayoutLMv3 upstream model/NC license](https://huggingface.co/microsoft/layoutlmv3-base/raw/main/README.md).
- **S23** [Docling supported formats/structured output](https://docling-project.github.io/docling/usage/supported_formats/).
- **S24** [Tesseract.js pinned5.1.1 API](https://raw.githubusercontent.com/naptha/tesseract.js/v5.1.1/docs/api.md); [Apache code license](https://raw.githubusercontent.com/naptha/tesseract.js/v5.1.1/LICENSE.md).
- **S25** [WHATWG autocomplete/person/section scope](https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#autofill).
- **S26** [W3C Accessible Name and Description Computation1.2](https://www.w3.org/TR/accname-1.2/).
- **S27** [Chrome activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab).
- **S28** [Chrome content-script isolation/frame scope](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts).
- **S29** [React controlled input contract](https://react.dev/reference/react-dom/components/input).
- **S30** [MDN programmatic value/input-event behavior](https://developer.mozilla.org/en-US/docs/Web/API/Element/input_event).
- **S31** [MDN closed shadow-root access](https://developer.mozilla.org/en-US/docs/Web/API/Element/shadowRoot).
- **S32** [MDN local-storage quotas/persistence/eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria).
- **S33** [Apple WWDC25 on-device document structure and capture quality](https://developer.apple.com/videos/play/wwdc2025/272/).
- **S34** [Google ML Kit current Android OCR/model-size/capture guidance](https://developers.google.com/ml-kit/vision/text-recognition/v2/android).
- **S35** [Learn then Test, version5](https://arxiv.org/abs/2110.01052v5).
