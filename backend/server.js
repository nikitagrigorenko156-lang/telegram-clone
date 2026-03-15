const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const JWT_SECRET = process.env.JWT_SECRET || 'supersecret123';

const initDB = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      avatar VARCHAR(10) DEFAULT '👤',
      online BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      room VARCHAR(100) NOT NULL,
      from_user VARCHAR(50) NOT NULL,
      text TEXT NOT NULL,
      type VARCHAR(20) DEFAULT 'text',
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
  console.log('DB ready');
};
initDB();

const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch { res.status(401).json({ error: 'Invalid token' }); }
};

app.post('/register', async (req, res) => {
  const { username, password, avatar } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Required' });
  try {
    const hash = await bcrypt.hash(password, 10);
    const r = await pool.query(
      'INSERT INTO users (username, password, avatar) VALUES ($1,$2,$3) RETURNING id,username,avatar',
      [username, hash, avatar || '👤']
    );
    const token = jwt.sign({ id: r.rows[0].id, username }, JWT_SECRET);
    res.json({ token, user: r.rows[0] });
  } catch (e) {
    res.status(400).json({ error: 'Username taken' });
  }
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const r = await pool.query('SELECT * FROM users WHERE username=$1', [username]);
    if (!r.rows[0]) return res.status(400).json({ error: 'Not found' });
    const ok = await bcrypt.compare(password, r.rows[0].password);
    if (!ok) return res.status(400).json({ error: 'Wrong password' });
    const token = jwt.sign({ id: r.rows[0].id, username }, JWT_SECRET);
    res.json({ token, user: { id: r.rows[0].id, username, avatar: r.rows[0].avatar } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/users', auth, async (req, res) => {
  const r = await pool.query('SELECT id,username,avatar,online FROM users WHERE username!=$1', [req.user.username]);
  res.json(r.rows);
});

app.get('/messages/:room', auth, async (req, res) => {
  const r = await pool.query('SELECT * FROM messages WHERE room=$1 ORDER BY created_at ASC LIMIT 100', [req.params.room]);
  res.json(r.rows);
});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

io.on('connection', (socket) => {
  socket.on('join', (room) => socket.join(room));
  socket.on('message', async (data) => {
    await pool.query('INSERT INTO messages (room,from_user,text,type) VALUES ($1,$2,$3,$4)',
      [data.room, data.from, data.text, data.type || 'text']);
    io.to(data.room).emit('message', data);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log('Server on port', PORT));
