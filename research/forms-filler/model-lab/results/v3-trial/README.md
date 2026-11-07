# Forms Filler v3 trial: not production ready

This is a text-only synthetic benchmark of reference-to-field matching. It is not a visual form-accuracy result, not a scanned-page result, and not a browser WebLLM or WebGPU measurement. No model here is production ready. Nothing is shipped, converted to MLC, or set as the live default.

This record supersedes [v3-trial-partial](../v3-trial-partial/README.md). That folder is the earlier dev cut, taken while the 0.5B LoRA was still training.

## Reproduce the published scores

From the repository root, with no extra links:

```bash
python3 research/forms-filler/model-lab/results/v3-trial/check_v3_final.py
node research/forms-filler/model-lab/results/v3-trial/postfilter/postfilter.mjs --self-check
```

The check rescores the frozen raw and postfilter JSONL with `scripts/score3.py` against `model-lab/data/v3`. Gold stays in that directory. Do not copy it.

## Inputs
- v3 data is already in `model-lab/data/v3/` (480 train, 180 dev, 180 test). File hashes are in `provenance/v3-data.sha256`. The standalone data zip was sha256 `00e90daf38f7b007b4f8905df30ebe8b9a04abda472ce85ea0966dce8ecb68e1`.
- Postfilter commit `9c2d5b80637b99a8d628287cd51ab5f2307fc15e`. `postfilter/` is the published copy: filter code byte-identical, synthetic self-test. See `postfilter/DIST.md`.
- Normalizer: `v2/v2-bundle/scripts/score_v2.py`. `score3.py` adds the wrong-person date split and does not repair JSON.
- llama.cpp b12182 is not in git. `llama.tgz` sha256 `c1dbfdb9cbef7ee50b6ab08142d6424184d68b242906837770439ed118c57d99`. Source tarball `src.tgz` sha256 `adc18ac17ece6139a009399181dc31accb5ab5337115180df7b7006e56deaeef` (convert_hf_to_gguf.py, gguf-py 0.19.0).

Pinned GGUF downloads, not vendored:

| File | Revision | sha256 |
| --- | --- | --- |
| Qwen2.5-1.5B-Instruct q4_k_m | `Qwen/Qwen2.5-1.5B-Instruct-GGUF@91cad511` | `6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e` |
| Qwen2.5-0.5B-Instruct q4_k_m | `Qwen/Qwen2.5-0.5B-Instruct-GGUF@9217f5db` | `74a4da8c9fdbcd15bd1f6d01d621410d31c6fc00986f5eb687824e7b93d7a9db` |
| Qwen3-0.6B Q8_0 | `Qwen/Qwen3-0.6B-GGUF@23749fef` (no official q4) | `9465e63a22add5354d9bb4b99e90117043c7124007664907259bd16d043bb031` |
| Own base Q4_K_M | `Qwen/Qwen2.5-0.5B-Instruct@7ae557604adf67be50417f59c2c2f167def9a775`, float16 GGUF, then `llama-quantize Q4_K_M` | `5de9f8fb6480ca0b3c48ce42ce788590c7b2918293353fb01e26653042d0e75b` |
| Own tuned Q4_K_M | same conversion after merging the LoRA | `a874bcdfbc6151d0c7a182a8f1998ad51493f7fd67306fb499e4bd3f5561a14c` |

The official 0.5B q4_k_m is about 491MB. The own conversion is 397,808,224 bytes. The tuned GGUF is 397,807,584 bytes. Training effect is judged only against the own base, because the tensor types differ. Adapter sha256 `ea4096d4b49db589930fa70a44f0c45f3a22c6be1948fefc42054dbf4ad799d0`. The weight file is not in this tree.

To repeat a generation, put llama.cpp at `gguf/llama-b12182` and the GGUFs under `gguf/`, then from this directory:

```bash
SPLIT=test MODES=schemareq bash scripts/run_v3.sh
bash scripts/postfilter_score.sh ../../data/v3/test.jsonl runs/v3_<tag>_test_schemareq.jsonl
```

A repeat run uses temperature 0, seed 0, 96 tokens, and context 1024. `schemareq` sends the production schema with every key required. The prompt is `production_prompt` as one user turn. Training, if repeated on a machine that already has the stack, is:

```bash
python3 scripts/train3.py --model Qwen/Qwen2.5-0.5B-Instruct --data ../../data/v3/train.jsonl --out adapters/v3_lora --epochs 2 --lr 1e-4 --r 8 --threads 4
```

## Training (from source and `results/train/train_meta.json`)
- Base: Qwen2.5-0.5B-Instruct @7ae55760. LoRA r=8, alpha 16, dropout 0.05, on all attention and MLP projections. bf16 on CPU.
- 480 train records × 2 epochs = **960 single-example forward/backward passes**. Gradient accumulation 8 gives **120 optimizer steps** (AdamW, lr 1e-4, 24-pass warmup, linear decay). Loss is computed on `target_json` tokens only.
- The log's `i` is the pass index, not the optimizer step.
- 3,217 s on 4 threads; peak RSS 3,741 MB; longest sequence 397 tokens. Loss was below 0.01 by pass ~180; low loss is not evidence of generalization.
- Adapter sha256 ea4096d4…99d0 (weights not included). Tuned Q4_K_M GGUF: 397,807,584 bytes, sha256 a874bcdf…a14c. Own base Q4_K_M: 397,808,224 bytes. The official Qwen q4_k_m is 491 MB, because it uses different tensor types, so **training effect is judged only against the own base**.

