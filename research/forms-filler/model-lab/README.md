# Model lab

CPU measurements for a compact form-filling model. The 12/4/6 smoke suite and `results/e2e-2026-11-07.json` stay where they are. This directory does not replace them.

Code under `scripts/` is Apache-2.0 (`../LICENSE`). Synthetic JSONL in `data/` is CC0-1.0 (`../FIXTURES-CC0.txt`). Qwen base weights remain Apache-2.0. No adapter weights are published.

## v1 is a negative result

`data/v1` is frozen (900 train, 40 dev, 80 test). Dev is not template-disjoint: it shares letter and NRIC-card templates and label families A and B with train. Test label family C was unseen. Test is 71.3% null. v1 test has been scored, so it is diagnostic only.

`lora_e1` trained for one epoch on those 900 rows (5634 seconds, peak 4819 MB). Dev precision was 0.941 and recall 0.974. The official test was precision 0 and recall 0 because 80 of 80 replies were invalid JSON. A later salvage of pairs inside those strings is in `results/lenient_test_diagnostic.txt` (precision 0.596, recall 0.463, wrong-fill 0.404). That salvage is not the official score and not a browser score. Nothing was merged or converted for the site.

Loss fell quickly on the training format. That is consistent with format fitting, and it is not by itself proof of memorization. The test also changed the label wording and left decoding unconstrained, and checkbox labels broke the JSON. Those are separate confounds.

The production-prompt smoke on 22 records and 44 fields, still unconstrained bf16:

| | matched | value mismatch | unsupported fills | missed | correct empty |
|---|---|---|---|---|---|
| base 0.5B | 10 | 0 | 12 | 0 | 22 |
| lora_e1 | 9 | 1 | 10 | 0 | 24 |

Do not quote the base run as "0 wrong." Twelve of its twenty-two fills were unsupported. Qwen2.5-1.5B was not measured. Details and denominators are in `results/TABLE.md`. Raw generations are the `results/*.jsonl` files.

## Paths

`scripts/gen.py` writes `data/train.jsonl` in the current directory. The frozen files are `data/v1/`. `scripts/regen_v1.sh` regenerates in a temp directory and compares. It does not link `data/` at itself.

`scripts/train.py` and `scripts/evalm.py` read `data/v1/<split>.jsonl` directly. Do not create `data/train.jsonl` by linking `v1` into `data`.

```bash
cd research/forms-filler/model-lab
python3 scripts/check_lab.py
```

That checks hashes, rescores the stored predictions, regenerates v1 in a temp directory, and checks that v2 is disjoint and stable. It does not download weights.

To reinstall the box stack that produced v1 (Python 3.13.5; not reinstalled here):

```bash
cd research/forms-filler/model-lab
python3 -m venv .venv
source .venv/bin/activate
pip install torch==2.15.0 --index-url https://download.pytorch.org/whl/cpu
pip install accelerate==1.15.0 huggingface_hub==2.4.0 peft==0.21.2 safetensors==0.8.0 tokenizers==0.23.3 transformers==5.22.2
```

`requirements-lock.txt` is that list, including `torch==2.15.0+cpu`.

## v2

`v2/CONTRACT.md` and `data/v2/` are the next fixture. Train, dev, and test are split by template, person, and label family. The prompt and schema match the site's `askRest` request. Gold keeps citizenship and bank empty unless the excerpt states them, and it does not treat a clinic patient's date as the applicant's. There is no v2 training result yet. Do not change the live default model from these files.
