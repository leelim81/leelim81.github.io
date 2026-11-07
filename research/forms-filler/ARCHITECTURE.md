# Architecture before more fine-tuning

Research date: 7 November 2026 (SGT). This page is a research proposal. It records an engineering judgment and the public sources behind it. It is not a measured comparison of the live Forms Filler, and it is not an architecture the app implements. No vision switch was built for this note. The separate v3 text-model fixture stays frozen and is not scored here.

Audit trail: [architecture/sources.json](architecture/sources.json) (32 public records, retrieval time, HTTP status, body hash, relative snapshot id). Artifact byte inventories: [architecture/artifact-inventory.json](architecture/artifact-inventory.json). Fetched page and model-card bodies are not vendored. `snapshot_id` names the retrieved body. The hash is of that body. There is no local filesystem path in the audit.

Prior product observations below come from the project record already published under this directory. This research pass did not re-run them.

## Decision

A form filler has four jobs: read and locate fields, associate labels with empty regions and section roles, extract facts about the right person, and write supported values into the original document. A stronger language model cannot recover coordinates or person boundaries that an earlier step threw away. A vision-language model can help the first two jobs. It does not remove the other two.

The proposed pipeline is a native-PDF fast path, spatial OCR that keeps boxes, sections, and transforms, a provenance and entity evidence graph, bounded fact selection, and a deterministic editor. A crop vision-language model is an optional later arm, and only after the same lawful visual benchmark and the same runtime gates. Model-card claims are not a reason to replace the live model or to upload documents to a cloud service.

LoRA does not reduce the base parameter count, so it does not by itself shrink the download. A small specialist or distillation can. That still needs its own held-out check.

The diagnostic that should come first is oracle substitution: perfect OCR, then perfect field geometry, then perfect identity binding, each measured alone. That shows which layer still causes the error.

## Where the observed failures sit

| Observed problem | Layer | Proposed intervention | Fine-tuning |
| --- | --- | --- | --- |
| Scanned fields land on the wrong row | Geometry, blank regions, label links, transforms | Keep token polygons, page and crop transforms, and sections. Validate the overlay. | A spatial detector or link ranker, if rules plateau |
| A patient's date copied onto the applicant | Entity and role binding | Separate applicant, patient, and dependant entities. An explicit same-person link is required. Ambiguity stays blank. | Hard-negative ranking can help. The deterministic guard stays. |
| Invented citizenship or bank data | Unsupported generation | Emit an evidence id or null. Check the source span and the allowed normalization. | Teach abstention. Do not teach a nationality guess from a name or an address. |
| Optional schema keys and malformed held-out JSON | Contract and runtime | One versioned prompt and schema. Validate ids and types on the exact production tokenizer and quantization. | Train only after that contract is frozen. |
| A text model misses columns and checks | The interface dropped the layout | Words, boxes, and a section graph, or a visual encoder | Text-only LoRA cannot restore evidence the prompt never contained |
| Stuck progress and edit/fill state mixing | App lifecycle | Per-document jobs, isolated state, cancellation, stable overlay geometry | None |

## Approaches

