const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const app = express();
const port = Number(process.env.PORT || 3001);
const db = new Database(process.env.STUDENT_AI_DB_PATH || path.join(__dirname, 'app.db'));

app.use(cors({ origin: ['http://localhost:5173', 'http://127.0.0.1:5173', 'null'], credentials: true }));
app.use(express.json({ limit: '10mb' }));

function ensureDatabase() {
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      title TEXT,
      created_at TEXT,
      updated_at TEXT,
      payload TEXT
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      session_id TEXT,
      role TEXT,
      content TEXT,
      created_at TEXT,
      FOREIGN KEY(session_id) REFERENCES sessions(id)
    );

    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      title TEXT,
      body TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT,
      due_date TEXT,
      priority TEXT,
      done INTEGER,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      title TEXT,
      date TEXT,
      type TEXT,
      notes TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS academic_records (
      collection TEXT NOT NULL,
      id TEXT NOT NULL,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (collection, id)
    );
  `);

  const noteColumns = db.pragma('table_info(notes)');
  if (!noteColumns.some((column) => column.name === 'metadata')) {
    db.exec("ALTER TABLE notes ADD COLUMN metadata TEXT NOT NULL DEFAULT '{}'");
  }
  const eventColumns = db.pragma('table_info(events)');
  if (!eventColumns.some((column) => column.name === 'metadata')) {
    db.exec("ALTER TABLE events ADD COLUMN metadata TEXT NOT NULL DEFAULT '{}'");
  }
  const taskColumns = db.pragma('table_info(tasks)');
  if (!taskColumns.some((column) => column.name === 'metadata')) {
    db.exec("ALTER TABLE tasks ADD COLUMN metadata TEXT NOT NULL DEFAULT '{}'");
  }

  const sessionCount = db.prepare('SELECT COUNT(*) AS count FROM sessions').get();
  if (!sessionCount.count) {
    db.prepare(
      'INSERT INTO sessions (id, title, created_at, updated_at, payload) VALUES (?, ?, ?, ?, ?)',
    ).run(
      'default-session',
      'Study Session',
      new Date().toISOString(),
      new Date().toISOString(),
      JSON.stringify({}),
    );
  }

  const noteCount = db.prepare('SELECT COUNT(*) AS count FROM notes').get();
  if (!noteCount.count) {
    db.prepare('INSERT INTO notes (id, title, body, created_at) VALUES (?, ?, ?, ?)').run(
      'note-1',
      'Algorithms reminder',
      'Big-O: O(log n) for binary search, O(n log n) for mergesort and quicksort average.',
      new Date().toISOString(),
    );
  }

  const taskCount = db.prepare('SELECT COUNT(*) AS count FROM tasks').get();
  if (!taskCount.count) {
    db.prepare('INSERT INTO tasks (id, title, due_date, priority, done, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
      'task-1',
      'Review data structures assignment',
      new Date(Date.now() + 86400000).toISOString().slice(0, 10),
      'high',
      0,
      new Date().toISOString(),
    );
  }
}

function sanitizeBaseUrl(value) {
  if (!value) return 'https://api.openai.com/v1';
  return value.replace(/\/$/, '');
}

function parseStoredMetadata(value) {
  try {
    const parsed = JSON.parse(value || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function buildLocalReply(input) {
  const question = String(input || '').trim();
  if (!question) return 'Please ask a question.';

  const lower = question.toLowerCase();
  if (lower.includes('solve') || lower.includes('calculate') || /\b\d+\b.*[+\-*/]|=.*\d/.test(lower) || /x\^2|x\s*\+|x\s*-/.test(lower)) {
    const raw = question.replace(/solve|calculate|what is|equals|=|please/gi, '').replace(/\s+/g, '').replace(/x\^2/g, 'pow(x,2)');
    try {
      const expression = raw.includes('x') ? raw.replace(/x/g, '2') : raw;
      const result = require('mathjs').evaluate(expression);
      return `Result: ${String(result)}`;
    } catch {
      return 'I can solve straightforward math expressions or simple quadratic equations like x^2 - 5x + 6 = 0.';
    }
  }

  if (lower.includes('algorithm') || lower.includes('complexity')) {
    return 'A good study answer: time complexity explains how runtime scales with input size. For example, binary search is O(log n), while linear search is O(n).';
  }

  if (lower.includes('database') || lower.includes('sql')) {
    return 'A useful approach is to start with the data model, then identify primary keys, normalization, and joins. If you need, I can help you write SQL queries or explain relational design.';
  }

  if (lower.includes('os') || lower.includes('operating')) {
    return 'Operating systems manage processes, memory, files, and I/O. Core concepts include scheduling, synchronization, deadlocks, and virtual memory.';
  }

  if (lower.includes('network') || lower.includes('tcp') || lower.includes('http')) {
    return 'HTTP is an application-layer protocol, while TCP guarantees ordered delivery over connections. A common exam tip is to distinguish between reliability, ports, and packet flow.';
  }

  return `Here is a focused study response: ${question} is best understood by breaking it into concepts, examples, and trade-offs. If you want, I can turn this into a revision note, a diagram, or a practice quiz.`;
}

async function callOpenAICompatible({ provider, apiKey, baseUrl, model, prompt }) {
  if (!apiKey) return null;

  const normalizedProvider = provider || 'openai';
  const endpoint = sanitizeBaseUrl(baseUrl || 'https://api.openai.com/v1');

  if (normalizedProvider === 'claude') {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: model || 'claude-3-5-sonnet-latest',
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) throw new Error(`Claude error: ${response.status}`);
    const json = await response.json();
    const content = json?.content?.[0]?.text;
    return typeof content === 'string' ? content.trim() : null;
  }

  if (normalizedProvider === 'gemini') {
    const endpointUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model || 'gemini-1.5-flash'}:generateContent?key=${apiKey}`;
    const response = await fetch(endpointUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      }),
    });

    if (!response.ok) throw new Error(`Gemini error: ${response.status}`);
    const json = await response.json();
    const text = json?.candidates?.[0]?.content?.parts?.map((part) => part.text).join('');
    return typeof text === 'string' ? text.trim() : null;
  }

  const response = await fetch(`${endpoint}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a helpful university study assistant for computer science and student life.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
    }),
  });

  if (!response.ok) throw new Error(`OpenAI error: ${response.status}`);
  const json = await response.json();
  const text = json?.choices?.[0]?.message?.content;
  return typeof text === 'string' ? text.trim() : null;
}

async function generateAssistantReply({ provider, apiKey, baseUrl, model, prompt }) {
  if (provider && provider !== 'local') {
    try {
      const outbound = await callOpenAICompatible({ provider, apiKey, baseUrl, model, prompt });
      if (outbound && outbound.trim()) {
        return { content: outbound, source: provider };
      }
    } catch (error) {
      console.warn('Provider request failed, falling back to local assistance:', error.message);
    }
  }

  return { content: buildLocalReply(prompt), source: 'local' };
}

async function summarizeText({ provider, apiKey, baseUrl, model, text }) {
  const cleaned = String(text || '').trim();
  if (!cleaned) return 'Summary is unavailable for this text.';

  const prompt = `Summarize the following study or lecture text in 3 bullet points, highlight key concepts, and keep it concise.\n\n${cleaned}`;

  if (provider && provider !== 'local') {
    try {
      const reply = await callOpenAICompatible({ provider, apiKey, baseUrl, model, prompt });
      if (reply) return reply;
    } catch (error) {
      console.warn('Summary provider failed, using local summary:', error.message);
    }
  }

  const sentences = cleaned.split(/(?<=[.!?])\s+/).filter(Boolean);
  const top = sentences.slice(0, Math.min(3, sentences.length));
  if (top.length === 0) return 'Summary is unavailable for this text.';
  return top.join(' ');
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', provider: process.env.DEFAULT_PROVIDER || 'local' });
});

const entities = {
  notes: {
    table: 'notes',
    order: 'created_at DESC',
    columns: ['title', 'body', 'created_at', 'metadata'],
    fromRow: (row) => ({ id: row.id, title: row.title, body: row.body, createdAt: row.created_at, ...parseStoredMetadata(row.metadata) }),
    values: (item, existing) => {
      const metadata = parseStoredMetadata(existing?.metadata);
      return [
        String(item.title ?? existing?.title ?? '').trim(),
        String(item.body ?? existing?.body ?? '').trim(),
        item.createdAt ?? existing?.created_at ?? new Date().toISOString(),
        JSON.stringify({
          ...metadata,
          ...(item.folder !== undefined ? { folder: item.folder } : {}),
          ...(item.tags !== undefined ? { tags: item.tags } : {}),
          ...(item.favorite !== undefined ? { favorite: item.favorite } : {}),
          ...(item.pinned !== undefined ? { pinned: item.pinned } : {}),
          ...(item.subjectId !== undefined ? { subjectId: item.subjectId } : {}),
          ...(item.attachments !== undefined ? { attachments: item.attachments } : {}),
          ...(item.taskId !== undefined ? { taskId: item.taskId } : {}),
          ...(item.examId !== undefined ? { examId: item.examId } : {}),
        }),
      ];
    },
    valid: (values) => Boolean(values[0] && values[1]),
  },
  tasks: {
    table: 'tasks',
    order: 'due_date ASC',
    columns: ['title', 'due_date', 'priority', 'done', 'created_at', 'metadata'],
    fromRow: (row) => ({ id: row.id, title: row.title, dueDate: row.due_date, priority: row.priority, done: Boolean(row.done), createdAt: row.created_at, ...parseStoredMetadata(row.metadata) }),
    values: (item, existing) => {
      const metadata = parseStoredMetadata(existing?.metadata);
      return [
        String(item.title ?? existing?.title ?? '').trim(),
        item.dueDate ?? existing?.due_date ?? new Date().toISOString().slice(0, 10),
        item.priority ?? existing?.priority ?? 'medium',
        (item.done ?? Boolean(existing?.done)) ? 1 : 0,
        item.createdAt ?? existing?.created_at ?? new Date().toISOString(),
        JSON.stringify({ ...metadata, ...(item.subjectId !== undefined ? { subjectId: item.subjectId } : {}), ...(item.kind !== undefined ? { kind: item.kind } : {}) }),
      ];
    },
    valid: (values) => Boolean(values[0] && values[1]) && ['low', 'medium', 'high'].includes(values[2]),
  },
  events: {
    table: 'events',
    order: 'date ASC',
    columns: ['title', 'date', 'type', 'notes', 'created_at', 'metadata'],
    fromRow: (row) => ({ id: row.id, title: row.title, date: row.date, type: row.type, notes: row.notes, createdAt: row.created_at, ...parseStoredMetadata(row.metadata) }),
    values: (item, existing) => {
      const metadata = parseStoredMetadata(existing?.metadata);
      return [
        String(item.title ?? existing?.title ?? '').trim(),
        item.date ?? existing?.date ?? new Date().toISOString().slice(0, 10),
        item.type ?? existing?.type ?? 'study',
        String(item.notes ?? existing?.notes ?? ''),
        item.createdAt ?? existing?.created_at ?? new Date().toISOString(),
        JSON.stringify({
          ...metadata,
          ...(item.subjectId !== undefined ? { subjectId: item.subjectId } : {}),
          ...(item.startTime !== undefined ? { startTime: item.startTime } : {}),
          ...(item.durationMinutes !== undefined ? { durationMinutes: item.durationMinutes } : {}),
        }),
      ];
    },
    valid: (values) => Boolean(values[0] && values[1]) && ['class', 'assignment', 'study', 'personal', 'exam', 'quiz', 'deadline'].includes(values[2]),
  },
};

for (const [resource, entity] of Object.entries(entities)) {
  app.get(`/api/${resource}`, (req, res) => {
    const rows = db.prepare(`SELECT * FROM ${entity.table} ORDER BY ${entity.order}`).all();
    res.json(rows.map(entity.fromRow));
  });

  app.post(`/api/${resource}`, (req, res) => {
    const item = req.body || {};
    const id = String(item.id || `${resource.slice(0, -1)}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    const values = entity.values(item);
    if (!entity.valid(values)) {
      res.status(400).json({ error: 'Invalid item data.' });
      return;
    }

    try {
      const columns = ['id', ...entity.columns];
      const placeholders = columns.map(() => '?').join(', ');
      db.prepare(`INSERT INTO ${entity.table} (${columns.join(', ')}) VALUES (${placeholders})`).run(id, ...values);
      const row = db.prepare(`SELECT * FROM ${entity.table} WHERE id = ?`).get(id);
      res.status(201).json(entity.fromRow(row));
    } catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
        res.status(409).json({ error: 'An item with this id already exists.' });
        return;
      }
      res.status(500).json({ error: 'Could not create item.' });
    }
  });

  app.put(`/api/${resource}/:id`, (req, res) => {
    const existing = db.prepare(`SELECT * FROM ${entity.table} WHERE id = ?`).get(req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Item not found.' });
      return;
    }

    const values = entity.values(req.body || {}, existing);
    if (!entity.valid(values)) {
      res.status(400).json({ error: 'Invalid item data.' });
      return;
    }

    const assignments = entity.columns.map((column) => `${column} = ?`).join(', ');
    db.prepare(`UPDATE ${entity.table} SET ${assignments} WHERE id = ?`).run(...values, req.params.id);
    const row = db.prepare(`SELECT * FROM ${entity.table} WHERE id = ?`).get(req.params.id);
    res.json(entity.fromRow(row));
  });

  app.delete(`/api/${resource}/:id`, (req, res) => {
    const result = db.prepare(`DELETE FROM ${entity.table} WHERE id = ?`).run(req.params.id);
    if (!result.changes) {
      res.status(404).json({ error: 'Item not found.' });
      return;
    }
    res.status(204).end();
  });
}

