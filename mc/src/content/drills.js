// Content for the pushback drill, the estimation drill, and the mock panel.

// Pushbacks about you, not about a case. The case pushbacks are added to these in the drill.
export const PERSONAL = [
  { id: "boss", q: "You would be our boss, and you know less about payments than any of us.", a: "That is true today, and I'd rather say it than have you find it out. What I bring is a team that ships, a way to win work from the business, and the cover you need to do your best work. On payments, I'd ask you to correct me early and often. What is the one thing about this domain that newcomers get wrong?" },
  { id: "change", q: "We've had leaders who change everything in their first month.", a: "I won't. The first 30 days are for listening: an hour with each of you, the sponsors, and the incident history. I'd change nothing in that time. After that, anything I propose comes with what I heard and why. What is one thing you'd want me not to touch?" },
  { id: "applied", q: "Some of us were considered for this role.", a: "Then I'd want to hear what you would have done with it, because some of that should happen anyway. I can't remove the disappointment, and I won't pretend to. What I can do is make sure your scope and your visibility grow, and that you're in the room for the decisions that shape this team." },
  { id: "aws", q: "Why are you drawing AWS? Most of our work runs in our own data centers.", a: "Then we use your names. I chose AWS as a vocabulary we share, not as a recommendation. The jobs are the same on any stack: a stream, a lake, batch compute, a feature store, a registry, and serving. Tell me what you call each one, and I'll redraw it in your terms." },
  { id: "view", q: "You keep saying you'd ask the team. What do you think?", a: "Fair. My view is this, and then I'll say where your data should overrule me. I'd state the option I'd pick and the reason in one sentence. I ask the team where you have facts that I don't. I decide when it is a matter of priorities, and I own the result either way." },
  { id: "platform", q: "Our last platform project took two years, and nobody used it.", a: "Then I'd make this one smaller and prove it sooner. Two lighthouse models, chosen with their owners, and a gate at six months: are those models faster to build and no worse in quality? If the answer is no, I'd stop it and say so. What made the last one hard to adopt?" },
  { id: "genai", q: "Leadership wants a generative AI win this quarter. What do you tell them?", a: "That they can have a thin slice in six weeks: internal users, read-only, on a short list of questions, with evals that we can show. I'd say what I won't cut, which is access rules and an audit trail, because those let us widen it afterwards. A demo this quarter and an incident next quarter is a bad trade." },
  { id: "fine", q: "This model has run fine for three years. Why touch it?", a: "If it meets its target and its monitoring is healthy, I wouldn't. I'd ask what \"fine\" means in numbers: its metric against the baseline, drift in its inputs, and what it costs to run. If those are good, the people on it are better spent elsewhere. If nobody knows, that is the first thing to fix." },
];

// Estimation drills. Do the arithmetic aloud. Figures marked "say" are assumptions to state, not facts.
export const SUMS = [
  { id: "tps", q: "A network switches 159 billion transactions a year. What is that per second, on average?", a: "About 5,000 a second.", how: "A year has about 31.5 million seconds. 159 billion divided by 31.5 million is about 5,000. Published peaks are near 70,000 a second." },
  { id: "market", q: "One market makes 2 billion payments a year. Give the average per second, and a safe peak.", a: "About 63 a second on average. Plan for about 650.", how: "2 billion divided by 31.5 million is 63. Ten times the average is a safe first guess for the peak. Then ask for the real one." },
  { id: "shards", q: "Each event is about 1 KB, and the peak is 650 a second. How many Kinesis shards?", a: "One would carry it. Run two to four.", how: "650 KB a second is under the 1 MB, or 1,000 records, that one shard takes each second. Add headroom for bursts and for a second consumer." },
  { id: "storage", q: "2 billion events a year, at about 1 KB each. How much storage in a year?", a: "About 2 TB, before compression.", how: "2 billion times 1,000 bytes is 2 trillion bytes." },
  { id: "alerts", q: "The bank can act on 0.1% of payments. At 2 billion payments a year, how many alerts a day?", a: "About 5,500 a day.", how: "2 billion times 0.001 is 2 million a year. Divide by 365." },
  { id: "precision", q: "Say 1 payment in 1,000 is fraud. Your model catches 80% of it, and alerts on 1% of payments. What share of alerts are real fraud?", a: "8%.", how: "Take 100,000 payments. 100 are fraud, and you catch 80. You raise 1,000 alerts. 80 out of 1,000 is 8%. The other 92% are good customers, which is why the action on an alert matters." },
  { id: "snapshot", q: "500 million cards, 300 features, 8 bytes a value. How big is one snapshot?", a: "About 1.2 TB.", how: "500 million times 300 is 150 billion values. Times 8 bytes is 1.2 trillion bytes." },
  { id: "embed", q: "500 million cards, a 128-dimension embedding, 4 bytes a number. How big is one version?", a: "256 GB.", how: "128 times 4 is 512 bytes a card. 500 million times 512 bytes is 256 billion bytes." },
  { id: "tokens", q: "300 account managers ask 20 questions a day. Each question uses about 6,000 tokens. How many tokens a day?", a: "About 36 million.", how: "300 times 20 is 6,000 questions. 6,000 times 6,000 is 36 million. Multiply by the current price list to get a budget." },
  { id: "budget", q: "You have 50 ms for your part of a payment. Split it.", a: "Network 5, features 10, rules 5, model 15, headroom 15.", how: "Any split that leaves real headroom is fine. The point is that every hop has a number and an owner." },
  { id: "people", q: "You have 34 people. Split them across run, builds, and the rest.", a: "Run 7, three builds 16, a spike 2, enablement 2, discovery 3, buffer 4.", how: "Fund the run work first, at about a fifth. Check the sum aloud: 7, 16, 2, 2, 3, and 4 make 34." },
  { id: "scan", q: "A job reads a year of transactions: 159 billion rows. Say each row is 200 bytes on disk. How big is the scan, and what does the default of 200 shuffle partitions give you?", a: "About 32 TB. Each shuffle partition would hold about 160 GB.", how: "159 billion times 200 bytes is 31.8 trillion bytes. Divide by 200 partitions. That is why defaults fail at this size, and why you filter and aggregate before you join." },
  { id: "labels", q: "Disputes can arrive up to 120 days after a payment. You retrain every month. How old is the newest month with complete labels?", a: "About four months old.", how: "120 days is four months. So either you train on older data, or you use early labels and correct for the ones still to come." },
  { id: "golden", q: "The agent must handle 20 types of question. How large is the golden set?", a: "About 150 questions.", how: "Five to eight variations of each type gives 100 to 160. Add adversarial cases on top." },
];

