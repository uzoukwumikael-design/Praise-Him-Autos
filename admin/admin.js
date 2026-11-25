(() => {
const $ = (s, r = document) => r.querySelector(s);
const root = $('#root');
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const naira = (n) => (n > 0 ? '₦' + Number(n).toLocaleString('en-NG') : '—');
const api = async (u, method = 'GET', body) => {
  const r = await fetch(u, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && !u.includes('login')) { login(); throw new Error('Signed out'); }
  if (!r.ok) throw new Error(j.error || 'Error');
  return j;
};
const toast = (m) => alert(m);
let tab = 'dashboard', newCount = 0;

function login(msg = '') {
  root.innerHTML = `<div class="login"><div class="brand" style="margin-bottom:20px"><span class="brand-mark">PH</span>Admin sign in</div>
  <form class="card pad" id="lf"><div class="field"><label>Username</label><input name="username" autocomplete="username" required></div>
  <div class="field"><label>Password</label><input type="password" name="password" autocomplete="current-password" required></div>
  <div class="notice err" id="le" style="display:${msg ? 'block' : 'none'}">${esc(msg)}</div><button class="btn btn-gold" style="width:100%">Sign in</button></form></div>`;
  $('#lf').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api('/api/admin/login', 'POST', Object.fromEntries(new FormData(e.target))); start(); }
    catch (err) { const el = $('#le'); el.textContent = err.message; el.style.display = 'block'; }
  });
}

