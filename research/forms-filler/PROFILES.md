# Saved values and the browser extension

Forms Filler keeps confirmed facts in IndexedDB database `tools-forms-profiles` on this browser. That store is not the editor database and it is not synced to an account. The extension cannot read it. Transfer is a JSON file you download and import.

Only confirmed values are exported. Reference reads stay unconfirmed until you save a correction, check a review value, or edit a tagged PDF field. A fill that the program wrote is not treated as your confirmation. A second read of the same person does not replace a confirmed value. Two applicant names, or a fact about someone else, stay in the unfiled list until you choose a person. A signature or a text box with no field key is not stored.

The unpacked extension is `tools/forms-filler/extension` (version 0.1.0). Installation steps are in that folder’s README. Permissions are `storage`, `activeTab`, and `scripting`. It does not submit forms, and it skips password, payment, one-time-code, hidden, disabled, and read-only controls. Shadow trees and frames from other sites are not filled.

## Reproduce

```bash
node tools/forms-filler/profiles.test.mjs
node research/forms-filler/profiles-e2e.mjs
```

The browser script needs Chrome or Chromium and `http://127.0.0.1:8765` serving this repository. Google Chrome stable ignores `--load-extension`. The run that produced `visual-e2e/results/profiles-e2e.json` used Playwright’s Chromium 131 for the extension and the system Chrome for the page. Without a toolbar click, `activeTab` is not granted, and `scripting` correctly refuses the page. The same `scan.js` and `apply.js` were then run in the fixture pages. That limitation is in the result file.
