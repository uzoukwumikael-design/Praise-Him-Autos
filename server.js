const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { db, hashPassword, verifyPassword, allSettings, putSetting, seed, DATA_DIR } = require('./db');

const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ---------- secrets / first-run ----------
const secretFile = path.join(DATA_DIR, 'secret.key');
if (!fs.existsSync(secretFile)) fs.writeFileSync(secretFile, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
const SECRET = fs.readFileSync(secretFile, 'utf8');
const created = seed();
if (created && !process.env.ADMIN_PASSWORD) {
  fs.writeFileSync(path.join(DATA_DIR, 'FIRST_LOGIN.txt'), `username: ${created.username}\npassword: ${created.password}\n(change it in Admin > Settings, then delete this file)\n`, { mode: 0o600 });
  console.log(`\n  First-run admin login -> ${created.username} / ${created.password}\n  (also saved in data/FIRST_LOGIN.txt)\n`);
}

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-src https://www.google.com; connect-src 'self'; base-uri 'self'; form-action 'self'"
  });
  next();
});
app.use(express.json({ limit: '100kb' }));

// ---------- helpers ----------
const s = (v, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const n = (v, d = 0) => { const x = parseInt(v, 10); return Number.isFinite(x) ? x : d; };
const bool = (v) => (v === true || v === 1 || v === '1' || v === 'true' ? 1 : 0);

const hits = new Map();
function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
  if (arr.length >= max) { hits.set(key, arr); return false; }
  arr.push(now); hits.set(key, arr); return true;
}
setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (!v.some((t) => now - t < 3600e3)) hits.delete(k); }, 600e3).unref();

// ---------- sessions (signed cookie) ----------
const sign = (payload) => crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
function makeToken(user) {
  const p = Buffer.from(JSON.stringify({ u: user.id, n: user.username, exp: Date.now() + 12 * 3600e3 })).toString('base64url');
  return `${p}.${sign(p)}`;
}
function readToken(tok) {
  if (!tok || !tok.includes('.')) return null;
  const [p, sig] = tok.split('.');
  const good = sign(p);
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
  try { const d = JSON.parse(Buffer.from(p, 'base64url').toString()); return d.exp > Date.now() ? d : null; } catch { return null; }
}
function cookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) { const i = part.indexOf('='); if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); }
  return out;
}
function requireAdmin(req, res, next) {
  const d = readToken(cookies(req).pha_session);
  if (!d) return res.status(401).json({ error: 'Not signed in' });
  req.user = d; next();
}
const cookieFlags = (req) => `HttpOnly; SameSite=Strict; Path=/; ${req.secure ? 'Secure; ' : ''}`;

// ---------- row mappers ----------
const carOut = (r) => r && ({ ...r, featured: !!r.featured, images: JSON.parse(r.images || '[]') });
const enqOut = (r) => ({ ...r, details: JSON.parse(r.details || '{}') });

// =====================================================
// PUBLIC API
// =====================================================
app.get('/api/settings', (req, res) => {
  const { business_name, tagline, hero_title, hero_sub, phone, whatsapp, email, address, hours, x_handle, instagram, about, map_query } = allSettings();
  res.json({ business_name, tagline, hero_title, hero_sub, phone, whatsapp, email, address, hours, x_handle, instagram, about, map_query });
});

app.get('/api/cars', (req, res) => {
  const where = ["status != 'hidden'"]; const args = [];
  const q = s(req.query.q, 60);
  if (q) { where.push('(title LIKE ? OR make LIKE ? OR model LIKE ? OR color LIKE ?)'); args.push(...Array(4).fill(`%${q}%`)); }
  if (s(req.query.make, 40)) { where.push('make = ?'); args.push(s(req.query.make, 40)); }
  if (s(req.query.condition, 20)) { where.push('condition = ?'); args.push(s(req.query.condition, 20)); }
  if (n(req.query.min)) { where.push('price >= ?'); args.push(n(req.query.min)); }
  if (n(req.query.max)) { where.push('price > 0 AND price <= ?'); args.push(n(req.query.max)); }
  const order = { newest: 'id DESC', price_asc: 'price = 0, price ASC', price_desc: 'price DESC', year_desc: 'year DESC' }[req.query.sort] || "featured DESC, status = 'sold', id DESC";
  const rows = db.prepare(`SELECT * FROM cars WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT 200`).all(...args);
  const makes = db.prepare("SELECT DISTINCT make FROM cars WHERE status != 'hidden' AND make != '' ORDER BY make").all().map((r) => r.make);
  res.json({ cars: rows.map(carOut), makes });
});
app.get('/api/cars/:id', (req, res) => {
  const r = db.prepare("SELECT * FROM cars WHERE id = ? AND status != 'hidden'").get(n(req.params.id));
  if (!r) return res.status(404).json({ error: 'Not found' });
  res.json(carOut(r));
});
app.get('/api/fleet', (req, res) => {
  res.json(db.prepare('SELECT * FROM fleet WHERE active = 1 ORDER BY sort, id').all());
});

