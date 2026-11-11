# Forms Filler: can a fine-tuned model beat the hand-written label rules?
Run date: 2026-11-11 (SGT). Owner request: pt99u. Baseline: live main ff7aba2f, "pr82c" harness result (252 runs: hits 115, precision 90.8%, aligned 89.6%, 56 refusals, 0 unexplained new wrong).

## Verdict: MIXED, and not safe to ship as a model
- At the **label level** a fine-tuned MiniLM classifier is clearly better than the rules (cross-fit by form).
- **End to end** (the real app, gated so rules veto and the model only adds) it **fails the "0 new wrong" gate**. It adds hits, but it also adds wrong or unexpected fills on 5 forms.
- A conservative subset of the model (v2) still fails the gate on one form. A **3-line rules change** gets the clean gain the model found (Post Code) with 0 new wrong. **Recommendation: do not ship the model. Ship the rules patch** (`patches/rules-postcode-RECOMMENDED.diff`).
- Caveat: the full 252-run harness was **not** re-run for any variant. I only ran forms whose behaviour the model table changes, plus controls (details below).

## 1. Research (links checked, HTTP 200)
Bottleneck: Forms Filler's misses and refusals come from mapping a printed field label to a value type, and from role/section context. OCR is not the limiting step for the synthetic ID cards in the harness.
- Layout/document models: LayoutLMv3 https://arxiv.org/abs/2204.08387, LiLT https://arxiv.org/abs/2202.13669, Donut https://arxiv.org/abs/2111.15664 (FUNSD benchmark https://arxiv.org/abs/1905.13538). They are 100M–200M+ parameters, need page images plus OCR boxes, and are too big and slow for a static in-browser tool. They are rejected for this task because the decision is on a label string, not on a page.
- OCR: Tesseract https://github.com/tesseract-ocr/tesseract (current), PaddleOCR https://github.com/PaddlePaddle/PaddleOCR and RapidOCR https://github.com/RapidAI/RapidOCR (ONNX PP-OCR), TrOCR https://arxiv.org/abs/2109.10282. I did **not** benchmark an OCR swap, so there is no measured claim about OCR.
- Small text models: all-MiniLM-L6-v2 (22M parameters, already in the app) https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2, MiniLM https://arxiv.org/abs/2002.10957, DistilBERT https://arxiv.org/abs/1910.01108, GLiNER https://arxiv.org/abs/2311.08526 (zero-shot NER, not tried).
- Fine-tuning techniques: LoRA https://arxiv.org/abs/2106.09685 and QLoRA https://arxiv.org/abs/2305.14314 (for LLMs, pointless at 22M parameters, so I did a full fine-tune). SetFit https://arxiv.org/abs/2209.11055 (few-shot contrastive; I didn't need it with about 13k labelled strings). Distillation https://arxiv.org/abs/1910.01108. ONNX Runtime dynamic int8 quantisation https://onnxruntime.ai/docs/performance/model-optimizations/quantization.html. Browser runtime: transformers.js https://huggingface.co/docs/transformers.js.
- **Picked:** (1) a full fine-tune of MiniLM-L6 as an 18-class label classifier, then ONNX int8; (2) a TF-IDF char+word logistic regression as the cheap baseline.

## 2. Data (synthetic or public only)
- Task: label text → one of 18 types: other, name, given, surname, nric, dob, sex, nationality, birthCountry, race, address, postal, blk, street, unit, phone, email, chineseName.
- Sources (13,069 rows): fields dumped from the 28 harness corpus forms (public bank/government PDFs, 686 usable rows plus the cimb-preferred unseen family); 57 other public PDFs downloaded from the URL list in `pubforms/urls.txt` (4,924 rows, mostly `other`); synthetic phrasebooks with role/section words and augmentation (about 7.4k rows).
- Labels: regex "silver" labeller plus my own review of the corpus list (single annotator, so gold is not independent). **Lee's private files were never used.** No data left the box.
- Split: held out **by form** (2 folds over the sorted 28 harness forms). Every harness form is predicted by a model that never saw it. cimb-preferred is a further unseen family and was excluded from fold 0 training.
- Training (CPU only, free): 6 epochs, lr 6e-5, about 232 s per fold. Total compute is far under the 2 h budget.