const academicCollections = new Set([
  'subjects',
  'exams',
  'grades',
  'attendance',
  'studySessions',
  'snippets',
  'vaultItems',
]);

app.get('/api/academic/:collection', (req, res) => {
  const { collection } = req.params;
  if (!academicCollections.has(collection)) {
    res.status(404).json({ error: 'Academic collection not found.' });
    return;
  }

  const rows = db.prepare('SELECT payload FROM academic_records WHERE collection = ? ORDER BY updated_at DESC').all(collection);
  res.json(rows.flatMap((row) => {
    try {
      return [JSON.parse(row.payload)];
    } catch {
      return [];
    }
  }));
});

app.post('/api/academic/:collection', (req, res) => {
  const { collection } = req.params;
  const record = req.body;
  if (!academicCollections.has(collection)) {
    res.status(404).json({ error: 'Academic collection not found.' });
    return;
  }
  if (!record || typeof record !== 'object' || Array.isArray(record) || typeof record.id !== 'string' || !record.id.trim()) {
    res.status(400).json({ error: 'A record with an id is required.' });
    return;
  }

  const payload = JSON.stringify(record);
  if (Buffer.byteLength(payload, 'utf8') > 1024 * 1024) {
    res.status(413).json({ error: 'Academic record exceeds the 1 MB limit.' });
    return;
  }

  try {
    db.prepare('INSERT INTO academic_records (collection, id, payload, updated_at) VALUES (?, ?, ?, ?)')
      .run(collection, record.id, payload, new Date().toISOString());
    res.status(201).json(record);
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
      res.status(409).json({ error: 'An academic record with this id already exists.' });
      return;
    }
    res.status(500).json({ error: 'Could not create academic record.' });
  }
});

