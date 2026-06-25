const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'db.json');
const DATA_DIR = path.join(__dirname, 'data');

// ===== Middleware =====
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ===== Data Layer =====
const SEED_FILE = path.join(__dirname, 'db.seed.json');

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    // Try seed file first (for Railway Volume first-deploy scenario)
    if (fs.existsSync(SEED_FILE)) {
      fs.copyFileSync(SEED_FILE, DATA_FILE);
      console.log('📄 Copied seed data to data/db.json');
    } else {
      fs.writeFileSync(DATA_FILE, JSON.stringify({
        questions: [],
        nextId: 1,
        name: 'Baichou',
        password: 'admin123',
        cardBg: 'lavender',
        cardCustomColor: '#F5E8FF',
      }, null, 2));
    }
  }
}

function readData() {
  ensureDataFile();
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch {
    return { questions: [], nextId: 1, name: 'Baichou', password: 'admin123', cardBg: 'lavender', cardCustomColor: '#F5E8FF' };
  }
}

function writeData(data) {
  ensureDataFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// ===== API Routes =====

// Public: Submit a question
app.post('/api/questions', (req, res) => {
  const { text, name, isPublic } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: '请输入问题内容' });

  const data = readData();
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
  const question = {
    id: data.nextId++,
    text: text.trim(),
    name: (name || '').trim() || '匿名',
    time: Date.now(),
    answer: '',
    answered: false,
    public: isPublic === true,
    ip: ip.split(',')[0].trim(),
    communityAnswers: [],
    followUps: [],
  };
  data.questions.unshift(question);
  writeData(data);
  res.json({ success: true, question });
});

// Public: Get ONLY public questions
app.get('/api/questions/public', (req, res) => {
  const data = readData();
  const list = data.questions
    .filter(q => q.public)
    .slice(0, 50)
    .map(q => ({
      id: q.id,
      text: q.text,
      name: q.name,
      time: q.time,
      answered: q.answered,
      answer: q.answered ? q.answer : undefined,
      communityAnswers: (q.communityAnswers || []).slice(-5).reverse(),
      followUps: (q.followUps || []).filter(f => f.answered).map(f => ({
        text: f.text,
        name: f.name,
        time: f.time,
        answer: f.answer,
      })),
    }));
  res.json({ questions: list });
});

// Public: Add a community answer to a public question
app.post('/api/questions/:id/community-answer', (req, res) => {
  const { text, name } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: '请输入内容' });

  const data = readData();
  const id = parseInt(req.params.id);
  const q = data.questions.find(q => q.id === id);
  if (!q) return res.status(404).json({ error: '问题不存在' });
  if (!q.public) return res.status(403).json({ error: '该问题未公开' });

  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
  if (!q.communityAnswers) q.communityAnswers = [];
  q.communityAnswers.push({
    text: text.trim(),
    name: (name || '').trim() || '匿名',
    time: Date.now(),
    ip: ip.split(',')[0].trim(),
  });
  writeData(data);
  res.json({ success: true });
});

// Public: Add a follow-up question to an answered question
app.post('/api/questions/:id/followup', (req, res) => {
  const { text, name } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: '请输入追问内容' });

  const data = readData();
  const id = parseInt(req.params.id);
  const q = data.questions.find(q => q.id === id);
  if (!q) return res.status(404).json({ error: '问题不存在' });
  if (!q.public) return res.status(403).json({ error: '该问题未公开' });
  if (!q.answered) return res.status(400).json({ error: '该问题还未回答，暂时不能追问' });

  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
  if (!q.followUps) q.followUps = [];
  q.followUps.push({
    id: (q.followUps.length + 1),
    text: text.trim(),
    name: (name || '').trim() || '匿名',
    time: Date.now(),
    answer: '',
    answered: false,
    ip: ip.split(',')[0].trim(),
  });
  writeData(data);
  res.json({ success: true });
});

