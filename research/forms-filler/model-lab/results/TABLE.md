# v1 results

CPU bf16, greedy, no JSON schema. Not a browser score. No adapter weights are in this tree. The adapter sha256 is `results/lora_e1_adapter_sha256.txt`. LoRA was not merged and not converted for the site.

`wrong_fill_rate` = (value mismatches + fills on null gold) / filled fields. When nothing parses, that rate is not a success; the official tuned test has no filled fields because all 80 replies were invalid JSON.

## Base models

| run | precision | recall | wrong-fill among filled | value mismatch | spurious on null | filled | parse-fail forms |
|---|---|---|---|---|---|---|---|
| 0.5B dev | 0.352 | 0.375 | 0.648 of 403 | 116 | 145 | 403 | 3/40 |
| 0.5B test | 0.326 | 0.294 | 0.674 of 331 | 87 | 136 | 331 | 23/80 |
| 0.6B dev | 0.517 | 0.673 | 0.483 of 493 | 113 | 125 | 493 | 0/40 |
| 0.6B test | 0.443 | 0.556 | 0.557 of 460 | 117 | 139 | 460 | 0/80 |

The 0.5B test abstain accuracy 0.851 includes 274 null fields from the 23 unparsed forms. Read it with recall 0.294.

## lora_e1, official

Trained 900 examples, 1 epoch, 5634 s, peak RSS 4819 MB. Chosen on dev before the one test look (`results/FREEZE_lora_e1.json`). Dev shares templates and label families with train.

| run | precision | recall | wrong-fill among filled | parse-fail |
|---|---|---|---|---|
| dev | 0.941 | 0.974 | 0.059 (23 spurious, 0 value mismatches, 392 filled) | 0/40 |
| test | 0 | 0 | not applicable (0 fills) | 80/80 |

Every test reply failed `json.loads` on the whole object. Checkbox-like keys were left without values. That is the official test result.

## Lenient salvage, not official

`scripts/lenient.py` pulls out well-formed pairs from those broken strings. It was not used to choose the run.

| run | precision | recall | wrong-fill among filled | value mismatch | spurious |
|---|---|---|---|---|---|
| lora_e1 test salvage | 0.596 | 0.463 | 0.404 of 285 | 50 | 65 |
| 0.5B test, same salvage | 0.347 | 0.439 | 0.653 | 112 | 191 |
| 0.6B test, same salvage | 0.443 | 0.556 | 0.557 | 117 | 139 |

Fifty of the salvaged tuned answers were the wrong value, including another person's date or id. This is not a win and not a browser measurement.

## Production prompt, 22 smoke records, 44 model fields

Unconstrained bf16, not schema decoding.

| model | matched | value mismatch | spurious | missed | correct empty |
|---|---|---|---|---|---|
| base 0.5B | 10 | 0 | 12 | 0 | 22 |
| lora_e1 | 9 | 1 | 10 | 0 | 24 |

The tuned value mismatch is an occupation string (`Orderer` for `orderly`). The spurious fills are mostly citizenship words the excerpt did not state. Neither row is acceptable. The tuned model was not trained on this prompt.
