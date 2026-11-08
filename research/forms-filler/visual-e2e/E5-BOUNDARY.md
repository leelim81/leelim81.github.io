# Extension boundary, version 0.1.2

The extension fills only checked fields for the role you choose. A section id in autocomplete is not a person. Applicant, patient, spouse, and contact come from the visible legend or label. If those words disagree with a section id, the field stays blank. Two fields of the same role and the same kind stay blank. Payment, file, password, one-time-code, hidden, disabled, and read-only fields stay untouched.

Fill looks again before it writes. A field that was removed, relabeled, or typed into after Preview is left alone. A controlled input that rerenders from the input event keeps the value. The page’s own listener can read that value before any submit. Open shadow and frames are counted and not filled. Closed shadow is not visible to the scan and is not filled.

Headed Chromium 131.0.6778.33, not current Chrome stable. No phone. 15 checks, 0 failed. Raw file: `results/e5-boundary.json`. The zip is `tools/forms-filler/extension/forms-filler-profiles-0.1.2.zip`, SHA-256 `0fe86e4845f8733037c7520df9f93582caae888e6d2af08a1c32ea1e55191080`. The 0.1.0 and 0.1.1 result files stay as earlier records.

```bash
node research/forms-filler/visual-e2e/e5-boundary.mjs
```
