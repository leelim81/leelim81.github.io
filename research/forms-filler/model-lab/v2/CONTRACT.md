# v2 contract

This is the fixture the box should train and score. It is not a measured winner. Do not start from `data/v1` and do not look at `data/v1/test` except as the failed diagnostic already published.

## Same request the site sends

`production_prompt` and `production_schema` are built like `askRest` and `asciiSchema` in the site:

- User message, temperature 0.
- Keys are the field ids listed after `Fields:`.
- An empty string is abstain. Do not invent a phone, email, citizenship, or bank account.
- Browser path: `response_format` JSON schema, `max_tokens` 96. That path was not used for v1.
- CPU unconstrained path: the same prompt, greedy, `max_new_tokens` 96, no schema. Report it separately.
- Official score is exact match of that JSON to `gold` after the normalizer in `scripts/common.py`. A salvage parser is not the official score.

`parser_facts` come from the current `facts.js` `fromText` on the excerpt. `model_fields` are what `modelFields` still asks after `mapFactsToFields`. Training targets are only those fields.

## Splits

| split | templates | label family | people |
|---|---|---|---|
| train | nric card, letter, payslip, utility, chat, checkbox note | A, B, F | t* |
| dev | visitor slip, courier note | D | d* |
| test | clinic copy, work pass, claim note | E | e* |

No template, label family, or person is shared. v2 test is one look after a dev choice. v1 test is already used.

## What the gold refuses

- Citizenship stays empty unless the excerpt states Permanent Resident or Foreigner. An NRIC prefix is not citizenship.
- Bank stays empty unless the excerpt has an account number. "Account holder" and an employer name are not a bank fill.
- A clinic patient's name, FIN, and date are not the applicant's. The applicant date field on those rows is empty.

## Train

`scripts/train.py` is the v1 experimental prompt and reads `data/v1/train.jsonl`. Do not point it at v2.

A v2 run should train on `production_prompt` with `target_json` as the only supervised tokens, from `data/v2/train.jsonl`, and select on `data/v2/dev.jsonl`. This repository does not launch that run.