const ENQ_TYPES = ['car', 'rental', 'chauffeur', 'preorder', 'general'];
app.post('/api/enquiries', (req, res) => {
  const b = req.body || {};
  if (b.website) return res.json({ ok: true }); // honeypot
  if (!rateLimit('enq:' + req.ip, 6, 10 * 60e3)) return res.status(429).json({ error: 'Too many requests. Please try again shortly.' });
  const type = ENQ_TYPES.includes(b.type) ? b.type : 'general';
  const name = s(b.name, 80); const phone = s(b.phone, 25);
  if (!name) return res.status(400).json({ error: 'Please enter your name.' });
  if (phone.replace(/\D/g, '').length < 7) return res.status(400).json({ error: 'Please enter a valid phone number.' });
  const email = s(b.email, 120);
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'Please enter a valid email.' });
  const details = {};
  if (b.details && typeof b.details === 'object') for (const [k, v] of Object.entries(b.details).slice(0, 15)) details[s(k, 40)] = s(String(v), 200);
  const carId = n(b.car_id) || null; const fleetId = n(b.fleet_id) || null;
  const info = db.prepare('INSERT INTO enquiries(type,name,phone,email,message,car_id,fleet_id,details) VALUES(?,?,?,?,?,?,?,?)')
    .run(type, name, phone, email, s(b.message, 1500), carId, fleetId, JSON.stringify(details));
  res.status(201).json({ ok: true, id: Number(info.lastInsertRowid) });
});

// =====================================================
// ADMIN API
// =====================================================
app.post('/api/admin/login', (req, res) => {
  if (!rateLimit('login:' + req.ip, 10, 15 * 60e3)) return res.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.' });
  const u = db.prepare('SELECT * FROM users WHERE username = ?').get(s(req.body?.username, 60));
  const ok = u && verifyPassword(String(req.body?.password || ''), u.salt, u.hash);
  if (!ok) return res.status(401).json({ error: 'Wrong username or password' });
  res.set('Set-Cookie', `pha_session=${makeToken(u)}; Max-Age=${12 * 3600}; ${cookieFlags(req)}`);
  res.json({ ok: true, username: u.username });
});
app.post('/api/admin/logout', (req, res) => {
  res.set('Set-Cookie', `pha_session=; Max-Age=0; ${cookieFlags(req)}`);
  res.json({ ok: true });
});
app.get('/api/admin/me', requireAdmin, (req, res) => res.json({ username: req.user.n }));

app.post('/api/admin/password', requireAdmin, (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.u);
  if (!u || !verifyPassword(String(req.body?.current || ''), u.salt, u.hash)) return res.status(400).json({ error: 'Current password is wrong' });
  const np = String(req.body?.next || '');
  if (np.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters' });
  const { salt, hash } = hashPassword(np);
  db.prepare('UPDATE users SET salt=?, hash=? WHERE id=?').run(salt, hash, u.id);
  const f = path.join(DATA_DIR, 'FIRST_LOGIN.txt'); if (fs.existsSync(f)) fs.unlinkSync(f);
  res.json({ ok: true });
});

