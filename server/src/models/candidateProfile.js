const mongoose = require('mongoose');

// The "truth store" — sole source of facts the Answer Agent is allowed to draw
// from. Every claim gets a stable, referenceable id (facts[].id) so generated
// answers can cite exactly which fact backs them (answers[].factIds on
// Application), and audits can trace a submitted claim back to its origin.
// Never populated by inference — user-entered/approved only.
const factSchema = new mongoose.Schema(
  {
    id:        { type: String, required: true }, // e.g. "employment.initializ.startDate"
    label:     { type: String, required: true },
    value:     { type: String, required: true },
    evidence:  String, // free-text pointer, e.g. "Offer letter", "Production logs"
    approved:  { type: Boolean, default: true },
  },
  { timestamps: true, _id: false }
);

const skillSchema = new mongoose.Schema(
  {
    name:        { type: String, required: true },
    yearsExp:    { type: Number, required: true },
    evidenceIds: [String], // references into facts[].id or projects[]
  },
  { _id: false }
);

const projectSchema = new mongoose.Schema(
  {
    title:       { type: String, required: true },
    description: String,
    techStack:   [String],
  },
  { _id: false }
);

const educationSchema = new mongoose.Schema(
  {
    degree:      String,
    institution: String,
    year:        Number,
  },
  { _id: false }
);

const candidateProfileSchema = new mongoose.Schema(
  {
    userId:           { type: mongoose.Schema.Types.ObjectId, ref: 'User', unique: true, required: true },
    fullName:         String,
    preferredName:    String, // e.g. "Utkarsh" when fullName is "Utkarsh Katiyar" — falls back to fullName's first token if unset (see llm/sanitize.js)
    phone:            String,
    country:          String, // country of residence — "Country" is a near-universal field on Greenhouse/Lever/Ashby forms, previously had no source at all
    currentCTC:       Number,
    expectedCTC:      Number,
    noticePeriodDays: Number,
    totalExpYears:    Number,
    skills:           [skillSchema],
    projects:         [projectSchema],
    education:        [educationSchema],
    links: {
      github:    String,
      linkedin:  String,
      portfolio: String,
    },
    workAuthorization: String,
    // Explicit, user-stated answer to "do you require visa sponsorship" —
    // deliberately NOT a policy default/auto-answer. This is the candidate's
    // own real fact, same trust model as workAuthorization; a wrong answer
    // here is a real legal/practical problem if the user's actual situation
    // changes and this goes stale, so it's never assumed or defaulted to a
    // fixed value. Still forces MANUAL confidenceTier regardless (see
    // agents/computeTier.js's SENSITIVE_LABEL_PATTERNS) — this only means
    // the DRAFT answer is correct and consistent, a human still reviews it
    // before every submission.
    requiresVisaSponsorship: { type: Boolean, default: undefined },
    // Distinct question from requiresVisaSponsorship above — "are you
    // eligible to work in [country] as per this job post" and "do you
    // require sponsorship" are two separate legal questions on many ATS
    // forms (e.g. Bloomreach's Greenhouse form asks both), and a candidate
    // could in principle answer them differently — never derived from one
    // another. Same explicit-fact, never-a-blind-default treatment.
    currentlyEligibleToWork: { type: Boolean, default: undefined },
    facts:             [factSchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model('CandidateProfile', candidateProfileSchema);
