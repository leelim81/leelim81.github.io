# Production postfilter at 9c2d5b8

Use this bundle to score raw model generations with the page logic from commit `e658ea8420e0906012c29aae31d156699a7911c1`. The snapshot inside `forms-filler-lab-v3-34e608d.zip` is older and does not contain these guards.

Frozen v3 JSONL is not in this zip. Point the rows at the v3 data you already have.

## Check the bytes

`VERSION` lists sha256 for `facts.js`, `llm.js`, `sanitize.js`, `app.js`, and `facts.test.mjs`. Those files are copied from that commit. `node postfilter.mjs --self-check` recomputes the hashes, runs `facts.test.mjs`, and checks nine keep-or-drop cases.

## Run

```
node postfilter.mjs --self-check
node postfilter.mjs rows.jsonl -o filtered.jsonl
```

Node 18 or newer. No browser, no WebLLM download, and no install.

Each input line is one JSON object:

```json
{"id":"row-1","context":"Citizenship: Singapore","fields":[{"id":"cit","label":"Citizenship","type":"text"}],"seeded":{},"response":{"cit":"Singapore"}}
```

- `context` is the excerpt. `excerpt` and `notes` are accepted names.
- `fields` is the list the page would score. `model_fields` is accepted. Labels decide citizenship, date, and bank rules, so pass the real labels.
- `seeded` or `parser_filled` wins over the model for that id, as `rowsFrom` does.
- `response` is the raw generation object, or a JSON string. `raw` and `generation` are accepted names. Invalid JSON becomes an empty object. `` ```json `` fences are not stripped. JSON `null` and the string `null` become empty before the evidence rules.

Each output line is `{"id","values","sources"}`. `values` is what the editor would keep after sanitize and `accept`. `sources` is `facts` or `model`.

## What is executed

`facts.js` and `sanitize.js` use their Node exports. `postfilter.mjs` runs `supported`, `bestSupported`, `proposalFrom`, and `rowsFrom` from this copy of `app.js`, then the same value loop `openEditor` uses.

`llm.js` is included so its hash can be checked. Loading it starts the WebLLM page binding, so this runner does not import it. After a successful parse, that file calls `FormFacts.coerceModelObject`. The runner calls that function itself.