// Admin: Answer a follow-up question
app.post('/api/admin/questions/:id/followup/:fid/answer', (req, res) => {
  const token = req.headers['admin-token'];
  const data = readData();
  if (token !== data.password) return res.status(401).json({ error: '未授权' });

  const id = parseInt(req.params.id);
  const fid = parseInt(req.params.fid);
  const q = data.questions.find(q => q.id === id);
  if (!q) return res.status(404).json({ error: '问题不存在' });

  const fu = (q.followUps || []).find(f => f.id === fid);
  if (!fu) return res.status(404).json({ error: '追问不存在' });

  const { answer } = req.body;
  if (!answer || !answer.trim()) return res.status(400).json({ error: '请输入回答' });

  fu.answer = answer.trim();
  fu.answered = true;
  writeData(data);
  res.json({ success: true });
});

// Admin: Get all questions (requires admin token)
app.get('/api/admin/questions', (req, res) => {
  const token = req.headers['admin-token'];
  const data = readData();
  if (token !== data.password) return res.status(401).json({ error: '密码错误' });

  res.json({
    questions: data.questions,
    name: data.name,
    cardBg: data.cardBg,
    cardCustomColor: data.cardCustomColor,
  });
});

// Admin: Login
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  const data = readData();
  if (password === data.password) {
    res.json({ success: true, name: data.name });
  } else {
    res.status(401).json({ error: '密码错误' });
  }
});

// Admin: Answer a question
app.post('/api/admin/questions/:id/answer', (req, res) => {
  const token = req.headers['admin-token'];
  const data = readData();
  if (token !== data.password) return res.status(401).json({ error: '未授权' });

  const id = parseInt(req.params.id);
  const q = data.questions.find(q => q.id === id);
  if (!q) return res.status(404).json({ error: '问题不存在' });

  const { answer } = req.body;
  if (!answer || !answer.trim()) return res.status(400).json({ error: '请输入回答' });

  q.answer = answer.trim();
  q.answered = true;
  writeData(data);
  res.json({ success: true, question: q });
});

// Admin: Toggle question visibility
app.post('/api/admin/questions/:id/toggle-visibility', (req, res) => {
  const token = req.headers['admin-token'];
  const data = readData();
  if (token !== data.password) return res.status(401).json({ error: '未授权' });

  const id = parseInt(req.params.id);
  const q = data.questions.find(q => q.id === id);
  if (!q) return res.status(404).json({ error: '问题不存在' });

  q.public = !q.public;
  writeData(data);
  res.json({ success: true, public: q.public });
});

// Admin: Delete a question
app.delete('/api/admin/questions/:id', (req, res) => {
  const token = req.headers['admin-token'];
  const data = readData();
  if (token !== data.password) return res.status(401).json({ error: '未授权' });

  const id = parseInt(req.params.id);
  data.questions = data.questions.filter(q => q.id !== id);
  writeData(data);
  res.json({ success: true });
});

// Admin: Update settings
app.put('/api/admin/settings', (req, res) => {
  const token = req.headers['admin-token'];
  const data = readData();
  if (token !== data.password) return res.status(401).json({ error: '未授权' });

  const { name, password, oldPassword, cardBg, cardCustomColor } = req.body;

  // If changing password, require old password verification
  if (password && password !== data.password) {
    if (!oldPassword || oldPassword !== data.password) {
      return res.status(403).json({ error: '旧密码错误，修改密码失败' });
    }
    data.password = password;
  }

  if (name) data.name = name;
  if (cardBg) data.cardBg = cardBg;
  if (cardCustomColor) data.cardCustomColor = cardCustomColor;
  writeData(data);
  res.json({ success: true });
});

// Admin: Get settings (public-safe data)
app.get('/api/settings', (req, res) => {
  const data = readData();
  res.json({ name: data.name, cardBg: data.cardBg, cardCustomColor: data.cardCustomColor });
});

// ===== Start Server =====
app.listen(PORT, '0.0.0.0', () => {
  console.log(`========================================`);
  console.log(`  📦 提问箱已启动`);
  console.log(`  🌐 本地访问: http://localhost:${PORT}`);
  console.log(`  🌍 局域网访问: http://你的IP:${PORT}`);
  console.log(`  🔐 管理后台密码: admin123`);
  console.log(`  💡 按 Ctrl+C 停止`);
  console.log(`========================================`);
});
