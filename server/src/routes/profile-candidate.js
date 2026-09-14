const router   = require('express').Router();
const mongoose = require('mongoose');
const { requireAuth }   = require('../middleware/auth');
const CandidateProfile  = require('../models/candidateProfile');
const ApplicationPolicy = require('../models/applicationPolicy');

const oid = (s) => new mongoose.Types.ObjectId(s);

// GET /profile/candidate — the truth store, auto-seeds an empty doc on first call
// (same pattern as the existing /profile route's UserPrefs auto-seed).
router.get('/candidate', requireAuth, async (req, res) => {
  try {
    const userId = oid(req.user.uid);
    const profile = await CandidateProfile.findOneAndUpdate(
      { userId },
      { $setOnInsert: { userId } },
      { new: true, upsert: true }
    ).lean();
    res.json(profile);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /profile/candidate — full or partial update, upserts
router.put('/candidate', requireAuth, async (req, res) => {
  try {
    const userId = oid(req.user.uid);
    const {
      fullName, preferredName, phone, country, currentCTC, expectedCTC, noticePeriodDays, totalExpYears,
      skills, projects, education, links, workAuthorization, requiresVisaSponsorship, currentlyEligibleToWork, facts,
    } = req.body;

    const profile = await CandidateProfile.findOneAndUpdate(
      { userId },
      { $set: {
          ...(fullName !== undefined && { fullName }),
          ...(preferredName !== undefined && { preferredName }),
          ...(phone !== undefined && { phone }),
          ...(country !== undefined && { country }),
          ...(currentCTC !== undefined && { currentCTC }),
          ...(expectedCTC !== undefined && { expectedCTC }),
          ...(noticePeriodDays !== undefined && { noticePeriodDays }),
          ...(totalExpYears !== undefined && { totalExpYears }),
          ...(skills !== undefined && { skills }),
          ...(projects !== undefined && { projects }),
          ...(education !== undefined && { education }),
          ...(links !== undefined && { links }),
          ...(workAuthorization !== undefined && { workAuthorization }),
          ...(requiresVisaSponsorship !== undefined && { requiresVisaSponsorship }),
          ...(currentlyEligibleToWork !== undefined && { currentlyEligibleToWork }),
          ...(facts !== undefined && { facts }),
      } },
      { new: true, upsert: true }
    );
    res.json(profile);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /profile/policy — user-level ApplicationPolicy, auto-seeds defaults
router.get('/policy', requireAuth, async (req, res) => {
  try {
    const userId = oid(req.user.uid);
    const policy = await ApplicationPolicy.findOneAndUpdate(
      { userId },
      { $setOnInsert: { userId } },
      { new: true, upsert: true }
    ).lean();
    res.json(policy);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /profile/policy — update user's application policy
router.put('/policy', requireAuth, async (req, res) => {
  try {
    const userId = oid(req.user.uid);
    const {
      allowedRoles, blockedCompanies, blockedLocations, minimumScore,
      maximumExperienceGapYears, minimumSalaryLPA, allowUnknownSalary,
      maxApplicationsPerDay, requireApprovalEveryTime, autoSubmitPlatforms,
      neverAnswerFields, requireManualFields, autoConsentToDataProcessing,
      sourceAttributionAnswer,
    } = req.body;

    const policy = await ApplicationPolicy.findOneAndUpdate(
      { userId },
      { $set: {
          ...(allowedRoles !== undefined && { allowedRoles }),
          ...(blockedCompanies !== undefined && { blockedCompanies }),
          ...(blockedLocations !== undefined && { blockedLocations }),
          ...(minimumScore !== undefined && { minimumScore }),
          ...(maximumExperienceGapYears !== undefined && { maximumExperienceGapYears }),
          ...(minimumSalaryLPA !== undefined && { minimumSalaryLPA }),
          ...(allowUnknownSalary !== undefined && { allowUnknownSalary }),
          ...(maxApplicationsPerDay !== undefined && { maxApplicationsPerDay }),
          ...(requireApprovalEveryTime !== undefined && { requireApprovalEveryTime }),
          ...(autoSubmitPlatforms !== undefined && { autoSubmitPlatforms }),
          ...(neverAnswerFields !== undefined && { neverAnswerFields }),
          ...(requireManualFields !== undefined && { requireManualFields }),
          ...(autoConsentToDataProcessing !== undefined && { autoConsentToDataProcessing }),
          ...(sourceAttributionAnswer !== undefined && { sourceAttributionAnswer }),
      } },
      { new: true, upsert: true }
    );
    res.json(policy);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
