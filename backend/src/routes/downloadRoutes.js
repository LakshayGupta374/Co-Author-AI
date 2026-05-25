const express  = require('express');
const router   = express.Router();
const { downloadStory } = require('../controllers/downloadController');
const { protect }       = require('../middleware/authMiddleware');

// GET /api/download/:id?format=pdf|docx|txt
router.get('/:id', protect, downloadStory);

module.exports = router;