| Approach | What the sources support | What remains | Fit |
| --- | --- | --- | --- |
| PDF-native first | PDF.js exposes field objects, annotations, text with transform, width, and height, the viewport, structure, and operators ([pdfjs](https://mozilla.github.io/pdf.js/api/draft/api.js.html)) | Widget names can be meaningless. A vector page may have no widgets. A text layer on a scan can be stale. Drawing order is not reading order. | Fast path when widgets are real. No model download for that geometry. |
| Layout-preserving OCR plus a small linker | LayoutLMv3 and UDOP take words, boxes, and pixels ([LayoutLMv3](https://huggingface.co/docs/transformers/model_doc/layoutlmv3), [UDOP](https://huggingface.co/docs/transformers/model_doc/udop)). Spatial dependency parsing predicts relations ([SPADE](https://aclanthology.org/2021.findings-acl.28/)). | A token classifier labels text that already exists. Empty boxes still need a detector. OCR errors still propagate. | Recommended scan baseline: geometric rules, then a compact ranker if annotations justify it. |
| OCR-free image to structure | Donut generates structure without a separate OCR engine ([paper](https://arxiv.org/html/2111.15664v3)). SmolDocling and Granite-Docling emit DocTags with element locations and can read a region by box. | Conversion is not the same as finding every writable blank, binding people across documents, or writing editor coordinates. Generation can truncate or loop. | Experiment arm. A conditional crop is the smaller risk. |
| Small grounded vision model | Florence-2 `<OCR_WITH_REGION>` returns quadrilaterals around printed text ([card](https://huggingface.co/microsoft/Florence-2-base)). The official browser example runs that localization ([demo](https://github.com/huggingface/transformers.js-examples/tree/main/florence2-webgpu)). SmolVLM accepts an image plus text and has an official browser example. | Florence localizes printed text. It does not fill a form or decide applicant versus dependant. SmolVLM's text answer is not a localization contract. DocVQA is not form filling. | Florence is a localization control. SmolVLM is only an optional crop challenger. |
| Hosted large vision model | A different deployment: the page image leaves the browser. | It can still hallucinate, mix people, miss small type, or emit approximate coordinates. | Research upper bound on redistributable or synthetic pages only, with the provider and version pinned. No private-document upload and no hidden cloud fallback. |

"OCR-free" means no separate OCR engine at inference time. Donut's pretraining still uses OCR-derived text labels. PaddleOCR-VL's bare Transformers example is element recognition. Full-page parsing uses its larger pipeline ([card](https://huggingface.co/PaddlePaddle/PaddleOCR-VL)). A vision-language model can remove one OCR error path and add its own resolution, generation, grounding, and hallucination failures.

Published task scores stay on their own tasks. Granite-Docling's card reports layout F1 0.86 against SmolDocling 0.85, layout mAP 0.27 against 0.23, full-page OCR F1 0.84 against 0.80, and a FinTabNet table score 0.96 against 0.76. A high table score is not field placement. SmolVLM-256M reports DocVQA validation 58.3. That is document question answering, not fill precision. No app visual benchmark was run for this note.

## Candidates, bytes, and runtimes

Sizes below are decimal megabytes from public Hub file inventories fetched on 7 November 2026. They are not measured downloads, not peak RAM, and not accuracy. Tokenizers, configs, the JS runtime, and OCR packs are extra. Parameter totals include the vision encoder. The file list and revisions are in [artifact-inventory.json](architecture/artifact-inventory.json).

| Model | Parameters and checkpoint | Browser artifact on record | Runtime caveat |
| --- | --- | --- | --- |
| Florence-2-base | 231,567,705 parameters. `model.safetensors` 463,221,266 bytes, float16. | Official base-ft WebGPU example: float16 embeddings and vision, q4 text encoder and merged decoder, four ONNX files, **357,163,078** bytes. The float32 vision fallback is larger. | Official browser demo supports localized OCR. It is not a form filler. Warmup shape in the example is `[1,3,768,768]`. No phone peak-RAM figure was verified. |
| SmolDocling-256M-preview | 256,484,928 parameters. BF16 checkpoint 513,028,808 bytes. | Published q4 ONNX embed, vision, and merged decoder: **264,221,217** bytes. | Near a 300MB candidate. Superseded by Granite-Docling. Hub YAML says CDLA-Permissive-2.0 and the card body says Apache-2.0. Resolve that before any redistribution. A community browser repo was not run. Official 0.35s/page is A100/vLLM, not a phone. |
| Granite-Docling-258M | **257,517,120** parameters. Card: Granite 165M decoder plus SigLIP2. BF16 checkpoint 515,093,104 bytes. | Community ONNX export. Count the external `_data` files. All-q4 is **400,028,103** bytes. All-q4f16 is **264,311,910** bytes, about 264MB. | This is an artifact inventory. It is not a tested WebGPU model. A browser run needs Transformers.js and ONNX Runtime Web, which is a different stack from the pinned WebLLM 0.2.79. q4f16 files existing does not prove operator support, accuracy, or a successful generation. Splitting a page into tiles raises memory. No phone peak RAM was verified. License metadata on the official card and the community export is Apache-2.0. Training corpora are a separate rights question. |
| SmolVLM-256M-Instruct | 256,484,928 parameters, about 93M in the vision encoder. BF16 checkpoint 513,028,808 bytes. | The official browser worker that was inspected loads **float32**, about **1,028,498,218** bytes for three ONNX files. | That demonstrated configuration is already above 880MB. A quantized export is a different artifact. The card's "under 1GB GPU RAM" claim is not a browser measurement. Default longest edge 2048, 64 visual tokens per 512×512 patch. |
| PaddleOCR-VL 0.9B | Hub total 958,588,736 parameters. BF16 checkpoint 1,917,255,968 bytes. | Python, Paddle, Transformers, and vLLM workflows in the inspected sources. | No browser-local demo or WebLLM build was verified. A 4-bit storage estimate is not a download measurement. |
| LayoutLMv3-base | 125,326,976 floating parameters. Float32 checkpoint 501,338,056 bytes. ONNX file 501,597,822 bytes. | An ONNX file exists. | No end-to-end browser form detector was verified. Hub metadata is CC-BY-NC-SA-4.0, so it is not a permissive production default. |
| Donut-base | The paper's 143M and 176M figures are task-comparison counts, not a license to treat them as the full checkpoint size. `pytorch_model.bin` on the Hub is 809,168,699 bytes. | Transformers.js lists Donut. This base checkpoint is pretrained, not a form filler. | No small quantized full pipeline was verified. Paper latency is a P40 GPU. |

`parameters × 0.5` for a 258M model suggests about 129MB. The Granite all-q4 export is 400,028,103 bytes because embeddings, graphs, and external tensors are real files. SmolDocling q4 embeddings alone are 113,541,438 bytes. Do not publish 129MB as a tested download.

A derived illustration, not peak RAM: these decoder configs use 30 layers, 3 KV heads, and head size 64. Float16 KV storage is `2 × 30 × 3 × 64 × 2 = 23,040` bytes per token, about 94MB at 4096 tokens. A 512×512 RGB float32 tensor is 3,145,728 bytes and is not the whole activation set. Run one stage at a time and release the session. OCR, the text model, and a vision model should not stay loaded together.

### Runtime ladder

The pinned app runtime is `@mlc-ai/web-llm@0.2.79`. The npm package registry that was inspected lists Qwen2.5 0.5B and 1.5B text models and Phi-3.5-vision. It does not list SmolDocling, Granite-Docling, Florence, SmolVLM, Donut, or PaddleOCR-VL. Phi-3.5-vision's listed `vram_required_MB` is 3952.18, against 944.62 for Qwen 0.5B and 1629.75 for Qwen 1.5B at the configured 4K context. Those are registry estimates, not measured browser RAM and not download sizes.

Current WebLLM docs, at retrieval, show 0.2.87 and model library `v0_2_87/base`. Adding a custom model requires an MLC compile. Substituting a Hugging Face ONNX id is not supported. Fine-tuning the text weights does not add vision.

Transformers.js and ONNX Runtime Web are a separate browser path. WASM is the default and WebGPU is optional. Florence and SmolVLM have first-party example source. The inspected Florence example pins `@huggingface/transformers` 3.7.1. Those demos were not launched for this note. The Granite community card shows a Transformers.js example with WebGPU commented out and float32 as the default. That is an existence proof of an example, not a device matrix. Docs that mentioned stable Transformers.js 3.8.1 do not promise that a newer main build runs these graphs. Pin the JS runtime, the ONNX runtime, and the model revision, list the graph ops, and test load, generate, and parse. Feature-test the GPU adapter, shader-f16, limits, and device loss.

## Proposed pipeline

`document → pages → sections and roles → tokens and labels → writable regions → reference facts and entities → supported assignments → deterministic editor`

- Native route: widgets first, with stable ids, type, rectangle, options, max length, and read-only state. Use vector text and line operators when there are no widgets. Do not run embedded PDF JavaScript in order to parse the form. Detect a scan, a stale text layer, and a mixed page separately.
- Scan route: orientation and deskew, OCR words with polygons, confidence, and page ids, then rows, columns, and reading order without dropping the 2D layout. Store a transform that can be inverted from PDF to render to deskew to crop. Detect blank boxes, rules, character cells, and checkbox groups. Score links with alignment, separators, and section membership.
- Optional visual rescue, later: send one uncertain crop, with its heading, to a model that is already on the device. Ask for local elements, not a filled form. Map coordinates back through the inverse transform and check containment. Repeated crops can lose context. That tradeoff is a hypothesis.
- Evidence record: fact id, entity id, role, value, type, source document, page, polygon, source span, and the normalization that was applied. Keep conflicting values. A string that appears somewhere in the packet is not evidence if it belongs to someone else.
- Selection: the model may return `{fieldId, factId or null, reasonCode}` from a list it was given. Type, role, and entity filters run before ranking. Citizenship does not follow from a name. A bank number does not follow from nearby digits. A patient date does not fill the applicant without an explicit same-person link.
- Validation: ids exist, the source span supports the normalized value, the role matches, the geometry is inside the writable region, and a conflict or a timeout leaves the field unchanged. A JSON schema blocks a broken object. It does not make the value true.
- Export: fill widgets or draw measured text. Leave signatures alone. Do not infer consent. Keep a provenance overlay and an undo.

A later all-vision extractor can replace the scan OCR and detector subgraph only if it wins the same geometry, evidence, and resource gates. The evidence graph and the editor stay.

## Experiment shape, when a visual benchmark exists

Proposed scale, not a corpus that has been collected: 100 blank-form families, split 50 train / 20 dev / 30 held-out test by issuer and layout, plus a later set of at least 20 test-only templates. Public availability is not permission to commit a file. No personal identity documents. Variants of one template stay in one split. Reference packs should include one to three people, shared surnames, conflicting dates, missing citizenship and bank facts, and irrelevant pages.

Arms, in order:

- A. The shipped text pipeline, pinned, reported separately from any visual result. Import v3 numbers only after that run is finished, and label them as text-only.
- B0. Native widgets and vector text with the current guards.
- B1. Native fast path, spatial OCR, a geometric blank-region linker, and the same fact selector.
- B2. B1 plus a learned linker, only if visual annotations exist.
- C. B1 plus a conditional Granite-Docling or SmolDocling crop, after a runtime and license smoke test. Florence regional OCR is the localization control.
- D. Full-page Donut or Granite extraction into the same graph. Donut needs task training. Record that cost.
- E. An optional hosted model on lawful test pages only, with provider, model, and image settings written down.

Run oracle OCR, oracle field geometry, and oracle identity. Score the proposal before the guard, the accepted fill after the guard, and the exported placement as three different numbers. Tune on dev. Held-out pages stay out of prompts and training.

Stop and go gates below are proposals to freeze before any visual run, not results:

1. Before training: 20 representative lawful pages load, infer, and parse in the browser on the exact export and runtime. Field ids are valid. Crop transforms round-trip. Accepted outputs are schema-valid. A failed runtime falls back to manual placement. License conflicts are resolved first.
2. Safety: an accepted cross-person date, id, bank number, or citizenship value, or any other unsupported sensitive value, blocks a default. Publish the count. A finite test is not a population proof.
3. Accuracy target to set before looking: at least 99% exact precision on accepted fills, at least 80% recall of eligible fields, at least 95% of accepted placements inside the writable region without covering the label, and at least a 10 point recall gain over arm A at matched precision, with no native-PDF regression.
4. Download: aim for at most 300MB for the entire default pack, not the decoder alone. Hard ceiling 880MB for one optional pack, with no second automatic download stacked on the current text model.
5. Mobile, where it can be measured: about 1GB incremental memory as a soft target and 1.5GB as a hard cap, no reload on a 10-page run on the target phones, warm 95th percentile at most 15 seconds per page, cold download reported separately.
6. If B1 wins on those gates, ship the structural change before supervised fine-tuning. Adopt a crop model only for the scan strata where it wins. Adopt full-page vision only if every gate passes.

## What fine-tuning is for

Freeze the evidence contract and show that the browser export matches it. Then train a small ranker or spatial detector on label-to-region and role examples, including wrong-person and unsupported candidates and an explicit null. Singapore-specific work is field aliases, address structure, and date formats. It is not a presumed citizenship.

Order: oracle diagnostics, then the native and spatial baseline, then a compact vision runtime smoke test, then one frozen visual comparison, and only then targeted fine-tuning or distillation.

## Sources

Narrative citations use the ids in [architecture/sources.json](architecture/sources.json). Hub metadata records for the same models are separate rows in that file. Rolling docs can change. Pin the revision before an experiment.

| Id | Record |
| --- | --- |
| pdfjs | [PDF.js API](https://mozilla.github.io/pdf.js/api/draft/api.js.html), rolling, retrieved 2026-11-07 |
| layoutlmv3 | [LayoutLMv3 docs](https://huggingface.co/docs/transformers/model_doc/layoutlmv3), paper 2022-04-18 |
| udop | [UDOP docs](https://huggingface.co/docs/transformers/model_doc/udop), paper 2022-12-05 |
| donut-paper | [Donut, arXiv v3](https://arxiv.org/html/2111.15664v3) |
| donut-readme | [Donut README](https://github.com/clovaai/donut) |
| donut-card | [donut-base card](https://huggingface.co/naver-clova-ix/donut-base) |
| smoldocling-card | [SmolDocling-256M-preview](https://huggingface.co/docling-project/SmolDocling-256M-preview), paper 2025-03-14 |
| granite-card | [granite-docling-258M](https://huggingface.co/ibm-granite/granite-docling-258M), released 2025-09-17 |
| granite-onnx | [Community ONNX export](https://huggingface.co/onnx-community/granite-docling-258M-ONNX) |
| florence-card | [Florence-2-base](https://huggingface.co/microsoft/Florence-2-base), paper 2023-11-10 |
| florence-worker | [Official browser worker](https://github.com/huggingface/transformers.js-examples/tree/main/florence2-webgpu) |
| smolvlm-card | [SmolVLM-256M-Instruct](https://huggingface.co/HuggingFaceTB/SmolVLM-256M-Instruct) |
| smolvlm-worker | [Official browser worker](https://github.com/huggingface/transformers.js-examples/tree/main/smolvlm-webgpu) |
| paddle-card | [PaddleOCR-VL](https://huggingface.co/PaddlePaddle/PaddleOCR-VL), release 2025-10-16 |
| docling-labels | [docling-core labels](https://github.com/docling-project/docling-core/blob/main/docling_core/types/doc/labels.py) |
| spade | [SPADE, Findings of ACL 2021](https://aclanthology.org/2021.findings-acl.28/) |
| transformersjs | [Transformers.js](https://huggingface.co/docs/transformers.js/en/index) |
| ort-web | [ONNX Runtime Web](https://onnxruntime.ai/docs/get-started/with-javascript/web.html) |
| webllm-0.2.79-npm | [npm `@mlc-ai/web-llm@0.2.79`](https://www.npmjs.com/package/@mlc-ai/web-llm/v/0.2.79) |
| webllm-current | [WebLLM `config.ts` on main](https://github.com/mlc-ai/web-llm/blob/main/src/config.ts), `v0_2_87/base` at retrieval |
| webllm-add | [Adding models](https://webllm.mlc.ai/docs/developer/add_models.html), docs 0.2.87 |
| webllm-advanced | [Advanced usage](https://webllm.mlc.ai/docs/user/advanced_usage.html), docs 0.2.87 |

Still open: phone peak RAM and latency, quantized accuracy on this task, blank-field and checkbox linking for a specific checkpoint, end-to-end entity safety, training-data redistribution rights, and which SmolDocling checkpoint license is the intended one. None of these sources is a completed form filler for this app.
