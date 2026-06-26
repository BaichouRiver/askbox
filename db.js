const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function initDb() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS questions (
        id SERIAL PRIMARY KEY,
        text TEXT NOT NULL,
        name TEXT DEFAULT '匿名',
        time BIGINT NOT NULL,
        answer TEXT DEFAULT '',
        answered BOOLEAN DEFAULT false,
        public BOOLEAN DEFAULT false,
        ip TEXT DEFAULT '',
        likes JSONB DEFAULT '[]',
        featured BOOLEAN DEFAULT false,
        community_answers JSONB DEFAULT '[]',
        follow_ups JSONB DEFAULT '[]'
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      )
    `);

    // Insert default settings if not exists
    const defaultSettings = {
      name: 'Baichou',
      password: 'admin123',
      cardBg: 'lavender',
      cardCustomColor: '#F5E8FF',
      bgImage: null,
      cardBgImage: null
    };

    for (const [k, v] of Object.entries(defaultSettings)) {
      await client.query(
        `INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING`,
        [k, v]
      );
    }
  } finally {
    client.release();
  }
}

async function getQuestions() {
  const result = await pool.query('SELECT * FROM questions ORDER BY id DESC');
  return result.rows.map(q => ({
    id: q.id,
    text: q.text,
    name: q.name,
    time: parseInt(q.time),
    answer: q.answer,
    answered: q.answered,
    public: q.public,
    ip: q.ip,
    likes: q.likes || [],
    featured: q.featured,
    communityAnswers: q.community_answers || [],
    followUps: q.follow_ups || []
  }));
}

async function getPublicQuestions() {
  const result = await pool.query(
    'SELECT * FROM questions WHERE public = true ORDER BY id DESC LIMIT 50'
  );
  return result.rows.map(q => ({
    id: q.id,
    text: q.text,
    name: q.name,
    time: parseInt(q.time),
    answered: q.answered,
    answer: q.answered ? q.answer : undefined,
    likesCount: (q.likes || []).length,
    featured: q.featured,
    communityAnswers: (q.community_answers || []).slice(-5).reverse(),
    followUps: (q.follow_ups || []).filter(f => f.answered).map(f => ({
      text: f.text,
      name: f.name,
      time: f.time,
      answer: f.answer
    }))
  }));
}

async function addQuestion(text, name, isPublic, ip) {
  const result = await pool.query(
    `INSERT INTO questions (text, name, time, public, ip) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [text, name || '匿名', Date.now(), isPublic === true, ip]
  );
  const q = result.rows[0];
  return {
    id: q.id,
    text: q.text,
    name: q.name,
    time: parseInt(q.time),
    answer: q.answer,
    answered: q.answered,
    public: q.public,
    ip: q.ip,
    likes: [],
    featured: false,
    communityAnswers: [],
    followUps: []
  };
}

async function getQuestionById(id) {
  const result = await pool.query('SELECT * FROM questions WHERE id = $1', [id]);
  if (result.rows.length === 0) return null;
  const q = result.rows[0];
  return {
    id: q.id,
    text: q.text,
    name: q.name,
    time: parseInt(q.time),
    answer: q.answer,
    answered: q.answered,
    public: q.public,
    ip: q.ip,
    likes: q.likes || [],
    featured: q.featured,
    communityAnswers: q.community_answers || [],
    followUps: q.follow_ups || []
  };
}

async function updateQuestion(id, updates) {
  const sets = [];
  const values = [];
  let idx = 1;

  for (const [key, value] of Object.entries(updates)) {
    const dbKey = key === 'communityAnswers' ? 'community_answers' :
                  key === 'followUps' ? 'follow_ups' : key;
    sets.push(`${dbKey} = $${idx}`);
    values.push(value);
    idx++;
  }

  values.push(id);
  await pool.query(
    `UPDATE questions SET ${sets.join(', ')} WHERE id = $${idx}`,
    values
  );
}

async function deleteQuestion(id) {
  await pool.query('DELETE FROM questions WHERE id = $1', [id]);
}

async function getSettings() {
  const result = await pool.query('SELECT * FROM settings');
  const settings = {};
  for (const row of result.rows) {
    settings[row.key] = row.value;
  }
  return settings;
}

async function updateSetting(key, value) {
  await pool.query(
    `INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2`,
    [key, value]
  );
}

module.exports = {
  initDb,
  getQuestions,
  getPublicQuestions,
  addQuestion,
  getQuestionById,
  updateQuestion,
  deleteQuestion,
  getSettings,
  updateSetting,
  pool
};
