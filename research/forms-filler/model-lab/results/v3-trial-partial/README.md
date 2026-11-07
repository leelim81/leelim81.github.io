# v3 trial, partial dev baselines

Superseded by [the final trial](../v3-trial/README.md). This folder is the dev cut from before the LoRA finished and before the one test look. Do not use it as the comparison.

Archive sha256 `b65aa8a389aefb1b567700fc512d57d9258faf7494a688f24642867583f76344`. This is a dev-only CPU record. The v3 test split is not scored. The 0.5B production-prompt LoRA was still training when the archive was cut (`results/v3_lora.trainlog` stops at step 460 of 480). No weights are published and the live model is unchanged.

Reproduce from the repository root:

```bash
python3 research/forms-filler/model-lab/results/v3-trial-partial/check_v3_trial.py
```

That reruns the trial `score3.py` on the frozen `data/v3/dev.jsonl`. It checks the 480/180/180 hashes, that v2 train is still the separate 360-row file, and that `facts.js`, `llm.js`, `sanitize.js`, and `app.js` are still the 9c2d5b8 guard bytes. It then runs `tools/forms-filler/facts.test.mjs`. The hash of `facts.test.mjs` in `provenance/postfilter-9c2d5b8.VERSION` names the historical test file. Do not restore that file. The current test uses the synthetic demo card.

## Provenance

| Piece | Identity |
| --- | --- |
| v3 rows | train 480, dev 180, test 180, hashes in `provenance/v3-data.sha256`. Same bytes as `data/v3/`. |
| v2 train | 360 rows, sha256 `86c42a7f…2d4e`. Not the set scored here. |
| Postfilter | commit `9c2d5b80637b99a8d628287cd51ab5f2307fc15e`, runner zip sha256 `13e9dcd2…6a16`. |
| Runtime | llama.cpp b12182, 4 CPU threads, temperature 0, seed 0, 96 tokens, context 1024. Not WebGPU and not the browser. |
| GGUF | Official Qwen2.5-1.5B and 0.5B `q4_k_m`, Qwen3-0.6B `Q8_0` (no official q4). Hashes in `provenance/GGUF.sha256`. |

Prompts are the production prompt. `schemareq` adds required keys. The longest dev prompt was 316 tokens, so the 1024 context did not cut the prompt. The 96-token generation cap did: finish reason `length` on 31 (1.5B), 64 (0.6B), and 34 (0.5B) of 180 calls.

## Dev after the 9c2d5b8 guard

180 model calls. Recall is matched divided by matched + wrong value + missed. Wrong-fill is wrong value plus unsupported, divided by filled fields. Raw parse failures are counted on the generation file. The postfilter always emits an object, so its parse-fail column is 0 and is not a parse success.

| Model | Raw parse failures | 96-token cutoffs | Matched | Wrong value | Unsupported | Wrong-person date | Recall | Wrong-fill |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1.5B q4_k_m | 24 | 31 | 344 | 31 | 102 | 0 | 0.675 | 0.279 |
| 0.6B Q8_0 | 58 | 64 | 216 | 29 | 15 | 0 | 0.424 | 0.169 |
| 0.5B q4_k_m | 30 | 34 | 264 | 48 | 113 | 0 | 0.518 | 0.379 |

Before the guard, the same generations had 15, 2, and 27 wrong-person date fills. Those are 0 after the guard on this dev split. Unsupported fills remain, including the literal strings `Not`, `nowhere`, and `Designation`, the label `Desk inbox`, and street addresses written into mailbox fields (`results/v3_1.5b_dev_residual_spurious.json`). The guard blocks a patient date in these dev cases. It does not block a generic unsupported value, a label echo, or a wrong semantic value. These runs are not a safety result.

Any later choice among these baselines is a dev choice. The test split stays untouched until one final look. A finished bundle is still to come.

## Not scored

- `v3_qwen25-0.5b-q4km_dev_free.PARTIAL93.jsonl` is 93 of 180. The Qwen3 free run was lost in the reboot and was not repeated.
- `v3_own-base05-q4km_dev_schemareq.jsonl` is 119 of 180. The own conversion is Qwen2.5-0.5B-Instruct at `7ae55760`, float16 GGUF, then `Q4_K_M`. It is 398MB. The official q4_k_m is 491MB because the tensor types differ. A tuned model will be compared only with this own-pipeline base, so the training effect is not mixed with that difference.

## Incident

The box rebooted at about 15:19 SGT. That wiped `/tmp`, including the virtualenv and the Hugging Face cache. They were rebuilt on persistent disk with the pinned stack: Python 3.13.5, torch 2.15.0+cpu, transformers 5.22.2, peft 0.21.2, accelerate 1.15.0. See `results/INCIDENTS.txt`.

Peak server RSS recorded for the 1.5B process is in `results/llama_rss_v3.txt` (`VmHWM` 2404424 kB).
