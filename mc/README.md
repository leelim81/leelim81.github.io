# One Twenty

A practice room for a two-hour panel case interview for a senior AI engineering role. It is a personal study tool. It names no company and no person, and it asks search engines not to list it.

The design follows Ninety, the practice room in `../bcgx2`: the same paper, ink, and yellow marker, the same fonts, and no framework.

## What is in it

- **Plan.** A countdown, five study sessions, and a checklist for the day.
- **Playbook.** How to run the two hours: the arc, the opening, the whiteboard, and how to behave as the panel's future manager.
- **Cases.** Four scenarios, each worked in full: questions, options, an architecture diagram that replays in draw order, numbers, trade-offs, the leadership layer, pushbacks, and a two-minute close. Each answer stays hidden until you have tried the case against a clock.
- **AWS kit.** The parts to name at a whiteboard, by layer, with the equivalent on a Hadoop, Spark, or Databricks stack. Four reference diagrams.
- **Q&A.** Questions outside the case, with draft answers to adapt.
- **Drills.** Recall cards, drawing from memory, pushbacks against a clock, arithmetic aloud, and a 25-minute mock panel with a scoring rubric.
- **Primer.** Five short lessons with checks.
- **Videos.** Seven reference videos, with what to look for in each.

Progress is kept in the browser's `localStorage`. Nothing is sent anywhere. The site works offline after the first visit.

## Build

```sh
cd mc
npm install
npm run lint
npm run build
```

`npm run build` bundles `src/main.js` into `js/app.js` with esbuild, and stamps a build id into `index.html`. Commit `js/app.js` and `index.html` together with the source, because the site is served as static files.

To look at it, serve the repository root and open `/mc/`:

```sh
python3 -m http.server 8000
```

## Lint

`npm run lint` checks the writing and the content:

- No long dashes, currency symbols, exclamation marks, or filler words. American spelling.
- Ids are unique.
- Every diagram refers to boxes that exist, every arrow appears no earlier than its boxes, and every draw step draws something.

Names that must never appear on the site are read from `dev/banned.local.txt`, one per line. That file is ignored by git, because the list itself would put the names in the repository.

## Layout

| Path | What it holds |
| --- | --- |
| `index.html`, `sw.js` | The page, and the service worker that keeps an offline copy |
| `css/app.css` | Ninety's design system |
| `css/one-twenty.css` | The pieces this site adds: diagrams, cards, clocks, and drills |
| `src/main.js` | The router |
| `src/diagram.js` | The diagram engine: layout, arrow routing, and the draw-order stepper |
| `src/content/` | All of the words: cases, kit, cards, questions, lessons, and videos |
| `src/*.js` | One file for each page |
| `dev/` | The build and the lint |

## Diagrams

A diagram is data. `src/diagram.js` lays it out tall for a phone or wide for a laptop, routes the arrows, and can replay it step by step.

```js
{
  id: "example",
  title: "An example",
  layers: [{ label: "Sources", nodes: ["a", "b"] }, { nodes: ["c"] }],
  nodes: { a: { t: "Title", s: "second line", at: 1 }, b: { t: "Other", k: "store", at: 1 }, c: { t: "Target", at: 2 } },
  edges: [{ a: "a", b: "c", at: 2, n: 1 }, { a: "b", b: "c", at: 2 }],
  base: [{ t: "A bar under the diagram.", at: 2 }],
  steps: ["What to say while drawing step 1.", "What to say while drawing step 2."],
}
```

`k` is the kind of box: a service by default, `store` for data, `ext` for something outside your control, and `human` for a person. `at` is the step a box or an arrow appears in. `n` is the flow number. An arrow that skips a layer, or runs backwards, travels in a lane at the side. Set `via` to `"left"` or `"right"` to choose the side.

## Fonts

IBM Plex Sans, IBM Plex Mono, and Latin Modern Roman. See `fonts/LICENSES.md`.
