// End-to-end API test against a throwaway database.
process.env.DATA_DIR = require('fs').mkdtempSync(require('os').tmpdir() + '/pha-');
process.env.ADMIN_USER = 'admin';
process.env.ADMIN_PASSWORD = 'test-pass-123';
const assert = require('assert');
const app = require('./server');

const srv = app.listen(0, async () => {
  const base = `http://127.0.0.1:${srv.address().port}`;
  let cookie = '';
  const call = async (path, method = 'GET', body) => {
    const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', cookie }, body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    return { status: r.status, json: await r.json().catch(() => null) };
  };
  const ok = (name) => console.log('  ✓', name);
  try {
    let r = await call('/api/cars'); assert.equal(r.status, 200); assert(r.json.cars.length >= 5); ok('public car list');
    r = await call('/api/cars?q=highlander'); assert.equal(r.json.cars.length, 1); ok('search');
    r = await call('/api/admin/cars'); assert.equal(r.status, 401); ok('admin blocked without login');
    r = await call('/api/admin/login', 'POST', { username: 'admin', password: 'wrong' }); assert.equal(r.status, 401); ok('bad password rejected');
    r = await call('/api/admin/login', 'POST', { username: 'admin', password: 'test-pass-123' }); assert.equal(r.status, 200); ok('login');
    r = await call('/api/admin/cars', 'POST', { title: 'Test Car', price: 5000000, status: 'available' }); assert.equal(r.status, 201); const id = r.json.id; ok('create car');
    r = await call('/api/admin/cars/' + id + '/status', 'PATCH', { status: 'hidden' });
    r = await call('/api/cars/' + id); assert.equal(r.status, 404); ok('hidden car not public');
    r = await call('/api/enquiries', 'POST', { type: 'chauffeur', name: 'Ada', phone: '08012345678', details: { pickup: 'MMIA' } }); assert.equal(r.status, 201); ok('chauffeur booking saved');
    r = await call('/api/enquiries', 'POST', { type: 'car', name: '', phone: '1' }); assert.equal(r.status, 400); ok('validation');
    r = await call('/api/admin/enquiries'); assert.equal(r.json.length, 1); assert.equal(r.json[0].details.pickup, 'MMIA'); ok('admin sees enquiry');
    r = await call('/api/admin/stats'); assert.equal(r.json.enquiries_new, 1); ok('stats');
    r = await call('/api/admin/password', 'POST', { current: 'test-pass-123', next: 'new-pass-456' }); assert.equal(r.status, 200); ok('password change');
    r = await call('/api/admin/settings', 'PUT', { phone: '08000000000' }); assert.equal(r.json.phone, '08000000000'); ok('settings');
    console.log('\nAll tests passed.'); srv.close(); process.exit(0);
  } catch (e) { console.error('FAIL', e); srv.close(); process.exit(1); }
});
