# v3 contract

v3 is the fixture to train next. It has not been trained. v2 stays frozen and is not a training set: its dev model calls were one template, and its test was then used. The published quantized comparison is in `results/v2-quantized/README.md`. No live model change follows from it.

Select on dev. `data/v3/test.jsonl` is one look after that choice. Do not open its expected answers to pick a config.

## Same request the site sends

`production_prompt` and `production_schema` match `askRest` in `tools/forms-filler/app.js`:

- Temperature 0, seed 0 on the CPU runs.
- `max_tokens` 96, context 1024. Prompts for this fixture are the same text the page builds, sliced excerpt 900.
- Schema keys are required. `additionalProperties` is false. An empty string is abstain.
- Required keys are not a semantic result. The page drops a model value that fails `allowModelValue` in `facts.js`.

Official score is exact match to `gold` on `model_fields` only. A JSON salvage is not the official score.

## Safeguards

Before this fixture, two product bugs were measured on v2:

- Optional schema keys let constrained decoding stop after one key. Requiring every key raised recall and also let the 0.5B model emit 18 empty-looking fills. The page now requires the keys and still rejects a value with no evidence.
- A premises line such as `44 CEDAR WALK 161616` was stored as the postal code `161616`. Labeled premises, home, residential, and mailing lines keep the street text and a trailing postal code. A following sentence is not part of the line. A bare 6-digit file number is not an address. An all-caps street line is not a person's name.

Identity:

- `Not specified`, `unknown`, `n/a`, and `nil` never pass.
- Citizenship passes only when the excerpt says Singapore Citizen, Permanent Resident, or Foreigner. The word Singapore, including a letterhead, does not.
- A bank, GIRO, ledger, payee, or settlement value passes only when its digits appear in the excerpt. An employer name does not.
- A date may be rewritten between `14.03.1992`, `14/03/1992`, and `14 March 1992` when that date is in the excerpt. A date said of a patient or another person is refused unless the excerpt says the patient is the applicant. If the relationship is not explicit, the field stays empty. A patient is not forbidden from being the applicant.
- Parser fills are unchanged. The model is skipped when it has no leftover fields.

## Splits

Seed 20261109. People, names, NRIC values, templates, and label strings are disjoint.

| split | records | model calls | templates | families | null fraction of model gold |
|---|---|---|---|---|---|
| train | 480 | 480 | 8 | A, B, C | 0.683 |
| dev | 180 | 180 | 6 | D, E | 0.622 |
| test | 180 | 180 | 6 | F, G | 0.500 |

sha256: train `11e2ac69475f970b94595639a584656b55a4db5eff17957b0c07d83b3539a403`, dev `6a703d22ee3ebd8e39fa868a4cbb133a1f6e60733f159c0d11556c3e975906f9`, test `92936e65321e904613d08a309d9f76f00dd219bdd9079347da3983709799978c`.

Each of name, date of birth, phone, email, address, job, citizenship, and bank has a positive and a negative model target in train, dev, and test. Each split also has a patient who is the applicant and a patient who is not. The same template appears with both label families of its split. `data/v3/COVERAGE.json` is the count matrix.

## Train

Do not point `scripts/train.py` at v1 or v2. A v3 run should supervise `target_json` from `production_prompt` in `data/v3/train.jsonl` and select on dev. This repository does not launch that run. The live Forms Filler model ids stay as they are.