app.get('/api/admin/stats', requireAdmin, (req, res) => {
  const one = (sql, ...a) => db.prepare(sql).get(...a).n;
  res.json({
    cars_total: one('SELECT COUNT(*) n FROM cars'),
    cars_available: one("SELECT COUNT(*) n FROM cars WHERE status='available'"),
    cars_sold: one("SELECT COUNT(*) n FROM cars WHERE status='sold'"),
    enquiries_new: one("SELECT COUNT(*) n FROM enquiries WHERE status='new'"),
    enquiries_week: one("SELECT COUNT(*) n FROM enquiries WHERE created_at >= datetime('now','-7 days')"),
    by_type: db.prepare("SELECT type, COUNT(*) n FROM enquiries WHERE created_at >= datetime('now','-30 days') GROUP BY type").all(),
    recent: db.prepare('SELECT * FROM enquiries ORDER BY id DESC LIMIT 6').all().map(enqOut)
  });
});

// --- uploads ---
const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, crypto.randomBytes(12).toString('hex') + EXT[file.mimetype])
  }),
  limits: { fileSize: 6 * 1024 * 1024, files: 12 },
  fileFilter: (req, file, cb) => cb(EXT[file.mimetype] ? null : new Error('Only JPG, PNG or WebP images are allowed'), !!EXT[file.mimetype])
});
app.post('/api/admin/upload', requireAdmin, (req, res) => {
  upload.array('images', 12)(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    res.json({ urls: (req.files || []).map((f) => '/uploads/' + f.filename) });
  });
});
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d', index: false, dotfiles: 'deny' }));

