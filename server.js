const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));

app.get('/create', (req, res) => res.sendFile(path.join(__dirname, 'public/create.html')));
app.get('/join', (req, res) => res.sendFile(path.join(__dirname, 'public/join.html')));
app.get('/room', (req, res) => res.sendFile(path.join(__dirname, 'public/room.html')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public/index.html')));

const rooms = new Map();

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

io.on('connection', (socket) => {
  let currentRoom = null;
  let userName = '';

  socket.on('create-room', ({ name }, callback) => {
    let code = generateCode();
    while (rooms.has(code)) code = generateCode();

    const roomData = {
      code,
      hostId: socket.id,
      members: [],
      mediaState: {
        type: null,
        sourceUrl: '',
        title: 'Waiting for a video',
        isPlaying: false,
        currentTime: 0,
        updatedAt: Date.now()
      }
    };

    rooms.set(code, roomData);
    if (callback) callback({ success: true, roomCode: code });
  });

  socket.on('join-room', ({ roomCode, name }, callback) => {
    const cleanCode = (roomCode || '').toUpperCase().trim();
    const room = rooms.get(cleanCode);

    if (!room) {
      if (callback) callback({ success: false, error: 'Room not found. Please verify the code.' });
      return;
    }

    currentRoom = cleanCode;
    userName = name || 'Guest';
    socket.join(cleanCode);

    room.members = room.members.filter(m => m.id !== socket.id);
    const member = { id: socket.id, name: userName, isHost: room.hostId === socket.id };
    room.members.push(member);

    io.to(cleanCode).emit('room-members', room.members);
    socket.emit('sync-initial-state', room.mediaState);
    socket.to(cleanCode).emit('sys-message', `${userName} joined room`);

    if (callback) callback({ success: true, member, mediaState: room.mediaState });
  });

  socket.on('change-source', (payload) => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room) return;

    room.mediaState = {
      type: payload.type,
      sourceUrl: payload.url || '',
      title: payload.title || 'Now Playing',
      isPlaying: false,
      currentTime: 0,
      updatedAt: Date.now()
    };

    io.to(currentRoom).emit('source-changed', room.mediaState);
    io.to(currentRoom).emit('sys-message', `${userName} updated video source`);
  });

  socket.on('media-action', (action) => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room) return;

    room.mediaState.isPlaying = action.type === 'play';
    room.mediaState.currentTime = action.time;
    room.mediaState.updatedAt = Date.now();

    socket.to(currentRoom).emit('media-action', {
      type: action.type,
      time: action.time,
      by: userName
    });
  });

  socket.on('send-message', (text) => {
    if (!currentRoom || !text.trim()) return;
    const msg = {
      id: Date.now().toString(),
      sender: userName,
      senderId: socket.id,
      text: text.trim(),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    io.to(currentRoom).emit('new-message', msg);
  });

  socket.on('typing', (isTyping) => {
    if (currentRoom) socket.to(currentRoom).emit('user-typing', { user: userName, isTyping });
  });

  socket.on('disconnect', () => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room) return;

    room.members = room.members.filter(m => m.id !== socket.id);
    io.to(currentRoom).emit('room-members', room.members);
    io.to(currentRoom).emit('sys-message', `${userName} disconnected`);

    if (room.members.length === 0) {
      setTimeout(() => {
        const checkRoom = rooms.get(currentRoom);
        if (checkRoom && checkRoom.members.length === 0) rooms.delete(currentRoom);
      }, 300000);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`✨ SARA app active on port ${PORT}`));