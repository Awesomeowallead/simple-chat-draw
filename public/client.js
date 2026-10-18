const socket = io();

const joinScreen = document.getElementById('join-screen');
const roomScreen = document.getElementById('room-screen');
const usernameInput = document.getElementById('username');
const roomCodeInput = document.getElementById('roomCode');
const joinBtn = document.getElementById('joinBtn');
const rollBtn = document.getElementById('rollName');
const renameBtn = document.getElementById('renameBtn');
const leaveBtn = document.getElementById('leaveBtn');

const roomLabel = document.getElementById('roomLabel');
const myNameLabel = document.getElementById('myName');
const messagesDiv = document.getElementById('messages');
const chatForm = document.getElementById('chatForm');
const chatInput = document.getElementById('chatInput');
const userList = document.getElementById('userList');

const canvas = document.getElementById('bgCanvas');
const ctx = canvas.getContext('2d');
const colorPicker = document.getElementById('colorPicker');
const eraserBtn = document.getElementById('eraserBtn');
const brushSizeInput = document.getElementById('brushSize');
const clearCanvasBtn = document.getElementById('clearCanvasBtn');

const simpleWords = [
  'oak', 'ketchup', 'arrow', 'cloud', 'stone', 'maple', 'pearl', 'ember', 'sage', 'cider',
  'river', 'breeze', 'fern', 'copper', 'lilac', 'mango', 'pepper', 'lodge', 'sprout', 'poppy',
  'willow', 'dune', 'sprig', 'thimble', 'crisp', 'marsh', 'bell', 'dawn', 'glade', 'flint',
  'pine', 'mint', 'honey', 'raven', 'fable', 'drift', 'cove', 'quartz', 'silk', 'moss'
];

const state = {
  room: null,
  myName: '',
  drawing: false,
  lastPoint: null,
  color: colorPicker.value,
  isEraser: false,
  brushSize: Number(brushSizeInput.value)
};

function randomName() {
  return simpleWords[Math.floor(Math.random() * simpleWords.length)];
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function renderMessages(messages = []) {
  messagesDiv.innerHTML = '';

  messages.forEach((message) => {
    const row = document.createElement('div');
    row.className = `message${message.system ? ' system' : ''}`;

    if (message.system) {
      row.textContent = message.text;
    } else {
      const meta = document.createElement('div');
      meta.className = 'meta';

      const name = document.createElement('strong');
      name.textContent = message.username;

      const time = document.createElement('span');
      time.textContent = formatTime(message.ts);

      meta.appendChild(name);
      meta.appendChild(time);

      const content = document.createElement('div');
      content.innerHTML = escapeHtml(message.text);

      row.appendChild(meta);
      row.appendChild(content);
    }

    messagesDiv.appendChild(row);
  });

  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function renderUserList(users = []) {
  userList.innerHTML = '';
  users.forEach((user) => {
    const li = document.createElement('li');
    li.textContent = user;
    userList.appendChild(li);
  });
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * devicePixelRatio;
  canvas.height = rect.height * devicePixelRatio;
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
}

function clearCanvasLocal() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function normalizePoint(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) / rect.width,
    y: (event.clientY - rect.top) / rect.height
  };
}

function drawStroke(stroke) {
  if (!stroke) return;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = stroke.width || state.brushSize;

  if (stroke.isEraser) {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = 'rgba(0, 0, 0, 1)';
  } else {
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = stroke.color || state.color;
  }

  ctx.beginPath();
  ctx.moveTo(stroke.from.x * canvas.width, stroke.from.y * canvas.height);
  ctx.lineTo(stroke.to.x * canvas.width, stroke.to.y * canvas.height);
  ctx.stroke();
  ctx.restore();
}

function handleJoinSuccess(info) {
  state.room = info.room;
  state.myName = usernameInput.value.trim() || randomName();
  roomLabel.textContent = info.room;
  myNameLabel.textContent = state.myName;
  renderUserList(info.users || []);
  renderMessages(info.messages || []);

  if (Array.isArray(info.strokes)) {
    clearCanvasLocal();
    info.strokes.forEach((stroke) => drawStroke(stroke));
  }

  joinScreen.classList.add('hidden');
  roomScreen.classList.remove('hidden');
}