// --- cars ---
const CONDITIONS = ['Foreign Used', 'Nigerian Used', 'Brand New'];
const STATUSES = ['available', 'reserved', 'sold', 'hidden'];
function carFields(b) {
  const images = (Array.isArray(b.images) ? b.images : []).filter((u) => typeof u === 'string' && /^\/uploads\/[a-f0-9]+\.(jpg|png|webp)$/.test(u)).slice(0, 12);
  const title = s(b.title, 120);
  if (!title) throw new Error('Title is required');
  return [title, s(b.make, 40), s(b.model, 40), n(b.year) || null, Math.max(0, n(b.price)), CONDITIONS.includes(b.condition) ? b.condition : 'Foreign Used',
    b.mileage === '' || b.mileage == null ? null : n(b.mileage), s(b.transmission, 20) || 'Automatic', s(b.fuel, 20) || 'Petrol', s(b.color, 30),
    s(b.description, 3000), STATUSES.includes(b.status) ? b.status : 'available', bool(b.featured), JSON.stringify(images)];
}
app.get('/api/admin/cars', requireAdmin, (req, res) => res.json(db.prepare('SELECT * FROM cars ORDER BY id DESC').all().map(carOut)));
app.post('/api/admin/cars', requireAdmin, (req, res) => {
  try {
    const info = db.prepare(`INSERT INTO cars(title,make,model,year,price,condition,mileage,transmission,fuel,color,description,status,featured,images) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(...carFields(req.body || {}));
    res.status(201).json(carOut(db.prepare('SELECT * FROM cars WHERE id=?').get(Number(info.lastInsertRowid))));
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.put('/api/admin/cars/:id', requireAdmin, (req, res) => {
  try {
    const id = n(req.params.id);
    if (!db.prepare('SELECT 1 FROM cars WHERE id=?').get(id)) return res.status(404).json({ error: 'Not found' });
    db.prepare(`UPDATE cars SET title=?,make=?,model=?,year=?,price=?,condition=?,mileage=?,transmission=?,fuel=?,color=?,description=?,status=?,featured=?,images=?,updated_at=datetime('now') WHERE id=?`).run(...carFields(req.body || {}), id);
    res.json(carOut(db.prepare('SELECT * FROM cars WHERE id=?').get(id)));
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.patch('/api/admin/cars/:id/status', requireAdmin, (req, res) => {
  if (!STATUSES.includes(req.body?.status)) return res.status(400).json({ error: 'Bad status' });
  db.prepare("UPDATE cars SET status=?, updated_at=datetime('now') WHERE id=?").run(req.body.status, n(req.params.id));
  res.json({ ok: true });
});
app.delete('/api/admin/cars/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM cars WHERE id=?').run(n(req.params.id));
  res.json({ ok: true });
});

// --- fleet ---
function fleetFields(b) {
  const name = s(b.name, 80); if (!name) throw new Error('Name is required');
  const image = typeof b.image === 'string' && /^\/uploads\/[a-f0-9]+\.(jpg|png|webp)$/.test(b.image) ? b.image : '';
  return [name, s(b.category, 30) || 'SUV', n(b.seats, 4), Math.max(0, n(b.daily_rate)), Math.max(0, n(b.driver_rate)), s(b.description, 500), image, b.active === false ? 0 : 1, n(b.sort)];
}
app.get('/api/admin/fleet', requireAdmin, (req, res) => res.json(db.prepare('SELECT * FROM fleet ORDER BY sort, id').all()));
app.post('/api/admin/fleet', requireAdmin, (req, res) => {
  try {
    const info = db.prepare('INSERT INTO fleet(name,category,seats,daily_rate,driver_rate,description,image,active,sort) VALUES(?,?,?,?,?,?,?,?,?)').run(...fleetFields(req.body || {}));
    res.status(201).json(db.prepare('SELECT * FROM fleet WHERE id=?').get(Number(info.lastInsertRowid)));
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.put('/api/admin/fleet/:id', requireAdmin, (req, res) => {
  try {
    const id = n(req.params.id);
    db.prepare('UPDATE fleet SET name=?,category=?,seats=?,daily_rate=?,driver_rate=?,description=?,image=?,active=?,sort=? WHERE id=?').run(...fleetFields(req.body || {}), id);
    res.json(db.prepare('SELECT * FROM fleet WHERE id=?').get(id));
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.delete('/api/admin/fleet/:id', requireAdmin, (req, res) => { db.prepare('DELETE FROM fleet WHERE id=?').run(n(req.params.id)); res.json({ ok: true }); });

// --- enquiries ---
app.get('/api/admin/enquiries', requireAdmin, (req, res) => {
  const where = []; const args = [];
  if (ENQ_TYPES.includes(req.query.type)) { where.push('e.type=?'); args.push(req.query.type); }
  if (['new', 'contacted', 'closed'].includes(req.query.status)) { where.push('e.status=?'); args.push(req.query.status); }
  const rows = db.prepare(`SELECT e.*, c.title AS car_title, f.name AS fleet_name FROM enquiries e LEFT JOIN cars c ON c.id=e.car_id LEFT JOIN fleet f ON f.id=e.fleet_id ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY e.id DESC LIMIT 500`).all(...args);
  res.json(rows.map(enqOut));
});
app.patch('/api/admin/enquiries/:id', requireAdmin, (req, res) => {
  const id = n(req.params.id);
  if (['new', 'contacted', 'closed'].includes(req.body?.status)) db.prepare('UPDATE enquiries SET status=? WHERE id=?').run(req.body.status, id);
  if (typeof req.body?.notes === 'string') db.prepare('UPDATE enquiries SET notes=? WHERE id=?').run(s(req.body.notes, 1500), id);
  res.json({ ok: true });
});
app.delete('/api/admin/enquiries/:id', requireAdmin, (req, res) => { db.prepare('DELETE FROM enquiries WHERE id=?').run(n(req.params.id)); res.json({ ok: true }); });
app.get('/api/admin/enquiries.csv', requireAdmin, (req, res) => {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""').replace(/^([=+\-@])/, "'$1")}"`;
  const rows = db.prepare('SELECT * FROM enquiries ORDER BY id DESC').all();
  const csv = ['id,date,type,status,name,phone,email,message,details'].concat(rows.map((r) => [r.id, r.created_at, r.type, r.status, r.name, r.phone, r.email, r.message, r.details].map(q).join(','))).join('\n');
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="enquiries.csv"' }).send(csv);
});

// --- settings ---
const SETTING_KEYS = Object.keys(allSettings());
app.get('/api/admin/settings', requireAdmin, (req, res) => res.json(allSettings()));
app.put('/api/admin/settings', requireAdmin, (req, res) => {
  for (const k of SETTING_KEYS) if (typeof req.body?.[k] === 'string') putSetting.run(k, s(req.body[k], 1500));
  res.json(allSettings());
});

// =====================================================
// STATIC
// =====================================================
app.use('/admin', express.static(path.join(__dirname, 'admin'), { index: 'index.html' }));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
app.use((req, res) => res.status(404).sendFile(path.join(__dirname, 'public', 'index.html')));
app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: 'Server error' }); });

if (require.main === module) app.listen(PORT, () => console.log(`Praise Him Autos running on http://localhost:${PORT}  (admin: /admin)`));
module.exports = app;
