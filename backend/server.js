const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;

const app = express();
app.use(cors());
app.use(express.json());

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const JWT_SECRET = process.env.JWT_SECRET || 'supersecret123';
const upload = multer({ storage: multer.memoryStorage(), limits:{fileSize:10*1024*1024} });

const initDB = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        avatar VARCHAR(10) DEFAULT '👤',
        bio TEXT DEFAULT '',
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
        reply_to INTEGER DEFAULT NULL,
        reply_text TEXT DEFAULT NULL,
        edited BOOLEAN DEFAULT false,
        read_by TEXT[] DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT DEFAULT ''`).catch(()=>{});
    await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS edited BOOLEAN DEFAULT false`).catch(()=>{});
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen TIMESTAMP DEFAULT NOW()`).catch(()=>{});
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS online BOOLEAN DEFAULT false`).catch(()=>{});
    await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to INTEGER DEFAULT NULL`).catch(()=>{});
    await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_text TEXT DEFAULT NULL`).catch(()=>{});
    console.log('DB ready');
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
    res.json({ token, user: { id: r.rows[0].id, username, avatar: r.rows[0].avatar, bio: r.rows[0].bio } });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/users', auth, async (req, res) => {
  try {
    const r = await pool.query('SELECT id,username,avatar,online,bio FROM users WHERE username!=$1 ORDER BY online DESC, username ASC', [req.user.username]);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/profile/:username', auth, async (req, res) => {
  try {
    const r = await pool.query('SELECT id,username,avatar,online,bio,last_seen,created_at FROM users WHERE username=$1', [req.params.username]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.put('/profile', auth, async (req, res) => {
  const { avatar, bio } = req.body;
  try {
    const r = await pool.query('UPDATE users SET avatar=$1, bio=$2 WHERE username=$3 RETURNING id,username,avatar,bio', [avatar, bio, req.user.username]);
    res.json(r.data);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/messages/:room', auth, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM messages WHERE room=$1 ORDER BY created_at ASC LIMIT 100', [req.params.room]);
    await pool.query('UPDATE messages SET read_by = array_append(read_by, $1) WHERE room=$2 AND NOT ($1 = ANY(read_by))', [req.user.username, req.params.room]).catch(()=>{});
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/lastmessages', auth, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT DISTINCT ON (room) room, from_user, text, type, created_at
      FROM messages ORDER BY room, created_at DESC
    `);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.put('/messages/:id', auth, async (req, res) => {
  const { text } = req.body;
  try {
    await pool.query('UPDATE messages SET text=$1, edited=true WHERE id=$2 AND from_user=$3', [text, req.params.id, req.user.username]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/messages/:id', auth, async (req, res) => {
  try {
    await pool.query('DELETE FROM messages WHERE id=$1 AND from_user=$2', [req.params.id, req.user.username]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/upload', auth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  try {
    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream({ folder: 'teleclone' }, (err, result) => {
        if (err) reject(err); else resolve(result);
      }).end(req.file.buffer);
    });
    res.json({ url: result.secure_url });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/groups', auth, async (req, res) => {
  const { name, icon, members } = req.body;
  try {
    const r = await pool.query('INSERT INTO groups (name,icon,created_by) VALUES ($1,$2,$3) RETURNING *', [name, icon||'👥', req.user.username]);
    const gid = r.rows[0].id;
    for (const m of [...new Set([...members, req.user.username])]) {
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
    await pool.query('UPDATE users SET online=true WHERE username=$1', [username]).catch(()=>{});
    io.emit('userOnline', username);
  });
  socket.on('join', (room) => socket.join(room));
  socket.on('message', async (data) => {
    try {
      const r = await pool.query(
        'INSERT INTO messages (room,from_user,text,type,reply_to,reply_text) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
        [data.room, data.from, data.text, data.type||'text', data.reply_to||null, data.reply_text||null]
      );
      data.dbId = r.rows[0].id;
    } catch(e) { console.log('msg error:', e.message); }
    io.to(data.room).emit('message', data);
  });
  socket.on('editMessage', async (data) => {
    await pool.query('UPDATE messages SET text=$1, edited=true WHERE id=$2 AND from_user=$3', [data.text, data.id, data.from]).catch(()=>{});
    io.to(data.room).emit('messageEdited', data);
  });
  socket.on('deleteMessage', async (data) => {
    await pool.query('DELETE FROM messages WHERE id=$1 AND from_user=$2', [data.id, data.from]).catch(()=>{});
    io.to(data.room).emit('messageDeleted', data.id);
  });
  socket.on('reaction', (data) => io.to(data.room).emit('reaction', data));
  socket.on('typing', (data) => socket.to(data.room).emit('typing', data));
  socket.on('disconnect', async () => {
    const username = Object.keys(onlineUsers).find(k => onlineUsers[k] === socket.id);
    if (username) {
      delete onlineUsers[username];
      await pool.query('UPDATE users SET online=false, last_seen=NOW() WHERE username=$1', [username]).catch(()=>{});
      io.emit('userOffline', username);
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log('Server on port', PORT));
