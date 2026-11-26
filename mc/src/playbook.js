// The playbook: how to run the two hours, as the person who may become the panel's boss.
import { add, clear, h, icon } from "./dom.js";
import { bullets, jump, say, sec } from "./ui.js";

const ARC = [
  { l: "S", name: "Set the contract", from: 0, to: 5, todo: "Thank them. Give your 60-second introduction. Agree how to use the time, and invite interruptions.", see: "Someone who can run a room without taking it over." },
  { l: "C", name: "Clarify, with DEPLOY", from: 5, to: 20, todo: "Play the prompt back. Ask one or two questions at a time, and write each answer on the board as an assumption.", see: "You find the real problem before you solve one." },
  { l: "O", name: "Organize the problem", from: 20, to: 35, todo: "Split it into three or four parts on the board. Say which part you'll go deep on, and why.", see: "Structure that they can follow and interrupt." },
  { l: "P", name: "Present options", from: 35, to: 55, todo: "Two or three ways to do it, with one line of trade-off for each. Recommend one. Ask who disagrees.", see: "Judgment, and room for theirs." },
  { l: "E", name: "Execute the pilot", from: 55, to: 100, todo: "Draw the design in order, and do one number aloud. Then the pilot: SLICE, the four M weeks, metrics with bodyguards, and risks by DRIFTS. Expect the deep dives here.", see: "Depth, and how you lead a design discussion." },
  { l: "D", name: "Drive expansion, and close", from: 100, to: 120, todo: "What happens after the pilot: scale-out, team, and governance. Close with Four P's and an Ask. Then put your questions to them.", see: "A leader who finishes on time, with a decision." },
];

const DEPLOY = [
  ["D", "Demand", "Who is asking, and why now? What happens if we do nothing?"],
  ["E", "Experience", "Who uses the output, and at what moment in their work? What do they do with it?"],
  ["P", "Plumbing", "What data exists, where, and how fresh? What is the latency budget? What can we build on?"],
  ["L", "Limits", "Which rules apply: residency, privacy, and model risk? What is fixed: the date, the budget, or the people?"],
  ["O", "Outcomes", "Which number should move, and from what baseline? What must not get worse?"],
  ["Y", "Yield to humans", "Where does a person decide? What happens when the system is unsure, or down?"],
];

const TOOLS = [
  ["SCOPED", "Set the contract. Clarify. Organize. Present options. Execute the pilot. Drive expansion, and close.", "The whole session."],
  ["DEPLOY", "Demand, Experience, Plumbing, Limits, Outcomes, Yield to humans.", "The clarifying questions."],
  ["SLICE", "Slice by intent. Ladder of autonomy. Instant human fallback. Contain the blast radius. Evals before the agent.", "Shaping a pilot, most of all for an agent."],
  ["The four M weeks", "Map, Make, Mirror, Measure.", "The phases of a pilot."],
  ["Metrics with bodyguards", "Value, quality, technical, and adoption. Every value metric has a quality metric that must not get worse.", "Any time you name a success measure."],
  ["DRIFTS", "Drift and staleness. Regulation and privacy. Integration is slow. Frontline resistance. Trust. Scale and latency.", "The risk check before you close a design."],
  ["Four P's and an Ask", "Problem, Play, Pilot, Proof, and one Ask.", "The two-minute close."],
  ["WEIGH", "Which number moves. Effort and elapsed time. Interdependencies. Guardrails and risk. Horizon.", "Ranking requests, or choosing between options."],
  ["The four A's", "Authenticate, Authorize, Assess, Account.", "Governing any agent."],
  ["Three levels of agents", "Personal, team, and enterprise. Each needs heavier governance than the last.", "Deciding how much control a use needs."],
];

const LENSES = [
  {
    name: "Platform and architecture",
    who: "Most likely the principal engineers.",
    listen: "Latency, failure modes, cost, and reuse of what exists.",
    give: "A budget on every hop. What happens when a dependency is slow. A design that builds on their platform.",
    ask: "Where would this break first at your volumes?",
  },
  {
    name: "Modeling",
    who: "Whoever asks about labels or evaluation first.",
    listen: "Label quality, leakage, evaluation, drift, and explanation.",
    give: "A backtest that walks forward in time. Calibration. A simple baseline before a deep model.",
    ask: "What has given you more lift lately: better features, or a different model?",
  },
  {
    name: "Governance and risk",
    who: "Whoever asks where the data lives.",
    listen: "Residency, model risk review, access, and audit.",
    give: "Gates, a risk tier, and the evidence a bank would ask for.",
    ask: "Which review takes the longest today, and why?",
  },
  {
    name: "Delivery and people",
    who: "Most likely the managers.",
    listen: "Priorities, capacity, stakeholders, and how you decide.",
    give: "A limit on work in progress. Run work funded first. A way to say no that people can accept.",
    ask: "What gets in the team's way most often?",
  },
];

