const Story = require('../models/Story');
const User = require('../models/User');

const canAccessStory = (userId) => ({
  $or: [
    { owner: userId },
    { collaborators: userId }
  ]
});

const normalizeEmail = (email) => (email || '').trim().toLowerCase();

const decorateStory = (story, userId) => {
  const obj = story.toObject ? story.toObject() : story;
  const currentUserId = userId.toString();
  const ownerId = (obj.owner?._id || obj.owner)?.toString();
  obj.role = ownerId === currentUserId ? 'owner' : 'collaborator';
  return obj;
};

exports.createStory = async (req, res) => {
  try {
    const { title, content, genres } = req.body;

    const story = await Story.create({
      title,
      content: content || '',
      genres: genres || [],
      owner: req.user._id,
      lastEditedBy: req.user._id
    });

    res.status(201).json(story);
  } catch (err) {
    console.error('Create story error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getStories = async (req, res) => {
  try {
    const stories = await Story.find(canAccessStory(req.user._id)).sort('-updatedAt');
    res.json(stories.map((story) => decorateStory(story, req.user._id)));
  } catch (err) {
    console.error('Get stories error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getStoryById = async (req, res) => {
  try {
    const story = await Story.findOne({
      _id: req.params.id,
      ...canAccessStory(req.user._id)
    })
      .populate('owner', 'name email')
      .populate('collaborators', 'name email');

    if (!story) {
      return res.status(404).json({ message: 'Story not found' });
    }

    res.json(decorateStory(story, req.user._id));
  } catch (err) {
    console.error('Get story error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.updateStory = async (req, res) => {
  try {
    const { title, content, genres } = req.body;

    const updateFields = { title, content, lastEditedBy: req.user._id };
    if (genres !== undefined) updateFields.genres = genres;

    const story = await Story.findOneAndUpdate(
      { _id: req.params.id, ...canAccessStory(req.user._id) },
      updateFields,
      { new: true }
    );

    if (!story) {
      return res.status(404).json({ message: 'Story not found or not yours' });
    }

    res.json(decorateStory(story, req.user._id));
  } catch (err) {
    console.error('Update story error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.inviteCollaborator = async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: 'Valid collaborator email is required' });
    }

    const story = await Story.findOne({ _id: req.params.id, owner: req.user._id });
    if (!story) {
      return res.status(404).json({ message: 'Story not found or not yours' });
    }

    if (email === req.user.email) {
      return res.status(400).json({ message: 'You already own this story' });
    }

    const invitedUser = await User.findOne({ email }).select('_id email name');
    if (invitedUser && story.collaborators.some((id) => id.toString() === invitedUser._id.toString())) {
      return res.status(400).json({ message: 'User is already a collaborator' });
    }

    const existingInvite = story.invites.find(
      (invite) => invite.email === email && invite.status === 'pending'
    );
    if (existingInvite) {
      return res.status(400).json({ message: 'Invite already pending for this email' });
    }

    story.invites.push({
      email,
      invitedBy: req.user._id,
      status: 'pending'
    });

    await story.save();
    res.status(201).json({
      message: 'Invite created',
      invite: story.invites[story.invites.length - 1]
    });
  } catch (err) {
    console.error('Invite collaborator error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getMyInvites = async (req, res) => {
  try {
    const email = normalizeEmail(req.user.email);
    const stories = await Story.find({
      invites: { $elemMatch: { email, status: 'pending' } }
    })
      .populate('owner', 'name email')
      .sort('-updatedAt');

    const invites = stories.flatMap((story) =>
      story.invites
        .filter((invite) => invite.email === email && invite.status === 'pending')
        .map((invite) => ({
          _id: invite._id,
          storyId: story._id,
          title: story.title,
          genres: story.genres,
          owner: story.owner,
          invitedAt: invite.invitedAt
        }))
    );

    res.json(invites);
  } catch (err) {
    console.error('Get invites error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.respondToInvite = async (req, res) => {
  try {
    const { action } = req.body;
    if (!['accept', 'decline'].includes(action)) {
      return res.status(400).json({ message: 'Action must be accept or decline' });
    }

    const email = normalizeEmail(req.user.email);
    const story = await Story.findOne({
      _id: req.params.id,
      invites: { $elemMatch: { email, status: 'pending' } }
    });

    if (!story) {
      return res.status(404).json({ message: 'Invite not found' });
    }

    const invite = story.invites.find((item) => item.email === email && item.status === 'pending');
    invite.status = action === 'accept' ? 'accepted' : 'declined';
    invite.respondedAt = new Date();

    if (
      action === 'accept' &&
      !story.collaborators.some((id) => id.toString() === req.user._id.toString())
    ) {
      story.collaborators.push(req.user._id);
    }

    await story.save();
    res.json({
      message: action === 'accept' ? 'Invite accepted' : 'Invite declined',
      story: action === 'accept' ? decorateStory(story, req.user._id) : undefined
    });
  } catch (err) {
    console.error('Respond to invite error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.deleteStory = async (req, res) => {
  try {
    const story = await Story.findOneAndDelete({
      _id: req.params.id,
      owner: req.user._id
    });

    if (!story) {
      return res.status(404).json({ message: 'Story not found or not yours' });
    }

    res.json({ message: 'Story deleted' });
  } catch (err) {
    console.error('Delete story error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
};
