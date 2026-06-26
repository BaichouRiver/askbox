const express = require('express');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

const UPLOAD_DIR = path.join(__dirname, 'data', 'uploads');

// ===== Middleware =====
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname)));
app.use('/uploads', express.static(UPLOAD_DIR));

// Trust proxy so req.ip works correctly
app.set('trust proxy', 1);

// ===== Init DB =====
let dbReady = false;
db.initDb().then(() => {
  dbReady = true;
  console.log('✅ Database initialized');
}).catch(err => {
  console.error('❌ Database init failed:', err.message);
});

function ensureUploadDir() {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
}
ensureUploadDir();

// ===== API Routes =====

// Public: Submit a question
app.post('/api/questions', async (req, res) => {
  if (!dbReady) return res.status(503).json({ error: '数据库初始化中，请稍后再试' });

  const { text, name, isPublic } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: '请输入问题内容' });

  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();

  try {
    const question = await db.addQuestion(text.trim(), (name || '').trim() || '匿名', isPublic === true, ip);
    res.json({ success: true, question });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '保存失败' });
  }
});

// Public: Get ONLY public questions
app.get('/api/questions/public', async (req, res) => {
  if (!dbReady) return res.status(503).json({ error: '数据库初始化中' });

  try {
    const list = await db.getPublicQuestions();
    res.json({ questions: list });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '读取失败' });
  }
});

// Public: Add a community answer to a public question
app.post('/api/questions/:id/community-answer', async (req, res) => {
  if (!dbReady) return res.status(503).json({ error: '数据库初始化中' });

  const { text, name } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: '请输入内容' });

  try {
    const q = await db.getQuestionById(parseInt(req.params.id));
    if (!q) return res.status(404).json({ error: '问题不存在' });
    if (!q.public) return res.status(403).json({ error: '该问题未公开' });

    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    const answers = q.communityAnswers || [];
    answers.push({
      text: text.trim(),
      name: (name || '').trim() || '匿名',
      time: Date.now(),
      ip
    });

    await db.updateQuestion(q.id, { communityAnswers: answers });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '保存失败' });
  }
});

// Public: Add a follow-up question to an answered question
app.post('/api/questions/:id/followup', async (req, res) => {
  if (!dbReady) return res.status(503).json({ error: '数据库初始化中' });

  const { text, name } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: '请输入追问内容' });

  try {
    const q = await db.getQuestionById(parseInt(req.params.id));
    if (!q) return res.status(404).json({ error: '问题不存在' });
    if (!q.public) return res.status(403).json({ error: '该问题未公开' });
    if (!q.answered) return res.status(400).json({ error: '该问题还未回答，暂时不能追问' });

    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    const originalIp = (q.ip || '').split(',')[0].trim();
    if (ip !== originalIp) {
      return res.status(403).json({ error: '只有提问者才能追问该问题' });
    }

    const followUps = q.followUps || [];
    followUps.push({
      id: followUps.length + 1,
      text: text.trim(),
      name: (name || '').trim() || '匿名',
      time: Date.now(),
      answer: '',
      answered: false,
      ip
    });

    await db.updateQuestion(q.id, { followUps });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '保存失败' });
  }
});

// Public: Like/unlike a question (IP-based)
app.post('/api/questions/:id/like', async (req, res) => {
  if (!dbReady) return res.status(503).json({ error: '数据库初始化中' });

  try {
    const q = await db.getQuestionById(parseInt(req.params.id));
    if (!q) return res.status(404).json({ error: '问题不存在' });
    if (!q.public) return res.status(403).json({ error: '该问题未公开' });

    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    const likes = q.likes || [];
    const idx = likes.indexOf(ip);

    if (idx >= 0) {
      likes.splice(idx, 1);
      await db.updateQuestion(q.id, { likes });
      res.json({ success: true, liked: false, likesCount: likes.length });
    } else {
      likes.push(ip);
      await db.updateQuestion(q.id, { likes });
      res.json({ success: true, liked: true, likesCount: likes.length });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '保存失败' });
  }
});

// Admin: Get all questions
app.get('/api/admin/questions', async (req, res) => {
  if (!dbReady) return res.status(503).json({ error: '数据库初始化中' });

  const token = req.headers['admin-token'];
  const settings = await db.getSettings();
  if (token !== settings.password) return res.status(401).json({ error: '密码错误' });

  try {
    const questions = await db.getQuestions();
    res.json({
      questions,
      name: settings.name,
      cardBg: settings.cardBg,
      cardCustomColor: settings.cardCustomColor,
      bgImage: settings.bgImage || null,
      cardBgImage: settings.cardBgImage || null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '读取失败' });
  }
});

// Admin: Login
app.post('/api/admin/login', async (req, res) => {
  if (!dbReady) return res.status(503).json({ error: '数据库初始化中' });

  const { password } = req.body;
  const settings = await db.getSettings();
  if (password === settings.password) {
    res.json({ success: true, name: settings.name });
  } else {
    res.status(401).json({ error: '密码错误' });
  }
});

// Admin: Answer a question
app.post('/api/admin/questions/:id/answer', async (req, res) => {
  if (!dbReady) return res.status(503).json({ error: '数据库初始化中' });

  const token = req.headers['admin-token'];
  const settings = await db.getSettings();
  if (token !== settings.password) return res.status(401).json({ error: '未授权' });

  const { answer } = req.body;
  if (!answer || !answer.trim()) return res.status(400).json({ error: '请输入回答' });

  try {
    const q = await db.getQuestionById(parseInt(req.params.id));
    if (!q) return res.status(404).json({ error: '问题不存在' });

    await db.updateQuestion(q.id, { answer: answer.trim(), answered: true });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '保存失败' });
  }
});