function resetJoinFields() {
  usernameInput.value = randomName();
  roomCodeInput.value = '';
}

rollBtn.addEventListener('click', () => {
  usernameInput.value = randomName();
});

renameBtn.addEventListener('click', () => {
  const candidate = randomName();
  socket.emit('rename', candidate, (response) => {
    if (response && response.ok) {
      state.myName = response.name;
      myNameLabel.textContent = response.name;
      usernameInput.value = response.name;
    }
  });
});

joinBtn.addEventListener('click', () => {
  const name = (usernameInput.value || '').trim() || randomName();
  const room = (roomCodeInput.value || '').trim();

  socket.emit('join', { room, username: name }, (response) => {
    if (!response || !response.ok) {
      alert('Could not join room.');
      return;
    }

    state.myName = name;
    usernameInput.value = name;
    handleJoinSuccess(response);
  });
});

leaveBtn.addEventListener('click', () => {
  window.location.reload();
});

chatForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;

  socket.emit('chat-message', text);
  chatInput.value = '';
});

colorPicker.addEventListener('input', (event) => {
  state.color = event.target.value;
  state.isEraser = false;
  eraserBtn.classList.remove('active');
});

eraserBtn.addEventListener('click', () => {
  state.isEraser = !state.isEraser;
  eraserBtn.classList.toggle('active', state.isEraser);
});

brushSizeInput.addEventListener('input', (event) => {
  state.brushSize = Number(event.target.value);
});

clearCanvasBtn.addEventListener('click', () => {
  clearCanvasLocal();
  socket.emit('clear-canvas');
});

canvas.addEventListener('pointerdown', (event) => {
  if (!state.room) return;
  state.drawing = true;
  state.lastPoint = normalizePoint(event);
});

canvas.addEventListener('pointermove', (event) => {
  if (!state.room || !state.drawing || !state.lastPoint) return;

  const nextPoint = normalizePoint(event);
  const stroke = {
    from: state.lastPoint,
    to: nextPoint,
    width: state.brushSize,
    color: state.isEraser ? '#000000' : state.color,
    isEraser: state.isEraser
  };

  drawStroke(stroke);
  socket.emit('drawing', stroke);
  state.lastPoint = nextPoint;
});

canvas.addEventListener('pointerup', () => {
  state.drawing = false;
  state.lastPoint = null;
});

canvas.addEventListener('pointerleave', () => {
  state.drawing = false;
  state.lastPoint = null;
});

socket.on('chat-message', (message) => {
  const currentMessages = messagesDiv.querySelectorAll('.message').length > 0 ? Array.from(messagesDiv.children).map((node) => node.dataset.message) : [];
  if (!message || !message.text) return;

  const messageNode = document.createElement('div');
  messageNode.className = 'message';

  const meta = document.createElement('div');
  meta.className = 'meta';

  const name = document.createElement('strong');
  name.textContent = message.username;

  const time = document.createElement('span');
  time.textContent = formatTime(message.ts);

  meta.appendChild(name);
  meta.appendChild(time);

  const text = document.createElement('div');
  text.innerHTML = escapeHtml(message.text);

  messageNode.appendChild(meta);
  messageNode.appendChild(text);
  messagesDiv.appendChild(messageNode);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
});

socket.on('system-message', (message) => {
  if (!message) return;
  const row = document.createElement('div');
  row.className = 'message system';
  row.textContent = message.text;
  messagesDiv.appendChild(row);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
});

socket.on('user-list', (users) => {
  renderUserList(users || []);
});

socket.on('chat-history', (messages) => {
  renderMessages(messages || []);
});

socket.on('draw-history', (strokes) => {
  clearCanvasLocal();
  (strokes || []).forEach((stroke) => drawStroke(stroke));
});

socket.on('drawing', (stroke) => {
  if (!stroke) return;
  drawStroke(stroke);
});

socket.on('clear-canvas', () => {
  clearCanvasLocal();
});

window.addEventListener('resize', () => {
  if (state.room) {
    resizeCanvas();
  }
});

resetJoinFields();
if (usernameInput.value.trim() === '') {
  usernameInput.value = randomName();
}
resizeCanvas();