app.put('/api/academic/:collection/:id', (req, res) => {
  const { collection, id } = req.params;
  const record = req.body;
  if (!academicCollections.has(collection)) {
    res.status(404).json({ error: 'Academic collection not found.' });
    return;
  }
  if (!record || typeof record !== 'object' || Array.isArray(record) || record.id !== id) {
    res.status(400).json({ error: 'The record id must match the URL.' });
    return;
  }

  const payload = JSON.stringify(record);
  if (Buffer.byteLength(payload, 'utf8') > 1024 * 1024) {
    res.status(413).json({ error: 'Academic record exceeds the 1 MB limit.' });
    return;
  }

  const result = db.prepare('UPDATE academic_records SET payload = ?, updated_at = ? WHERE collection = ? AND id = ?')
    .run(payload, new Date().toISOString(), collection, id);
  if (!result.changes) {
    res.status(404).json({ error: 'Academic record not found.' });
    return;
  }
  res.json(record);
});

app.delete('/api/academic/:collection/:id', (req, res) => {
  const { collection, id } = req.params;
  if (!academicCollections.has(collection)) {
    res.status(404).json({ error: 'Academic collection not found.' });
    return;
  }

  const result = db.prepare('DELETE FROM academic_records WHERE collection = ? AND id = ?').run(collection, id);
  if (!result.changes) {
    res.status(404).json({ error: 'Academic record not found.' });
    return;
  }
  res.status(204).end();
});

