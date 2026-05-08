const mongoose = require('mongoose');

const schema = new mongoose.Schema(
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
    atsSearched:  { type: Boolean, default: false }, // true = ATS already filtered by keyword
    firstSeen:  { type: Date, default: Date.now },
    lastSeen:   { type: Date, default: Date.now },
  },
  { timestamps: true }
);

const Job = mongoose.model('Job', schema);

const connect = () => mongoose.connect(process.env.MONGO_URI);

module.exports = { Job, connect };
