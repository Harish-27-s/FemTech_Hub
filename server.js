// server.js
// FemTech Hub – Main Server Entry Point
// Express REST API + Socket.IO real-time communication

require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const jwt = require('jsonwebtoken');

const { getDB } = require('./database/db');
const { router: authRouter } = require('./routes/auth');
const { router: safetyRouter, setIO: safetySetIO } = require('./routes/safety');
const healthRouter = require('./routes/health');
const wellnessRouter = require('./routes/wellness');
const { router: communityRouter, setIO: communitySetIO } = require('./routes/community');

const app = express();
const httpServer = http.createServer(app);

// ── Socket.IO Setup ──────────────────────────────────────────────────────────
const io = new Server(httpServer, {
  cors: { 
    origin: '*', 
    methods: ['GET', 'POST'] 
  },
  pingTimeout: 60000,
});

// Inject io into routes that need it
safetySetIO(io);
communitySetIO(io);

// ── Express Middleware ───────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── REST Routes ──────────────────────────────────────────────────────────────
app.use('/api/auth', authRouter);
app.use('/api/safety', safetyRouter);
app.use('/api/health', healthRouter);
app.use('/api/wellness', wellnessRouter);
app.use('/api/community', communityRouter);

// Health check
app.get('/api/ping', (req, res) => res.json({ status: 'FemTech Hub server running 💜' }));

// ── Socket.IO Real-Time Events ───────────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET || 'femtech_hub_secret_2024';

// Track connected users: socketId → { userId, name }
const connectedUsers = new Map();

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (token) {
    try {
      socket.user = jwt.verify(token, JWT_SECRET);
    } catch {
      // Allow unauthenticated socket connections for demo
    }
  }
  next();
});

io.on('connection', (socket) => {
  console.log(`🔌 Client connected: ${socket.id} (${socket.user?.name || 'guest'})`);

  if (socket.user) {
    connectedUsers.set(socket.id, { userId: socket.user.id, name: socket.user.name });
    io.emit('user_online', {
      socketId: socket.id,
      name: socket.user.name,
      onlineCount: connectedUsers.size,
    });
  }

  socket.on('location_update', (data) => {
    const payload = {
      ...data,
      socketId: socket.id,
      name: socket.user?.name || 'Unknown',
      timestamp: new Date().toISOString(),
    };
    if (data.sharingWith === 'all') {
      socket.broadcast.emit('location_receive', payload);
    } else {
      socket.broadcast.emit('location_receive', payload);
    }
  });

  socket.on('new_post', (data) => {
    io.emit('receive_post', {
      ...data,
      author_name: data.anonymous ? 'Anonymous' : socket.user?.name || 'Unknown',
      timestamp: new Date().toISOString(),
    });
  });

  socket.on('sos_trigger', (data) => {
    io.emit('sos_alert', {
      ...data,
      socketId: socket.id,
      name: socket.user?.name || 'Unknown',
      timestamp: new Date().toISOString(),
      message: `🚨 SOS Alert from ${socket.user?.name || 'a user'}!`,
    });
    console.log(`🚨 SOS triggered by ${socket.user?.name} at ${data.latitude}, ${data.longitude}`);
  });

  socket.on('disconnect', () => {
    connectedUsers.delete(socket.id);
    io.emit('user_offline', {
      socketId: socket.id,
      onlineCount: connectedUsers.size,
    });
    console.log(`🔌 Client disconnected: ${socket.id}`);
  });
});

// ── Start Server ─────────────────────────────────────────────────────────────
// 🛠️ RENDER FIX: Must use process.env.PORT and bind to 0.0.0.0
const PORT = process.env.PORT || 3000; 

httpServer.listen(PORT, '0.0.0.0', () => {
  getDB(); // Initialize DB on startup
  console.log('🚀 FemTech Hub Server – ONLINE on Port ' + PORT);
});
