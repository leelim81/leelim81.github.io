// Case 3: an insights agent for account teams.
export default {
  id: "insights-agent",
  n: 3,
  title: "An insights agent for account teams",
  kicker: "A business unit wants an agent in three months. Ship something safe that survives real numbers.",
  minutes: 20,
  prompt:
    "One of our business units wants an AI agent for its account teams. It should answer bank customers' questions about portfolio performance and fraud trends from our data, and draft recommendations. They saw a demo from another unit and want it live in three months. How do you approach it?",
  first:
    "I'd start by asking what the simplest thing is that solves it. This is question answering over governed data, with a language interface. So the numbers come from approved queries, never from the model's memory. We start read-only, for our own people, and a person sends every answer.",
  insight: {
    title: "The line that shows you govern agents, not only build them",
    text: "I think of agents at three levels: personal, team, and enterprise. Each needs a different weight of governance. This one touches customer data and speaks for the company, so it is enterprise level. That means identity, entitlements, evals, and an audit trail from day one.",
    proof: "Make it concrete with your four checks: authenticate, authorize, assess, account.",
  },
  clarify: [
    { q: "Who uses it: our account managers, or the bank customers directly?", why: "Internal users with a person in the loop sit in a different risk tier from a customer-facing channel." },
    { q: "What questions do they ask most, and where does the true answer live today?", why: "The top twenty questions and their source tables are your first scope." },
    { q: "Does it only read, or should it also act: send emails, change settings, open tickets?", why: "Read-only first. Actions need approvals." },
    { q: "How do we make sure one customer never sees another customer's data?", why: "Entitlements belong in the data layer, not in a prompt." },
    { q: "What accuracy do they expect, and who answers for a wrong number shown to a bank?", why: "Sets the eval bar and the review step." },
    { q: "What did the other unit's demo use, and is there a company platform for models, logging, and approvals?", why: "Partner and reuse before you build. It also lowers the politics." },
    { q: "Why three months? What happens on that date?", why: "A real deadline shapes the slice. A wish does not." },
    { q: "How will we know it worked: hours saved, faster answers, more revenue from insights?", why: "Gives you the gate metric and its bodyguard." },
  ],
  assume: [
    "The users are about 300 internal account managers. Customers come later, behind a gate.",
    "Read-only. Drafts go to a person who edits and sends.",
    "Curated data marts exist, with access rules at customer level.",
    "The company has an approved way to call large language models.",
    "The deadline is real, so the first release covers the top 20 questions for one region.",
  ],
  options: [
    { name: "A. A dashboard with better search", text: "No model near the numbers. The safest choice and the least exciting. It doesn't explain a result or draft a note." },
    { name: "B. A constrained assistant", text: "The model picks from approved metrics and filters. The system runs a tested query. The model explains the result and drafts a note, and a person sends it.", pick: true },
    { name: "C. An open agent", text: "Free-form SQL across the warehouse, and actions on its own. The most impressive demo. Wrong numbers and data leaks are likely." },
  ],
  recommend: "B for the first release. Then earn more autonomy with evidence: widen the question set, then allow suggested actions, then consider the customer channel.",
  diagrams: [
    {
      intro: "Eight boxes. Draw the loop first: a person, an agent, and a model. Then the tools behind one gateway, and the data they read. Finish with what makes it safe: guardrails, identity, evals, and the person who sends the answer.",
      spec: {
        id: "insights-agent",
        title: "A constrained insights assistant, with the controls outside the model",
        layers: [
          { label: "People", nodes: ["user"] },
          { label: "Reason", nodes: ["agent"] },
          { nodes: ["gr", "llm", "gw"] },
          { label: "Tools", nodes: ["kb", "met"] },
          { label: "Governed data", nodes: ["data"] },
        ],
        nodes: {
          user: { t: "Account manager", s: "asks, edits, then sends", k: "human", at: 1 },
          agent: { t: "Agent runtime", s: "(AgentCore Runtime)", at: 1 },
          gr: { t: "Guardrails", s: "(Bedrock Guardrails)", at: 4 },
          llm: { t: "Model", s: "(Amazon Bedrock)", at: 1 },
          gw: { t: "Tool gateway", s: "(AgentCore Gateway)", at: 2 },
          kb: { t: "Knowledge search", s: "(Bedrock Knowledge Bases)", at: 2 },
          met: { t: "Metrics tool", s: "approved queries only", at: 2 },
          data: { t: "Documents and data marts", s: "(S3, Lake Formation)", k: "store", at: 3 },
        },
        edges: [
          { a: "user", b: "agent", at: 1, n: 1 },
          { a: "agent", b: "llm", at: 1, n: 2 },
          { a: "agent", b: "gw", at: 2, n: 3 },
          { a: "gw", b: "kb", at: 2 },
          { a: "gw", b: "met", at: 2, n: 4 },
          { a: "kb", b: "data", at: 3 },
          { a: "met", b: "data", at: 3, n: 5 },
          { a: "gr", b: "llm", at: 4 },
          { a: "agent", b: "user", at: 6, n: 6, dash: true },
        ],
        base: [
          { t: "Identity: company sign-on, and the user's own identity travels to the data layer, which filters rows by customer. No shared service account.", at: 3 },
          { t: "Evals and audit: a golden question set gates every release. Every prompt, tool call, and answer is logged.", at: 5 },
        ],
        steps: [
          "Start with the loop. A person asks, the agent runtime runs the session, and the agent calls a model.",
          "Give the agent tools through one gateway: a search over documents, and a metrics tool for numbers. The model chooses a metric and its filters. It does not write free SQL.",
          "Now the part that keeps customers apart. Both tools read governed data, the user's identity flows down to it, and the data layer filters the rows. Say it aloud: entitlements live in the data, not in the prompt.",
          "Add guardrails on the way in and on the way out: prompt attacks, personal data, off-topic requests, and a grounding check on the answer.",
          "Add evals and audit under everything. A golden set of questions with known answers decides whether a release ships.",
          "Close with the person. The draft goes back to the account manager, who edits and sends. That is your ladder of autonomy: the agent drafts, and a person delivers.",
        ],
      },
      notes: {
        user: "An internal account manager, signed in through the company's sign-on. They ask from a chat screen, or from a plug-in to the chat tool they already use. About 300 of them in the first release. The same person is the last check: they see the answer, the numbers, and the sources, then they edit and send. Their edits become new eval cases.",
        agent: {
          what: "Runs the agent loop for one session, isolated from every other session.",
          why: "Session isolation and managed scaling, without building a runtime.",
          alt: "Your own containers on Kubernetes, if the platform team has a standard.",
          eq: "An agent framework running on Kubernetes.",
        },
        gr: {
          what: "Filters what goes in and what comes out: prompt attacks, personal data, denied topics, and answers that are not grounded in the retrieved data.",
          why: "A control that sits outside the model, so it holds whichever model you use.",
          eq: "An input and output filter service.",
        },
        llm: { what: "The language model, called through one managed gateway.", why: "You can change the model without changing the application.", eq: "The company's model gateway, or another provider's API." },
        gw: {
          what: "The single door to every tool. A policy engine allows or denies each tool call before it runs.",
          why: "Deterministic rules outside the model. The agent cannot talk its way past them.",
          eq: "An API gateway with a policy engine in front of your tools.",
        },
        kb: { what: "Finds the right passages in product documents and playbooks.", why: "Explanations and recommendations should quote your own material.", eq: "A search index with embeddings." },
        met: {
          what: "Turns a chosen metric and its filters into a tested query, and returns numbers with their definitions.",
          why: "Numbers come from governed queries. That is what makes an answer checkable.",
          alt: "Letting the model write SQL freely. It demos well, and it fails on joins, definitions, and access rules.",
          eq: "A semantic layer or a metrics service.",
        },
        data: {
          what: "Product guides and playbooks, and curated tables of portfolio and fraud metrics for each customer.",
          why: "Row-level rules here decide what each user can see. Treat every retrieved document as data, never as instructions.",
          eq: "Your warehouse or lakehouse tables with access policies, and a document store.",
        },
      },
    },
  ],
  talk: [
    {
      h: "An agent, or something simpler",
      points: [
        "Ask first whether a dashboard or a fixed workflow would do. Add a model only where language helps: understanding the question, explaining a result, drafting a note.",
        "Start as a constrained workflow. Add autonomy when the evals show that you need it.",
      ],
    },
    {
      h: "Numbers you can defend",
      points: [
        "The model selects from approved metrics. The system runs a tested query.",
        "Every figure in an answer carries its definition and its source.",
        "When the data isn't there, the assistant says so. It does not estimate.",
      ],
    },
    {
      h: "Your four checks",
      points: [
        "Authenticate: the user signs on, and the agent has an identity of its own.",
        "Authorize: a policy decides each tool call, and the data layer filters the rows.",
        "Assess: evals before every release, and on live traffic.",
        "Account: a full trail of prompts, tool calls, and answers.",
      ],
    },
    {
      h: "Evals",
      points: [
        "Build the golden set with the business unit before you build the agent: about 150 real questions with known answers.",
        "Check numbers exactly, in code. Use a model as judge only for the writing, with a rubric, and compare it against human scores.",
        "Add red-team tests for leaks across customers, and for instructions hidden in documents.",
        "Every change to a prompt, a tool, or a model reruns the set.",
      ],
    },
    {
      h: "Working with the other unit",
      points: [
        "Don't compete with their demo. Ask to build on their platform for model access and logging.",
        "Bring what they lack: governed data tools and eval discipline.",
      ],
    },
  ],
  numbers: [
    { k: "Load", v: "about 6,000 questions a day", how: "300 account managers, 20 questions each." },
    { k: "Per second", v: "under 1", how: "6,000 over an 8-hour day is 0.2 a second, with peaks of 2 or 3. Load is not the problem here. Correctness is." },
    { k: "Tokens", v: "about 36 million a day", how: "Say 6,000 tokens a question, with retrieved context and tool results. Multiply by today's price list to budget." },
    { k: "Golden set", v: "about 150 questions", how: "The top 20 question types, with 5 to 8 variations of each." },
    { k: "Pass bar", v: "98% exact, zero leaks", how: "Numbers exact on at least 98% of the set, and no leak across customers. Propose it, then agree it with the business unit and the risk team." },
    { k: "Response time", v: "about 5 seconds", how: "A model call, one or two tool calls, and a final model call. Cache the common questions." },
  ],
  tradeoffs: [
    { call: "A constrained assistant, not an open agent.", because: "A wrong number shown to a bank costs more than a slower launch.", flip: "Evals show the constrained version can't answer what people ask." },
    { call: "Approved metrics, not free SQL.", because: "Definitions and access rules stay under control.", flip: "A sandboxed analyst mode for internal exploration, never for answers sent to customers." },
    { call: "Internal users first.", because: "A person in the loop catches what evals miss.", flip: "Months of clean results, and a risk sign-off for the customer channel." },
    { call: "A managed runtime for the agent.", because: "Isolation, identity, and tracing come built in.", flip: "The company already has an agent platform. Then use that." },
    { call: "Build with the other unit.", because: "One platform, and no turf war.", flip: "Their stack can't meet the data rules. Then agree a boundary in the open." },
  ],
  lead: {
    team: "A pod of five: a principal who owns the evals and the agent design, two engineers, a data scientist for the metrics tool and the golden set, and a product owner from the business unit who owns the question list and signs the acceptance bar. A risk partner joins in week one.",
    phases: [
      { name: "Map", when: "Weeks 1 to 2", text: "The top 20 questions, their source tables, the golden set, the pass bar, and the access model, all agreed with the business unit." },
      { name: "Make", when: "Weeks 3 to 6", text: "A thin slice: ten metrics, one region, read-only. Evals run on every change." },
      { name: "Mirror", when: "Weeks 7 to 10", text: "A pilot with 20 account managers. They compare each draft with what they would have written, and their edits feed the golden set." },
      { name: "Measure", when: "Weeks 11 to 12", text: "The gate. If it passes, roll out to the region. If it fails, you know which metric or which question type failed." },
    ],
    metrics: [
      "Value: minutes saved per customer question, and questions answered the same day.",
      "Bodyguards: numeric accuracy on the golden set, and the share of drafts sent without a corrected figure.",
      "Technical: response time, cost per answer, and tool errors.",
      "Adoption: account managers active each week, and questions the assistant declined.",
    ],
    risks: [
      { l: "D", name: "Drift and staleness", text: "Metric definitions and documents change. Give each one an owner, and rerun the evals on a schedule." },
      { l: "R", name: "Regulation and privacy", text: "Customer data, and the bank customers' own duties for third-party AI. Keep data in region, and keep the evidence." },
      { l: "I", name: "Integration is slow", text: "Access to the data marts and to sign-on. Named owners and dates in week one." },
      { l: "F", name: "Frontline resistance", text: "Account managers fear being replaced or blamed. Position it as a draft that they own." },
      { l: "T", name: "Trust", text: "One wrong number, and people stop using it. Show sources, and say \"I don't have that\" when the data is missing." },
      { l: "S", name: "Scale and cost", text: "Token spend grows quietly. Cache, route simple questions to a small model, and set a budget per answer." },
    ],
    gates: [
      "The golden set passes the agreed bar.",
      "Red-team tests show no leak across customers.",
      "The risk tier and the human review step are signed off.",
      "Prompts, tools, and model versions are under change control.",
    ],
  },
  pushbacks: [
    { q: "The other unit's demo already works. Why does yours need three months?", a: "Their demo proves that people want this, which helps us. A demo answers the questions it was shown. Production has to keep customers' data apart, get the numbers right every time, and leave a trail. I'd ask to build on their work, and I'd put a thin slice in front of real users in six weeks, not twelve." },
    { q: "Why not let bank customers use it directly? That's where the value is.", a: "I agree that is where it ends up. I'd earn it in steps: drafts for our people first, then suggested answers that they approve, then a customer channel for a narrow set of questions. Each step needs clean eval results and a risk sign-off. A wrong number that we send is fixable. A wrong number the system sends on its own is a different conversation with the bank." },
    { q: "Models make things up. How do you stop that?", a: "By not asking the model for facts. Numbers come from tested queries and arrive with their definitions. The model explains and drafts. A grounding check compares the answer with the retrieved data, and when the data is missing, the assistant says so." },
    { q: "We have our own model gateway. Does your design still hold?", a: "Yes, and we'd use yours. I drew a model behind a gateway, not a product. What I need from any gateway is the same: a choice of models, private networking, logging, and filters on input and output. Which of those does yours cover today?" },
    { q: "Using a model to judge a model is circular.", a: "For numbers I don't use a judge at all. Code checks them exactly. A model judges only the writing, against a rubric, and I'd calibrate it on a sample that people have scored. If the judge and the people disagree too often, I fix the rubric before I trust the judge." },
    { q: "What if a document contains hidden instructions?", a: "Everything the agent retrieves is treated as data. It can't change which tools the agent may call, because a policy outside the model decides that. I'd add injection cases to the red-team set. And in this release the agent has no tool that sends anything outside the company." },
    { q: "Three months is fixed. What do you cut?", a: "Scope, not safety. One region, the top 20 questions, read-only, and internal users. I'd keep the evals, the access rules, and the audit trail, because those let us widen it afterwards without starting again." },
  ],
  summary:
    "The business unit wants an agent that answers bank customers' questions from our data, in three months. I'd ship a constrained assistant for our own account managers first. A person asks in plain language. The agent picks from approved metrics, a tested query runs under that person's own access rights, and the model explains the result and drafts a note with its sources. The account manager edits and sends. Guardrails filter what goes in and out, a policy outside the model decides every tool call, and everything is logged. Before we build, we write a golden set of about 150 real questions with the business unit, and that set gates every release. I'd build on the other unit's platform, not compete with it. In twelve weeks: two to scope, four for a thin slice, four in a pilot with 20 users, and two for the gate. Success is time saved per question, with numeric accuracy as the bodyguard. The customer-facing channel comes later, once the evidence is clean and risk has signed off. My first ask is a product owner from the business unit who owns the question list.",
};
