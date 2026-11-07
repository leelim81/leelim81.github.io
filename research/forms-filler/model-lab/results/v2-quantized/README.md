# Forms Filler v2: untrained quantized baselines (llama.cpp CPU)

These rows used the frozen v2 excerpts and parser facts. The product parser later stopped storing a premises line as a postal code, and the page now pairs required schema keys with evidence checks. The numbers below were not recomputed. See `../../v3/CONTRACT.md`.

Data: the cloud v2 bundle (zip sha256 f697e1fcd0cf3f8435819b4a0b8ae834d319ff0c51f9562d90c02614c8cabb9b), used unchanged and not copied here. Point `--data` at its `data/`.
Runtime: llama.cpp release b12182 (`llama-b12182-bin-ubuntu-x64.tar.gz`, sha256 c1dbfdb9…57d99), `llama-server -t 4 -c 1024 -np 1`, temperature 0, seed 0, max_tokens 96, `production_prompt` sent verbatim as one user turn. Hardware: 8 vCPU Xeon, no GPU. **CPU GGUF results; not WebLLM, q4f16 or WebGPU.**

Models: official Qwen GGUF repos (Apache-2.0), sha256 in `GGUF.sha256`, each matching the HF x-linked-etag:
- Qwen/Qwen2.5-1.5B-Instruct-GGUF@91cad511 q4_k_m (the current production base; the browser uses MLC q4f16_1 instead)
- Qwen/Qwen2.5-0.5B-Instruct-GGUF@9217f5db q4_k_m
- Qwen/Qwen3-0.6B-GGUF@23749fef Q8_0 (no official q4 GGUF exists; this quantization differs from the other two)

Modes:
- `schema` = production `asciiSchema` (no `required`)
- `schemareq` = the same schema plus `required` set to all keys (an experimental change)
- `free` = no constraint
Records with empty `model_fields` are skipped (the parser already solved them). Scoring uses the bundle's `score_v2.py` with no JSON repair. `prodfilter` drops values not found verbatim in the excerpt; it only approximates the site's unsupported-value filter.

## Dev (18 model-called records, 72 fields: 54 supported, 18 should be empty)
| model | mode | parse fail | matched | wrong | spurious | missed | correct empty | s/call |
|---|---|---|---|---|---|---|---|---|
| 0.5B q4km | schema | 1 | 17 | 0 | 0 | 37 | 18 | 1.25 |
| 0.5B q4km | free | 1 | 51 | 0 | 0 | 3 | 18 | 0.77 |
| 0.5B q4km | schemareq | 0 | 53 | 1 | **18** | 0 | 0 | |
| Qwen3-0.6B Q8 | schema | 0 | 16 | 2 | 0 | 36 | 18 | 1.22 |
| Qwen3-0.6B Q8 | free | 18 (```json fences) | 0 | 0 | 0 | 54 | 18 | 0.63 |
| Qwen3-0.6B Q8 | schemareq | 0 | **54** | 0 | 0 | 0 | **18** | |
| 1.5B q4km | schema | 6 (truncated) | 0 | 12 | 0 | 42 | 18 | 2.76 |
| 1.5B q4km | free | 18 (fences) | 0 | 0 | 0 | 54 | 18 | 3.67 |
| 1.5B q4km | schemareq | 0 | 37 | **17** | 0 | 0 | 18 | |
Peak server RSS: 0.5B 0.78 GB, Qwen3-0.6B 2.04 GB, 1.5B 2.42 GB. Prompts are at most 262 tokens, so the 1024 context never truncates.

Findings:
1. **The production schema has no `required`.** Under grammar-constrained decoding, models emit one key and close the object, so most fields are lost (the `missed` column). Adding `required` fixes this in llama.cpp. WebLLM's grammar engine was not tested.
2. All 17 of the 1.5B's wrong values are `premises` (it gave the postal code instead of the full premises line). It copies the parser fact `"address":"<postal>"`, which suggests the `fromText` address fact is misleading.
3. Unconstrained Qwen3 and 1.5B wrap their answer in ```json fences, so the strict parse fails.

## Freeze, then one test look (12 model-called records, 24 fields)
Frozen on dev (`results/FREEZE_v2.json`): Qwen3-0.6B Q8 + schemareq. LoRA tuning was skipped because dev was at its ceiling. After the freeze, test was run once for the frozen config, plus the 1.5B as a reference:
| model | mode | matched | spurious | correct empty |
|---|---|---|---|---|
| Qwen3-0.6B Q8 (frozen) | schemareq | 12 | **12** | 0 |
| 1.5B q4km | schema | 12 | **12** | 0 |
| 1.5B q4km | schemareq | 12 | **12** | 0 |
**Every model put the clinic patient's date of birth into `applicant_date_of_birth` on all 12 records.** The callback numbers were all correct. **Negative result: not shippable.**

## Dataset validity issues (to fix in v3)
- Of dev's 18 model-called records, all are one template (visitor_slip) and every empty field is `nationality_stated`. courier_note never reaches the model. Dev cannot select between models on person-mismatch.
- Train's model fields are only designation, birth_date (always filled), bank_account (always empty) and bank_account_no. There are **no wrong-person or citizenship abstention examples** in train or dev, yet they make up 50% of test fields. A LoRA on this train cannot learn the behaviour test measures, so training was not run.
- Test has only 12 model calls, which gives very low statistical power.

## Other comparison: cloud v1 production-smoke records (22 records, 44 fields; `llama_*prod*`, max_tokens 256, ctx 4096)
| model | mode | correct | wrong | spurious | missed | correct empty | malformed |
|---|---|---|---|---|---|---|---|
| 0.5B | schema / free | 8 / 9 | 2 / 0 | 16 / 27 | 0 / 1 | 18 / 7 | 0 / 5 |
| Qwen3-0.6B | schema / free | 4 / 10 | 6 / 0 | 11 / 13 | 0 / 0 | 23 / 21 | 1 / 0 |
| 1.5B | schema / free | 4 / 5 | 0 / 0 | 12 / 18 | 6 / 5 | 22 / 16 | 6 / 0 |
All models hallucinate unsupported citizenship (e.g. "Not specified", "Singapore"). The 1.5B is not better than the small models here.

## Recommendation
- Don't change the production model on this evidence.
- Product fixes with stronger evidence than any model choice:
  1. Add `required` to the schema, but only together with point 2, because forcing every key increases spurious fills (0.5B: 18).
  2. Keep or extend the deterministic post-filter: blank any value that is not in the excerpt or that comes from a "Patient" / "about another person" span.
  3. Fix the `address` parser fact.
- v3 data should put person-mismatch and citizenship/bank abstention in train **and** dev, with several dev templates.
