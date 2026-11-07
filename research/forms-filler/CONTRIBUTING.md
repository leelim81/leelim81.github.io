# Contributing

Add cases as synthetic people and layouts. Keep train, dev, and test disjoint by person, template, and source. Run:

```bash
python3 research/forms-filler/scripts/assert_integrity.py
python3 research/forms-filler/scripts/score_predictions.py --smoke
```

If you change `tools/forms-filler/facts.js`, regenerate `results/parser-only/` and review the diff. Do not describe that report as a model baseline.

Do not commit:

- Identity documents, photos, or text from a real upload
- FUNSD, XFUND, FormGym, or other non-commercial or uncleared sets
- A public blank PDF only because it can be downloaded. Add a URL and hash to `data/public-forms-not-vendored.json` unless the license clearly allows redistribution
- Secrets, tokens, or local-machine paths and usernames

New original code in this directory stays Apache-2.0. New original synthetic fixtures stay CC0-1.0. Say which is which in the commit.

A model table needs a raw prediction file and the scorer output. Leave the status as pending until those files exist.