## 3. Label-level results (cross-fit; 686 corpus labels, 160 gold-fillable; label-only, so no role/section context)
| system | precision | recall | wrong fills |
|---|---|---|---|
| rules (label-only) | 74.2% | 84.4% | 47 |
| MiniLM thr 0.5 | 84.3% | 97.5% | 29 |
| MiniLM thr 0.8 | 88.6% | 97.5% | 20 |
| MiniLM thr 0.9 | 96.3% | 81.3% | 5 |
| MiniLM thr 0.9, add-only (rules first, model fills the rest) | 75.0% | 95.6% | 51 |
| TF-IDF LR thr 0.8 | 84.5% | 98.8% | 29 |
- Per fold, thr 0.8: fold0 91.4% precision / 98.8% recall (rules 82.6% / 88.4%); fold1 85.5% / 96.0% (rules 65.6% / 79.7%).
- **Unseen family (cimb-preferred, n=21 gold): the model is NOT better.** Rules 61.1% precision / 52.4% recall; MiniLM thr 0.5 52.6% / 47.6%; thr 0.9 62.5% / 23.8%. Generalisation to unseen layouts is unproven.
- Synthetic phrasebook dev set (335 labels): rules 73.9% / 67.1%, model 0.7 97.0% / 84.2%. It is partly circular, so I don't lean on it.
- Note: the "rules" row is a label-only re-implementation, so it is not the app's full pipeline. The app also vetoes by role and section, which is why the label-level gain overstates the end-to-end gain.

## 4. End-to-end gated plug-in on the real app
Design: `model-types.js` holds a label→type table, built offline from the cross-fit predictions (fold0 table used for fold-1 forms and vice versa). `evidence.js` consults it only after every rule declines, in `fieldKind` and `applicantIdentitySlot`. Role, person and section vetoes (`fieldRole`, `personOf`, `sectionKind`, `unsafeDestination`) are untouched. The model never overrides a rule. Patch: `patches/model-gate-EXPERIMENTAL.diff`.
Harness: playwright + Chrome, `FF_HONOUR=1`, desktop, same scorer as pr82c, same 3 synthetic people and 3 modes. Only forms the table changes (plus controls) were run.

| variant | runs | hits (baseline → model, same runs) | precision | aligned | new correct | new wrong/unexpected | lost |
|---|---|---|---|---|---|---|---|
| baseline pr82c (these 162 runs) | 162 | 101 | 88.8% | 89.0% | – | – | – |
| t09: all 18 types, thr 0.9 | 162 | 117 | 78.3% | 90.4% | 16 | **20 across 5 forms** | 0 |
| v2: dob/postal/blk/street/unit/birthCountry/sex/nationality/race only, thr 0.9 | 63 | 48 → 54 | 100% → 90% | 100% | 6 | **6 (sc-personal-aof "Place of Birth")** | 0 |
| rules-only Post Code patch | 27 | 24 → 30 | 100% | 100% | 6 | **0** | 0 |

t09's new wrong fills:
- hsbc-sg-personal-particulars-update: the instruction caption "(Residential Address refers to…)" got an address fragment ("T A M P I N E S").
- iras-f24-letter-of-authorisation: the "(Full Name of Taxpayer)" caption was filled with an NRIC.
- iras-aitds-tax-deduction-claim: an unlabelled underscore line was filled with an NRIC.
- ocbc-account-opening: the "Identity Card" option label was filled with an NRIC.
- sc-personal-aof: "Place of Birth" was filled with a country.

Why the model fails here: these are option, caption or heading strings. The model was trained on labels and has no notion of "this is a checkbox option" or of the form's policy, so it is confidently wrong on exactly the strings the rules deliberately leave alone. Gating on a threshold does not fix that: the wrong cases have confidence ≥0.9.
- In the first t09 pass, 4 runs ended as "error" (dbs-hk p2/p3 card+sheet, iras-aitds p3 card+sheet, iras-application-for-qcr p1 card+sheet). I re-ran them and they were harness timeouts under load. They are now editor-reached with 0 lost placements.
- The Post Code patch passes `evidence.test.mjs` and `facts.test.mjs`. `safety.test.mjs` can't run in my copy because the public-form fixtures are missing; it fails identically on unmodified pr82c, so that is an environment limit.

Coverage gap (be honest): of the 252 runs, 162 were run for t09, 63 for v2 and 27 for the rules patch. The other forms have no table entries, so they are unchanged by construction, but I did not run them. Projected full-harness numbers for t09 would be about 131 hits, but that is a projection, not a measurement, and it fails the gate anyway.

