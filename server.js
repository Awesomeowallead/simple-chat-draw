const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const MAX_ROOM_CODE_LEN = 10;
const MAX_MESSAGE_COUNT = 200;
const MAX_STROKE_COUNT = 2000;
const rooms = new Map();

const simpleWords = [
  'oak', 'ketchup', 'arrow', 'cloud', 'stone', 'maple', 'pearl', 'ember', 'sage', 'cider',
  'river', 'breeze', 'fern', 'copper', 'lilac', 'mango', 'pepper', 'lodge', 'sprout', 'poppy',
  'willow', 'dune', 'sprig', 'thimble', 'crisp', 'marsh', 'bell', 'dawn', 'glade', 'flint',
  'pine', 'mint', 'honey', 'raven', 'fable', 'drift', 'cove', 'quartz', 'silk', 'moss'
];

function randomName() {
  return simpleWords[Math.floor(Math.random() * simpleWords.length)];
}

function sanitizeRoomCode(value) {
  if (value === null || value === undefined) return null;
  const code = String(value).trim().slice(0, MAX_ROOM_CODE_LEN);
  return /^[A-Za-z0-9_-]{1,10}$/.test(code) ? code : null;
}

function makeRoomCode(length = 6) {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function getOrCreateRoom(roomCode) {
  if (!rooms.has(roomCode)) {
    rooms.set(roomCode, {
      users: new Map(),
      messages: [],
      strokes: []
    });
  }
  return rooms.get(roomCode);
}

function userListForRoom(room) {
  return Array.from(room.users.values()).map((user) => user.name);
}

function safeTrimText(value, maxLength = 500) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

function leaveRoom(socket) {
  const roomCode = socket.data.room;
  const username = socket.data.username;
  if (!roomCode || !rooms.has(roomCode)) return;

  const room = rooms.get(roomCode);
  room.users.delete(socket.id);

  if (room.users.size === 0) {
    rooms.delete(roomCode);
    return;
  }

  const systemText = `${username || 'Someone'} left the room.`;
  const systemMessage = { id: `${Date.now()}-${Math.random()}`, system: true, text: systemText, ts: Date.now() };
  room.messages.push(systemMessage);
  if (room.messages.length > MAX_MESSAGE_COUNT) room.messages.shift();

  io.to(roomCode).emit('system-message', systemMessage);
  io.to(roomCode).emit('user-list', userListForRoom(room));
}

io.on('connection', (socket) => {
  socket.data.room = null;
  socket.data.username = null;

  socket.on('join', ({ room, username }, ack) => {
    const safeUsername = safeTrimText(username || randomName(), 30) || randomName();
    let roomCode = sanitizeRoomCode(room);

    if (!roomCode) {
      do {
        roomCode = makeRoomCode(6);
      } while (rooms.has(roomCode));
    }

    if (socket.data.room && socket.data.room !== roomCode) {
      leaveRoom(socket);
    }

    socket.join(roomCode);
    const roomData = getOrCreateRoom(roomCode);
    socket.data.room = roomCode;
    socket.data.username = safeUsername;
    roomData.users.set(socket.id, { name: safeUsername });

    const payload = {
      ok: true,
      room: roomCode,
      users: userListForRoom(roomData),
      messages: roomData.messages,
      strokes: roomData.strokes
    };

    if (typeof ack === 'function') {
      ack(payload);
    }

    const welcomeMessage = {
      id: `${Date.now()}-${Math.random()}`,
      system: true,
      text: `${safeUsername} joined the room.`,
      ts: Date.now()
    };

    roomData.messages.push(welcomeMessage);
    if (roomData.messages.length > MAX_MESSAGE_COUNT) roomData.messages.shift();

    io.to(roomCode).emit('system-message', welcomeMessage);
    io.to(roomCode).emit('user-list', userListForRoom(roomData));
    socket.emit('chat-history', roomData.messages);
    socket.emit('draw-history', roomData.strokes);
  });

  socket.on('chat-message', (message) => {
    const roomCode = socket.data.room;
    const username = socket.data.username;
    if (!roomCode || !rooms.has(roomCode) || !username) return;

    const text = safeTrimText(message, 500);
    if (!text) return;

    const room = rooms.get(roomCode);
    const msg = {
      id: `${Date.now()}-${Math.random()}`,
      username,
      text,
      ts: Date.now()
    };

    room.messages.push(msg);
    if (room.messages.length > MAX_MESSAGE_COUNT) room.messages.shift();

    io.to(roomCode).emit('chat-message', msg);
  });

  socket.on('drawing', (stroke) => {
    const roomCode = socket.data.room;
    if (!roomCode || !rooms.has(roomCode) || !stroke || typeof stroke !== 'object') return;

    const room = rooms.get(roomCode);
    const normalizedStroke = {
      id: `${Date.now()}-${Math.random()}`,
      from: stroke.from,
      to: stroke.to,
      color: stroke.color || '#90f5df',
      width: stroke.width || 3,
      isEraser: Boolean(stroke.isEraser),
      ts: Date.now()
    };

    room.strokes.push(normalizedStroke);
    if (room.strokes.length > MAX_STROKE_COUNT) room.strokes.shift();

    socket.to(roomCode).emit('drawing', normalizedStroke);
  });

  socket.on('clear-canvas', () => {
    const roomCode = socket.data.room;
    if (!roomCode || !rooms.has(roomCode)) return;

    const room = rooms.get(roomCode);
    room.strokes = [];
    io.to(roomCode).emit('clear-canvas');
  });

  socket.on('rename', (newName, ack) => {
    const roomCode = socket.data.room;
    if (!roomCode || !rooms.has(roomCode)) {
      if (typeof ack === 'function') ack({ ok: false, error: 'Not in a room' });
      return;
    }

    const room = rooms.get(roomCode);
    const oldName = socket.data.username || 'Anon';
    const safeNewName = safeTrimText(newName, 30) || randomName();

    socket.data.username = safeNewName;
    room.users.set(socket.id, { name: safeNewName });

    const systemMessage = {
      id: `${Date.now()}-${Math.random()}`,
      system: true,
      text: `${oldName} is now ${safeNewName}.`,
      ts: Date.now()
    };

    room.messages.push(systemMessage);
    if (room.messages.length > MAX_MESSAGE_COUNT) room.messages.shift();

    io.to(roomCode).emit('system-message', systemMessage);
    io.to(roomCode).emit('user-list', userListForRoom(room));

    if (typeof ack === 'function') {
      ack({ ok: true, name: safeNewName });
    }
  });

  socket.on('disconnect', () => {
    leaveRoom(socket);
  });
});

app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