const TABS = [['dashboard', 'Dashboard'], ['enquiries', 'Enquiries'], ['cars', 'Cars'], ['fleet', 'Rental fleet'], ['settings', 'Settings']];
function shell() {
  root.innerHTML = `<div class="shell"><aside class="side"><div class="brand"><span class="brand-mark">PH</span>Admin</div>
  ${TABS.map(([k, l]) => `<button class="tab ${tab === k ? 'on' : ''}" data-t="${k}">${l}${k === 'enquiries' && newCount ? `<span class="badge">${newCount}</span>` : ''}</button>`).join('')}
  <div style="flex:1"></div><a class="tab" style="padding:10px 12px;color:var(--mute)" href="/" target="_blank">View site ↗</a><button class="tab" id="lo">Sign out</button></aside><main class="main" id="view"></main></div>`;
  document.querySelectorAll('.tab[data-t]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.t; show(); }));
  $('#lo').addEventListener('click', async () => { await api('/api/admin/logout', 'POST'); login(); });
}
async function show() { shell(); const v = $('#view'); try { await ({ dashboard, enquiries, cars, fleet, settings })[tab](v); } catch (e) { v.innerHTML = `<div class="notice err">${esc(e.message)}</div>`; } }
async function start() { try { await api('/api/admin/me'); await show(); } catch { login(); } }

// ---------- dashboard ----------
async function dashboard(v) {
  const s = await api('/api/admin/stats'); newCount = s.enquiries_new; shell(); v = $('#view');
  const lbl = { car: 'Car enquiries', rental: 'Rentals', chauffeur: 'Chauffeur', preorder: 'Pre-orders', general: 'General' };
  v.innerHTML = `<div class="top"><h1>Dashboard</h1></div><div class="stats">
  <div class="stat"><b>${s.enquiries_new}</b><span>New enquiries</span></div><div class="stat"><b>${s.enquiries_week}</b><span>Enquiries this week</span></div>
  <div class="stat"><b>${s.cars_available}</b><span>Cars available</span></div><div class="stat"><b>${s.cars_sold}</b><span>Cars sold</span></div></div>
  <h3>Last 30 days by type</h3><div class="acts" style="margin-bottom:24px">${s.by_type.map((t) => `<span class="pill">${lbl[t.type] || t.type}: ${t.n}</span>`).join('') || '<span class="det">No enquiries yet.</span>'}</div>
  <h3>Latest enquiries</h3>${enqTable(s.recent)}`;
}

// ---------- enquiries ----------
const dt = (d) => new Date(d.replace(' ', 'T') + 'Z').toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' });
function enqTable(rows) {
  if (!rows.length) return '<div class="notice">Nothing here yet.</div>';
  return `<div class="tbl-wrap"><table><tr><th>When</th><th>Type</th><th>Customer</th><th>Details</th><th>Status</th><th></th></tr>${rows.map((r) => `<tr data-id="${r.id}">
  <td>${dt(r.created_at)}</td><td><span class="pill">${esc(r.type)}</span></td>
  <td><b>${esc(r.name)}</b><br><a style="color:var(--gold)" href="tel:${esc(r.phone)}">${esc(r.phone)}</a>${r.email ? '<br>' + esc(r.email) : ''}</td>
  <td>${r.car_title ? `<b>${esc(r.car_title)}</b><br>` : ''}${esc(r.message)}<div class="det">${Object.entries(r.details).filter(([, v]) => v).map(([k, v]) => `${esc(k)}: ${esc(v)}`).join(' · ')}</div>${r.notes ? `<div class="det">Note: ${esc(r.notes)}</div>` : ''}</td>
  <td><span class="pill ${r.status}">${r.status}</span></td>
  <td><div class="acts"><a class="btn btn-wa sm" target="_blank" rel="noopener" href="https://wa.me/${esc(waNum(r.phone))}">WhatsApp</a>
  <button class="btn btn-line sm" data-a="contacted">Contacted</button><button class="btn btn-line sm" data-a="closed">Close</button><button class="btn btn-line sm" data-a="note">Note</button></div></td></tr>`).join('')}</table></div>`;
}
const waNum = (p) => { let d = String(p).replace(/\D/g, ''); if (d.startsWith('0')) d = '234' + d.slice(1); return d; };
async function enquiries(v) {
  const f = enquiries.f || { type: '', status: '' };
  const rows = await api(`/api/admin/enquiries?type=${f.type}&status=${f.status}`);
  newCount = rows.filter((r) => r.status === 'new').length && (await api('/api/admin/stats')).enquiries_new; shell(); v = $('#view');
  v.innerHTML = `<div class="top"><h1>Enquiries</h1><div class="acts"><select id="ft" style="width:auto"><option value="">All types</option>${['car', 'rental', 'chauffeur', 'preorder', 'general'].map((t) => `<option ${f.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
  <select id="fs" style="width:auto"><option value="">Any status</option>${['new', 'contacted', 'closed'].map((t) => `<option ${f.status === t ? 'selected' : ''}>${t}</option>`).join('')}</select><a class="btn btn-line sm" href="/api/admin/enquiries.csv">Export CSV</a></div></div>${enqTable(rows)}`;
  $('#ft').onchange = (e) => { enquiries.f = { ...f, type: e.target.value }; show(); };
  $('#fs').onchange = (e) => { enquiries.f = { ...f, status: e.target.value }; show(); };
  v.querySelectorAll('button[data-a]').forEach((b) => b.addEventListener('click', async () => {
    const id = b.closest('tr').dataset.id, a = b.dataset.a;
    if (a === 'note') { const n = prompt('Internal note'); if (n === null) return; await api('/api/admin/enquiries/' + id, 'PATCH', { notes: n }); }
    else await api('/api/admin/enquiries/' + id, 'PATCH', { status: a });
    show();
  }));
}

// ---------- cars ----------
async function cars(v) {
  const rows = await api('/api/admin/cars');
  v.innerHTML = `<div class="top"><h1>Cars</h1><button class="btn btn-gold" id="add">Add car</button></div><div class="tbl-wrap"><table><tr><th></th><th>Car</th><th>Price</th><th>Status</th><th></th></tr>
  ${rows.map((c) => `<tr data-id="${c.id}"><td><div class="thumb" ${c.images[0] ? `style="background-image:url('${esc(c.images[0])}')"` : ''}></div></td>
  <td><b>${esc(c.title)}</b>${c.featured ? ' ★' : ''}<div class="det">${esc(c.condition)}${c.year ? ' · ' + c.year : ''}</div></td><td>${naira(c.price)}</td>
  <td><select data-s style="width:auto">${['available', 'reserved', 'sold', 'hidden'].map((s) => `<option ${c.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></td>
  <td><div class="acts"><button class="btn btn-line sm" data-e>Edit</button><button class="btn btn-line sm" data-d>Delete</button></div></td></tr>`).join('')}</table></div>`;
  $('#add').onclick = () => carForm();
  v.querySelectorAll('tr[data-id]').forEach((tr) => {
    const c = rows.find((x) => x.id == tr.dataset.id);
    $('[data-e]', tr).onclick = () => carForm(c);
    $('[data-d]', tr).onclick = async () => { if (confirm(`Delete "${c.title}"? This cannot be undone.`)) { await api('/api/admin/cars/' + c.id, 'DELETE'); show(); } };
    $('[data-s]', tr).onchange = async (e) => { await api(`/api/admin/cars/${c.id}/status`, 'PATCH', { status: e.target.value }); };
  });
}
function modal(html) { const m = document.createElement('div'); m.className = 'modal'; m.innerHTML = `<div class="box">${html}</div>`; document.body.appendChild(m); m.addEventListener('mousedown', (e) => { if (e.target === m) m.remove(); }); return m; }
function carForm(c = {}) {
  let images = [...(c.images || [])];
  const m = modal(`<h2>${c.id ? 'Edit car' : 'Add car'}</h2><form id="cf">
  <div class="field"><label>Title</label><input name="title" required value="${esc(c.title)}" placeholder="2016 Toyota Avalon XLE Premium"></div>
  <div class="row2"><div class="field"><label>Make</label><input name="make" value="${esc(c.make)}"></div><div class="field"><label>Model</label><input name="model" value="${esc(c.model)}"></div></div>
  <div class="row2"><div class="field"><label>Year</label><input name="year" type="number" value="${esc(c.year)}"></div><div class="field"><label>Price (₦, 0 = call for price)</label><input name="price" type="number" min="0" value="${esc(c.price || 0)}"></div></div>
  <div class="row2"><div class="field"><label>Condition</label><select name="condition">${['Foreign Used', 'Nigerian Used', 'Brand New'].map((o) => `<option ${c.condition === o ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
  <div class="field"><label>Status</label><select name="status">${['available', 'reserved', 'sold', 'hidden'].map((o) => `<option ${c.status === o ? 'selected' : ''}>${o}</option>`).join('')}</select></div></div>
  <div class="row2"><div class="field"><label>Colour</label><input name="color" value="${esc(c.color)}"></div><div class="field"><label>Mileage (km)</label><input name="mileage" type="number" value="${esc(c.mileage ?? '')}"></div></div>
  <div class="row2"><div class="field"><label>Transmission</label><input name="transmission" value="${esc(c.transmission || 'Automatic')}"></div><div class="field"><label>Fuel</label><input name="fuel" value="${esc(c.fuel || 'Petrol')}"></div></div>
  <div class="field"><label>Description</label><textarea name="description" rows="4">${esc(c.description)}</textarea></div>
  <div class="field"><label>Photos (first photo is the cover)</label><div class="imgs" id="imgs"></div><input type="file" id="fi" accept="image/jpeg,image/png,image/webp" multiple></div>
  <label class="chk"><input type="checkbox" name="featured" ${c.featured ? 'checked' : ''}> Feature on homepage</label><div id="ce"></div>
  <div class="acts"><button class="btn btn-gold">Save</button><button type="button" class="btn btn-line" id="cx">Cancel</button></div></form>`);
  const draw = () => { $('#imgs', m).innerHTML = images.map((u, i) => `<div class="im" style="background-image:url('${esc(u)}')"><button type="button" data-i="${i}">×</button></div>`).join(''); m.querySelectorAll('.im button').forEach((b) => b.onclick = () => { images.splice(b.dataset.i, 1); draw(); }); };
  draw();
  $('#cx', m).onclick = () => m.remove();
  $('#fi', m).onchange = async (e) => {
    const fd = new FormData(); [...e.target.files].forEach((f) => fd.append('images', f));
    try { const r = await fetch('/api/admin/upload', { method: 'POST', body: fd }); const j = await r.json(); if (!r.ok) throw new Error(j.error); images.push(...j.urls); draw(); }
    catch (err) { $('#ce', m).innerHTML = `<div class="notice err">${esc(err.message)}</div>`; }
  };
  $('#cf', m).onsubmit = async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target)); d.featured = !!e.target.featured.checked; d.images = images;
    try { await api(c.id ? '/api/admin/cars/' + c.id : '/api/admin/cars', c.id ? 'PUT' : 'POST', d); m.remove(); show(); }
    catch (err) { $('#ce', m).innerHTML = `<div class="notice err">${esc(err.message)}</div>`; }
  };
}

// ---------- fleet ----------
async function fleet(v) {
  const rows = await api('/api/admin/fleet');
  v.innerHTML = `<div class="top"><h1>Rental fleet</h1><button class="btn btn-gold" id="add">Add vehicle</button></div><div class="tbl-wrap"><table><tr><th>Vehicle</th><th>Self-drive / day</th><th>With driver / day</th><th>Shown</th><th></th></tr>
  ${rows.map((f) => `<tr data-id="${f.id}"><td><b>${esc(f.name)}</b><div class="det">${esc(f.category)} · ${f.seats} seats</div></td><td>${naira(f.daily_rate)}</td><td>${naira(f.driver_rate)}</td><td>${f.active ? 'Yes' : 'No'}</td>
  <td><div class="acts"><button class="btn btn-line sm" data-e>Edit</button><button class="btn btn-line sm" data-d>Delete</button></div></td></tr>`).join('')}</table></div>`;
  $('#add').onclick = () => fleetForm();
  v.querySelectorAll('tr[data-id]').forEach((tr) => { const f = rows.find((x) => x.id == tr.dataset.id); $('[data-e]', tr).onclick = () => fleetForm(f); $('[data-d]', tr).onclick = async () => { if (confirm(`Delete ${f.name}?`)) { await api('/api/admin/fleet/' + f.id, 'DELETE'); show(); } }; });
}
function fleetForm(f = {}) {
  const m = modal(`<h2>${f.id ? 'Edit vehicle' : 'Add vehicle'}</h2><form id="ff">
  <div class="field"><label>Name</label><input name="name" required value="${esc(f.name)}"></div>
  <div class="row2"><div class="field"><label>Category</label><input name="category" value="${esc(f.category || 'SUV')}"></div><div class="field"><label>Seats</label><input name="seats" type="number" value="${esc(f.seats || 4)}"></div></div>
  <div class="row2"><div class="field"><label>Self-drive rate / day (₦)</label><input name="daily_rate" type="number" min="0" value="${esc(f.daily_rate || 0)}"></div><div class="field"><label>With-driver rate / day (₦)</label><input name="driver_rate" type="number" min="0" value="${esc(f.driver_rate || 0)}"></div></div>
  <div class="field"><label>Description</label><textarea name="description" rows="2">${esc(f.description)}</textarea></div>
  <label class="chk"><input type="checkbox" name="active" ${f.active !== 0 ? 'checked' : ''}> Show on website</label><div id="fe"></div>
  <div class="acts"><button class="btn btn-gold">Save</button><button type="button" class="btn btn-line" id="fx">Cancel</button></div></form>`);
  $('#fx', m).onclick = () => m.remove();
  $('#ff', m).onsubmit = async (e) => { e.preventDefault(); const d = Object.fromEntries(new FormData(e.target)); d.active = e.target.active.checked;
    try { await api(f.id ? '/api/admin/fleet/' + f.id : '/api/admin/fleet', f.id ? 'PUT' : 'POST', d); m.remove(); show(); } catch (err) { $('#fe', m).innerHTML = `<div class="notice err">${esc(err.message)}</div>`; } };
}

// ---------- settings ----------
async function settings(v) {
  const s = await api('/api/admin/settings');
  const F = [['business_name', 'Business name'], ['tagline', 'Tagline'], ['hero_title', 'Homepage headline'], ['hero_sub', 'Homepage sub-text', 1], ['phone', 'Phone number'], ['whatsapp', 'WhatsApp number (international, no +, e.g. 2348084159280)'], ['email', 'Email'], ['address', 'Address'], ['hours', 'Opening hours'], ['x_handle', 'X (Twitter) handle, no @'], ['about', 'About text', 1]];
  v.innerHTML = `<div class="top"><h1>Settings</h1></div><form class="card pad" id="sf" style="max-width:680px">${F.map(([k, l, ta]) => `<div class="field"><label>${l}</label>${ta ? `<textarea name="${k}" rows="3">${esc(s[k])}</textarea>` : `<input name="${k}" value="${esc(s[k])}">`}</div>`).join('')}<div id="se"></div><button class="btn btn-gold">Save settings</button></form>
  <h3 style="margin-top:30px">Change password</h3><form class="card pad" id="pf" style="max-width:420px"><div class="field"><label>Current password</label><input type="password" name="current" autocomplete="current-password" required></div>
  <div class="field"><label>New password (8+ characters)</label><input type="password" name="next" autocomplete="new-password" minlength="8" required></div><div id="pe"></div><button class="btn btn-gold">Update password</button></form>`;
  $('#sf').onsubmit = async (e) => { e.preventDefault(); try { await api('/api/admin/settings', 'PUT', Object.fromEntries(new FormData(e.target))); $('#se').innerHTML = '<div class="notice ok">Saved.</div>'; } catch (err) { $('#se').innerHTML = `<div class="notice err">${esc(err.message)}</div>`; } };
  $('#pf').onsubmit = async (e) => { e.preventDefault(); try { await api('/api/admin/password', 'POST', Object.fromEntries(new FormData(e.target))); e.target.reset(); $('#pe').innerHTML = '<div class="notice ok">Password updated.</div>'; } catch (err) { $('#pe').innerHTML = `<div class="notice err">${esc(err.message)}</div>`; } };
}

start();
})();
