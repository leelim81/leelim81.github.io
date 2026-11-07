# Model card

## Intended models

| Role | Weights | Status |
| --- | --- | --- |
| Product default when shader-f16 exists | Qwen2.5-1.5B-Instruct q4f16, WebLLM 0.2.79 | Not measured in this browser |
| Product fallback | Qwen2.5-0.5B-Instruct q4f32, WebLLM 0.2.79 | Not measured |
| Research primary | Qwen/Qwen2.5-0.5B-Instruct, LoRA, bf16, CPU | Config only. Not trained |
| Research challenger | Qwen/Qwen3-0.6B, LoRA, bf16, CPU | Config only. Not trained |

No tuned checkpoint is published. Hosting weights is out of scope until a held-out comparison exists and there is an authorized place to put the files.

## Runtime differences

A CPU bf16 or fp32 Hugging Face run, a GGUF/quantized CPU run, and the browser q4f16 or q4f32 WebLLM run are different systems. A number from one must be labeled with that runtime. Vendor model-card scores are not form-filling scores.

The production prompt is stored on each JSONL row. WebLLM 0.2.79 is the package the site loads. This project does not upgrade it.

## What has been scored

The synthetic 12/4/6 split is a smoke check. Do not cite it as a benchmark of the product.

`results/parser-only/score.json` is the deterministic parser in `tools/forms-filler/facts.js` on the frozen letters. On test it was 30 correct, 6 missed, 0 wrong, 18 abstentions. The six misses are occupation. That file is not a Qwen score.

`results/placement-browser.json` is the browser filling development forms. It records wrong placements on the HDBSU scan and misses on the brochure and the noisy photo.

## Failure modes already seen

- A dependant row can receive the member's NRIC and sex if the row context is ignored. The product parser now leaves those fields empty when the label or group names a dependant, spouse, child, or authorised officer. The hospital remeasure after that change no longer shows those two wrong fills.
- Scanned membership pages still place extra names on the wrong band, and the landscape brochure still does not yield a usable form.
- The parser does not read occupation from a prose sentence. A model is not allowed to take credit for that miss unless a raw model prediction is scored.

## Limits

The synthetic letters are cleaner than photographs of cards. The clinic image is a drawn blank, not a photograph of a printed official form. Results on this suite will not by themselves show performance on NTUC or IRS pages.
