const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const DATA_FILE = path.join(ROOT, 'data.json');
const PUBLIC_DIR = path.join(ROOT, 'public');
const sseClients = new Set();

function now() { return new Date().toISOString(); }
function toInt(value, fallback = 0) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? n : fallback;
}
function clamp(value, min, max = Number.MAX_SAFE_INTEGER) {
  return Math.min(max, Math.max(min, toInt(value, min)));
}
function slugify(text) {
  return String(text || 'general')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 48) || 'general';
}
function escId(id) { return String(id || '').trim(); }
function randomId(prefix = 'id') { return `${prefix}-${crypto.randomBytes(4).toString('hex')}`; }

function defaultCategory(name = 'General') {
  const clean = String(name || 'General').trim() || 'General';
  return {
    id: slugify(clean),
    name: clean,
    title: clean.toUpperCase(),
    boxColor: '#06008f',
    textColor: '#ffffff',
    titleColor: '#ffffff',
    numberColor: '#ffffff'
  };
}
function defaultData() {
  return {
    settings: { title: 'METAS DEL DIRECTO', pointsPerEuro: 100, unassignedBits: 0 },
    categories: [defaultCategory('General')],
    goals: [],
    transactions: []
  };
}
function normalizeHex(value, fallback) {
  const v = String(value || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v;
  return fallback;
}
function normalizeCategories(rawCategories = [], rawGoals = []) {
  const byId = new Map();
  function add(cat) {
    let obj;
    if (typeof cat === 'string') obj = defaultCategory(cat);
    else if (cat && typeof cat === 'object') {
      const name = String(cat.name || cat.id || 'General').trim() || 'General';
      obj = {
        id: slugify(cat.id || name),
        name,
        title: String(cat.title || name.toUpperCase()).trim() || name.toUpperCase(),
        boxColor: normalizeHex(cat.boxColor, '#06008f'),
        textColor: normalizeHex(cat.textColor, '#ffffff'),
        titleColor: normalizeHex(cat.titleColor, '#ffffff'),
        numberColor: normalizeHex(cat.numberColor, '#ffffff')
      };
    } else return;
    if (!byId.has(obj.id)) byId.set(obj.id, obj);
  }
  add(defaultCategory('General'));
  if (Array.isArray(rawCategories)) rawCategories.forEach(add);
  if (Array.isArray(rawGoals)) rawGoals.forEach(g => add(g.categoryName || g.category || g.categoryId || 'General'));
  return Array.from(byId.values());
}
function categoryIdFrom(data, value) {
  const text = String(value || 'General').trim() || 'General';
  const slug = slugify(text);
  const cats = data.categories || [];
  const found = cats.find(c => c.id === slug || slugify(c.name) === slug);
  return found ? found.id : slug;
}
function ensureCategory(data, value) {
  data.categories = normalizeCategories(data.categories, data.goals);
  const text = String(value || 'General').trim() || 'General';
  const wanted = slugify(text);
  let found = data.categories.find(c => c.id === wanted || slugify(c.name) === wanted);
  if (!found) {
    found = defaultCategory(text);
    found.id = wanted;
    data.categories.push(found);
  }
  return found;
}
function uniqueGoalId(base, goals) {
  const used = new Set(goals.map(g => g.id));
  let id = slugify(base || 'meta');
  let i = 2;
  while (used.has(id)) id = `${slugify(base || 'meta')}-${i++}`;
  return id;
}
function normalizeGoal(goal, dataForCats = null) {
  const out = { ...(goal || {}) };
  out.id = String(out.id || randomId('goal'));
  out.name = String(out.name || 'Meta sin nombre').trim() || 'Meta sin nombre';
  if (dataForCats) out.categoryId = categoryIdFrom(dataForCats, out.categoryId || out.category || out.categoryName || 'General');
  else out.categoryId = slugify(out.categoryId || out.category || out.categoryName || 'General');
  out.visible = out.visible !== false;
  out.createdAt = out.createdAt || now();
  out.completed = out.completed === true;

  if (out.type === 'chapters') {
    out.type = 'chapters';
    out.bitsPerChapter = clamp(out.bitsPerChapter, 1);
    out.totalChapters = clamp(out.totalChapters, 1);
    // Importante: NO se limita a totalChapters. Así puede verse 3/2 si pagan de más.
    out.completedChapters = clamp(out.completedChapters, 0);
    out.currentBits = clamp(out.currentBits, 0, out.bitsPerChapter - 1);
    return out;
  }

  out.type = 'normal';
  out.targetBits = clamp(out.targetBits ?? out.target ?? 2000, 1);
  out.currentBits = clamp(out.currentBits ?? Math.max(0, out.targetBits - (out.remaining ?? out.targetBits)), 0, out.targetBits);
  if (out.currentBits >= out.targetBits) out.completed = true;
  return out;
}
function normalizeData(raw) {
  const base = defaultData();
  const data = {
    settings: { ...base.settings, ...(raw?.settings || {}) },
    categories: normalizeCategories(raw?.categories, raw?.goals),
    goals: [],
    transactions: Array.isArray(raw?.transactions) ? raw.transactions.slice(-700) : []
  };
  data.settings.pointsPerEuro = clamp(data.settings.pointsPerEuro || 100, 1);
  data.settings.unassignedBits = clamp(data.settings.unassignedBits || 0, 0);
  data.goals = Array.isArray(raw?.goals) ? raw.goals.map(g => normalizeGoal(g, data)) : [];
  data.categories = normalizeCategories(data.categories, data.goals);
  return data;
}
function readData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      const d = defaultData();
      writeData(d);
      return d;
    }
    return normalizeData(JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')));
  } catch (err) {
    console.error('Error leyendo data.json:', err);
    return defaultData();
  }
}
function writeData(data) {
  const normalized = normalizeData(data);
  const tmp = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(normalized, null, 2), 'utf8');
  fs.renameSync(tmp, DATA_FILE);
}
function catName(data, id) {
  return (data.categories.find(c => c.id === id) || defaultCategory(id)).name;
}
function goalSnapshot(goal) {
  if (!goal) return null;
  if (goal.type === 'chapters') {
    return {
      type: 'chapters',
      completedChapters: goal.completedChapters,
      totalChapters: goal.totalChapters,
      currentBits: goal.currentBits,
      bitsPerChapter: goal.bitsPerChapter,
      completed: goal.completed
    };
  }
  return {
    type: 'normal',
    currentBits: goal.currentBits,
    targetBits: goal.targetBits,
    remainingBits: Math.max(0, goal.targetBits - goal.currentBits),
    completed: goal.completed
  };
}
function totalChapterBits(goal) {
  return goal.completedChapters * goal.bitsPerChapter + goal.currentBits;
}
function setChapterTotalBits(goal, totalBits) {
  const total = clamp(totalBits, 0);
  goal.completedChapters = Math.floor(total / goal.bitsPerChapter);
  goal.currentBits = total % goal.bitsPerChapter;
  // No se marca completado automáticamente aunque pase del objetivo; así puede mostrar 3/2.
}
function goalRemaining(goal) {
  if (goal.type === 'chapters') return Number.MAX_SAFE_INTEGER;
  return Math.max(0, goal.targetBits - goal.currentBits);
}
function applyBits(goal, bits) {
  const safe = clamp(bits, 1);
  const before = goalSnapshot(goal);
  let applied = safe;
  let overflow = 0;
  let completedNow = 0;

  if (goal.type === 'chapters') {
    const beforeChapters = goal.completedChapters;
    setChapterTotalBits(goal, totalChapterBits(goal) + safe);
    completedNow = Math.max(0, goal.completedChapters - beforeChapters);
    // Puede pasar de totalChapters. No hay overflow en capítulos.
  } else {
    const rem = goalRemaining(goal);
    applied = Math.min(safe, rem);
    overflow = safe - applied;
    goal.currentBits = clamp(goal.currentBits + applied, 0, goal.targetBits);
    goal.completed = goal.currentBits >= goal.targetBits;
  }
  return { before, after: goalSnapshot(goal), bits: applied, requestedBits: safe, overflowBits: overflow, completedNow };
}
function removeBits(goal, bits) {
  const safe = clamp(bits, 1);
  const before = goalSnapshot(goal);
  if (goal.type === 'chapters') {
    setChapterTotalBits(goal, totalChapterBits(goal) - safe);
  } else {
    goal.currentBits = clamp(goal.currentBits - safe, 0, goal.targetBits);
    goal.completed = false;
  }
  return { before, after: goalSnapshot(goal), bits: safe, requestedBits: safe, overflowBits: 0, completedNow: 0 };
}
function addTransaction(data, tx) {
  data.transactions.push({ id: crypto.randomUUID(), createdAt: now(), ...tx });
  if (data.transactions.length > 700) data.transactions = data.transactions.slice(-700);
}
function publicData(data) {
  const d = normalizeData(data);
  const catsById = new Map(d.categories.map(c => [c.id, c]));
  return {
    settings: d.settings,
    categories: d.categories,
    goals: d.goals.map(g => ({
      ...g,
      categoryName: (catsById.get(g.categoryId) || defaultCategory(g.categoryId)).name,
      remainingBits: g.type === 'normal' ? Math.max(0, g.targetBits - g.currentBits) : undefined,
      nextChapterRemaining: g.type === 'chapters' ? Math.max(0, g.bitsPerChapter - g.currentBits) : undefined,
      totalChapterBits: g.type === 'chapters' ? totalChapterBits(g) : undefined
    })),
    transactions: d.transactions.slice(-100).reverse()
  };
}
function findGoal(data, id) { return data.goals.find(g => g.id === id); }
function findCategory(data, id) { return data.categories.find(c => c.id === id || slugify(c.name) === id); }

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-store' });
  res.end(body);
}
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
      if (body.length > 1_000_000) { reject(new Error('Body demasiado grande')); req.destroy(); }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try { resolve(JSON.parse(body)); } catch { reject(new Error('JSON inválido')); }
    });
  });
}
function broadcast() {
  const payload = `event: update\ndata: ${JSON.stringify(publicData(readData()))}\n\n`;
  for (const res of sseClients) {
    try { res.write(payload); } catch { sseClients.delete(res); }
  }
}
function contentType(file) {
  const ext = path.extname(file).toLowerCase();
  return {
    '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml; charset=utf-8',
    '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff', '.woff2': 'font/woff2'
  }[ext] || 'application/octet-stream';
}
function serveStatic(res, rel) {
  const filePath = path.resolve(PUBLIC_DIR, rel);
  if (!filePath.startsWith(PUBLIC_DIR)) return sendJson(res, 403, { error: 'Prohibido' });
  fs.readFile(filePath, (err, data) => {
    if (err) return sendJson(res, 404, { error: 'No encontrado.' });
    res.writeHead(200, { 'Content-Type': contentType(filePath), 'Cache-Control': 'no-store' });
    res.end(data);
  });
}
function patchGoal(goal, body, data) {
  const before = goalSnapshot(goal);
  if (typeof body.name === 'string') goal.name = body.name.trim() || goal.name;
  if (typeof body.categoryId === 'string') goal.categoryId = ensureCategory(data, body.categoryId).id;
  if (typeof body.category === 'string') goal.categoryId = ensureCategory(data, body.category).id;
  if (typeof body.visible === 'boolean') goal.visible = body.visible;

  if (goal.type === 'chapters') {
    const preserveTotalBits = body.preserveTotalBits !== false;
    const oldTotalBits = totalChapterBits(goal);
    if (body.bitsPerChapter !== undefined) goal.bitsPerChapter = clamp(body.bitsPerChapter, 1);
    if (body.totalChapters !== undefined) goal.totalChapters = clamp(body.totalChapters, 1);
    if (preserveTotalBits && (body.bitsPerChapter !== undefined || body.totalChapters !== undefined)) setChapterTotalBits(goal, oldTotalBits);
    if (body.completedChapters !== undefined) goal.completedChapters = clamp(body.completedChapters, 0);
    if (body.currentBits !== undefined) goal.currentBits = clamp(body.currentBits, 0, goal.bitsPerChapter - 1);
    if (typeof body.completed === 'boolean') goal.completed = body.completed;
  } else {
    if (body.targetBits !== undefined) goal.targetBits = clamp(body.targetBits, 1);
    if (body.currentBits !== undefined) goal.currentBits = clamp(body.currentBits, 0, goal.targetBits);
    if (typeof body.completed === 'boolean') goal.completed = body.completed;
    if (goal.currentBits >= goal.targetBits) goal.completed = true;
    if (!goal.completed && goal.currentBits >= goal.targetBits) goal.currentBits = Math.max(0, goal.targetBits - 1);
  }
  const after = goalSnapshot(goal);
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    addTransaction(data, { goalId: goal.id, goalName: goal.name, goalType: goal.type, source: 'admin', label: 'ajuste manual', rawAmount: null, bits: 0, before, after, completedNow: 0 });
  }
}

