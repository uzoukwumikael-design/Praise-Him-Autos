const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || (process.env.VERCEL ? '/tmp/pha-data' : path.join(__dirname, 'data'));
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'app.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS cars (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  make TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  year INTEGER,
  price INTEGER NOT NULL DEFAULT 0,
  condition TEXT NOT NULL DEFAULT 'Foreign Used',
  mileage INTEGER,
  transmission TEXT NOT NULL DEFAULT 'Automatic',
  fuel TEXT NOT NULL DEFAULT 'Petrol',
  color TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'available',
  featured INTEGER NOT NULL DEFAULT 0,
  images TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS fleet (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'SUV',
  seats INTEGER NOT NULL DEFAULT 4,
  daily_rate INTEGER NOT NULL DEFAULT 0,
  driver_rate INTEGER NOT NULL DEFAULT 0,
  description TEXT NOT NULL DEFAULT '',
  image TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS enquiries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  car_id INTEGER,
  fleet_id INTEGER,
  details TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'new',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_enq_status ON enquiries(status, created_at);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  salt TEXT NOT NULL,
  hash TEXT NOT NULL
);
`);

// ---------- password hashing (scrypt) ----------
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}
function verifyPassword(password, salt, hash) {
  const test = crypto.scryptSync(password, salt, 64);
  const real = Buffer.from(hash, 'hex');
  return test.length === real.length && crypto.timingSafeEqual(test, real);
}

// ---------- settings ----------
const DEFAULT_SETTINGS = {
  business_name: 'Praise Him Autos',
  tagline: 'Your Journey, Our Priority',
  hero_title: 'Buy, rent or be driven. Without the stories.',
  hero_sub: 'Clean foreign-used cars, pre-orders, car rentals and professional chauffeurs in Lagos and interstate. Inspect before you pay.',
  phone: '08084159280',
  whatsapp: '2348084159280',
  email: '',
  address: 'GRA Ikeja, Lagos',
  hours: 'Mon - Sat: 9:00am - 6:00pm',
  x_handle: 'PraiseHimAutos',
  instagram: '',
  about: 'Praise Him Autos sells clean foreign-used cars from GRA Ikeja, Lagos, and provides professional chauffeur service for airport pickups, business meetings, city trips and interstate journeys. Every car can be inspected before you pay. Bring your own mechanic.',
  map_query: 'GRA Ikeja Lagos'
};
const getSetting = db.prepare('SELECT value FROM settings WHERE key = ?');
const putSetting = db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
function allSettings() {
  const out = { ...DEFAULT_SETTINGS };
  for (const r of db.prepare('SELECT key, value FROM settings').all()) out[r.key] = r.value;
  return out;
}

// ---------- first-run seed ----------
function seed() {
  let created = null;
  if (!db.prepare('SELECT COUNT(*) AS n FROM users').get().n) {
    const username = process.env.ADMIN_USER || 'admin';
    const password = process.env.ADMIN_PASSWORD || crypto.randomBytes(9).toString('base64url');
    const { salt, hash } = hashPassword(password);
    db.prepare('INSERT INTO users(username,salt,hash) VALUES(?,?,?)').run(username, salt, hash);
    created = { username, password };
  }
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
    if (!getSetting.get(k)) putSetting.run(k, v);
  }
  if (!db.prepare('SELECT COUNT(*) AS n FROM cars').get().n && process.env.SEED_DEMO !== '0') {
    const ins = db.prepare(`INSERT INTO cars(title,make,model,year,price,condition,mileage,transmission,fuel,color,description,status,featured)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    // Highlander price is from their public post; the rest are SAMPLE listings to be replaced.
    ins.run('2013 Toyota Highlander Limited','Toyota','Highlander',2013,17500000,'Foreign Used',null,'Automatic','Petrol','Grey','Cleared from the port, ready to go. Clean grey exterior and light leather interior. Super clean, buy and drive. Bring your mechanic.','available',1);
    ins.run('2016 Toyota Avalon XLE Premium','Toyota','Avalon',2016,0,'Foreign Used',null,'Automatic','Petrol','Deep Blue','Deep blue with cream leather and wireless charging. Executive comfort without Lexus money. Drop your best offer or DM.','available',1);
    ins.run('2015 Lexus GX 460','Lexus','GX 460',2015,32000000,'Foreign Used',null,'Automatic','Petrol','Black','SAMPLE LISTING. Replace from the admin panel.','available',1);
    ins.run('2014 Toyota Camry SE','Toyota','Camry',2014,9800000,'Nigerian Used',null,'Automatic','Petrol','Silver','SAMPLE LISTING. Replace from the admin panel.','available',0);
    ins.run('2012 Honda CR-V EX','Honda','CR-V',2012,8500000,'Nigerian Used',null,'Automatic','Petrol','White','SAMPLE LISTING. Replace from the admin panel.','reserved',0);
    ins.run('2017 Mercedes-Benz GLE 350','Mercedes-Benz','GLE 350',2017,41000000,'Foreign Used',null,'Automatic','Petrol','White','SAMPLE LISTING. Replace from the admin panel.','available',0);
  }
  if (!db.prepare('SELECT COUNT(*) AS n FROM fleet').get().n && process.env.SEED_DEMO !== '0') {
    const f = db.prepare('INSERT INTO fleet(name,category,seats,daily_rate,driver_rate,description,sort) VALUES(?,?,?,?,?,?,?)');
    f.run('Toyota Camry','Sedan',4,0,0,'SAMPLE. Set real rates in the admin panel.',1);
    f.run('Toyota Highlander','SUV',6,0,0,'SAMPLE. Set real rates in the admin panel.',2);
    f.run('Lexus GX 460','Luxury SUV',6,0,0,'SAMPLE. Set real rates in the admin panel.',3);
  }
  return created;
}

module.exports = { db, hashPassword, verifyPassword, allSettings, putSetting, seed, DATA_DIR };
