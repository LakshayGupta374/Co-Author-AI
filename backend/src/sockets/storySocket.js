const Story = require('../models/Story');
const User = require('../models/User');
const axios = require('axios');
const jwt = require('jsonwebtoken');

// Optional: JWT auth on socket connection
const authenticateSocket = (token) => {
  try {
    if (!token) return null;
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return decoded.id; // userId
  } catch {
    return null;
  }
};

const canAccessStory = (userId) => ({
  $or: [
    { owner: userId },
    { collaborators: userId }
  ]
});

const storyPresence = new Map();

const getPresenceList = (storyId) => {
  const room = storyPresence.get(storyId);
  if (!room) return [];

  return [...room.values()].map(({ user }) => user);
};

const addPresence = (storyId, socketId, user) => {
  if (!storyPresence.has(storyId)) storyPresence.set(storyId, new Map());

  const room = storyPresence.get(storyId);
  const existing = room.get(user._id);

  if (existing) {
    existing.socketIds.add(socketId);
    return;
  }

  room.set(user._id, {
    user,
    socketIds: new Set([socketId])
  });
};

const removePresence = (storyId, socketId, userId) => {
  const room = storyPresence.get(storyId);
  if (!room) return;

  const existing = room.get(userId);
  if (!existing) return;

  existing.socketIds.delete(socketId);
  if (existing.socketIds.size === 0) room.delete(userId);
  if (room.size === 0) storyPresence.delete(storyId);
};

module.exports = function initStorySocket(io) {
  io.on('connection', (socket) => {
    console.log('🔌 New client connected:', socket.id);

    // Optional: send JWT in query: ?token=XXX
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    const userId = authenticateSocket(token);

    if (!userId) {
      console.log('❌ Socket auth failed');
      socket.disconnect(true);
      return;
    }

    socket.data.storyIds = new Set();

    // Join a room for a specific story
    socket.on('story:join', async ({ storyId }) => {
      const story = await Story.findOne({ _id: storyId, ...canAccessStory(userId) }).select('_id');
      if (!story) {
        socket.emit('story:error', { message: 'Not authorized for this story' });
        return;
      }

      const user = await User.findById(userId).select('name email');
      if (!user) {
        socket.emit('story:error', { message: 'User not found' });
        return;
      }

      socket.join(storyId);
      socket.data.storyIds.add(storyId);
      addPresence(storyId, socket.id, {
        _id: user._id.toString(),
        name: user.name,
        email: user.email
      });
      io.to(storyId).emit('story:presence', {
        storyId,
        users: getPresenceList(storyId)
      });
      console.log(`✅ Socket ${socket.id} joined story room ${storyId}`);
    });

    // Handle live text updates from client
    socket.on('story:update', async ({ storyId, content }) => {
      try {
        // update DB (optional: you can throttle this in real app)
        const story = await Story.findOneAndUpdate(
          { _id: storyId, ...canAccessStory(userId) },
          {
            content,
            lastEditedBy: userId
          }
        );

        if (!story) {
          socket.emit('story:error', { message: 'Not authorized for this story' });
          return;
        }

        // broadcast the updated content to others in room (for future collab features)
        socket.to(storyId).emit('story:updatedFromServer', { content });

        // Call Groq for suggestion based on current content
        const prompt = `Continue this story in the same style, suggest the next 2-3 lines:\n\n${content}`;

        const groqRes = await axios.post(
          'https://api.groq.com/openai/v1/chat/completions',
          {
            model: 'llama-3.1-8b-instant',
            messages: [
              { role: 'system', content: 'You are a helpful story co-writer.' },
              { role: 'user', content: prompt }
            ],
            max_tokens: 120,
            temperature: 0.9
          },
          {
            headers: {
              Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
              'Content-Type': 'application/json'
            }
          }
        );

        const suggestion = groqRes.data.choices[0].message.content;

        // Send suggestion back to same room
        io.to(storyId).emit('story:suggestion', {
          storyId,
          suggestion
        });

      } catch (err) {
        console.error('Socket story:update error:', err.response?.data || err.message);
        socket.emit('story:error', { message: 'Error generating suggestion' });
      }
    });

    socket.on('disconnect', () => {
      for (const storyId of socket.data.storyIds || []) {
        removePresence(storyId, socket.id, userId);
        io.to(storyId).emit('story:presence', {
          storyId,
          users: getPresenceList(storyId)
        });
      }
      console.log('🔌 Client disconnected:', socket.id);
    });
  });
};