## 5. Size and latency
- Fine-tuned MiniLM-L6 + 18-way head: fp32 ONNX 91.0 MB; **dynamic int8 ONNX 23.0 MB** (15.4 MB gzipped). int8 vs fp32 argmax agreement 99.5%, and 99.6–99.7% at the 0.8 decisions.
- Native onnxruntime, 1 thread, batch 1: median 0.9 ms (p95 1.2 ms) per label; batched about 1.1 ms per label.
- **In-browser (Chrome headless, onnxruntime-web WASM, local server):** session create about 0.8–0.9 s, model fetch 63 ms locally, per-label median 5.6–5.7 ms (p95 8.5–10.2 ms), 1 or 2 threads (no cross-origin isolation, so threads gave no gain). Pre-tokenised inputs were used, so tokenisation is excluded. A runtime download would add ort wasm 14.8 MB (3.8 MB gzipped) plus 0.37 MB JS plus the 15.4 MB gzipped model, about 19 MB over the wire. That is on top of what the app already lazy-loads. Real-network cold-load time was not measured.
- Table-only variant (what the harness used): a few hundred bytes of JS, with no runtime cost. It can't generalise beyond labels already seen, which is another reason the gain doesn't carry to new forms.

## 6. Recommended change (rules, not the model)
`tools/forms-filler/evidence.js`, in `applicantIdentitySlot`:
```
-    if (/^(?:postal|postal code)$/.test(s)) return 'postal';
+    if (/^(?:postal|postal code|post code|zip|zip code)(?:\s+\d+)?$/.test(s)) return 'postal';
```
Patch file: `/workspace/ff-model/patches/rules-postcode-RECOMMENDED.diff` (against the pr82c site). Measured on 3 forms (27 runs): hits 24 → 30, 0 new wrong. sc-personal-aof "Post Code" is filled correctly for all 3 people in all 3 modes. A cloud agent should re-run the full 252-run harness before merging. The model also suggested numbered "Date of Birth" and "Contact No" variants. I did not isolate those as rules patches, so they're untested.

## 7. What would change the verdict
A model would need (a) option/caption/heading awareness (role/section features, or a label+neighbourhood input), (b) a larger, independent gold set (mine is single-annotator and partly regex-derived), and (c) a pass on unseen families. Cheap next steps: train with the option/caption strings as explicit `other` negatives (the fields where t09 failed) and re-run the gate.

## Not done
SetFit/frozen-embedding ablation, OCR swap benchmark, an all-data final model, and the full 252-run harness for any variant.

## Files (/workspace/ff-model)
`report-2026-11-11.md`; `patches/`; `models/` (fold0/fold1 HF + ONNX int8, `crossfit_eval.json`); `data/` (labels, labeller, phrasebooks); `train/` (ft.py, export, eval scripts, logs); `score/` (compare.py, scored_*.json); `runs_model_t09`, `runs_model_v2`, `runs_model_rp`; `ortweb/` (browser benchmark). Nothing was pushed or merged.

---

