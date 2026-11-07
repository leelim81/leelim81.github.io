# Measured CPU baselines (not a tuned model)

Runtime for every row: Hugging Face bf16 on CPU, greedy decoding, no JSON-schema constraint. This is not the browser WebLLM q4 runtime. Qwen2.5-1.5B was not loaded. LoRA `lora_e1` was still training when these files were packed and has no row here.

`wrong_fill_rate` = (value mismatches + fills where gold is null) / filled fields. Filled fields are true positives + value mismatches + spurious fills. The denominator is not every target field. Abstain accuracy counts a missing parse as an empty answer, so read it next to `parse_fail` and recall.

| run | precision | recall | wrong-fill (among filled) | value mismatch | spurious on null | filled fields | abstain acc | parse-fail forms | fields inside unparsed forms counted as abstain / miss |
|---|---|---|---|---|---|---|---|---|---|
| Qwen2.5-0.5B dev | 0.352 | 0.375 | 0.648 | 116 | 145 | 403 | 0.444 | 3 of 40 | 11 / 37 |
| Qwen2.5-0.5B test | 0.326 | 0.294 | 0.674 | 87 | 136 | 331 | 0.851 | 23 of 80 | 274 / 94 |
| Qwen3-0.6B dev | 0.517 | 0.673 | 0.483 | 113 | 125 | 493 | 0.521 | 0 of 40 | 0 / 0 |
| Qwen3-0.6B test | 0.443 | 0.556 | 0.557 | 117 | 139 | 460 | 0.848 | 0 of 80 | 0 / 0 |

The 0.5B test abstain accuracy of 0.851 sits next to 23 forms that did not parse. Those unparsed forms contribute 274 null gold fields counted as abstain and 94 supported fields counted as misses. Qwen3-0.6B parsed every form. Its test wrong-fill rate is still 0.557 of the fields it filled.

## Production prompt, Qwen2.5-0.5B, 22 smoke records

This is the earlier 12/4/6 smoke suite (`research/forms-filler/data`), not the 1,020-example v1 set. The prompt is the site's `production_prompt`. Only `model_fields` are scored. The parser is assumed to have filled the rest. Decoding was still unconstrained bf16 JSON, not browser schema decoding.

| | count |
|---|---|
| records | 22 |
| model fields | 44 |
| matched fills | 10 |
| value mismatches (gold had a value, prediction differed) | 0 |
| spurious fills (gold empty, prediction not) | 12 |
| misses | 0 |
| correct abstentions | 22 |
| parse failures | 0 |
| wrong-fill rate among the 22 fills | 12/22 = 0.545 |

Do not report this run as "0 wrong." Twelve of the twenty-two fills were unsupported. Examples in the raw file include citizenship predicted as Singaporean and a bank field filled with an employer name.
