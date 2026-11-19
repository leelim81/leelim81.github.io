# Ninety

Ninety is a practice room for a 90-minute data science test: probability and statistics, machine learning fundamentals, and three coding tasks in pandas and scikit-learn. It is a static site. Python runs in the browser, so there is no server and nothing to install.

It is a personal practice tool. It is not affiliated with or endorsed by CodeSignal, and none of the data, questions, or checks come from a real test.

## What is in it

- **23 coding tasks** with realistic data files: joins and aggregations, leak-free preprocessing, and models that have to clear a metric bar. Each task has visible checks, hidden checks, three hints, and a reference solution.
- **50 quiz questions**: numeric answers to three decimals, single choice, and select all that apply. Every question has a worked explanation and a note on each option.
- **2 mock tests**: 11 questions on a 90-minute clock. Quiz answers stay unmarked until the end. Submit on a coding task shows how many checks pass, hidden ones included, without the reasons.
- **A coding-only run**: four linked coding questions on a 70-minute clock and no quiz, the shape that some candidates describe. It adds a short analysis question and a model that has to reach a recall bar while precision stays above a floor. The story, the data, and the wording are this site's own.
- **A 12-lesson refresher** on the theory behind the quiz questions: probability, statistics, and machine learning fundamentals. Each lesson has worked examples, a few checks with the reasoning, and a Python snippet to run and change. Quiz feedback links back to the lesson that covers the question.
- **A code recall drill** for the three coding tasks: 55 one-line cards on the imports, method names, and arguments that are easy to blank on. You type the missing piece. A round is 10 cards, a card you miss comes back before the round ends, and a line counts as known after two first tries in a row are right.
- **An eight-session plan** that orders the tasks, sets, and mocks, and a library for free practice.

## How it works

- **Python in the browser.** The site loads [Pyodide](https://pyodide.org) in a web worker (`py-worker.js`). One worker serves the whole visit, so pandas and scikit-learn load once and stay in memory while you move between tasks.
- **Cached after the first visit.** A service worker (`sw.js`) keeps the Python files in the browser's cache. Later visits start Python from the device, with no download.
- **Fresh folder for every run.** Run, Test, and Submit copy the task's input files into an empty folder, run `solution.py` there, and then check the files it saved.
- **Progress stays in the browser.** Answers, results, and code drafts are saved in `localStorage` as you go. Settings has a backup file for moving to another browser.

## Folder map

| Path | What it holds |
| --- | --- |
| `index.html`, `css/`, `js/app.js` | The page, its styles, and the bundled app |
| `src/` | App source, bundled into `js/app.js` |
| `py-worker.js` | The Python runtime worker |
| `py/ninety_check.py` | The check library that grades task output |
| `sw.js` | The service worker |
| `content/bank.json` | Questions, lessons, code recall cards, plan, and task descriptions |
| `content/ex/*.json` | Input files and hidden check data for each task |
| `dev/` | Content sources and build scripts |
| `fonts/` | IBM Plex and Latin Modern, with their licenses |

## Change the content

The tasks, questions, and lessons are written in Python under `dev/`. The build runs every reference solution, compares it with an independent second implementation, runs a set of known-wrong solutions to make sure the checks catch them, and then writes `content/`.

The refresher lessons are in `dev/course.py`. The build recomputes the results in the worked examples and the answer to every check, runs every snippet, and confirms that each quiz question points at a lesson.

The code recall cards are in `dev/recall.py`. In a card's code, `{{answer}}` marks a gap, and `{{answer|other}}` lists every spelling that is accepted. The build runs each card with its answers filled in and checks the result, runs every accepted alternative the same way, and confirms that the wrong answers listed for a card fail. The page itself judges an answer by comparing text, so it needs no Python.

```
pip install pandas numpy scikit-learn latex2mathml
python3 dev/build.py
```

Then bundle the app. This also stamps a build id into `index.html`, so browsers pick up the new files.

```
npm install
npm run build
```

## Run it locally

Serve the repository root with any static server, then open `/bcgx2/`.

```
python3 -m http.server 8000
```

The first run downloads Python from `cdn.jsdelivr.net`, so it needs a connection.

## Offline use

One visit with a connection saves the whole site on the device: the pages, the fonts, the cheatsheet, the data of every task, and Python. After that it opens at the same address without a connection. Settings shows how much is saved.

- `sw.js` serves saved files. Python files are served from the device first. The site's own files come from the network first, with the saved copy as the fallback.
- `src/offline.js` fetches what the service worker has not seen: the files of a first visit, which load before the service worker is in control, and the data of tasks that were never opened. `dev/build.mjs` writes the list.
- Task data files carry a hash of their own in the URL, so a new build downloads only the tasks that changed.
