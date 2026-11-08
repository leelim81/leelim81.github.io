# Release readiness and stopping point

This is the qualification of the local Forms Filler work, not a merge request. Pull request 13 (`cursor/local-profiles-1412`) is open onto pull request 12 (`cursor/evidence-scorecard-1412`). Pull request 12 is open onto `main`. Neither was merged. Scan autofill is not ready. Native filling, review, the profile store, and extension 0.1.0 are qualified only inside the limits below.

The filler behavior under test is `ff02b88952aab7be53d4aad4c31fd17c56911aee`. This qualification, including the audit family, is `25e982f76a0a509bd015fbd83bf9e9525eca9b7c`. It does not change the filler gates. OCR autofill in `tools/forms-filler/thresholds.js` is false for every type. `research/forms-filler/visual-e2e/VISUAL-GATES.json` was not edited. `FROZEN-e2e.json` was not edited.

## What was frozen before the look

`visual-e2e/AUDIT-FREEZE.json` hashes the audit PDFs, `gold/audit.jsonl`, and the filler source files. The family is `audit-quill`, seed `20261150`. Templates are `quill_widget`, `quill_band`, and `quill_card`. People are Lior Quill, Nils Quill, Oda Quill, and Ned Brook. The street is BIRCH COURT. Those tokens are absent from the older gold files. The template ids are not intake, roster, holder, member stack, desk widget, gate widget, or claim widget.

Five forms, 35 fields, 28 answerable. That is enough to show a miss. It is not a population sample and it does not clear a 5% or 2% bound.

Generate and check the hashes:

```bash
node research/forms-filler/visual-e2e/audit-generate.mjs
node research/forms-filler/visual-e2e/audit-look.mjs
```

`audit-look.mjs` now refuses to run, because `looked` is true. The family is a regression set. Do not generate a replacement and call it unseen.

## The one look

Chrome 156.0.8078.47 ran the shipped path through `FormBench`. Raw extraction is `visual-e2e/results/audit-score.json`. That runner passes `FROZEN-e2e.json`, which has no text-layer map, so native rows came back as review. The same captured text and fields were scored again with `thresholds.js`, which is what the page ships. That rescore is the qualification. It did not change a threshold.

| | Shipped page gate |
| --- | ---: |
| Answerable fields | 28 |
| Not answerable, including five badge-colour widgets and two conflicted names | 7 |
| Automatic fills | 17 |
| Correct automatic fills | 17 |
| Wrong automatic fills | 0 |
| Wrong-person automatic fills | 0 |
| Review suggestions | 2 |
| Review suggestions that matched | 2 |
| Answerable fields with no suggestion | 9 |
| Automatic coverage | 17/28 |
| If a person confirmed both review rows | 19/28 useful, still 9 to type |

The 17 automatic fills are the three native widget PDFs. Each has 7 widgets. A single applicant filled 6 values and left badge colour empty. A patient block before the applicant saved Nils Quill, not Ned Brook. Two applicant names abstained the name and did not open a second profile. The other unique native fields still filled. Readback put the painted values back into the exported PDF (`audit-look.json` geometry). The upper 95% bound on 0 wrong out of 17 automatic fills is about 16%. That does not enable anything.

The two raster forms are a different layout from the development sheets. Each exposed 1 field. Both suggestions matched and stayed review, because OCR autofill is off. The other raster fields were not detected. That is a miss, not an empty-page success. The band reference's email line was read as `Email:` with the address dropped. A phone was not tested. Safari and Firefox were not tested.

The first card reference printed the word `undefined` because the generator omitted the second name. The product did not autofill a name. The fixture was corrected to Ned Brook and read once more as a regression. The text contained both names. The only suggestion was the NRIC, as review. The name was not detected, so it was not chosen.

A real page upload of the native mixed PDF and the native conflict PDF is `visual-e2e/results/audit-page.json`. Seven widgets, Nils Quill saved, Ned Brook pending as the patient, and the two-name file added a conflict to pending without a new profile.

The old `fromText` mapper, scored as the baseline on the same extraction, made 7 automatic fills, 7 correct, 0 wrong. It is not the page's selector.

Manual steps in this look are a proxy, not a timed study. Seventeen automatic fills need no extra step. Two review rows need a confirmation. Nine answerable fields need typing. Human time was not measured.

## Headed extension and profiles

Chromium 131.0.6778.33, headed, with the unpacked extension. Google Chrome 156 ignores `--load-extension`, so this was not Chrome stable. The Activate shortcut Ctrl+Shift+Y opened the real popup. Sixteen checks passed: import, preview, fill, nonempty protection, an explicit override, no submit, secrets and hidden and readonly and disabled and shadow left empty, raster OCR into a profile, a confirmed email that survives reload and a second read, reference removal that leaves the profile, an ambiguous reference that stays pending, and an export that keeps the correction and the custom key and omits the other person.

A second Activate shortcut in that same session did not open another popup, so the extension re-import of the export was not repeated this time. The earlier run on this branch did that import. This session did not. Mobile, Safari, and Firefox were not tested.

Extension package `tools/forms-filler/extension/forms-filler-profiles-0.1.0.zip`, sha256 `1ffea593ca98d4413e698e895a8e2123a0a5a73d8d28aaebd3f23b75b702b917`, version 0.1.0. The extension sources did not change, so the zip was not rebuilt.

## Security and readiness pass

Reviewed on this branch, not a third-party audit.

- Extension permissions are `storage`, `activeTab`, and `scripting`. There is no host permission and no `externally_connectable` entry.
- The popup fills only after a click. `apply.js` does not call submit or click a button. The headed page's submitted count stayed `no`.
- Import rejects `__proto__`, `constructor`, and `prototype`, and rejects unconfirmed facts.
- Profile text is written with `textContent`.
- Another person's facts go to pending. Two applicant names do not create a profile. A signature edit is not stored as a fact.
- The audit fixtures use synthetic names and `example.com`. They are not private documents.
- PaddleOCR is not downloaded by the page. Its trial weights are not in the site.

## Qualified, and not qualified

Qualified, with the limits above:

- Native AcroForm read and fill for a single explicit applicant, and abstention when two applicant names disagree.
- OCR suggestions as review, not as automatic fills.
- The on-browser profile store: confirm, keep a correction, pending for another person, export.
- Extension 0.1.0 on Chromium 131 through the Activate shortcut, for the checks that passed in this session and the earlier one.

Not qualified:

- OCR autofill. The gate stays off. The audit was not used to turn it on.
- Raster field detection on the new band and card layouts. Most fields were missed.
- A 5% or 2% wrong-fill claim. Seventeen clean native fills are one family.
- Phones, Safari, Firefox, and human timing.

## Why this stops

The low-cost local work has reached a plateau. Dictionary flags at Tesseract Init did not change the `1`/`l` email. The person-heading fix stayed. A new family showed the native path and the role gates behaving, and showed raster layouts this detector does not cover. Another threshold pass would be fitted to sheets we have already seen. A larger model, a phone test, and a new disjoint family big enough for the published sample-size gates are future work, not a reason to keep tuning this branch. Those are higher cost. They are not a claim that no further improvement exists.

Do not merge from this report.
