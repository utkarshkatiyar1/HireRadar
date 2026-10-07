const router   = require('express').Router();
const mongoose = require('mongoose');
const fs       = require('fs');
const path     = require('path');
const crypto   = require('crypto');
const multer   = require('multer');
const { requireAuth } = require('../middleware/auth');
const ResumeVariant   = require('../models/resumeVariant');

const oid = (s) => new mongoose.Types.ObjectId(s);

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads', 'resumes');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_MIME = new Set(['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) return cb(new Error('Unsupported file type — upload a PDF or Word document'));
    cb(null, true);
  },
});

// GET /resumes — list the current user's resume variants
router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = oid(req.user.uid);
    const variants = await ResumeVariant.find({ userId, isActive: true }).sort({ isDefault: -1, createdAt: -1 }).lean();
    res.json(variants);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /resumes — upload a new resume variant (multipart: file, label, tags[])
router.post('/', requireAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'file is required' });
    const userId = oid(req.user.uid);
    const { label, tags, isDefault } = req.body;
    if (!label) return res.status(400).json({ error: 'label is required' });

    const sha256 = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
    const ext = path.extname(req.file.originalname) || '.pdf';
    const storageKey = `${userId}-${sha256.slice(0, 16)}${ext}`;
    fs.writeFileSync(path.join(UPLOAD_DIR, storageKey), req.file.buffer);

    const priorVersions = await ResumeVariant.countDocuments({ userId, label });

    if (isDefault === 'true' || isDefault === true) {
      await ResumeVariant.updateMany({ userId }, { $set: { isDefault: false } });
    }

    const variant = await ResumeVariant.create({
      userId,
      label,
      tags: Array.isArray(tags) ? tags : (tags ? String(tags).split(',').map(t => t.trim()).filter(Boolean) : []),
      isDefault: isDefault === 'true' || isDefault === true,
      storageProvider: 'LOCAL',
      storageKey,
      originalFileName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      sha256,
      version: priorVersions + 1,
    });

    res.status(201).json(variant);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /resumes/:id — update label/tags/isDefault
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const userId = oid(req.user.uid);
    const { label, tags, isDefault } = req.body;

    if (isDefault === true) {
      await ResumeVariant.updateMany({ userId }, { $set: { isDefault: false } });
    }

    const variant = await ResumeVariant.findOneAndUpdate(
      { _id: oid(req.params.id), userId },
      { $set: {
          ...(label !== undefined && { label }),
          ...(tags !== undefined && { tags }),
          ...(isDefault !== undefined && { isDefault }),
      } },
      { new: true }
    );
    if (!variant) return res.status(404).json({ error: 'Not found' });
    res.json(variant);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /resumes/:id — soft-delete (isActive: false) so past Applications
// that reference this resumeVariantId keep a valid audit trail.
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const userId = oid(req.user.uid);
    const variant = await ResumeVariant.findOneAndUpdate(
      { _id: oid(req.params.id), userId },
      { $set: { isActive: false } },
      { new: true }
    );
    if (!variant) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
