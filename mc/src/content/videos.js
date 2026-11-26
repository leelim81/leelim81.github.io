// Reference videos. Each was chosen from its title, its description, and its channel.
// The "watch for" lines are things to look for, not claims about what happens in the video.

export const VIDEO_GROUPS = [
  {
    id: "case",
    title: "Talking through a case",
    note: "The consulting style: structure first, then numbers, then a recommendation. Closest to how the first half of your session should sound.",
    items: [
      {
        id: "TFZQIZrK0YQ",
        title: "BCG Technology consulting case interview: Airline AI (w/ McKinsey and BCG consultants)",
        channel: "RocketBlocks",
        date: "18 September 2024",
        why: "The closest match to your session. The case is about scaling AI tools after the pilots, which is the kind of question a team of builders will put to its next leader.",
        watch: ["How long the candidate takes before offering a structure.", "How each clarifying question changes what comes next.", "How sizing, sequencing, and risks are linked to one recommendation."],
      },
      {
        id: "3NzF7eajxVE",
        title: "Data Science Case Interview with BCG Gamma | #WillYouHireMe S1E04EN",
        channel: "Fless",
        date: "10 September 2021",
        why: "A data science team lead runs the case. It moves from defining the problem, to choosing a solution and a success metric, to getting the client to agree, to long-term implementation.",
        watch: ["How the success metric is chosen, and who it is agreed with.", "The moment the talk moves from the model to adoption.", "What the interviewer rewards and what they push on."],
      },
      {
        id: "M0-c7rXzhwk",
        title: "BCG Case Interview Example - CookieCo",
        channel: "Management Consulted",
        date: "22 February 2024",
        why: "A case led by the candidate, with feedback. Not a technology case, so use it for the mechanics alone: pacing, signposting, and the close.",
        watch: ["The signposts: \"I'd look at three things\".", "How the candidate handles a number they don't have.", "The last 60 seconds: the recommendation, the risks, and the next step."],
      },
    ],
  },
  {
    id: "design",
    title: "Talking through a design",
    note: "The engineering style: requirements, a picture, then the deep dives. Closest to the second half, when the principals take you into the detail.",
    items: [
      {
        id: "3PRJjNaqcdY",
        title: "MLE System Design Interview: Fraud Detection",
        channel: "MeetAPro",
        date: "20 September 2025",
        why: "The same subject as Case 1: real-time fraud detection, from ingestion and feature pipelines to inference, decision logic, drift, and compliance.",
        watch: ["The order the candidate draws in.", "Where a latency figure or a volume is stated aloud.", "How drift and compliance enter the design, and how early."],
      },
      {
        id: "9U48NlbOzCU",
        title: "Full ML Design Mock by ex-Meta Staff Engineer (with feedback)",
        channel: "MLEpath",
        date: "6 December 2024",
        why: "A full mock with feedback. It moves through problem alignment, the big picture, data, modeling, and deployment, which is the arc you will follow.",
        watch: ["How much time goes on aligning on the problem before any design.", "The feedback at the end. Write down two points that apply to you.", "How the candidate recovers after a wrong turn."],
      },
      {
        id: "yz1jtze4qr8",
        title: "System Design Mock Interview: Design Yelp w/ Meta Staff Engineer",
        channel: "Hello Interview",
        date: "15 June 2025",
        why: "Not machine learning, and still useful: a clean example of narrating a whiteboard design at staff level.",
        watch: ["How requirements become boxes.", "How the candidate checks in with the interviewer before going deep.", "How trade-offs are said aloud: \"I'm choosing this, and giving up that\"."],
      },
    ],
  },
  {
    id: "aws",
    title: "One design, in one vendor's names",
    note: "A fraud design drawn with AWS products. Watch it for the order of the parts, then put each product back into a plain box.",
    items: [
      {
        id: "8k6OfLGsxZU",
        title: "AI/ML based Card Payment Fraud Detection on AWS using replicated data from mainframe",
        channel: "Amazon Web Services",
        date: "30 May 2024",
        why: "A card payment fraud design in one vendor's words, starting from data that lives on a mainframe. Useful for the order the parts connect in. As you watch, name the plain component behind each product.",
        watch: ["Which components carry the real-time path, and which carry the batch path.", "How data leaves the system of record.", "What you would draw differently for a network that scores on behalf of banks."],
      },
    ],
  },
];

export const VIDEOS = VIDEO_GROUPS.flatMap((g) => g.items);

export const HOW_TO_WATCH = [
  "Watch at normal speed for the first ten minutes. Listen for the rhythm: play back, structure, check in.",
  "Pause after each question from the interviewer. Say your own answer aloud, then press play.",
  "Write down phrases you'd like to borrow. Three good transitions are worth more than ten facts.",
  "Skip to the feedback if a video has it. That is where the interviewer says what they were scoring.",
  "Two videos watched actively beat seven watched in the background.",
];
