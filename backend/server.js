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

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const JWT_SECRET = process.env.JWT_SECRET || 'supersecret123';

const initDB = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        avatar VARCHAR(10) DEFAULT '👤',
        online BOOLEAN DEFAULT false,
        last_seen TIMESTAMP DEFAULT NOW(),
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS groups (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        icon VARCHAR(10) DEFAULT '👥',
        created_by VARCHAR(50),
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS group_members (
        group_id INTEGER REFERENCES groups(id),
        username VARCHAR(50),
        PRIMARY KEY (group_id, username)
      );
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        room VARCHAR(100) NOT NULL,
        from_user VARCHAR(50) NOT NULL,
        text TEXT NOT NULL,
        type VARCHAR(20) DEFAULT 'text',
        read_by TEXT[] DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen TIMESTAMP DEFAULT NOW()").catch(()=>{});
    pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS online BOOLEAN DEFAULT false").catch(()=>{});
    console.log("DB ready");;
  } catch(e) { console.log('DB error:', e.message); }
};
initDB();

const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Invalid token' }); }
};

app.get('/', (req, res) => res.json({ status: 'ok' }));

app.post('/register', async (req, res) => {
  const { username, password, avatar } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Required' });
  try {
    const hash = await bcrypt.hash(password, 10);
    const r = await pool.query('INSERT INTO users (username,password,avatar) VALUES ($1,$2,$3) RETURNING id,username,avatar', [username, hash, avatar||'👤']);
    const token = jwt.sign({ id: r.rows[0].id, username }, JWT_SECRET);
    res.json({ token, user: r.rows[0] });
  } catch(e) { res.status(400).json({ error: 'Username taken' }); }
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const r = await pool.query('SELECT * FROM users WHERE username=$1', [username]);
    if (!r.rows[0]) return res.status(400).json({ error: 'Not found' });
    const ok = await bcrypt.compare(password, r.rows[0].password);
    if (!ok) return res.status(400).json({ error: 'Wrong password' });
    await pool.query('UPDATE users SET online=true WHERE username=$1', [username]);
    const token = jwt.sign({ id: r.rows[0].id, username }, JWT_SECRET);
    res.json({ token, user: { id: r.rows[0].id, username, avatar: r.rows[0].avatar } });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/users', auth, async (req, res) => {
  try {
    const r = await pool.query('SELECT id,username,avatar,online FROM users WHERE username!=$1 ORDER BY online DESC, username ASC', [req.user.username]);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/messages/:room', auth, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM messages WHERE room=$1 ORDER BY created_at ASC LIMIT 100', [req.params.room]);
    await pool.query('UPDATE messages SET read_by = array_append(read_by, $1) WHERE room=$2 AND NOT ($1 = ANY(read_by))', [req.user.username, req.params.room]);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/groups', auth, async (req, res) => {
  const { name, icon, members } = req.body;
  try {
    const r = await pool.query('INSERT INTO groups (name,icon,created_by) VALUES ($1,$2,$3) RETURNING *', [name, icon||'👥', req.user.username]);
    const gid = r.rows[0].id;
    const allMembers = [...new Set([...members, req.user.username])];
    for (const m of allMembers) {
      await pool.query('INSERT INTO group_members (group_id,username) VALUES ($1,$2) ON CONFLICT DO NOTHING', [gid, m]);
    }
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/groups', auth, async (req, res) => {
  try {
    const r = await pool.query('SELECT g.* FROM groups g JOIN group_members gm ON g.id=gm.group_id WHERE gm.username=$1', [req.user.username]);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/search/:query', auth, async (req, res) => {
  try {
    const r = await pool.query("SELECT id,username,avatar,online FROM users WHERE username ILIKE $1 AND username!=$2 LIMIT 10", [`%${req.params.query}%`, req.user.username]);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const onlineUsers = {};

io.on('connection', (socket) => {
  socket.on('online', async (username) => {
    onlineUsers[username] = socket.id;
    await pool.query('UPDATE users SET online=true WHERE username=$1', [username]);
    io.emit('userOnline', username);
  });
  socket.on('join', (room) => socket.join(room));
  socket.on('message', async (data) => {
    try {
      const r = await pool.query('INSERT INTO messages (room,from_user,text,type) VALUES ($1,$2,$3,$4) RETURNING id', [data.room, data.from, data.text, data.type||'text']);
      data.dbId = r.rows[0].id;
    } catch(e) { console.log('msg error:', e.message); }
    io.to(data.room).emit('message', data);
  });
  socket.on('reaction', (data) => io.to(data.room).emit('reaction', data));
  socket.on('typing', (data) => socket.to(data.room).emit('typing', data));
  socket.on('disconnect', async () => {
    const username = Object.keys(onlineUsers).find(k => onlineUsers[k] === socket.id);
    if (username) {
      delete onlineUsers[username];
      await pool.query('UPDATE users SET online=false, last_seen=NOW() WHERE username=$1', [username]);
      io.emit('userOffline', username);
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log('Server on port', PORT));
