# Model lab

CPU baselines for a compact form-filling model. This directory is separate from the 12/4/6 smoke JSONL and from `results/e2e-2026-11-07.json`.

Status: base-model measurements only. The LoRA run in `configs/lora_e1.json` was still training when this bundle was packed (about step 800 of 900). No adapter, no tuned scores, and no claim that a small model beats the site's 1.5B browser model. That 1.5B model was not measured: bf16 needs about 3.1 GB and was left unloaded on the shared 16 GB host.

## What was measured

| Piece | What it is |
|---|---|
| `data/v1` | 1,020 synthetic examples. Train 900, dev 40, test 80. Frozen hashes in `data/v1/FROZEN.sha256`. |
| `results/base_*.jsonl` | Raw greedy generations and parsed JSON for Qwen2.5-0.5B-Instruct and Qwen3-0.6B. |
| `results/prod_base_qwen25-0.5b.jsonl` | The same 0.5B model on the site's production prompt, 22 smoke records. |
| `results/TABLE.md` | Counts with the filled-field denominator written out. |

Both base models are Apache-2.0 Qwen weights. Inference here is Hugging Face bf16 on CPU. The browser runtime is `@mlc-ai/web-llm@0.2.79` with q4f16 or q4f32 weights and a JSON schema. Those constraints were not applied. A CPU bf16 number is not a browser number.

## Data, and what it does not prove

`scripts/gen.py` (seed 20261107) writes `data/train.jsonl`, `data/dev.jsonl`, and `data/test.jsonl` in the current directory. The frozen copy lives at `data/v1/` so a regenerate does not overwrite it. Identities are invented. NRIC and FIN strings only have a valid checksum.

| split | n | templates | label families | null share |
|---|---|---|---|---|
| train | 900 | nric_card, letter, payslip, utility | A, B | 0.488 |
| dev | 40 | chat, nric_card, letter | A, B | 0.408 |
| test | 80 | clinic, workpass, chat | C, unseen label wording | 0.713 |

Dev is not template-disjoint from train. It shares letter and nric_card, and both label families A and B. Use it only as a rough check. Test label wording is family C, which train does not use. Test still shares the chat template with dev. About 71% of test fields are null, so abstention can look strong while recall stays weak.

Code in `scripts/` is Apache-2.0 (`../LICENSE`). The synthetic JSONL is CC0-1.0 (`../FIXTURES-CC0.txt`). Qwen weights stay under their own Apache-2.0 terms. Nothing here relicenses the website.

## Check the stored results

From a fresh environment, scoring and the hash check need only the Python standard library. Model weights are not downloaded.

```bash
cd research/forms-filler/model-lab
python3 scripts/check_lab.py
```

That checks `data/v1` and `scripts/gen.py` against `FROZEN.sha256`, rescores every stored prediction file, and regenerates the JSONL in a temporary directory. The temporary files must match `data/v1`. The check deletes that directory and does not modify `data/v1`.

## Install the versions that produced the baselines

These pins are the box environment that wrote the result files (Python 3.13.5). This publishing machine did not reinstall them.

```bash
cd research/forms-filler/model-lab
python3 -m venv .venv
source .venv/bin/activate
pip install torch==2.15.0 --index-url https://download.pytorch.org/whl/cpu
pip install accelerate==1.15.0 huggingface_hub==2.4.0 peft==0.21.2 safetensors==0.8.0 tokenizers==0.23.3 transformers==5.22.2
```

`requirements-lock.txt` records the same versions, including `torch==2.15.0+cpu`.

Re-running a baseline reads `data/v1` and writes a new result file. It does not replace the frozen JSONL.

```bash
python3 scripts/evalm.py --model Qwen/Qwen2.5-0.5B-Instruct --split dev --out results/rerun_0.5b_dev --threads 4
python3 scripts/prodeval.py --model Qwen/Qwen2.5-0.5B-Instruct --out results/rerun_prod_0.5b --threads 4
```

`prodeval.py` defaults to `research/forms-filler/data`, the 22-record smoke suite. It does not score `data/v1`.

Do not start `scripts/train.py` to duplicate the run that was still going. When an adapter arrives, evaluate it and publish the raw JSONL before changing the table.

## How to read the negatives

- Qwen2.5-0.5B test: wrong-fill rate 0.674 of 331 filled fields (87 value mismatches and 136 fills on null gold). Recall 0.294. 23 of 80 forms did not parse; those replies are scored as empty, which adds 274 abstentions and 94 misses.
- Qwen3-0.6B test: parsed every form, recall 0.556, and still a wrong-fill rate of 0.557 of 460 filled fields.
- Production-prompt 0.5B: 10 matched fills, 0 value mismatches, and 12 spurious fills, so 12 of 22 fills were unsupported. Parse failures were 0 on this small set. That is not "0 wrong."
