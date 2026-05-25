require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const connectDB = require('./config/db');

const authRoutes = require('./routes/authRoutes');
const storyRoutes = require('./routes/storyRoutes');
const aiRoutes = require('./routes/aiRoutes');
const downloadRoutes = require('./routes/downloadRoutes');
const imageRoutes    = require('./routes/imageRoutes');

const initStorySocket = require('./sockets/storySocket');

const app = express();
const server = http.createServer(app);

// 🔌 Attach Socket.io to HTTP server
const { Server } = require('socket.io');
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true
  }
});

// connect DB
connectDB();

// middlewares
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true
}));

app.use(express.json());
app.use(cookieParser());

// routes
app.use('/api/auth', authRoutes);
app.use('/api/stories', storyRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/download', downloadRoutes);
app.use('/api/images',   imageRoutes);

// socket setup
initStorySocket(io);

// simple health route
app.get('/', (req, res) => {
  res.json({ message: 'Co-Author AI backend running ✅' });
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
