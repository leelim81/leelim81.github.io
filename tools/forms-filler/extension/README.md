# Forms Filler profiles (unpacked extension)

Version 0.1.0. This is not in the Chrome Web Store. It does not sync, and it does not upload a profile.

The extension cannot read the website’s IndexedDB. In Forms Filler, use **Export confirmed values** and then import that JSON here. The file contains only confirmed values.

## Install

1. Open `chrome://extensions`.
2. Turn on Developer mode.
3. Choose **Load unpacked** and select this folder (`tools/forms-filler/extension`).
4. Pin the extension if you want the button visible.

## Use

1. Open the form page.
2. Click the extension. Import a profile if this browser does not have one yet.
3. Choose the person. Click **Preview this page**.
4. Check the rows you want. A field that already has text stays as it is unless you check it.
5. Click **Fill checked empty fields**. The extension does not press submit.

Password, payment, and one-time-code fields are skipped. Hidden, disabled, and read-only fields are skipped. A label that matches two saved values is left blank. Shadow DOM and frames inside other sites are not filled.

Permissions are `storage`, `activeTab`, and `scripting`. There is no host permission and no background reading of pages.