## Dev (180 calls; the freeze is decided here, see `results/FREEZE_v3.json`)
For each model, the RAW line is the model's output and the POST line is after the 9c2d5b8 postfilter.

| model | parse fail | trunc@96 | matched | wrong | spurious | wrong-person DOB | missed | wrong-fill | recall | s/call |
|---|---|---|---|---|---|---|---|---|---|---|
| own base Q4_K_M RAW | 7 | 7 | 172 | 8 | 97 | 12 | 330 | 0.405 | 0.337 | 2.79 |
| own base POST | (7) | | 172 | 7 | 57 | 0 | 331 | 0.271 | 0.337 | |
| **own LoRA Q4_K_M RAW** | 0 | 0 | 188 | 1 | 16 | 1 | 321 | 0.087 | 0.369 | 1.46 |
| own LoRA POST | (0) | | 188 | 0 | 1 | 0 | 322 | **0.005** | 0.369 | |
| official 0.5B RAW / POST | 30 | 34 | 264 / 264 | 71 / 48 | 332 / 113 | 27 / 0 | 175 / 198 | 0.62 / 0.379 | 0.518 | 1.95 |
| Qwen3-0.6B Q8 RAW / POST | 58 | 64 | 216 / 216 | 62 / 29 | 35 / 15 | 2 / 0 | 232 / 265 | 0.314 / 0.169 | 0.424 | 2.11 |
| 1.5B RAW / POST | 24 | 31 | 344 / 344 | 31 / 31 | 193 / 102 | 15 / 0 | 135 / 135 | 0.41 / 0.279 | 0.675 | 6.52 |

How to read the columns:
- wrong-fill = (wrong + spurious + wrong-person) / filled fields.
- recall = matched / (matched + wrong + missed) over supported fields.
- Parse failures stay counted even though the postfilter turns them into `{}`; they are shown in brackets on the POST lines.
- 1.5B dev residual spurious fills are in `results/dev/v3_1.5b_dev_residual_spurious.json`: mostly "Not", "nowhere", label echoes, and an address in "Post mailbox".
- LoRA dev misses are mostly unseen phone and other label wordings ("Gate handset", "Reachable at"): it over-abstains.

## Test: one look after the freeze, same harness for all predeclared comparators
| model | parse fail | trunc | matched | wrong | spurious | wrong-person DOB | missed | correct empty | wrong-fill | recall | s/call |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **own LoRA RAW** | 0 | 0 | 251 | 26 | 43 | **30** | 143 | 347 | 0.283 | 0.598 | 1.25 |
| **own LoRA POST** | (0) | | 236 | 13 | 0 | 0 | 171 | 420 | **0.052** | 0.562 | |
| own base RAW | 0 | 0 | 262 | 58 | 61 | 30 | 100 | 329 | 0.363 | 0.624 | 1.63 |
| own base POST | (0) | | 232 | 41 | 15 | 0 | 147 | 405 | 0.194 | 0.552 | |
| official 0.5B RAW | 0 | 0 | 329 | 78 | 325 | 30 | 13 | 65 | 0.568 | 0.783 | 1.72 |
| official 0.5B POST | | | 303 | 45 | 160 | 0 | 72 | 260 | 0.404 | 0.721 | |
| Qwen3-0.6B Q8 RAW | 9 | 9 | 271 | 42 | 40 | 15 | 107 | 365 | 0.264 | 0.645 | 1.41 |
| Qwen3-0.6B Q8 POST | (9) | | 271 | 8 | 10 | 0 | 141 | 410 | 0.062 | 0.645 | |
| official 1.5B q4_k_m RAW | 0 | 0 | 358 | 50 | 111 | 30 | 12 | 279 | 0.348 | 0.852 | 3.40 |
| official 1.5B POST | (0) | | 330 | 43 | 10 | 0 | 47 | 410 | 0.138 | 0.786 | |

Findings:
- **The model did not learn person safety.** The tuned model still gives the wrong person's DOB in **30** raw cases, the same as the own base; the deterministic guard removes all of them. The model gets no credit for that.
- 12 of the tuned model's 13 remaining post-filter wrong values are **wrong-person names**: in ward_note "Claimant name" it picks the other person ("Lee Fixture", "Jo Sample", ...). The guard covers wrong-person DOB but not names. The 13th is a phone number put into an email field (`results/test/v3_tuned_test_postfilter_wrong13.json`).
- Against the same-conversion base, the LoRA cut post-filter wrong-fill from 0.194 to 0.052 (raw 0.363 to 0.283), with similar recall (0.562 vs 0.552), no truncation and faster calls. Qwen3-0.6B Q8 without tuning reaches 0.062 at higher recall (0.645), but uses a different (larger) quantization.
- **Against the current 1.5B:** the tuned 0.5B has a lower post-filter wrong-fill (0.052 vs 0.138) but much lower recall (0.562 vs 0.786). Neither dominates, and this is not a claim that the 0.5B beats the 1.5B. The 1.5B's 43 post-filter wrong values are mostly ward_note 'Day callback' (14), rebate_claim 'Premises line' (13) and wrong-person claimant names (12). The 1.5B also gave the wrong person's DOB in 30 raw cases.
- **No ship gate is met.** The target was under 2% wrong fills; the best is 5.2%. Browser q4f16/WebGPU behaviour is untested.

## Next steps (not done in this trial)
1. Add a wrong-person **name** guard (the same evidence rule as DOB) and a guard against label echoes and negation words.
2. Add more label-wording diversity in training to fix over-abstention.
3. Pursue the spatial/evidence-graph architecture work separately.
4. MLC packaging only after a valid candidate passes these gates.
