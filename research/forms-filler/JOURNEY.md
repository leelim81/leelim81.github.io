# Forms Filler journey

Checked on this branch, not on the live site. Pull request 14 is not merged, so the download link is not on the published GitHub Pages site yet. Locally it is `tools/forms-filler/extension/forms-filler-profiles-0.1.0.zip`.

## What a first visit can do

The page says it reads a form and papers on this computer, and that a desktop extension is separate and not in the Chrome Web Store. Saved values stay closed until the Saved values button is used. Escape or Close puts them away and returns focus to that button. A reload starts closed again. Finishing a read does not open the panel.

An empty store says no one is saved yet. Export before anything is confirmed explains that unconfirmed reads stay on the site. A broken import file is rejected. Confirmed corrections survive reload and a later read. Another person’s values stay unfiled. Delete removes one value. The extension copy can be removed without deleting the site copy.

## Extension

Version 0.1.1. Permissions are storage, activeTab, and scripting. No host permission. The page does not install it. Desktop Chrome or Chromium: unzip, Extensions, Developer mode, Load unpacked, pin, import an export, Preview, Fill. Fill writes the checked values into that website immediately. The site can read them. Fill does not press submit. Password, payment, one-time-code, hidden, disabled, and read-only fields are skipped. The 32 headed checks were on 0.1.0, before this sentence. The fill behavior is unchanged. The zip the page links is 0.1.1.

Chromium 131.0.6778.33 ran the unpacked zip from the download path. The shortcut toggles the popup: one press while it is open closes it, and the next press opens it. A DevTools connection that started before the popup does not list it. Current Chrome stable was not the browser that loaded the extension. Phones are not supported by this install.

## This run

32 checks passed, 0 failed. Raw file: `visual-e2e/results/profiles-gesture-e2e.json`. Screenshots: `saved-collapsed.png`, `saved-collapsed-mobile.png`, `saved-open.png`, plus the popup preview and fill shots in the same folder.

## Not this release

Scan autofill stays off. The frozen scan audit was not retuned. Bigger layout and model work is separate.
