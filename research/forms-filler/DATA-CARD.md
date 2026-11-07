# Data card

## What this is

Synthetic people and synthetic form layouts for reference-to-field filling. Every identity is invented. NRIC and FIN strings are checksum-valid and are not copies of a real card. No uploaded identity document, photo, or derivative is in this directory.

## Splits

This is a seed smoke suite, not a gold benchmark. The counts are only large enough to check that the generator, checksums, and scorer run.

| Split | Templates | People | Records |
| --- | --- | --- | --- |
| train | harbour-membership, harbour-payslip | p01–p08 | 12 |
| dev | northwind-visitor | p09–p12 | 4 |
| test | cedar-clinic | p13–p18 | 6 |

A person, template, and source id used in test is not used in train or dev. `scripts/assert_integrity.py` checks that. Test gold leaves dependant name, citizenship, and bank account empty (18 of 54 test fields).

## What a row contains

`reference_text` is the synthetic letter. `parser_facts` is the labeled-fact subset the product parser is expected to see. `model_fields` are the fields the production prompt would still ask a model about. `production_prompt` and `production_schema` match Forms Filler's `askRest` request. `gold` is the full correct assignment, including empty strings for abstention.

Occupation on the clinic form is only in the sentence "works as a …". That is deliberate so a model-assisted score cannot be replaced by the parser.

## Fixtures

`fixtures/forms/` and `fixtures/references/` are original PDFs drawn by `scripts/generate_fixtures.py`. `fixtures/images/cedar-clinic-clean.png` is the same clinic blank. `cedar-clinic-noisy.png` is that image rotated 2.6 degrees with deterministic noise from seed 1412. Annotations are in `fixtures/annotations/cedar-clinic.json`. These files are CC0-1.0.

## Not included

Public blank PDFs from NTUC, HDBSU, IRS, and USCIS are listed by URL and SHA-256 in `data/public-forms-not-vendored.json`. They were already seen, or they are candidate layouts, and they are not redistributed here. FUNSD, XFUND, and FormGym are not downloaded. The development forms must not be treated as untouched held-out test.

## Generator

`python3 scripts/generate_fixtures.py` with seed 1412. PNG regeneration needs Pillow 13.0.0 (`requirements-generate.txt`). The committed checksum list is authoritative if a regeneration differs.