// Admin: Answer a follow-up question
app.post('/api/admin/questions/:id/followup/:fid/answer', async (req, res) => {
  if (!dbReady) return res.status(503).json({ error: '数据库初始化中' });

  const token = req.headers['admin-token'];
  const settings = await db.getSettings();
  if (token !== settings.password) return res.status(401).json({ error: '未授权' });

  const { answer } = req.body;
  if (!answer || !answer.trim()) return res.status(400).json({ error: '请输入回答' });

  try {
    const q = await db.getQuestionById(parseInt(req.params.id));
    if (!q) return res.status(404).json({ error: '问题不存在' });

    const fu = (q.followUps || []).find(f => f.id === parseInt(req.params.fid));
    if (!fu) return res.status(404).json({ error: '追问不存在' });

    fu.answer = answer.trim();
    fu.answered = true;

    await db.updateQuestion(q.id, { followUps: q.followUps });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '保存失败' });
  }
});

// Admin: Toggle question visibility
app.post('/api/admin/questions/:id/toggle-visibility', async (req, res) => {
  if (!dbReady) return res.status(503).json({ error: '数据库初始化中' });

  const token = req.headers['admin-token'];
  const settings = await db.getSettings();
  if (token !== settings.password) return res.status(401).json({ error: '未授权' });

  try {
    const q = await db.getQuestionById(parseInt(req.params.id));
    if (!q) return res.status(404).json({ error: '问题不存在' });

    await db.updateQuestion(q.id, { public: !q.public });
    res.json({ success: true, public: !q.public });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '保存失败' });
  }
});

// Admin: Delete a question
app.delete('/api/admin/questions/:id', async (req, res) => {
  if (!dbReady) return res.status(503).json({ error: '数据库初始化中' });

  const token = req.headers['admin-token'];
  const settings = await db.getSettings();
  if (token !== settings.password) return res.status(401).json({ error: '未授权' });

  try {
    await db.deleteQuestion(parseInt(req.params.id));
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '删除失败' });
  }
});

// Admin: Toggle featured status
app.post('/api/admin/questions/:id/toggle-featured', async (req, res) => {
  if (!dbReady) return res.status(503).json({ error: '数据库初始化中' });

  const token = req.headers['admin-token'];
  const settings = await db.getSettings();
  if (token !== settings.password) return res.status(401).json({ error: '未授权' });

  try {
    const q = await db.getQuestionById(parseInt(req.params.id));
    if (!q) return res.status(404).json({ error: '问题不存在' });

    await db.updateQuestion(q.id, { featured: !q.featured });
    res.json({ success: true, featured: !q.featured });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '保存失败' });
  }
});

// Admin: Upload a background image
app.post('/api/admin/upload', (req, res) => {
  const token = req.headers['admin-token'];
  db.getSettings().then(settings => {
    if (token !== settings.password) return res.status(401).json({ error: '未授权' });

    const { image, type } = req.body;
    if (!image || !type) return res.status(400).json({ error: '缺少图片数据' });

    const matches = image.match(/^data:image\/(jpeg|png|gif|webp);base64,(.+)$/i);
    if (!matches) return res.status(400).json({ error: '图片格式不支持，请使用 jpg/png/gif/webp' });

    const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
    const base64Data = matches[2];
    const filename = 'bg_' + type + '_' + Date.now() + '.' + ext;
    const filepath = path.join(UPLOAD_DIR, filename);

    fs.writeFileSync(filepath, Buffer.from(base64Data, 'base64'));

    const url = '/uploads/' + filename;
    db.updateSetting(type + 'Image', url).then(() => {
      res.json({ success: true, url });
    });
  });
});

// Admin: Update settings
app.put('/api/admin/settings', async (req, res) => {
  if (!dbReady) return res.status(503).json({ error: '数据库初始化中' });

  const token = req.headers['admin-token'];
  const settings = await db.getSettings();
  if (token !== settings.password) return res.status(401).json({ error: '未授权' });

  const { name, password, oldPassword, cardBg, cardCustomColor } = req.body;

  if (password && password !== settings.password) {
    if (!oldPassword || oldPassword !== settings.password) {
      return res.status(403).json({ error: '旧密码错误，修改密码失败' });
    }
    await db.updateSetting('password', password);
  }

  if (name) await db.updateSetting('name', name);
  if (cardBg) await db.updateSetting('cardBg', cardBg);
  if (cardCustomColor) await db.updateSetting('cardCustomColor', cardCustomColor);

  const updated = await db.getSettings();
  res.json({ success: true, bgImage: updated.bgImage || null, cardBgImage: updated.cardBgImage || null });
});

// Public: Get settings
app.get('/api/settings', async (req, res) => {
  if (!dbReady) return res.status(503).json({ error: '数据库初始化中' });

  try {
    const settings = await db.getSettings();
    res.json({
      name: settings.name,
      cardBg: settings.cardBg,
      cardCustomColor: settings.cardCustomColor,
      bgImage: settings.bgImage || null,
      cardBgImage: settings.cardBgImage || null
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '读取失败' });
  }
});

// ===== Start Server =====
app.listen(PORT, () => {
  console.log(`========================================`);
  console.log(`  📦 提问箱已启动`);
  console.log(`  🌐 本地访问: http://localhost:${PORT}`);
  console.log(`  🔐 管理后台密码: admin123`);
  console.log(`  💡 按 Ctrl+C 停止`);
  console.log(`========================================`);
});