async function handleApi(req, res, pathname) {
  if (req.method === 'GET' && pathname === '/api/state') return sendJson(res, 200, publicData(readData()));
  if (req.method === 'GET' && pathname === '/api/export') return sendJson(res, 200, readData());
  if (req.method === 'GET' && pathname === '/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'Connection': 'keep-alive', 'Access-Control-Allow-Origin': '*' });
    res.write(`event: update\ndata: ${JSON.stringify(publicData(readData()))}\n\n`);
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
    return;
  }

  if (req.method === 'POST' && pathname === '/api/categories') {
    const body = await parseBody(req);
    const name = String(body.name || '').trim();
    if (!name) return sendJson(res, 400, { error: 'Pon un nombre a la categoría.' });
    const data = readData();
    const cat = ensureCategory(data, name);
    if (typeof body.title === 'string') cat.title = body.title.trim() || cat.title;
    if (body.boxColor) cat.boxColor = normalizeHex(body.boxColor, cat.boxColor);
    if (body.textColor) cat.textColor = normalizeHex(body.textColor, cat.textColor);
    if (body.titleColor) cat.titleColor = normalizeHex(body.titleColor, cat.titleColor);
    if (body.numberColor) cat.numberColor = normalizeHex(body.numberColor, cat.numberColor);
    writeData(data); broadcast();
    return sendJson(res, 201, { ok: true, category: cat });
  }
  const catMatch = pathname.match(/^\/api\/categories\/([^/]+)$/);
  if (catMatch && req.method === 'PATCH') {
    const data = readData();
    const id = decodeURIComponent(catMatch[1]);
    let cat = findCategory(data, id);
    if (!cat) return sendJson(res, 404, { error: 'Categoría no encontrada.' });
    const oldId = cat.id;
    const body = await parseBody(req);
    if (typeof body.name === 'string') {
      const name = body.name.trim() || cat.name;
      cat.name = name;
      const newId = slugify(name);
      if (newId !== oldId && !data.categories.some(c => c.id === newId)) {
        cat.id = newId;
        data.goals.forEach(g => { if (g.categoryId === oldId) g.categoryId = newId; });
      }
    }
    if (typeof body.title === 'string') cat.title = body.title.trim() || cat.title;
    if (body.boxColor) cat.boxColor = normalizeHex(body.boxColor, cat.boxColor);
    if (body.textColor) cat.textColor = normalizeHex(body.textColor, cat.textColor);
    if (body.titleColor) cat.titleColor = normalizeHex(body.titleColor, cat.titleColor);
    if (body.numberColor) cat.numberColor = normalizeHex(body.numberColor, cat.numberColor);
    writeData(data); broadcast();
    return sendJson(res, 200, { ok: true, category: cat });
  }

  if (req.method === 'POST' && pathname === '/api/goals') {
    const body = await parseBody(req);
    const name = String(body.name || '').trim();
    if (!name) return sendJson(res, 400, { error: 'Pon un nombre a la meta.' });
    const data = readData();
    const cat = ensureCategory(data, body.categoryId || body.category || 'General');
    const type = body.type === 'chapters' ? 'chapters' : 'normal';
    const goal = normalizeGoal({
      id: uniqueGoalId(name, data.goals), type, name, categoryId: cat.id, visible: true, completed: false, createdAt: now(),
      targetBits: clamp(body.targetBits || 2000, 1), currentBits: 0,
      bitsPerChapter: clamp(body.bitsPerChapter || 2500, 1), totalChapters: clamp(body.totalChapters || 5, 1), completedChapters: 0
    }, data);
    data.goals.push(goal);
    addTransaction(data, { goalId: goal.id, goalName: goal.name, goalType: goal.type, source: 'admin', label: 'meta creada', rawAmount: null, bits: 0, before: null, after: goalSnapshot(goal), completedNow: 0 });
    writeData(data); broadcast();
    return sendJson(res, 201, { ok: true, goal });
  }

  const goalMatch = pathname.match(/^\/api\/goals\/([^/]+)$/);
  if (goalMatch && req.method === 'PATCH') {
    const data = readData();
    const goal = findGoal(data, decodeURIComponent(goalMatch[1]));
    if (!goal) return sendJson(res, 404, { error: 'Meta no encontrada.' });
    patchGoal(goal, await parseBody(req), data);
    writeData(data); broadcast();
    return sendJson(res, 200, { ok: true, goal });
  }
  if (goalMatch && req.method === 'DELETE') {
    const data = readData();
    const id = decodeURIComponent(goalMatch[1]);
    const before = data.goals.length;
    data.goals = data.goals.filter(g => g.id !== id);
    if (before === data.goals.length) return sendJson(res, 404, { error: 'Meta no encontrada.' });
    writeData(data); broadcast();
    return sendJson(res, 200, { ok: true });
  }

  const actionMatch = pathname.match(/^\/api\/goals\/([^/]+)\/(contribute|undo|reset)$/);
  if (actionMatch && req.method === 'POST') {
    const data = readData();
    const goal = findGoal(data, decodeURIComponent(actionMatch[1]));
    if (!goal) return sendJson(res, 404, { error: 'Meta no encontrada.' });
    const action = actionMatch[2];
    const body = await parseBody(req);
    let result;
    if (action === 'reset') {
      const before = goalSnapshot(goal);
      if (goal.type === 'chapters') { goal.completedChapters = 0; goal.currentBits = 0; goal.completed = false; }
      else { goal.currentBits = 0; goal.completed = false; }
      result = { before, after: goalSnapshot(goal), bits: 0, requestedBits: 0, overflowBits: 0, completedNow: 0 };
    } else if (action === 'undo') result = removeBits(goal, body.bits || 1);
    else result = applyBits(goal, body.bits || 1);
    if (result.overflowBits > 0) data.settings.unassignedBits = clamp((data.settings.unassignedBits || 0) + result.overflowBits, 0);
    addTransaction(data, { goalId: goal.id, goalName: goal.name, goalType: goal.type, source: body.source || 'admin', label: body.label || (action === 'undo' ? `quitar ${result.bits} Bits` : action === 'reset' ? 'reset' : `añadir ${result.requestedBits} Bits`), rawAmount: body.rawAmount ?? null, bits: result.bits, overflowBits: result.overflowBits, before: result.before, after: result.after, completedNow: result.completedNow });
    writeData(data); broadcast();
    return sendJson(res, 200, { ok: true, goal, ...result, unassignedBits: data.settings.unassignedBits });
  }

  if (req.method === 'POST' && pathname === '/api/pending/apply') {
    const body = await parseBody(req);
    const data = readData();
    const bits = clamp(body.bits, 1);
    if (bits > (data.settings.unassignedBits || 0)) return sendJson(res, 400, { error: 'No hay tantos Bits en el bote.' });
    const goal = findGoal(data, String(body.goalId || ''));
    if (!goal) return sendJson(res, 404, { error: 'Elige una meta.' });
    const result = applyBits(goal, bits);
    data.settings.unassignedBits -= bits;
    if (result.overflowBits > 0) data.settings.unassignedBits += result.overflowBits;
    addTransaction(data, { goalId: goal.id, goalName: goal.name, goalType: goal.type, source: 'admin', label: `reparto desde bote: ${bits} Bits`, rawAmount: bits, bits: result.bits, overflowBits: result.overflowBits, before: result.before, after: result.after, completedNow: result.completedNow });
    writeData(data); broadcast();
    return sendJson(res, 200, { ok: true, goal, ...result, unassignedBits: data.settings.unassignedBits });
  }

  if (req.method === 'POST' && pathname === '/api/mock/bits') {
    const body = await parseBody(req);
    const data = readData();
    const goal = findGoal(data, String(body.goalId || ''));
    if (!goal) return sendJson(res, 404, { error: 'Elige una meta.' });
    const bits = clamp(body.bits, 1);
    const result = applyBits(goal, bits);
    if (result.overflowBits > 0) data.settings.unassignedBits = clamp((data.settings.unassignedBits || 0) + result.overflowBits, 0);
    addTransaction(data, { goalId: goal.id, goalName: goal.name, goalType: goal.type, source: 'bits-simulados', label: `${bits} Bits simulados`, rawAmount: bits, bits: result.bits, overflowBits: result.overflowBits, before: result.before, after: result.after, completedNow: result.completedNow });
    writeData(data); broadcast();
    return sendJson(res, 200, { ok: true, goal, ...result, unassignedBits: data.settings.unassignedBits });
  }

  if (req.method === 'POST' && pathname === '/api/mock/paypal-split') {
    const body = await parseBody(req);
    const eurosTotal = Number(body.eurosTotal || 0);
    if (!eurosTotal || eurosTotal <= 0) return sendJson(res, 400, { error: 'Pon una cantidad total válida.' });
    const allocations = Array.isArray(body.allocations) ? body.allocations : [];
    const data = readData();
    const ppe = data.settings.pointsPerEuro || 100;
    const totalBits = Math.floor(eurosTotal * ppe);
    let allocatedBits = 0;
    const clean = [];
    for (const item of allocations) {
      const goal = findGoal(data, String(item.goalId || ''));
      const euros = Number(item.euros || 0);
      if (!goal || !euros || euros <= 0) continue;
      const bits = Math.floor(euros * ppe);
      clean.push({ goal, euros, bits });
      allocatedBits += bits;
    }
    if (allocatedBits > totalBits) return sendJson(res, 400, { error: 'Has repartido más dinero del total.' });
    const results = [];
    for (const item of clean) {
      const result = applyBits(item.goal, item.bits);
      if (result.overflowBits > 0) data.settings.unassignedBits = clamp((data.settings.unassignedBits || 0) + result.overflowBits, 0);
      addTransaction(data, { goalId: item.goal.id, goalName: item.goal.name, goalType: item.goal.type, source: 'paypal-simulado', label: `${item.euros.toFixed(2)} € simulados repartidos`, rawAmount: item.euros, bits: result.bits, overflowBits: result.overflowBits, before: result.before, after: result.after, completedNow: result.completedNow });
      results.push({ goalId: item.goal.id, bits: result.bits, overflowBits: result.overflowBits, completedNow: result.completedNow });
    }
    const leftoverBits = totalBits - allocatedBits;
    if (leftoverBits > 0) {
      data.settings.unassignedBits = clamp((data.settings.unassignedBits || 0) + leftoverBits, 0);
      addTransaction(data, { goalId: null, goalName: 'Bote sin repartir', goalType: 'pending', source: 'paypal-simulado', label: `${(leftoverBits / ppe).toFixed(2)} € simulados sin repartir`, rawAmount: leftoverBits / ppe, bits: leftoverBits, before: null, after: { type: 'pending', currentBits: data.settings.unassignedBits }, completedNow: 0 });
    }
    writeData(data); broadcast();
    return sendJson(res, 200, { ok: true, totalBits, allocatedBits, leftoverBits, results, unassignedBits: data.settings.unassignedBits });
  }

  return sendJson(res, 404, { error: 'API no encontrada.' });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = decodeURI(url.pathname);
    if (pathname === '/api/state' || pathname === '/api/export' || pathname === '/events' || pathname.startsWith('/api/')) return await handleApi(req, res, pathname);
    if (pathname === '/' || pathname === '/admin') return serveStatic(res, 'admin.html');
    if (pathname === '/donar') return serveStatic(res, 'donar.html');
    if (pathname === '/bits') return serveStatic(res, 'bits.html');
    if (pathname === '/overlay' || pathname.startsWith('/overlay/')) return serveStatic(res, 'overlay.html');
    if (pathname.startsWith('/fonts/')) return serveStatic(res, pathname.slice(1));
    if (pathname === '/styles.css') return serveStatic(res, 'styles.css');
    if (pathname === '/app.js') return serveStatic(res, 'app.js');
    return sendJson(res, 404, { error: 'No encontrado.' });
  } catch (err) {
    console.error(err);
    return sendJson(res, 500, { error: err.message || 'Error interno.' });
  }
});

server.listen(PORT, () => {
  console.log('===========================================');
  console.log(`Metas OBS iniciado en http://localhost:${PORT}`);
  console.log(`Panel:   http://localhost:${PORT}/admin`);
  console.log(`PayPal:  http://localhost:${PORT}/donar`);
  console.log(`Bits:    http://localhost:${PORT}/bits`);
  console.log(`OBS:     http://localhost:${PORT}/overlay`);
  console.log('No cierres esta ventana mientras esté en OBS.');
  console.log('===========================================');
});
