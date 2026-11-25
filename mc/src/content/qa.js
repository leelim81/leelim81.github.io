// Questions the panel is likely to ask outside the case, with answers built from your own record.
// Employers and clients are not named. Say the names in the room if you want to.
// Each answer runs 60 to 90 seconds when spoken.

export const QA_GROUPS = [
  {
    id: "tech",
    title: "Technical credibility",
    note: "The principals want to know if you can follow them into the detail, and if you know where your depth ends.",
    items: [
      {
        id: "prod-model",
        q: "Walk us through a model you took to production, end to end.",
        a: "At the bank, I worked in the data science team for corporate banking. The models recommended which product to offer a company next, and which sales channel to use. The data sat in more than ten legacy systems, so the first job was plumbing: we consolidated them into a data lake and built one end-to-end pipeline, with PySpark jobs for company and transaction features. Each model was backtested on history before release and tracked against real outcomes afterwards. Over five years that pipeline carried more than 50 models into production, and I moved from data scientist to senior data scientist. What I'd do differently now is treat the feature layer as a shared product from day one, because similar features get rebuilt for every model. That is why I'd care about your feature platform.",
        add: "Pick one model and add its real detail: the metric, how you validated it, and what you monitored after release.",
        more: ["#/mine/bank-pipeline", "Build the ten-minute version of this case"],
        why: "A real system, your part in it, a gate, and one thing you'd change. End on a link to their world.",
      },
      {
        id: "skew",
        q: "How do you stop a model that works offline from failing in production?",
        a: "Three causes account for most of it, so I check them in order. First, skew: the features in training are computed one way and in serving another way. The fix is one definition that serves both. Second, leakage through time: the training set saw data that would not have existed at decision time. The fix is point-in-time joins, and a backtest that walks forward. Third, the world moved: the data drifted after training. The fix is monitoring on inputs and outputs, with an alarm and an owner. Then I release in steps: shadow first, where the model scores real traffic and nobody acts on it, then a small share, with a rollback tied to an alarm. If a model fails after all that, the review asks which of the three we missed.",
        why: "Structure under pressure. They are checking that you know skew, leakage, and drift without being prompted.",
      },
      {
        id: "simple-deep",
        q: "When do you choose a simple model over a deep one, or a foundation model?",
        a: "I start with the simplest model that could meet the target, and I make the bigger model earn its place. For tabular transaction data, rules plus gradient-boosted trees are a strong baseline: fast, cheap, and they give reason codes. A sequence model or embeddings from a foundation model go in when a backtest shows lift that survives three checks. Does it fit the latency budget? Can we explain a decision to a customer or a regulator? Can this team run it at three in the morning? If the lift is real, I'd often add the embedding as a feature to the simple model first, which keeps the reason codes. I like research, and I'd fund it. I'd fund it as a time-boxed test with a gate, not as the default.",
        why: "Judgment, not fashion. One panelist will favor depth and one will favor simplicity. This answer respects both.",
      },
      {
        id: "genai-evals",
        q: "How do you evaluate a generative AI system before it goes live?",
        a: "I write the evaluation before the system. With the business owner, we build a golden set: real questions with known answers. Anything that can be checked exactly is checked in code, such as a number, a date, or a citation. For the quality of the writing, I use a model as judge with a rubric I write myself, and I calibrate it against human scores on a sample. If the judge and the people disagree, I fix the rubric first. Then come the adversarial cases: prompt injection, leaks between users, and requests that are out of scope. Every change to a prompt, a tool, or a model reruns the set, and a release needs a pass and a sign-off from the users who tested it. That discipline is why my team was the first AI team in my firm's regional network to go through internal audit, and we passed.",
        why: "A method with a gate, and proof that it held up under audit.",
      },
    ],
  },
  {
    id: "lead",
    title: "Leading this team",
    note: "The managers want to know what working for you is like. The principals want to know if you will respect their depth.",
    items: [
      {
        id: "deeper",
        q: "Some of us are deeper technically than you. How do you lead that?",
        a: "I'd expect you to be, and I'd want it that way. My job is different from yours. I set the direction and the bar, I win the work and the headcount, and I clear what blocks you. On design, I ask for a short written proposal with options, I read it properly, and I ask the questions a customer or a regulator would ask. Where you know more, your recommendation stands unless I can name a reason. When two of you disagree, I decide, and I say why. I stay close enough to be useful: I read design documents, I review how we evaluate, and I build small things to understand a new technique before I ask anyone to bet on it. At my current firm I hired every one of my 15 people, and I hired for strengths I don't have. That is the point of hiring.",
        why: "Security without ego. Never claim to out-engineer the principals.",
      },
      {
        id: "two-sites",
        q: "How do you run one team across Singapore and India?",
        a: "As one team with one bar. Three habits make that real. First, ownership: the India team owns whole components and leads at least one build, with its own contact with the business. It doesn't receive the leftover tickets. Second, decisions in writing: a short design note and a decision log, so nobody misses a decision made in a corridor here. Third, time: meetings sit in the hours we share, and the awkward slots rotate. I'd visit early, and I'd ask the people there what they want to own before I assign anything. I'd watch two numbers: how often a build is led from India, and how long people there wait for an answer from here.",
        why: "Fairness, and a concrete mechanism. Remote panelists listen closely to this one.",
      },
      {
        id: "grow",
        q: "How do you grow people?",
        a: "By giving them ownership a little before they feel ready, with a safety net. On my current team, a small group of one to four people owns a client project end to end, so ownership is real and visible. Every week we hold a one-hour session where anyone shares something new, and once a year each person teaches a topic to the whole team. That builds depth, and it shows me who is ready for more. I have three managers reporting to me, and with managers I spend the time on judgment: scope, priorities, and when to say no. With senior engineers, growth looks different. It means bigger technical bets, time for research with a gate, and credit in public. I'd ask each of you what you want to be known for in two years, and plan the work toward that.",
        add: "Add one person you grew, without naming them: where they started and what they own now.",
        why: "Specific habits you already run, and a different answer for managers and for principals.",
      },
      {
        id: "failure",
        q: "Tell us about something that went wrong.",
        a: "When I started the AI unit, we said yes too often. We built prototypes fast, and many of them stayed prototypes. Each one worked in a demo and then stalled, for the usual reasons: nobody on the business side owned it, the data wasn't ready, or there was no route into production. Looking back, I separate two things. A project that is stopped is a decision, and that is healthy. A project that is stuck has no sponsor who intends to fund it and no date for a decision, and that was a failure of governance on my part. So I changed the front door: an intake that scores value and risk, a plan for adoption before we build, readiness gates, and sign-off by the users who test. Over three years we built about 100 prototypes and shipped 30 into real use. The lesson I carry is that a stuck project costs more than the hours spent on it, because it uses up trust.",
        add: "Name one project that stalled, in a sentence, so the story is concrete.",
        why: "A real mistake, owned in the first person, with a mechanism that fixed it. No blame on others.",
      },
    ],
  },
  {
    id: "gaps",
    title: "The gaps they will test",
    note: "Name each gap before they do. Say what transfers, then say how you'd close the rest.",
    items: [
      {
        id: "payments",
        q: "You haven't worked in payments. Why would this work?",
        a: "You're right, and I won't pretend otherwise. Here is what transfers. I spent five years in a bank on company and transaction data. One of the things I helped build was a graph of money flows between companies, used to monitor risk and to group similar companies. So transactions, risk signals, and the pace of a regulated business are familiar. What I don't have is your depth on authorization flows, network rules, and how issuers use a score. I'd close that in two ways. I'd learn from the people in this room in my first month, and I've started on the basics so that I can ask better questions. I'd also rather hear \"that's not how it works here\" early, and I'd ask you to say it.",
        why: "Honesty first, then a real bridge from your own record. Invite correction.",
      },
      {
        id: "scale",
        q: "Our volumes are far beyond anything you've handled.",
        a: "Yes. The largest volume I've worked with is about 100 million a year. Yours is more than a thousand times that, and I won't claim experience I don't have. What I bring is the set of questions that decide a design at any size. What is the budget in milliseconds, and who spends it? Where is the skew in the data? What happens when a dependency is slow? What does it cost per thousand calls? This team has people who have run this scale for years. My job isn't to tune the Spark job. My job is to make sure the right person is doing it, that the trade-offs are stated plainly, and that we're building the right thing. Where I'm wrong on scale, I'd want to be corrected in the design review, not in production.",
        why: "No bluffing. A clear split between your job and theirs.",
      },
      {
        id: "consulting",
        q: "You come from a professional services firm. This is a product engineering team.",
        a: "The firm is professional services, but the unit I run is a build team. We don't write slide decks about AI. We ship software: more than 30 systems are live inside the firm, and they return about SGD 6 million a year in recurring value. We run them, we fix them, and we were audited on how we build them. For clients, we send small teams that build end to end. For one large fund client, that cut the time to prepare its financial statements by 40%. Before that I spent five years in a bank's data science team, and earlier I was a software engineer and the technology lead of a startup. So I've spent a large part of my 20 years building. What professional services added is something this team needs too: I can sit with a business unit and turn a vague wish into a scoped build.",
        why: "Reframe with facts, and keep the two results separate: internal value, and the client result.",
      },
      {
        id: "hands-on",
        q: "How hands-on are you? Do you still code?",
        a: "Hands-on enough to judge, and not on the critical path. I review designs and how we evaluate, I write the evaluation rubrics myself, and I build small prototypes when a new technique appears, so that I understand it before a team commits to it. I hold a current architect certification from one of the large model providers, because I wanted to earn it myself. I don't own production tickets, and I shouldn't: a leader who sits on the delivery path becomes the bottleneck. For this team, I'd expect to read far more of your code and designs than I write, and to get into the detail when a decision is expensive or hard to reverse.",
        why: "A straight answer. No claim to code daily, and a reason why that is right for the role.",
      },
    ],
  },
  {
    id: "direction",
    title: "Direction and fit",
    note: "They are asking what changes on the day you arrive, and what does not.",
    items: [
      {
        id: "ninety",
        q: "What would your first 90 days look like?",
        a: "The first 30 days are for listening. I'd spend an hour with each of you, meet the sponsors in the business units, and read the list of live models and the incident history. I'd change nothing. By day 60, I'd write down what I heard and play it back to you: what works, what hurts, and what the business thinks of us. With the leads, I'd agree how requests come in and how we rank them. By day 90, we'd have a ranked portfolio that the sponsors have seen, and one visible result that the team chose, not me. Throughout, I'd keep what works. This team has shipped real models at a scale I haven't, and I'd be careful not to break that while I learn it.",
        why: "Humility with a plan. No promises of change before listening.",
      },
      {
        id: "win-work",
        q: "This team has to win its work from the business units, and other units claim generative AI. How do you position us?",
        a: "I wouldn't fight over who owns generative AI. I'd make this the team that takes any AI, classic or generative, safely into production on governed data. Other units can show a demo. Few can keep customers' data apart, pass a model risk review, and run a system for years. That is the offer. In practice: one front door with a one-page intake, two lighthouse projects with sponsors who will speak for us, and reference patterns and office hours for teams we can't staff. I'd partner with the unit that leads on generative AI: their platform for model access, our data tools and evaluation discipline. I've done this inside my current firm, where my team wins its client work alongside partners who have their own priorities.",
        why: "A position that avoids a turf war, backed by having done internal selling before.",
      },
      {
        id: "why-role",
        q: "Why this role, and why now?",
        a: "Three reasons. First, the data. I've spent my career getting models into production, and payments data is some of the richest and most demanding there is: huge volume, real-time decisions, and real consequences when a model is wrong. Second, the team. I built my current unit from nothing to more than 30 live systems. I've learned what that takes, and I'd like to apply it with people who have depth I can learn from. Third, the moment. Classic machine learning and agents are meeting, in fraud, in scams, and in payments made by software. A team that knows both sides will matter a great deal. I'm not looking to manage from a distance. I want to be in the room where the hard trade-offs are made.",
        why: "Motivation that is about the work and the team. Keep it short and specific.",
      },
      {
        id: "research",
        q: "How do you protect research when delivery pressure is high?",
        a: "By giving it a budget and a gate, so it doesn't depend on spare time. I'd set aside a small, fixed share of the team: for example, two people for six weeks on a question that matters in two years. Each spike has a written question, a date, and a decision at the end: adopt, extend, or stop. Stopping is a fine result if we write down what we learned. I'd link research to delivery, so that a spike on a new embedding is tested on a model we already run. I'd also keep the habits that cost little: a weekly hour where anyone shares, a reading group, and work with a local university, which I've done on several projects at my current firm. What I wouldn't do is let research become a place to hide from shipping.",
        why: "A leader who funds curiosity with discipline. Your future manager values research, so show you would protect it.",
      },
    ],
  },
];

export const QA = QA_GROUPS.flatMap((g) => g.items.map((x) => ({ ...x, group: g.title })));