// The mock panel: 25 minutes, six phases.
export const PHASES = [
  { id: "frame", name: "Frame", minutes: 4, todo: "Play the prompt back in one sentence. Set the contract for the session. Ask five clarifying questions, and state an assumption for each." },
  { id: "options", name: "Options", minutes: 3, todo: "Give two or three ways to do it. Pick one, and say what would change your mind." },
  { id: "design", name: "Design", minutes: 8, todo: "Draw the picture in order, and say each caption as you draw. Do one piece of arithmetic aloud. Use AWS names, and invite theirs." },
  { id: "operate", name: "Operate and govern", minutes: 4, todo: "How it is released, watched, and rolled back. Risks by DRIFTS. The gates before go-live." },
  { id: "lead", name: "Lead", minutes: 3, todo: "The team, the four M weeks, and metrics with their bodyguards. Who decides what." },
  { id: "close", name: "Close", minutes: 3, todo: "Problem, play, pilot, proof, and one ask, in two minutes. Then ask the panel a question." },
];

export const CURVES = [
  "The bank says the latency budget is 20 ms, not 50.",
  "Legal says this data can't leave the country.",
  "Your strongest principal disagrees with your design, in front of everyone.",
  "The sponsor wants it in half the time.",
  "A panelist says: we tried this two years ago, and it failed.",
  "The labels turn out to arrive three months late.",
  "Your budget is cut by a third.",
  "Another unit announces a similar product.",
  "The model works, but the business unit isn't using it.",
  "A regulator asks how one specific customer was scored last March.",
  "Two of the people you planned to staff on this resign.",
  "One panelist hasn't spoken yet. Bring them in.",
  "A panelist says: that is not how it works here.",
  "The data owner refuses access to the table you need.",
];

export const RUBRIC = [
  { id: "frame", name: "Framed before solving", what: "You played the prompt back, asked questions that changed the design, and stated your assumptions." },
  { id: "options", name: "Options and a recommendation", what: "Two or three real choices, one clear pick, and what would change it." },
  { id: "design", name: "A design you can defend", what: "A picture in a sensible order, with a number worked aloud and the trade-offs named." },
  { id: "govern", name: "Risk and governance", what: "Release steps, monitoring, residency, and gates. Not added at the end as an afterthought." },
  { id: "lead", name: "Led like the boss", what: "Team, phases, and decisions. You invited challenge, and you took the curveballs calmly." },
  { id: "close", name: "Closed on time", what: "A two-minute close with one ask, inside 25 minutes." },
];

// Prompts you have not seen worked. After the run, check yourself against the pointers.
export const UNSEEN = [
  {
    id: "declines",
    title: "Fewer false declines",
    prompt: "A large online merchant says too many of its good customers are declined at checkout. It wants fewer false declines without more fraud. The issuers make the decisions, not us. How do you approach it?",
    pointers: [
      "You asked who declines and why: the issuer's rules, the issuer's model, or a low score from the network.",
      "You sized it by value: sales lost to false declines against fraud prevented.",
      "You offered options, such as richer signals from the merchant, a better-calibrated score, or a step-up in place of a decline.",
      "You proposed a test with a few issuers, in shadow first, with a bodyguard metric on fraud.",
      "You named who has to agree: the merchant, the acquirer, and the issuers.",
    ],
  },
  {
    id: "monitoring",
    title: "One way to watch every model",
    prompt: "We have about twenty models in production, and each team monitors in its own way. Last quarter, one model degraded for six weeks before anyone noticed. Design how we monitor and retrain models across the team.",
    pointers: [
      "You started from the incident: what would have caught it in a day.",
      "You set a minimum standard for every model: input drift, score distribution, outcome metrics when labels arrive, and an owner on call.",
      "You drew one shared service, with scores and features logged in one place, and alarms that route to a person.",
      "You tiered the models, so that the critical ones get tighter thresholds and a faster response.",
      "You set retraining triggers: a schedule, plus drift, each with an evaluation gate.",
      "You planned adoption by pull: two models first, then a rule for new models.",
    ],
  },
  {
    id: "insights",
    title: "A spending insights product for an agency",
    prompt: "A government agency wants weekly insights from our transaction data, to track consumer spending by sector and by district. Design the data product, and tell us what you would not share.",
    pointers: [
      "You asked what decision the agency makes with it, and how fresh and how fine it needs to be.",
      "You shared aggregates only, with a minimum group size, and no data about single cards or single merchants.",
      "You checked residency and the contracts with the banks whose data this is.",
      "You drew a batch pipeline: curated tables, aggregation, privacy checks, review, then publication.",
      "You dealt with bias: card spending is not all spending, so you stated the coverage and adjusted for it.",
      "You named an owner, a review step before each release, and a way to withdraw a number that is wrong.",
    ],
  },
];
