// Recall cards. Short prompts for the things that slip under pressure: your own frameworks, the figures,
// and the vocabulary. An answer that is a list shows as a list.

export const TOPICS = [
  { id: "frame", name: "Your frameworks", note: "The scaffolding for the two hours. You wrote these. Keep them word for word." },
  { id: "pay", name: "Payments", note: "Enough to follow the panel and not be corrected on the basics." },
  { id: "model", name: "Models at scale", note: "The ideas the principals will expect you to hold without notes." },
  { id: "spark", name: "Spark", note: "The team builds with PySpark. Know the words and the defaults." },
  { id: "parts", name: "Components", note: "A plain name for each box, the job it does, and one example to offer." },
  { id: "rules", name: "Rules and residency", note: "Name the rule, then say what it changes in the design." },
  { id: "you", name: "Your numbers", note: "Your own record. These must come out the same way every time." },
];

const c = (topic, id, q, a, note) => ({ id: `${topic}-${id}`, topic, q, a, note });

export const CARDS = [
  // ---- your frameworks ----
  c("frame", "scoped", "SCOPED: what does each letter stand for?", ["Set the contract.", "Clarify, with DEPLOY.", "Organize the problem.", "Present options.", "Execute the pilot.", "Drive expansion, and close."]),
  c("frame", "deploy", "DEPLOY: the six areas to clarify.", ["Demand: who wants it, and why now.", "Experience: who uses the output, and where.", "Plumbing: data, systems, and latency.", "Limits: regulation, residency, budget, and deadline.", "Outcomes: the metric and its baseline.", "Yield to humans: where a person decides."]),
  c("frame", "slice", "SLICE: how you shape a pilot.", ["Slice by intent.", "Ladder of autonomy: shadow, assisted, autonomous.", "Instant human fallback.", "Contain the blast radius.", "Evals before the agent."]),
  c("frame", "fourm", "The four M weeks.", "Map, Make, Mirror, Measure.", "Map the work and the data. Make a thin slice. Mirror it beside the current way, in shadow. Measure against the gate."),
  c("frame", "bodyguards", "Metrics with bodyguards: the four kinds.", ["Value: the number the business cares about.", "Quality: the bodyguards, which must not get worse.", "Technical: latency, cost, and errors.", "Adoption: who uses it, and how often."]),
  c("frame", "drifts", "DRIFTS: the six risks.", ["Drift and staleness.", "Regulation and privacy.", "Integration is slow.", "Frontline resistance.", "Trust.", "Scale and latency."]),
  c("frame", "fourp", "Four P's and an Ask: your close.", "Problem, Play, Pilot, Proof, and one Ask.", "Two minutes. End on the ask, then stop talking."),
  c("frame", "weigh", "WEIGH: how you rank requests.", ["Which number moves.", "Effort and elapsed time.", "Interdependencies.", "Guardrails and risk.", "Horizon."]),
  c("frame", "foura", "The four A's for agents.", "Authenticate, Authorize, Assess, Account.", "Who is it, what may it do, how do we test it, and what trail does it leave."),
  c("frame", "levels", "Your three levels of enterprise agents.", "Personal, team, and enterprise.", "Each level needs a heavier weight of governance. Anything that touches customer data or speaks for the company is enterprise level."),
  c("frame", "pushback", "Your pattern for a pushback.", ["Take the point.", "Test it with a question or a number.", "Land a decision."]),
  c("frame", "arc", "The 120 minutes, in six blocks.", ["Set the contract: 0 to 5.", "Clarify: 5 to 20.", "Organize: 20 to 35.", "Present options: 35 to 55.", "Execute: 55 to 100.", "Drive and close: 100 to 120."]),
  c("frame", "answers", "The three answers to any request for your team.", ["Fund it.", "Not now, with a date and a trigger.", "Not ours, with something useful to take away."], "Never silence."),
  c("frame", "intake", "What a build needs before it starts.", ["A named owner in the business.", "A number it should move.", "Data you can use.", "A path to production."]),

  // ---- payments ----
  c("pay", "decides", "Who approves or declines a card payment?", "The issuer, which is the cardholder's bank.", "The network routes the request and can supply a risk score. Say \"we supply the score, and the bank keeps the decision\"."),
  c("pay", "parties", "The four parties in a card payment.", ["Cardholder.", "Merchant.", "Acquirer: the merchant's bank.", "Issuer: the cardholder's bank."], "The network sits in the middle and connects acquirers to issuers."),
  c("pay", "steps", "Authorization, clearing, and settlement: what is each?", ["Authorization: approve or decline, in real time.", "Clearing: the banks exchange the final records.", "Settlement: the money moves between the banks."]),
  c("pay", "scam", "Fraud and a scam: what is the difference?", "In fraud, the customer did not make the payment. In a scam, the customer made it, because someone deceived them.", "A scam passes the device and identity checks. Look at the payee, the amount, and the behavior."),
  c("pay", "dispute", "How long does a cardholder generally have to dispute a payment?", "Generally 120 days.", "So labels arrive months late."),
  c("pay", "labels", "Three reasons fraud labels are hard.", ["They arrive late.", "Declined payments never get one.", "Scams are under-reported."]),
  c("pay", "ms", "How long does a payment authorization typically take, end to end?", "Typically under 300 ms.", "Your part of that is tens of milliseconds. Give every hop a budget."),
  c("pay", "scale", "The whole-network scale to quote.", "More than 159 billion transactions in 2024. That is about 5,000 a second on average, with published peaks near 70,000 a second."),
  c("pay", "decline", "What is a false decline, and why does it matter?", "A good payment that is refused.", "It costs the sale and the customer's trust. Measure it by value, next to the fraud you stop."),
  c("pay", "stepup", "What is a step-up?", "An extra check in place of a decline: a passcode, a confirmation in the app, or a delay.", "For scams, a pause and a clear warning often work better than a decline."),
  c("pay", "mule", "What is a mule account?", "An account that receives stolen money and moves it on.", "Mule networks show up as patterns in a graph: many new senders, and quick onward transfers."),
  c("pay", "token", "What is tokenization?", "The card number is replaced by a token that only works in one context, such as one device or one merchant.", "Stolen tokens are worth much less than stolen card numbers."),
  c("pay", "sg-scams", "Singapore scam figures for 2025.", "37,308 cases and about SGD 913 million lost.", "Down from 51,501 cases and about SGD 1.1 billion in 2024."),
  c("pay", "self", "What share of Singapore scams involve a transfer the victim made?", "78.8% in the first half of 2025.", "That is why device and identity checks miss them."),

  // ---- models at scale ----
  c("model", "skew", "What is training-serving skew, and the fix?", "A feature is computed one way in training and another way in serving. The fix is one definition that serves both."),
  c("model", "pit", "What is point-in-time correctness?", "Each training row uses only the feature values that were known at that moment.", "It stops a model from seeing the future."),
  c("model", "accuracy", "Why is accuracy useless for fraud, and what do you use?", "Almost every payment is good, so a model that flags nothing is nearly 100% accurate. Use precision and recall at a fixed alert rate, weighted by value."),
  c("model", "calibration", "What does a calibrated score give a bank?", "A score of 0.8 means that about 80% of such payments are bad.", "Thresholds keep their meaning after a retrain."),
  c("model", "shadow", "Shadow and canary: what is each?", ["Shadow: the model scores real traffic, and nobody acts on it.", "Canary: a small share of traffic acts on it, with a rollback tied to an alarm."]),
  c("model", "drift", "Three things that can drift.", ["The inputs.", "The relationship between inputs and outcome, because fraudsters adapt.", "The base rate."]),
  c("model", "champion", "What is champion and challenger?", "The live model and a candidate run on the same traffic. The candidate is promoted on evidence."),
  c("model", "bias", "What is the selection bias in fraud labels?", "You only see outcomes for payments that were approved. The payments your system declined have no label.", "The label you train on is shaped by the system you are replacing."),
  c("model", "baseline", "Your baseline for tabular transaction data.", "Rules plus gradient-boosted trees.", "Fast, strong on this kind of data, and they give reason codes."),
  c("model", "embed", "Where do foundation-model embeddings go first?", "Into the simple model as extra features, computed ahead of time in batch.", "You keep the latency and the reason codes."),
  c("model", "reasons", "What are reason codes?", "The top factors behind a score, in words an analyst can read.", "Banks need them to act, and regulators need them to check."),
  c("model", "three", "A model is good offline and bad in production. Three causes to check, in order.", ["Skew between training and serving.", "Leakage through time.", "Drift after training."]),
  c("model", "registry", "What does a model registry record?", ["The version and its metrics.", "The data and feature versions it was trained on.", "Who approved it, and its status."]),
  c("model", "fresh", "How fresh does a feature need to be?", "Decide for each feature. Most can be a day old. A few, such as counts in the last hour, need seconds.", "Streaming costs more to run, so keep that list short."),

  // ---- Spark ----
  c("spark", "shuffle", "What is a shuffle, and why does it hurt?", "Rows with the same key are moved between machines so they can meet, for a join or a group by.", "It uses the network and the disk. It is the main cost of a big job."),
  c("spark", "skew", "What is data skew, and how does it show?", "A few keys hold most of the rows. Most tasks finish in seconds, and a few run for an hour.", "Fixes: the skew join in adaptive execution, salting the key, or handling the giant keys apart."),
  c("spark", "aqe", "What is Adaptive Query Execution?", "Spark changes the plan while the job runs, using real statistics. It is on by default since Spark 3.2.0.", "Three features: it merges small shuffle partitions, switches a sort-merge join to a broadcast join, and splits skewed partitions."),
  c("spark", "parts", "The default for spark.sql.shuffle.partitions.", "200.", "Far too few for a very large shuffle, and too many for a small one. Adaptive execution helps."),
  c("spark", "bcast", "The default broadcast join threshold.", "10 MB.", "A table under that size is sent whole to every executor, so the big table is not shuffled."),
  c("spark", "udf", "Why are plain Python functions slow in Spark?", "Every row is passed between the Java engine and Python.", "Use built-in functions first. Then pandas functions, which work on batches."),
  c("spark", "prune", "What is partition pruning?", "Spark reads only the folders that the filter needs, such as one date.", "Partition tables by what you filter on."),
  c("spark", "small", "What is the small files problem?", "Thousands of tiny files slow down planning and reading.", "Compact them on a schedule."),
  c("spark", "three", "Three questions for any slow Spark job.", ["How much does it read, against how much it needs?", "Where does it shuffle?", "Where is the skew?"]),
  c("spark", "advisory", "The target partition size after adaptive execution merges partitions.", "64 MB, by default."),
  c("spark", "joins", "Broadcast join and sort-merge join: when is each used?", "Broadcast when one side is small. Sort-merge when both sides are large, which needs a shuffle of both."),

  // ---- components ----
  c("parts", "name", "How do you label a box on the whiteboard?", "With the component: the job the box does. A product name goes in brackets, as an example.", "Say: tell me what you run for each box, and I'll write your names in."),
  c("parts", "nine", "How many boxes should a whiteboard diagram have?", "Nine or fewer.", "What does not change the answer goes into a bar underneath: security, monitoring, and the fallback."),
  c("parts", "stream", "What is an event stream, and how do you size one?", "An ordered log of events that many consumers can read and replay. Size it by events a second, times the size of one event.", "Examples: Kafka, or Kinesis on AWS, where one shard takes 1 MB or 1,000 records a second in."),
  c("parts", "fs", "The two faces of a feature store.", ["Online: the latest value for each key, read in milliseconds.", "Offline: the full history, for training and backtests."], "One definition feeds both, which removes the skew between training and serving. Examples: Feast, or SageMaker Feature Store."),
  c("parts", "modes", "Four ways to serve a model, and when.", ["Real-time endpoint: milliseconds, always on.", "Queued inference: large or slow requests, where minutes are fine.", "On-demand endpoint: bursts, with a cold start.", "Batch scoring: a whole dataset, offline."], "Most models should be batch. Real time has to earn its cost."),
  c("parts", "lake", "The four parts of a lake.", ["Object storage.", "A table format, for time travel.", "A catalog, so every engine agrees on what a table is.", "Access control, down to rows and columns."], "AWS examples: S3, Iceberg tables, Glue Data Catalog, and Lake Formation. Others: HDFS, Delta or Hive tables, Hive Metastore, and Ranger."),
  c("parts", "orch", "What does a workflow orchestrator add to a pipeline?", "It runs the steps in order, with retries, branches, and waits, and it shows where a run failed.", "Examples: Airflow, or Step Functions on AWS."),
  c("parts", "kv", "When do you pick a key-value store?", "You look things up by key, at high volume, and need it to stay fast.", "Examples: Cassandra, Aerospike, or Redis. On AWS: DynamoDB."),
  c("parts", "guard", "What do guardrails filter, and where do they sit?", ["Prompt attacks.", "Personal and sensitive data.", "Denied topics and words.", "Answers that are not grounded in what was retrieved."], "They sit outside the model, on the way in and on the way out, so they hold whichever model you use. AWS example: Bedrock Guardrails."),
  c("parts", "agent", "What does an agent need in production, beyond a model?", ["An isolated runtime for each session.", "One gateway to every tool.", "An identity of its own.", "Evaluations.", "A log of every prompt and tool call."], "AWS example: Bedrock AgentCore, which also has memory and a policy engine."),
  c("parts", "policy", "What does a policy check at the tool gateway do?", "It allows or denies each tool call, with written rules, before the call runs.", "The control sits outside the model, so the agent can't talk its way past it."),
  c("parts", "access", "Where do entitlements live?", "In the data layer. A user's identity decides which rows, columns, and cells come back.", "Not in a prompt. Examples: Apache Ranger, or Unity Catalog. On AWS: Lake Formation."),
  c("parts", "map", "Give one AWS example and one other example for each: event stream, batch compute, workflow orchestration, feature store, model registry.", ["Kinesis Data Streams, or Kafka.", "EMR, or Spark on Hadoop or Databricks.", "Step Functions, or Airflow.", "SageMaker Feature Store, or Feast.", "SageMaker Model Registry, or MLflow."]),
  c("parts", "residency", "A market says its data must stay in country. What do you draw?", ["One full stack inside that market.", "Raw data, features, and scoring stay.", "Only approved aggregates and model artifacts move."], "On AWS, that is one Region for each market. Singapore, Mumbai, and Jakarta each have one."),
  c("parts", "bar", "The security bar you draw under every diagram.", ["Roles with least privilege.", "Keys you control.", "An audit log.", "A private network.", "Where the data lives."], "AWS examples: IAM, KMS, CloudTrail, VPC with PrivateLink, and one Region for each market."),
  c("parts", "plink", "How does a bank reach your scoring service?", "Over a private connection, with no route over the public internet.", "Examples: private circuits, a VPN, or AWS PrivateLink."),
  c("parts", "afd", "Which managed service should you not design on, and why?", "Amazon Fraud Detector. It closed to new customers on 7 November 2025.", "Say it only if a managed fraud service comes up."),

  // ---- rules and residency ----
  c("rules", "rbi", "India's rule on payment data.", "A central bank circular of 6 April 2018 requires payment system data to be stored only in India."),
  c("rules", "ban", "What happened to card networks in India in 2021?", "The regulator barred three card networks from taking on new domestic customers, over data storage. The bars were lifted between November 2021 and August 2022.", "Residency can stop a business. Treat it as a design input."),
  c("rules", "mas", "Singapore's guidelines on AI risk for financial institutions.", "The Monetary Authority of Singapore issued its Guidelines on AI Risk Management on 7 October 2026.", "They cover all financial institutions and all AI, including generative AI and agents."),
  c("rules", "material", "The three factors that decide how material an AI use is, in those guidelines.", "Impact, complexity, and reliance."),
  c("rules", "third", "A bank uses a vendor's AI. Who stays accountable?", "The bank. Using third-party AI does not transfer accountability.", "So banks will ask a supplier for evidence: purpose, data, testing, monitoring, and change control."),
  c("rules", "feat", "FEAT: the four principles.", "Fairness, Ethics, Accountability, and Transparency."),
  c("rules", "srf", "Singapore's Shared Responsibility Framework.", "In force from 16 December 2024. It sets duties on financial institutions and telcos for phishing scams.", "It does not cover payments that the customer authorized. Bank duties include a 12-hour cooling period and fraud surveillance."),
  c("rules", "moves", "Under residency rules, what stays and what moves?", "Raw data, features, and scoring stay in the market. Approved aggregates and model artifacts move."),

  // ---- your numbers ----
  c("you", "team", "The team you built.", "15 people, all hired by you, with three managers reporting to you. You founded the unit in November 2023."),
  c("you", "ship", "Prototypes built, and shipped.", "About 100 prototypes, and 30 shipped into real use, in three years."),
  c("you", "value", "The internal result.", "More than 30 live systems, returning about SGD 6 million a year in recurring value.", "Internal only. Keep it apart from the client result."),
  c("you", "client", "The flagship client result.", "A 40% cut in the time to prepare financial statements, for a large fund client.", "Keep it apart from the internal number."),
  c("you", "audit", "Your audit line.", "The first AI team in the firm's regional network to go through internal audit, and it passed.", "It covered stage gates, intake, evals, the golden test set, user sign-off, and least-privilege access."),
  c("you", "bank", "Your record at the bank.", "Five years. More than 50 models in production. More than 10 legacy systems consolidated into a data lake. Promoted to senior data scientist."),
  c("you", "scale", "Your largest volume, said honestly.", "About 100 million a year. The panel's network is more than a thousand times larger.", "Say it before they do."),
  c("you", "years", "Your years of experience.", "20."),
  c("you", "mandates", "The two mandates of your unit.", ["AI transformation inside the firm.", "Impact in the industry: pre-sales, scoping, and small teams of one to four who build end to end."]),
  c("you", "habits", "Two habits that grow your team.", ["A weekly one-hour session where anyone shares something new.", "Each person teaches a topic to the team once a year."]),
];

export const cardById = (id) => CARDS.find((x) => x.id === id) || null;
