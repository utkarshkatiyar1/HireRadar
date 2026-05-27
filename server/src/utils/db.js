const mongoose = require('mongoose');

const jobSchema = new mongoose.Schema(
  {
    title:      { type: String, required: true },
    company:    { type: String, required: true },
    location:   String,
    exp:        String,
    department: String,
    url:        { type: String, unique: true, required: true },
    date:       { type: Date, default: Date.now },
    applied:      { type: Boolean, default: false },
    appliedAt:    Date,
    dismissed:    { type: Boolean, default: false },
    ats:          { type: String, default: 'custom-api' },
    atsSearched:  { type: Boolean, default: false },
    firstSeen:  { type: Date, default: Date.now },
    lastSeen:   { type: Date, default: Date.now },
  },
  { timestamps: true }
);

const Job = mongoose.model('Job', jobSchema);

const userSchema = new mongoose.Schema(
  {
    email:        { type: String, unique: true, required: true, lowercase: true, trim: true },
    name:         { type: String, required: true, trim: true },
    passwordHash: { type: String, required: true },
  },
  { timestamps: true }
);

const User = mongoose.model('User', userSchema);

const userJobStateSchema = new mongoose.Schema(
  {
    userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    jobId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Job',  required: true, index: true },
    applied:   { type: Boolean, default: false },
    appliedAt: Date,
    dismissed: { type: Boolean, default: false },
  },
  { timestamps: true }
);
userJobStateSchema.index({ userId: 1, jobId: 1 }, { unique: true });

const UserJobState = mongoose.model('UserJobState', userJobStateSchema);

const userPrefsSchema = new mongoose.Schema(
  {
    userId:           { type: mongoose.Schema.Types.ObjectId, ref: 'User', unique: true, required: true },
    locationAllow:    [String],
    seniorityExclude: [String],
    frontendSignals:  [String],
    juniorSignals:    [String],
    negativeSignals:  [String],
    scoreThreshold:   { type: Number, default: 0 },
  },
  { timestamps: true }
);

const UserPrefs = mongoose.model('UserPrefs', userPrefsSchema);

// Stores dynamic company sources — mirrors the shape of config/sources.js entries.
// Custom scrapers (ats: custom-api / playwright) still need a scraperModule on disk.
const sourceSchema = new mongoose.Schema(
  {
    company:             { type: String, required: true, unique: true },
    ats:                 { type: String, required: true },
    enabled:             { type: Boolean, default: true },
    // ATS-specific
    scraperModule:       String,
    greenhouseToken:     String,
    leverToken:          String,
    ashbySlug:           String,
    smartrecruitersSlug: String,
    workdayBase:         String,
    workdayTenant:       String,
    workdaySite:         String,
    eightfoldBase:       String,
    baseUrl:             String,
    searchPath:          String,
    selectors:           mongoose.Schema.Types.Mixed,
    // Per-source overrides (if absent, DEFAULTS from config/sources.js apply at runtime)
    keywords:            [String],
    locations:           [String],
    maxExp:              Number,
    // Health tracking — updated after every scrape
    lastJobCount:        { type: Number, default: null },
    lastScrapedAt:       { type: Date,   default: null },
    consecutiveFailures: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const Source = mongoose.model('Source', sourceSchema);

const connect = () => mongoose.connect(process.env.MONGO_URI);

module.exports = { Job, User, UserJobState, UserPrefs, Source, connect };