app.post('/api/chat', async (req, res) => {
  const { message, provider, apiKey, baseUrl, model } = req.body || {};
  const reply = await generateAssistantReply({
    provider,
    apiKey: apiKey || process.env[`${String(provider || 'openai').toUpperCase()}_API_KEY`] || '',
    baseUrl: baseUrl || process.env.API_BASE_URL,
    model: model || process.env.DEFAULT_MODEL,
    prompt: message || '',
  });

  res.json({
    reply: reply.content,
    source: reply.source,
  });
});

app.post('/api/summarize', async (req, res) => {
  const { text, provider, apiKey, baseUrl, model } = req.body || {};
  const summary = await summarizeText({
    provider,
    apiKey: apiKey || process.env[`${String(provider || 'openai').toUpperCase()}_API_KEY`] || '',
    baseUrl: baseUrl || process.env.API_BASE_URL,
    model: model || process.env.DEFAULT_MODEL,
    text,
  });
  res.json({ summary });
});

app.get('/api/data', (req, res) => {
  const sessions = db.prepare('SELECT * FROM sessions ORDER BY created_at DESC').all();
  const notes = db.prepare('SELECT * FROM notes ORDER BY created_at DESC').all();
  const tasks = db.prepare('SELECT * FROM tasks ORDER BY created_at DESC').all();
  const events = db.prepare('SELECT * FROM events ORDER BY date ASC').all();
  res.json({ sessions, notes, tasks, events });
});

ensureDatabase();

function startServer(options = {}) {
  const listenPort = options.port ?? port;
  const host = options.host || '127.0.0.1';
  return new Promise((resolve, reject) => {
    const server = app.listen(listenPort, host, () => {
      console.log(`Student AI backend listening on http://${host}:${listenPort}`);
      resolve(server);
    });
    server.once('error', reject);
  });
}

if (require.main === module) {
  startServer({ host: process.env.HOST || '127.0.0.1' }).catch((error) => {
    console.error('Could not start Student AI backend:', error.message);
    process.exitCode = 1;
  });
}

module.exports = { startServer };
