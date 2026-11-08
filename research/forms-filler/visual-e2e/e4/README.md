# E4 nano detector

Optional. The forms page does not load it. Rejected for adoption on the preregistered gate.

The checkpoint is `nutrientdocs/form-field-v1-nano` revision `7cbc1ecd55d59f6315a1415dddc59c3c8b115f05`, file `model.onnx`, 3,728,816 bytes, SHA-256 `d7ab44396154af79409c9f8a4fded6c9aa907ae6d283fbe5d2b533d3b7314ec1`. The card says Apache-2.0. It names Text, Choice, and Signature boxes. It does not read labels, checked state, or people. The card’s mAP figures are the vendor’s, not ours. The card says the weights were trained on synthetic renders and contain no personal records. That training set was not audited here.

Runtime is onnxruntime-web 1.18.0 (MIT): `ort.min.js` 540,716 bytes SHA-256 `74945866728300a05746a37387ac48863a8be5cdc3760304b47d0136d7d0dc5b`, and `ort-wasm-simd.wasm` 10,595,041 bytes SHA-256 `f533b5f21790563d7556c611c3835ac65848ee326da2689aac54ed7d9cc8c6a4`. One thread. The browser session returned `[1, 8400, 8]` from input `images`.

Cold requests were those three files, 14,864,573 bytes. Chrome RSS while the page was open was about 2.0 GB for the whole browser, not the model. No phone was available, so this is not a phone result.

Gate, frozen before the look: score 0.3, NMS 0.6, IoU 0.5, same class, one-to-one. Go required recall at least 10 points above the current line finder and precision at least 0.95. Four new Pell layouts, 17 destination boxes. Result: current finder 0 true positives at that IoU (9 boxes, none overlapping enough), nano 4 true, 4 false, precision 0.50, recall 0.24. Rotated page stayed blocked and the detector was not asked. Decision: reject. Thresholds were not changed after the look.

A later look at one page, not a new score, showed the nano scores on the thin ticket rules were about 0.09 to 0.25, under 0.3. The current finder’s boxes sat on those rules but the gold strokes are about 9 points tall, so IoU stayed under 0.5. That explains the zeros. It was not used to pick a new cutoff.

```bash
node research/forms-filler/visual-e2e/e4/fetch.mjs
node research/forms-filler/visual-e2e/e4/e4-prepare.mjs
node research/forms-filler/visual-e2e/e4/e4-score.mjs
```

`e4-score.mjs` refuses a second look. The vendor binaries are downloaded, not committed.
