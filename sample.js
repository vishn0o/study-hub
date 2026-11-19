/* Built-in sample subject — a tiny illustrative demo that exercises the app. */
const SAMPLE_SUBJECT = {
  id: 'sample-quickstart',
  name: 'Study Hub — Quick Tour',
  code: 'START 101',
  examTotal: 50,
  target: 30,
  description: 'A two-topic walkthrough of every feature: confidence rating, spaced repetition, formulas, reviews, print sheet.',
  topics: [
    {
      id: 'qt1',
      seq: 1,
      title: 'How to use Study Hub',
      marks: 10,
      marksLabel: '10',
      rank: 1,
      everyPaper: false,
      concepts: [
        'Every question shows three confidence buttons. Tap Got it / Fuzzy / Didn\'t get it.',
        'Got it schedules the next review 1 → 3 → 7 → 15 days out (SM-2).',
        'Fuzzy makes the question come back sooner; Didn\'t get it resets it to 10 minutes.',
        'The predicted score weights both marks and your confidence (Fuzzy = half marks).'
      ],
      formulas: [
        'due = now + interval \\times 1000 \\cdot 60 \\cdot 60 \\cdot 24'
      ],
      questions: [
        {
          id: 'qt1q1',
          question: 'How do you mark a question as \u201cI know this\u201d so it is scheduled for later review?',
          marks: 3,
          source: 'Quick Start Guide',
          answer: ['Tap the green \u201cGot it\u201d button inside the question.', 'The app records your rating and re-surfaces the question in 1 day.'],
          steps: ['Open any topic', 'Tap the question to expand it', 'Hit \u201cGot it\u201d'],
          code: ''
        },
        {
          id: 'qt1q2',
          question: 'What does the Fuzzy rating do to your review schedule?',
          marks: 3,
          source: 'Quick Start Guide',
          answer: ['Fuzzy schedules the question to reappear sooner than Got it.', 'It keeps the interval short and does not bump the ease factor much.'],
          steps: ['Rate Fuzzy', 'Notice the interval staying short', 'Review again after a day or two'],
          code: ''
        },
        {
          id: 'qt1q3',
          question: 'How does confidence affect the predicted score?',
          marks: 4,
          source: 'Quick Start Guide',
          answer: ['Got it counts as full marks for that question.', 'Fuzzy counts as half marks.', 'Didn\'t get it counts as zero.'],
          steps: ['Read your current predicted score', 'Rate some questions Fuzzy', 'Watch the prediction drop'],
          code: ''
        }
      ]
    },
    {
      id: 'qt2',
      seq: 2,
      title: 'Importing your own PDF',
      marks: 15,
      marksLabel: '15',
      rank: 2,
      everyPaper: false,
      concepts: [
        'Click \u201cAgent prompt\u201d in the top bar and copy the prompt.',
        'Paste your syllabus, PYQs and notes into any chat LLM (Gemini / Claude / ChatGPT).',
        'The agent returns a PDF; drop it into + Add subject → Next: upload PDF.',
        'EVERY PAPER is detected automatically from the @@EVERY flag the agent writes.'
      ],
      formulas: [],
      questions: [
        {
          id: 'qt2q1',
          question: 'What does the agent need to produce a working importable PDF?',
          marks: 5,
          source: 'Quick Start Guide',
          answer: ['An @@STUDY_TRACKER block with @@SUBJECT, @@TOPIC blocks, @@QUESTION/@@ANSWER pairs, and @@END.', 'ASCII only, one marker per line — no smart quotes, no emoji.'],
          steps: ['Paste the prompt', 'Attach the documents', 'Read the output carefully before importing'],
          code: ''
        },
        {
          id: 'qt2q2',
          question: 'How do you know if an imported topic is flagged as appearing on every paper?',
          marks: 5,
          source: 'Quick Start Guide',
          answer: ['Each topic can carry an \u201cEVERY paper\u201d badge in orange, shown next to its marks.', 'That flag comes from the agent writing @@EVERY true for the topic.'],
          steps: ['Open a topic', 'Look for the orange badge', 'Trust it as a priority signal'],
          code: ''
        }
      ]
    }
  ],
  plan: {
    blueprint: [
      ['Group', 'What to do', 'Time'],
      ['First open', 'Import the demo sample or your first PDF', '5 min'],
      ['Rating', 'Tap Got it / Fuzzy / Didn\'t get it on a few questions', '10 min'],
      ['Reviews', 'Open the Reviews page and try the queue', '5 min'],
      ['Print', 'Print the sample\u2019s revision sheet', '1 min']
    ],
    checklist: [
      'See your predicted score move as you rate questions.',
      'Notice the review queue grow as you rate things Fuzzy / Didn\u2019t get it.',
      'Print the sheet and give Study Hub to a friend.'
    ]
  },
  progress: { topics: {}, questions: {}, history: [] },
  createdAt: new Date().toISOString(),
};
