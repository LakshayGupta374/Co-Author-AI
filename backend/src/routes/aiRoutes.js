const express = require('express');
const router = express.Router();
const { getSuggestions, transformText, transcribeAudio, checkPlotConsistency } = require('../controllers/aiController');
const { protect } = require('../middleware/authMiddleware');
const { validateAISuggest, validateAITransform, validatePlotCheck } = require('../middleware/validationMiddleware');

router.post('/suggest',   protect, validateAISuggest,   getSuggestions);
router.post('/transform', protect, validateAITransform,  transformText);
router.post('/plot-check', protect, validatePlotCheck, checkPlotConsistency);
router.post(
  '/transcribe',
  protect,
  express.raw({ type: ['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/ogg'], limit: '25mb' }),
  transcribeAudio
);

module.exports = router;
