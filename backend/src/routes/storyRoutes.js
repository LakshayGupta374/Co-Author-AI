const express = require('express');
const router = express.Router();
const {
  createStory,
  getStories,
  getStoryById,
  updateStory,
  deleteStory,
  inviteCollaborator,
  getMyInvites,
  respondToInvite
} = require('../controllers/storyController');
const { protect } = require('../middleware/authMiddleware');
const { validateCreateStory, validateUpdateStory } = require('../middleware/validationMiddleware');

router.use(protect);

router.route('/')
  .get(getStories)
  .post(validateCreateStory, createStory);

router.get('/invites/mine', getMyInvites);
router.post('/:id/invites', inviteCollaborator);
router.post('/:id/invites/respond', respondToInvite);

router.route('/:id')
  .get(getStoryById)
  .put(validateUpdateStory, updateStory)
  .delete(deleteStory);

module.exports = router;