const STUCK = [
  ["You blank.", "\"Let me take ten seconds.\" Look at the board, and restart from the last thing you wrote."],
  ["You are corrected on a fact.", "\"Thank you. I had that wrong. So the design changes like this.\""],
  ["Two panelists disagree with each other.", "\"That is a real trade-off. Give me the strongest case for each in a sentence, and I'll say how I'd decide.\""],
  ["You are running over.", "\"I'm at time on this part. I'll state my assumption and move on.\""],
  ["You can't answer.", "\"I don't know. My guess is this. How does it work here?\""],
  ["The room goes quiet.", "\"I've been talking for a while. What would you challenge?\""],
  ["A deep dive goes past your depth.", "\"You're past what I know in detail. Walk me through it, and I'll say how I'd decide with what you tell me.\""],
  ["A panelist repeats a question, or offers a number.", "That is a hint. Take it. \"That helps. Let me adjust.\""],
];

const ASK = [
  "What is the one thing this team does that you'd want protected, whoever takes the role?",
  "Where does the team lose the most time today?",
  "Which business unit is your best partner, and what makes that work?",
  "What do you wish the next person in this role would decide quickly?",
  "How do the two sites work together today, and what would make it better?",
  "What research would you start tomorrow if you had the time?",
];

function arcBar() {
  const track = h("div", { class: "nb-track", "aria-hidden": "true" });
  ARC.forEach((p, i) => track.append(h("div", { class: "nb-seg" + (p.l === "E" ? " is-mark" : "") + (i === ARC.length - 1 ? " nb-end" : ""), vars: { "--w": p.to - p.from } }, p.l)));
  return h("div", { class: "nb arc" }, track);
}

