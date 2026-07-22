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
    phone:            String,
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
    facts:             [factSchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model('CandidateProfile', candidateProfileSchema);
