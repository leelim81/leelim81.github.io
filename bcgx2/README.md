# Ninety

Ninety is a practice room for a 90-minute data science test: probability and statistics, machine learning fundamentals, and three coding tasks in pandas and scikit-learn. It is a static site. Python runs in the browser, so there is no server and nothing to install.

It is a personal practice tool. It is not affiliated with or endorsed by CodeSignal, and none of the data, questions, or checks come from a real test.

## What is in it

- **19 coding tasks** with realistic data files: joins and aggregations, leak-free preprocessing, and models that have to clear a metric bar. Each task has visible checks, hidden checks, three hints, and a reference solution.
- **50 quiz questions**: numeric answers to three decimals, single choice, and select all that apply. Every question has a worked explanation and a note on each option.
- **2 mock tests**: 11 questions on a 90-minute clock, with nothing marked until the end.
- **A 12-lesson refresher** on the theory behind the quiz questions: probability, statistics, and machine learning fundamentals. Each lesson has worked examples, a few checks with the reasoning, and a Python snippet to run and change. Quiz feedback links back to the lesson that covers the question.
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
| `content/bank.json` | Questions, lessons, plan, and task descriptions |
| `content/ex/*.json` | Input files and hidden check data for each task |
| `dev/` | Content sources and build scripts |
| `fonts/` | IBM Plex and Latin Modern, with their licenses |

## Change the content

The tasks, questions, and lessons are written in Python under `dev/`. The build runs every reference solution, compares it with an independent second implementation, runs a set of known-wrong solutions to make sure the checks catch them, and then writes `content/`.

The refresher lessons are in `dev/course.py`. The build recomputes the results in the worked examples and the answer to every check, runs every snippet, and confirms that each quiz question points at a lesson.

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
