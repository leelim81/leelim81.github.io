// The plan: five sessions before the panel, a daily warm-up, and a checklist for the day.
// An item points at a case, a lesson, or a video, and is ticked off when that is done.
// A "todo" item is ticked by hand.

export const SESSIONS = [
  {
    id: "s1",
    title: "Learn the shape of the day",
    goal: "Know how the two hours run, and what the panel is scoring.",
    minutes: 60,
    items: [
      { kind: "todo", id: "s1-playbook", title: "Read the playbook from start to finish", href: "#/playbook", meta: "15 min" },
      { kind: "lesson", ref: "payments" },
      { kind: "video", ref: "TFZQIZrK0YQ" },
      { kind: "todo", id: "s1-recall", title: "One recall round on your frameworks", href: "#/drills/recall", meta: "5 min" },
    ],
  },
  {
    id: "s2",
    title: "Case 1, and the core AWS parts",
    goal: "One full case cold, and two reference pictures you can draw.",
    minutes: 75,
    items: [
      { kind: "case", ref: "scam-score" },
      { kind: "lesson", ref: "fraud-models" },
      { kind: "todo", id: "s2-kit", title: "Read the core parts of the AWS kit", href: "#/aws", meta: "15 min" },
      { kind: "todo", id: "s2-draw", title: "Draw the real-time scoring picture from memory", href: "#/drills/draw/ref-realtime", meta: "10 min" },
    ],
  },
  {
    id: "s3",
    title: "Cases 2 and 3",
    goal: "A platform case and an agent case, each tried cold first.",
    minutes: 90,
    items: [
      { kind: "case", ref: "feature-platform" },
      { kind: "case", ref: "insights-agent" },
      { kind: "lesson", ref: "spark" },
      { kind: "todo", id: "s3-push", title: "One round of pushbacks, standing up", href: "#/drills/pushback", meta: "10 min" },
    ],
  },
  {
    id: "s4",
    title: "Case 4, and the questions about you",
    goal: "The leadership case, and answers you can give without notes.",
    minutes: 80,
    items: [
      { kind: "case", ref: "portfolio" },
      { kind: "todo", id: "s4-qa", title: "Say all the answers in Q&A aloud, and fix what isn't true", href: "#/qa", meta: "30 min" },
      { kind: "lesson", ref: "production" },
      { kind: "lesson", ref: "residency" },
      { kind: "todo", id: "s4-sums", title: "One round of numbers aloud", href: "#/drills/numbers", meta: "10 min" },
    ],
  },
  {
    id: "s5",
    title: "Dress rehearsal",
    goal: "One timed run on a prompt you haven't seen, then rest.",
    minutes: 60,
    items: [
      { kind: "todo", id: "s5-mock", title: "Run the mock panel on an unseen prompt, standing, with a pen", href: "#/drills/mock", meta: "25 min, then score" },
      { kind: "video", ref: "3PRJjNaqcdY" },
      { kind: "todo", id: "s5-close", title: "Say the two-minute close of each case against the clock", href: "#/cases", meta: "10 min" },
      { kind: "todo", id: "s5-missed", title: "A last recall round. Missed cards come up first", href: "#/drills/recall", meta: "5 min" },
    ],
  },
];

export const WARMUP = [
  ["#/drills/recall", "One recall round"],
  ["#/drills/draw", "One diagram from memory"],
  ["#/drills/pushback", "Three pushbacks, standing"],
];

export const DAY = [
  { id: "d-names", text: "Learn the six names, and how to say each one." },
  { id: "d-closes", text: "Read your four two-minute closes once. Nothing new today." },
  { id: "d-numbers", text: "Say your own numbers aloud: 15, 100 and 30, SGD 6 million, 40%, 50, and 20." },
  { id: "d-kit", text: "Pack two whiteboard markers, a notebook, and a photo ID for the front desk." },
  { id: "d-early", text: "Arrive 20 minutes early. Use the time to slow down, not to cram." },
  { id: "d-phone", text: "Phone on silent, face down, before you walk in." },
  { id: "d-after", text: "Afterwards, the same evening: write down every question they asked." },
];