# Round 2 (hard negatives, rules-first gating, SetFit-style ablation)
Run 17:11–19:20 SGT, about 2 h wall clock. The box was shared (another agent's browsers, and one box restart at about 18:10), so some harness runs were flaky and I re-ran them. Training itself needed about 40 min under contention.

## Verdict (round 2): BETTER ON THE HARNESS, NOT YET SHIPPABLE AS A PR. It meets the numeric criteria only with one adjudicated item, and the evidence is optimistic.
- Criterion: full 252 runs, 0 real new wrong, and hits above the rules + Post Code baseline.
- Baseline (pr82c + my Post Code rules patch, full 252 re-run): **121 hits**, precision 91.2%, aligned 90.1%, 0 new wrong vs pr82c. pr82c itself is 115 hits / 90.8% / 89.6%.
- Round-2 best variant **r2c** (full 252): **135 hits (+14 over rules + Post Code, +20 over pr82c)**, 0 lost placements, 51 refusals (baseline 56), aligned 91.0%. The scorer flags **4 "unexpected"** placements, all in iras-aitds-tax-deduction-claim (p1 and p3, card and card+sheet), so strict precision reads 89.8% vs 91.2%.
- I opened the iras-aitds screenshot: the NRIC went into "NRIC/ FIN No." under "PART 1 – YOUR PERSONAL PARTICULARS". That is the right box. The 4 flags come from `expected.txt` not listing that field, so I count 0 real new wrong. This is my adjudication. It is not a clean harness pass, so the parent or Lee should look at it (`runs_model_r2cf/iras-aitds-tax-deduction-claim__p1__card__desktop/editor.png`).
- Why I still don't call it shippable (details below):
  1. The final vetoes and type exclusions were chosen after seeing label-level diffs and harness failures on these same forms, so the harness number is tuned, not held out.
  2. The clean unseen-family result (cimb-preferred) shows only a marginal gain.
  3. The harness used an offline label→type table built from cross-fit predictions. The in-browser ONNX inference path was **not** wired in or tested end to end.

## What changed from round 1
1. **Hard negatives (synthetic and public).**
   - `data/hardneg.py`: parenthetical captions, option/choice strings, headings, and ambiguous labels such as "Place of Birth", bare "Identity Card"/"Passport", ID Type, Date of Issue/Expiry. Disjoint train and test vocabularies (590 train rows; 319 held-out `hn_test` rows).
   - Public option/group labels from radio/checkbox fields: 2.5k train rows from the public PDFs, plus the corpus options by fold.
   - Labeller policy fixes to match the app: only "country of birth" is a fillable birth field; bare document words are options; fully parenthetical labels are `other`.
   - Training set 17,388 rows. Same held-out-by-form 2-fold protocol, plus cimb-preferred.
2. **Gating.** The model never overrides the rules or the role/section/`unsafeDestination` vetoes: it is consulted only after every rule has declined. New structural eligibility checks in `evidence.js`: plain `text` input only; label ≤ 70 chars; has letters after removing parentheticals; not starting with "(", "[" or "☐"; not "If/Please/Note/Refer/Enter…"; fewer than 7 words; no "last 4 characters/digits"; no "today"; not starting with "new". The "binary agree/disagree on the rules' key" idea was not needed. Rules-first add-only is the safer form.
3. **SetFit-style ablation.** Step 2 only: frozen all-MiniLM-L6-v2 embeddings + logistic regression. I did not run the contrastive step.
4. **TF-IDF agreement** was tested as an extra gate.

## Label-level results (cross-fit by form; same gold as before but with the policy fixes; vetoes as of the run)
| corpus, 686 labels, 157 gold-fillable | precision | recall | wrong |
|---|---|---|---|
| rules + Post Code (label-only) | 74.1% | 89.2% | 49 |
| round-2 model alone, thr 0.8 (struct + role veto) | 93.7% | 94.3% | 10 |
| round-2 model alone, thr 0.9 | 96.9% | 79.0% | 4 |
| round-1 model alone, thr 0.9 (same vetoes, new labels) | 95.9% | 74.5% | 5 |
| round-2 model **add-only** (rules first), thr 0.9 | 75.5% | 96.2% | 49 (0 more than the rules) |
| round-2 add-only, thr 0.8 | 74.0% | 98.1% | 54 |
| SetFit-head add-only, thr 0.9 | 74.8% | 98.1% | 52 |
| TF-IDF alone, thr 0.9 | 93.7% | 94.9% | 10 |

- **Held-out hard negatives (`hn_test`, 319 strings, all should be `other`), model alone at thr 0.9:** false-fillable round 1 **30**, round 2 **2**, SetFit head 14, TF-IDF 4. The rules alone fire on 70 of these, but the app's other structure stops most of them, so this is label-only.
- **Corpus option/group labels (598):** round 1 8, round 2 **0**, rules 8, SetFit head 5, TF-IDF 7.
- **Unseen family cimb-preferred (21 gold-fillable), add-only thr 0.9:** round 2 P 63.2% / R 57.1% / 7 wrong; round 1 60.0% / 57.1% / 8; rules 61.1% / 52.4% / 7. At thr 0.8, round 2 gets 14 of 21 at 63.6% precision (8 wrong). The gain is small, and n=21.
- The SetFit-style frozen-embedding head is cheaper to train, but it generalises worse on cimb-preferred (add-only thr 0.9 had 11 wrong of 26 predicted) and fires more on the hard negatives. It is not worth keeping.
- Hard negatives clearly fixed the confident-wrong problem **at the label level**: the model's own false fills on captions and options dropped from 30 to 2 of 319, and from 8 to 0 on real options.
- Caveat: gold is still single-annotator regex plus review. The phrasebook `ptest` numbers (in `r2/eval2_main.out`) share templates with training and are not independent.

## End-to-end iterations (full 252 harness, flakes re-run, baseline = pr82c + Post Code)
| variant | table | hits | vs baseline 121 | new wrong or unexpected | lost |
|---|---|---|---|---|---|
| r2a (14 forms only: affected + controls) | all 18 types, thr 0.9, int8 | +10 on those runs | | 12: hsbc "New Residential Address 1" got a partial address; sc "House No." blk into "Permanent Address:"; iras-aitds NRIC (correct) | 0 |
| r2b (full 252) | drop blk/street/unit, add "(" and "new" vetoes | 135 | +14 | 10: iras-aitds ×4 (correct), **sc-personal-aof "Permanent Address:" ×6 (real wrong: Nominee Details address filled with a partial address)** | 0 |
| **r2c (full 252)** | r2b minus `address` | **135** | **+14** | **4 (iras-aitds, adjudicated correct), 0 real** | **0** |
- r2c is exactly r2b with the `address` entries removed. The 14 forms with address entries were re-run (126 runs); the other 14 forms are identical by construction (same table entries).
- Both iterations (r2b, r2c) had flaky runs re-run once on separate ports (8814–8817): "lost placement" runs were harness refusals under load, not model effects. After the re-run there were 0 lost placements.
- The 14 new correct placements: qcr "Identification No. (NRIC/FIN)" (×8, across iras-application-for-qcr and derived-iras-qcr-rotated90), greateastern-pa-claim "2. Date of Birth:" (×5), uk-gp-prf1-medicalgroup "Your name" (×1). They come from 3 or 4 forms, so this is narrow. Several look rules-patchable (numbered DOB label, "Identification No. (NRIC/FIN)"), though I did not test that.
- Lesson: address labels are section-dependent. A label-keyed model cannot tell the applicant's address from the nominee's, so `address` is excluded.
- Type scope: name, given, surname, nric, dob, phone, email, postal, and the slot types sex/nationality/birthCountry/race. blk, street, unit and address are excluded.

## Size and latency (round-2 model, same architecture as round 1)
- MiniLM-L6 + 18-way head. ONNX fp32 91.0 MB; **dynamic int8 23.0 MB** (about 15.4 MB gzipped).
- int8 vs fp32 argmax agreement is 96.6% (fold 0) and 99.6% (fold 1). At confidence ≥ 0.9, the fillable/not decision agrees 98.4% and 99.6%. Fold 0 is lower than round 1 (99.5%), so a shipped model would need a check that the int8 and fp32 decisions match on the table labels.
- Latency was **not re-measured**; the architecture is unchanged, so the round-1 numbers apply: native onnxruntime about 0.9 ms per label (p95 1.2 ms); in-browser onnxruntime-web WASM (headless Chrome, local server) median about 5.6 ms (p95 8.5–10.2 ms), with session creation about 0.85 s. Runtime download is about 19 MB gzipped (model plus WASM). Cold load on a real network was not measured.
- The harness used the table form of the gate, which costs a few hundred bytes and has no latency. A real PR needs the runtime inference (the 19 MB download).

## Recommendation
- Ship the **Post Code rules fix** (PR #84, or `patches/rules-postcode-RECOMMENDED.diff`) on its own.
- **Do not open a model PR yet.** Before one, run the r2c gate on forms outside the 28 corpus forms. Also integrate and measure in-browser inference, and re-check int8 vs fp32 on fold 0.
- If Lee wants to go ahead anyway, the artifacts are: `patches/r2-model-gate-EXPERIMENTAL.diff` (the `evidence.js` and `index.html` hook with the structural gate), and `patches/model-types-r2c-fold0.js` / `fold1.js` (cross-fit label tables, which are *test fixtures*, not shippable). A shippable change would replace those tables with runtime ONNX inference of `models/r2fold{0,1}/onnx/model_int8.onnx`, retrained on all data.
- The PR #84 head b60688a is broader than my Post Code patch (it also touches other rules). My baseline is pr82c + Post Code only. A fair comparison on top of #84's final head has not been run, and the gate executor owns that.

## Round-2 files (/workspace/ff-model)
`r2/` (assemble2.py, ft2.py, eval2.py, mktables2.py, setfit_head.py, tfidf_r2.py, eval outputs, CHECKPOINT.md); `data/hardneg.py`; `models/r2fold0|1` (HF + ONNX), `models/r2*_probs.npy`; `site-r2b`, `site-r2c-0|1`; runs `runs_model_rp252`, `runs_model_r2a`, `runs_model_r2b_*`, `runs_model_r2c_*`, `runs_model_r2cf*`; `score/cmp_*.out`; `patches/r2-model-gate-EXPERIMENTAL.diff`, `patches/model-types-r2c-fold*.js`, `patches/r2c_full252_compare.txt`. Nothing was pushed or merged. The python venv under `/workspace/ff-model-lab/.venv` was gone by the end (box restart), so the training scripts need a re-created environment to re-run.
