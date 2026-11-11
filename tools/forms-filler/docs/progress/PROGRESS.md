# Forms Filler: progress and resume notes (paused 11 Nov 2026, 19:55 SGT)

Work was paused at a logical point to save credits. This file says what is live, what is half-done, and exactly how to resume.

## 1. What is live
- **Live site:** https://leelim81.github.io/tools/forms-filler/
- **Last Forms Filler release:** PR #82 (merge `ff7aba2f`, verified live, 79/79 public files match; live CIMB journey run25 passed).
- **Current main:** `ab4fddd`. It adds PR #83, the bcgx scikit-learn preload, which does not touch `tools/forms-filler/`.
- **How it works:** everything runs in the browser.
  - Tesseract.js (eng LSTM) reads ID photos and scans.
  - Hand-written rules decide which value goes in which field. They live in `evidence.js`, `person.js`, `facts.js`, `spots.js` and `select.js`.
  - `pdf.js` reads PDFs and `pdf-lib` writes them.
  - Xenova all-MiniLM-L6-v2 is used only for passage retrieval in long text documents.
- **Corpus baseline at PR82** (28 public forms × 3 synthetic people × 3 modes = 252 runs):

  | Hits | Precision | Aligned | Refusals | Real new wrong vs PR68 |
  |---|---|---|---|---|
  | 115 | 90.8% | 89.6% | 56 | 0 |

  Adjusted, these become 121 hits and 93.2%: the SC DOB comb digits are scored as misses but are correctly placed, and the three irs-8822 "3a" flags are scorer false positives.

## 2. In flight (not merged)
### PR #84: Post Code / Zip as the applicant's postal code
- **Branch and PR:** `cursor/post-code-1412`, https://github.com/leelim81/leelim81.github.io/pull/84
- **Head:** `935133e` (CI green). It addresses the review of `b60688a`:
  - The typed-sheet route in `facts.js` is anchored to an applicant block or address.
  - Third-party headings are other-person sections: Solicitor, Hospital, Bank, Insurer, Accountant, Pharmacy, GP/surgery, School and Previous address.
  - A US ZIP box is never filled with a non-US postal code. The address row keeps "SINGAPORE <postal>".
- **Gate status on `935133e`:** NOT RUN. The run was stopped when work was paused.
- **Previous head `b60688a`:** private check PASS; corpus PASS, with hits 115 → 121 (SC Post Code +6) and 0 real new wrong; review CONCERNS, which the three fixes above address.
- **Resume:**
  1. Run review, the private check and the full 252 corpus gate on the current head.
  2. Merge pinned to the reviewed SHA only if 0 real new wrong.
  3. Verify that the Pages hashes match.
  4. Run the live CIMB journey.

### Model experiment (fine-tuned field-label classifier)
- **Rounds 1–2 result:** better on the 28-form harness, but not shippable yet.
- **What was trained:**
  - MiniLM-L6, fully fine-tuned as an 18-class field-label classifier.
  - Trained on public and synthetic labels only, held out by form, with hard negatives for caption, option and heading strings.
  - Exported as int8 ONNX: 23 MB, about 19 MB gzipped with the runtime, about 5.6 ms per label in the browser.
- **Round 1, model plugged in naively:** +16 hits but 20 new wrong fills (captions and headings), so rejected.
- **Round 2, "r2c":** the model is used only after every rule declines, with structural vetoes on caption, option, heading and sentence labels and no address types.
  - On the full 252: 121 → 135 hits against the rules plus Post Code baseline, with 0 real new wrong. Four iras-aitds NRIC fills were adjudicated correct, but they are missing from `expected.txt`.
  - Hard negatives cut the model's false fills on caption and option strings from 30 to 2.
- **Why it isn't shippable yet:**
  - The vetoes were tuned on the same 28 forms.
  - The results came from an offline lookup table, not live in-browser inference.
  - On the unseen cimb-preferred family the gain was only marginal.
  - int8 and fp32 decisions agree only 98.4% of the time.
- **Next (round 3, not started):**
  1. Download 10–15 new public forms and freeze `expected.txt` before running anything.
  2. Wire live in-browser ONNX inference behind the r2c gate.
  3. Measure cold load on a throttled network.
  4. Ship only if there are 0 real new wrong on both the holdout and the corpus and a net gain on the holdout, with a feature flag and fallback to rules.
- **Files in this folder:** `report-2026-11-11.md` (full research, method and numbers, with links) and `patches/`:
  - `rules-postcode-RECOMMENDED.diff`, which is superseded by PR #84;
  - `r2-model-gate-EXPERIMENTAL.diff`, the r2c hook in `evidence.js` and `index.html`;
  - `model-types-r2c-fold*.js`, harness fixtures that are not shippable;
  - `r2c_full252_compare.txt`.
- **Not in the repo:**
  - Model weights and the training environment. They were on the dev box, and the training venv was lost in a restart, so retraining needs a fresh environment.
  - Datasets and training scripts. They are on the dev box at `/workspace/ff-model/` (data/, train/, models/).

## 3. Known gaps and backlog
- **Fields not filled yet:** phone, email, nationality, split first/last name, Chinese name.
- **Plain "Year of birth":** gets the full date unless the label says yyyy.
- **Bare "Born in":** gets the year only.
- **Day-Month-Year labels:** written with slashes.
- **DBS HK page 4:** the field box is detected about 5 pt wider than the cell, so a long name may cross the rule.
- **Scorer:** the irs-8822 "3a" false positives, the SC comb split digits, and the iras-aitds NRIC missing from `expected.txt`.
- **Phone:** real-phone testing has not been done. All verification so far is desktop Chrome, including narrow viewports.
- **Lee's CIMB form:** the Name row starts unticked and the user ticks it. NRIC is ticked by default.

## 4. Release gate used for every change
1. Independent code review is clear.
2. The private check passes on the real CIMB form. That form is kept off-repo and never uploaded.
3. The 252-run corpus gate shows 0 real new wrong vs PR68, with every candidate checked in the exported PDF, including date format.
4. Merge pinned to the reviewed SHA.
5. Verify the Pages deploy and that the live file hashes match.
6. Run the live CIMB journey.

**Privacy rules:**
- Real user documents never go into the repo, cloud agents, training or artifacts.
- The corpus uses synthetic people only.
