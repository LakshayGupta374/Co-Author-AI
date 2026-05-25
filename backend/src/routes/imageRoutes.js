const express  = require('express');
const router   = express.Router();
const { getSceneImages, getCoverImages } = require('../controllers/imageController');
const { protect }                        = require('../middleware/authMiddleware');
const { validateImageRequest }           = require('../middleware/validationMiddleware');

// POST /api/images/scenes  — scene inspiration images
router.post('/scenes', protect, validateImageRequest, getSceneImages);

// POST /api/images/cover   — cinematic cover images
router.post('/cover',  protect, validateImageRequest, getCoverImages);

module.exports = router;