export function playbookView(root) {
  const page = h("div", { class: "page learn" });
  clear(root).append(page);
  add(
    page,
    h(
      "div",
      { class: "hero" },
      h("div", null, h("h1", { class: "display" }, "The playbook"), h("p", { class: "hero-sub" }, "How to run two hours with six people who would report to you. The case is the excuse. The working session is the test.")),
      h(
        "div",
        { class: "next" },
        h("span", { class: "next-where" }, "If you remember three things"),
        h("ol", { class: "rules" }, h("li", null, "Clarify before you solve, and write the assumptions where everyone can see them."), h("li", null, "Give your view, then ask where it is wrong."), h("li", null, "Name your gaps before they do: payments, and scale.")),
      ),
    ),
    jump([
      ["tests", "What it tests"],
      ["arc", "The 120 minutes"],
      ["open", "First five minutes"],
      ["clarify", "Clarify"],
      ["board", "The board"],
      ["tools", "Frameworks"],
      ["boss", "As their boss"],
      ["gaps", "Your gaps"],
      ["room", "The room"],
      ["stuck", "When stuck"],
      ["ask", "Your questions"],
    ]),

    sec(
      "tests",
      "Read this first",
      "What the two hours are for",
      h("p", { class: "body" }, "The invitation describes an interactive, discussion-based scenario, with no preparation required. The panel is the team: three principal engineers and three managers. So each of them is asking two questions at once. Is this person good? And do I want to work for them?"),
      h(
        "div",
        { class: "cards", style: "margin-top: 16px" },
        [
          ["Can you think in the open?", "They want to watch you go from a vague prompt to a decision, aloud, while people interrupt."],
          ["Can we work for you?", "How you listen, how you take a correction, and how you make a call. Each of them is picturing a Monday morning with you."],
          ["Can you judge our work?", "Not do their work. Ask the right question in a design review, and notice when an answer is thin."],
          ["What do you do when you don't know?", "You will reach the edge of what you know, on payments or on scale. Saying so early counts in your favor here."],
        ].map(([t, x]) => h("div", { class: "card" }, h("p", { class: "card-title" }, t), h("p", { class: "card-text" }, x))),
      ),
    ),

    sec(
      "arc",
      "SCOPED",
      "The 120 minutes",
      h("p", { class: "body" }, "Your own arc, stretched to two hours. The long block is the design and the pilot, because that is where the principals will take you deep."),
      arcBar(),
      h(
        "ol",
        { class: "arc-rows" },
        ARC.map((p) => h("li", null, h("span", { class: "arc-l" }, p.l), h("span", { class: "arc-when" }, `${p.from} to ${p.to} min`), h("div", null, h("p", { class: "arc-name" }, p.name), h("p", { class: "arc-do" }, p.todo), h("p", { class: "arc-see" }, "They see: " + p.see)))),
      ),
      h("div", { class: "note-box" }, h("p", { class: "h-note" }, "If they run it differently"), h("p", null, "They may lead with questions, or hand you a prompt in parts. Follow them. Use the arc to notice what hasn't been covered yet, and offer it: \"We haven't talked about how this is released. Shall I take that next?\""), h("p", null, "They may also ask you to present a case of your own. ", h("a", { href: "#/mine" }, "Prepare one in Your case"), ".")),
    ),

    sec(
      "open",
      "Set the contract",
      "The first five minutes",
      say("Agree how to work", "Thank you for making the time. Before we start, can I check how you'd like to run the two hours? I'm happy to think aloud at the board, and I'd like you to stop me whenever you disagree. That is how I'd want us to work in any case."),
      say(
        "Your introduction, in 60 seconds",
        "I lead the AI unit at my current firm. I started it three years ago with two mandates: change how the firm itself works with AI, and build for clients. I hired the team of 15, and we have more than 30 systems in real use. We were the first AI team in the firm's regional network to go through internal audit, and we passed. Before that I spent five years in a bank's data science team, where we took more than 50 models into production. I haven't worked in payments. So today I'll ask a lot of questions, and I'd like you to correct me early.",
      ),
      say("After they give the prompt", "Let me play that back, to check I have it. Is that the whole problem, or is there a larger one behind it?", true),
      h("p", { class: "body" }, "Name your employers in the room. They are left out here on purpose. Then learn the six names and use them, including for anyone who joins by video."),
    ),

    sec(
      "clarify",
      "Clarify",
      "DEPLOY, for a data and AI case",
      h("p", { class: "body" }, "Ask one or two at a time. Write each answer on the left of the board as an assumption. Stop at about 15 minutes, and say: \"I have enough to start. I'll flag assumptions as I go.\""),
      h(
        "ul",
        { class: "rows rows-n", style: "margin-top: 12px" },
        DEPLOY.map(([l, name, q]) => h("li", null, h("span", { class: "row-n" }, l), h("div", null, h("p", { class: "row-main" }, name), h("p", { class: "row-sub" }, q)))),
      ),
    ),

    sec(
      "board",
      "Organize",
      "How to lay out the board",
      h(
        "div",
        { class: "wb", role: "img", "aria-label": "A whiteboard in five zones: the prompt on top, questions and assumptions on the left, the picture in the middle, numbers and a parking lot on the right, and the decision and the ask at the bottom." },
        h("div", { class: "wb-top" }, "The prompt, in one line"),
        h("div", { class: "wb-left" }, h("b", null, "Questions and assumptions"), "Filled in the first 20 minutes"),
        h("div", { class: "wb-mid" }, h("b", null, "The picture"), "Boxes and numbered arrows, drawn in order"),
        h("div", { class: "wb-right" }, h("b", null, "Numbers"), "Worked aloud", h("b", { style: "margin-top: 8px" }, "Parking lot"), "Points to come back to"),
        h("div", { class: "wb-bot" }, h("b", null, "Decision and ask"), "Written last, read aloud at the close"),
      ),
      bullets([
        "Use big boxes and few words. Nine boxes at most. Number the main flow.",
        "Name each box for the job it does: event stream, feature store, model endpoint. If you name a product, put it in brackets as an example, and ask for theirs.",
        "Say the caption as you draw. Don't draw in silence for more than 20 seconds.",
        "Hand the pen over once: \"Would you draw how this works today?\"",
        "Use the parking lot. It shows that you heard a point, without losing your thread.",
        "Stand to the side, and face the people.",
        "If there is no whiteboard, use paper turned toward them. Bring your own markers.",
      ]),
    ),

    sec(
      "tools",
      "Your own tools",
      "The frameworks, on one page",
      h("div", { class: "warn-box" }, h("p", null, h("b", null, "Use them, and don't announce them. "), "Say \"let me check the risks\", and walk through the six. Don't say \"I have a framework called DRIFTS\". An acronym said aloud sounds rehearsed.")),
      h(
        "ul",
        { class: "rows" },
        TOOLS.map(([name, what, when]) => h("li", null, h("p", { class: "row-main" }, name), h("p", { class: "row-sub", style: "color: var(--ink)" }, what), h("p", { class: "row-sub" }, h("b", null, "Use it for: "), when))),
      ),
      h("div", { class: "btn-row", style: "margin-top: 16px" }, h("a", { class: "btn", href: "#/drills/recall" }, "Drill these as recall cards", icon("next"))),
    ),

    sec(
      "boss",
      "The second test",
      "Behave like the boss they would want",
      h(
        "div",
        { class: "cards" },
        h(
          "div",
          { class: "card is-pick" },
          h("p", { class: "card-title" }, "Do"),
          bullets([
            "Give your view first, then invite challenge: \"Here is my take. Where is it wrong?\"",
            "Take a correction in the open: \"Thank you. That changes my design.\"",
            "Use names. Bring in the quiet person, and anyone on a video link.",
            "Credit what exists: \"You've built this at a scale I haven't. What did you learn?\"",
            "Decide. When two options are close, pick one, and say what would change your mind.",
            "Keep time. Park a point, and come back to it.",
          ]),
        ),
        h(
          "div",
          { class: "card trap" },
          h("p", { class: "card-title" }, "Don't"),
          bullets([
            "Don't say \"when I take over\" or \"my team\". Say \"if I joined\" and \"this team\".",
            "Don't promise anything: headcount, promotions, tools, or a new structure.",
            "Don't criticize how things are done today, or the person who is leaving.",
            "Don't bluff. A wrong answer said with confidence loses the principals.",
            "Don't lecture on generative AI. Ask how they see it first.",
            "Don't play to the most senior voice. Six people score you.",
          ]),
        ),
      ),
      h("div", { class: "note-box" }, h("p", { class: "h-note" }, "Assume someone in the room wanted this role"), h("p", null, "Be generous to every idea, and keep your ego out of it. If a principal out-argues you, say so, and adopt the better design. That is the strongest thing you can show.")),
    ),

    sec(
      "gaps",
      "Say it first",
      "Scripts for your gaps",
      say("Payments", "I haven't worked in payments. I've learned the basics so that I can ask better questions, and I'll check my assumptions with you as I go."),
      say("Scale", "The largest volume I've worked with is about 100 million a year. Yours is more than a thousand times that. Where scale changes the answer, I'll say what I'd expect, and ask you what happens in practice."),
      say("Their stack", "I'll draw this with plain components, and name a product only as an example. Tell me what you run for each box, and I'll write your names in."),
      say("Anything else", "I don't know. Here is my guess, so that you can correct it, and here is how I'd find out.", true),
    ),

    sec(
      "room",
      "Six people, four lenses",
      "Who is listening for what",
      h("p", { class: "body" }, "You won't know for certain who holds which lens. The first question each person asks will tell you. Answer the person, then check: \"Does that cover what you were asking?\" Keep a name and a note for each person in ", h("a", { href: "#/panel" }, "the Panel page"), "."),
      h(
        "div",
        { class: "cards", style: "margin-top: 16px" },
        LENSES.map((x) =>
          h(
            "div",
            { class: "card" },
            h("p", { class: "card-title" }, x.name),
            h("p", { class: "card-text muted" }, x.who),
            h("dl", { class: "kv" }, h("dt", null, "They listen for"), h("dd", null, x.listen), h("dt", null, "Give them"), h("dd", null, x.give), h("dt", null, "Ask them"), h("dd", null, x.ask)),
          ),
        ),
      ),
    ),

    sec(
      "stuck",
      "Recovery",
      "When it goes wrong",
      h(
        "ul",
        { class: "rows" },
        STUCK.map(([when, line]) => h("li", null, h("p", { class: "row-main" }, when), h("p", { class: "row-sub", style: "color: var(--ink); font-size: 16px" }, line))),
      ),
    ),

    sec(
      "ask",
      "The last ten minutes",
      "Your questions for them",
      h("p", { class: "body" }, "Pick three. Write the answers down in front of them. They are the first page of your first 90 days."),
      h("ol", { class: "rows rows-n", style: "margin-top: 12px" }, ASK.map((q, i) => h("li", null, h("span", { class: "row-n" }, i + 1), h("p", { class: "row-main", style: "font-weight: 400" }, q)))),
      h("div", { class: "lesson-foot" }, h("div", { class: "btn-row" }, h("a", { class: "btn btn-go", href: "#/cases" }, "On to the cases", icon("next")), h("a", { class: "btn", href: "#/qa" }, "Questions about you"))),
    ),
  );
  return () => {};
}
