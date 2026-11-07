# Forms Filler research

Open measurements and a frozen synthetic suite for the on-device Forms Filler. The product page links here.

The 12/4/6 JSONL split is a seed smoke suite for the pipeline. It is not a gold benchmark. Parser-only counts in `results/parser-only/score.json` are not end-to-end scores. End-to-end evidence is `results/e2e-2026-11-07.json`. Fields whose placement was not checked are `placement: unverified` and are left out of the verified rate. Training has not been run here.

[ARCHITECTURE.md](ARCHITECTURE.md) is a research proposal for a native-PDF and spatial-OCR pipeline, with an evidence graph and oracle diagnostics. It is not a measured app comparison and it is not what the page runs. The source list is [architecture/sources.json](architecture/sources.json).

This directory is the research project. Apache-2.0 applies to the original code in this directory. CC0-1.0 applies to the original synthetic JSONL, PDFs, PNGs, and annotations in `data/` and `fixtures/`. Neither license changes the rest of the website, pdf.js, pdf-lib, Tesseract, WebLLM, or Qwen weights.

## Status

No browser model was run here. The finished `lora_e1` run failed its held-out test and is not deployed: [model-lab](model-lab/README.md). Quantized CPU baselines, including the current 1.5B, are in [model-lab/results/v2-quantized](model-lab/results/v2-quantized/README.md). They are not a reason to change the live model. v2 was an invalid training distribution and its test is used. v3 is the frozen fixture in [model-lab/v3/CONTRACT.md](model-lab/v3/CONTRACT.md). The finished text-only CPU comparison is in [model-lab/results/v3-trial](model-lab/results/v3-trial/README.md). It is not production ready: the tuned 0.5B lowers wrong fills and also lowers coverage, and it does not beat the current 1.5B. The earlier unfinished cut is [model-lab/results/v3-trial-partial](model-lab/results/v3-trial-partial/README.md). `results/mock-evidence-2026-11-07.json` is a mocked page check. A mocked reply is an integration check, not model accuracy. Explicit `Citizenship: Singapore` or `Singaporean` normalizes to Singapore Citizen, or to a matching option such as Singaporean. An address, a letterhead, or an NRIC prefix does not. A date said of a patient fills the applicant date only when the page says they are the same person. A bank number has to match the account's own digits, not a piece of a phone or NRIC. Printed answers `Not specified`, `null`, and `n/a` stay blank. A premises line that contains `No.` is cut at that period. An unlabeled citizenship line is left blank when the page has both a patient and an applicant. The schema sent to WebLLM 0.2.79 still types every property as a string.

What is measured:

- Parser-only, on the frozen synthetic references, using `tools/forms-filler/facts.js`. See `results/parser-only/score.json`. This is not a model score.
- Browser placement on development forms already seen during product work. See `results/placement-browser.json`. The hospital claim, HDBSU scan, NTUC brochure, and noisy photo were filled through the real page.

Test gold has 6 occupation misses under the parser because occupation is only in a sentence. Wrong fills on that parser run were 0. That still is not a language-model result.

## Reproduce the data

Scoring and the split check use the Python standard library.

```bash
python3 research/forms-filler/scripts/assert_integrity.py
python3 research/forms-filler/scripts/score_predictions.py --smoke
node research/forms-filler/scripts/export_parser_baseline.mjs
python3 research/forms-filler/scripts/score_parser_baseline.py
python3 research/forms-filler/scripts/score_predictions.py \
  --gold research/forms-filler/data/test.jsonl \
  --pred research/forms-filler/results/parser-only/mapped-predictions.json
```

The last command scores every split that appears in the prediction file against test gold ids it can see. Parser predictions for train and dev are ignored by an id join when the gold file is test-only. To score one split, pass that split's JSONL as `--gold`.

Regenerate fixtures (Pillow 13.0.0 is only needed for the PNGs):

```bash
pip install -r research/forms-filler/requirements-generate.txt
python3 research/forms-filler/scripts/generate_fixtures.py
```

Committed hashes in `data/CHECKSUMS.sha256` are the frozen bytes. Seed is 1412.

## Train later

Do not train on `data/dev.jsonl` or `data/test.jsonl`. Primary config: `configs/qwen2.5-0.5b-lora.json` (Qwen2.5-0.5B-Instruct, LoRA r=8, bf16, CPU). Challenger: `configs/qwen3-0.6b-lora.json`. The prompt and JSON schema on each JSONL row are the production prompt from Forms Filler (`askRest` in `tools/forms-filler/app.js`, WebLLM 0.2.79). A CPU bf16 run is not a q4f16 browser run. Write raw predictions as a JSON list of `{id, fields}` and score them with `score_predictions.py`. Put tables in `results/` only after that file exists. `requirements-train.txt` records the shared-box pins from 2026-11-07. They were not reinstalled here.

## Public forms that are not in git

`data/public-forms-not-vendored.json` lists URLs and SHA-256 for blanks used as development or as candidate held-out layouts. They are not committed. `scripts/fetch_public_forms.py` can download them only to a directory outside this repository. FUNSD, XFUND, and FormGym are refused. The synthetic files in `fixtures/` are enough to repeat the JSONL task offline.

## Layout of the evidence

| Path | What it is |
| --- | --- |
| `data/train.jsonl` `dev.jsonl` `test.jsonl` | Frozen tasks. Templates, people, and sources do not cross splits. |
| `fixtures/` | Synthetic blank forms, two reference PDFs, a clean clinic image, a noisy rotated image, and box annotations. |
| `results/parser-only/` | Raw `fromText` output and the mapped score. |
| `results/placement-browser.json` | Measured placement, including wrong and missed fields. |
| `results/scorer-smoke/` | A four-way check of the scorer. Not a baseline. |
| `DATA-CARD.md` `MODEL-CARD.md` `CONTRIBUTING.md` | Collection notes, model limits, how to add a case. |
| `ARCHITECTURE.md` | Proposal and source audit. Not an implemented vision stack and not a v3 result. |
