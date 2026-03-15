const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const messages = {};
const channels = [
  { id: 'general', name: 'General', icon: '📢' },
  { id: 'news', name: 'News', icon: '📰' },
  { id: 'music', name: 'Music', icon: '🎵' },
];
const chats = [
  { id: 'alice', name: 'Alice', avatar: '👩' },
  { id: 'bob', name: 'Bob', avatar: '👨' },
  { id: 'carol', name: 'Carol', avatar: '👱' },
];

app.get('/channels', (req, res) => res.json(channels));
app.get('/chats', (req, res) => res.json(chats));
app.get('/messages/:room', (req, res) => {
  res.json(messages[req.params.room] || []);
});

io.on('connection', (socket) => {
  socket.on('join', (room) => socket.join(room));
  socket.on('message', (data) => {
    if (!messages[data.room]) messages[data.room] = [];
    messages[data.room].push(data);
    io.to(data.room).emit('message', data);
  });
  socket.on('reaction', (data) => {
    io.to(data.room).emit('reaction', data);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
