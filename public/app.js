(() => {
const $ = (s, r = document) => r.querySelector(s);
const app = $('#app');
let S = {};
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const naira = (n) => (n > 0 ? '₦' + Number(n).toLocaleString('en-NG') : 'Call for price');
const api = (u, o) => fetch(u, o).then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Something went wrong'); return j; });
const wa = (text) => `https://wa.me/${S.whatsapp}?text=${encodeURIComponent(text)}`;
const bg = (u) => (u ? `style="background-image:url('${esc(u)}')"` : '');

function carCard(c) {
  const img = c.images[0];
  return `<a class="card car" href="#/car/${c.id}">
    <div class="ph ${img ? '' : 'none'}" ${bg(img)}>${img ? '' : 'Photos coming soon'}${c.status !== 'available' ? `<span class="tag ${c.status}">${c.status === 'sold' ? 'Sold' : 'Reserved'}</span>` : `<span class="tag">${esc(c.condition)}</span>`}</div>
    <div class="body"><h3>${esc(c.title)}</h3>
      <div class="meta">${[c.color, c.transmission, c.mileage ? c.mileage.toLocaleString() + ' km' : ''].filter(Boolean).map(esc).join(' · ')}</div>
      <div class="price">${naira(c.price)}</div></div></a>`;
}

function formHtml(type, extra = '', opts = {}) {
  return `<form class="card pad enq" data-type="${type}" novalidate>
    <input class="hp" name="website" tabindex="-1" autocomplete="off">
    <div class="row2"><div class="field"><label>Full name</label><input name="name" required autocomplete="name"></div>
    <div class="field"><label>Phone / WhatsApp</label><input name="phone" required inputmode="tel" autocomplete="tel"></div></div>
    ${extra}
    <div class="field"><label>${opts.msgLabel || 'Message (optional)'}</label><textarea name="message" rows="3"></textarea></div>
    <div class="msg"></div>
    <button class="btn btn-gold" type="submit">${opts.cta || 'Send request'}</button>
    <p style="margin:12px 0 0;font-size:.85rem">We reply by call or WhatsApp. No spam.</p></form>`;
}
function wireForms(ctx = {}) {
  document.querySelectorAll('form.enq').forEach((f) => f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('button', f), msg = $('.msg', f), fd = Object.fromEntries(new FormData(f));
    const { name, phone, message, website, email, ...rest } = fd;
    btn.disabled = true; msg.innerHTML = '';
    try {
      await api('/api/enquiries', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: f.dataset.type, name, phone, email, message, website, details: rest, car_id: ctx.car_id, fleet_id: ctx.fleet_id }) });
      f.innerHTML = `<div class="notice ok"><b>Request received.</b> Our team will contact you shortly. For something urgent, call ${esc(S.phone)}.</div>`;
    } catch (err) { msg.innerHTML = `<div class="notice err">${esc(err.message)}</div>`; btn.disabled = false; }
  }));
}

// ---------- pages ----------
async function home() {
  const [{ cars }, fleet] = await Promise.all([api('/api/cars?sort=featured'), api('/api/fleet')]);
  const feat = cars.filter((c) => c.featured && c.status !== 'sold').slice(0, 3);
  const show = feat.length ? feat : cars.slice(0, 3);
  app.innerHTML = `
  <section class="hero"><div class="wrap">
    <div class="eyebrow">${esc(S.tagline)}</div>
    <h1>${esc(S.hero_title)}</h1><p>${esc(S.hero_sub)}</p>
    <div class="cta"><a class="btn btn-gold" href="#/cars">Browse cars</a><a class="btn btn-line" href="#/chauffeur">Book a chauffeur</a><a class="btn btn-wa" target="_blank" rel="noopener" href="${wa('Hello Praise Him Autos, I found you on your website.')}">Chat on WhatsApp</a></div>
  </div></section>
  <section><div class="wrap"><h2>Fresh on the lot</h2><p>Every car can be inspected before you pay. Bring your own mechanic.</p>
    <div class="grid g3">${show.map(carCard).join('') || '<div class="empty">New cars landing soon.</div>'}</div>
    <p style="margin-top:20px"><a class="btn btn-line" href="#/cars">See all cars</a></p></div></section>
  <section style="background:var(--bg2)"><div class="wrap"><h2>More than a car lot</h2>
    <div class="grid g4">
      <a class="card pad" href="#/rentals"><h3>Car rentals</h3><p>Self-drive or with a driver, by the day.</p></a>
      <a class="card pad" href="#/chauffeur"><h3>Chauffeur service</h3><p>Airport pickups, meetings, city trips and interstate journeys.</p></a>
      <a class="card pad" href="#/preorder"><h3>Pre-order a car</h3><p>Tell us what you want and we source it for you.</p></a>
      <a class="card pad" href="#/contact"><h3>Visit us</h3><p>${esc(S.address)}</p></a></div></div></section>
  <section><div class="wrap"><h2>How buying works</h2><div class="grid g3 steps">
    <div class="card"><h3>Pick a car</h3><p>Browse listings and send an enquiry or message us on WhatsApp.</p></div>
    <div class="card"><h3>Inspect it</h3><p>Visit us and bring your mechanic. Check it yourself.</p></div>
    <div class="card"><h3>Drive away</h3><p>Agree a fair price, complete the paperwork and go.</p></div></div></div></section>`;
}

async function cars() {
  app.innerHTML = `<section><div class="wrap"><h1 style="font-size:2.2rem">Cars for sale</h1>
  <div class="filters"><input id="fq" placeholder="Search make, model, colour"><select id="fmake"><option value="">All makes</option></select>
  <select id="fcond"><option value="">Any condition</option><option>Foreign Used</option><option>Nigerian Used</option><option>Brand New</option></select>
  <select id="fmax"><option value="">Any budget</option><option value="10000000">Up to ₦10m</option><option value="20000000">Up to ₦20m</option><option value="35000000">Up to ₦35m</option><option value="60000000">Up to ₦60m</option></select>
  <select id="fsort"><option value="">Featured</option><option value="newest">Newest listed</option><option value="price_asc">Price: low to high</option><option value="price_desc">Price: high to low</option><option value="year_desc">Year</option></select></div>
  <div id="list" class="grid g3"></div></div></section>`;
  let t, made = false;
  const load = async () => {
    const p = new URLSearchParams({ q: $('#fq').value, make: $('#fmake').value, condition: $('#fcond').value, max: $('#fmax').value, sort: $('#fsort').value });
    const { cars, makes } = await api('/api/cars?' + p);
    if (!made) { $('#fmake').innerHTML += makes.map((m) => `<option>${esc(m)}</option>`).join(''); made = true; }
    $('#list').innerHTML = cars.map(carCard).join('') || '<div class="empty" style="grid-column:1/-1">No cars match. Try a wider search or <a href="#/preorder" style="color:var(--gold)">pre-order what you want</a>.</div>';
  };
  ['fq', 'fmake', 'fcond', 'fmax', 'fsort'].forEach((id) => $('#' + id).addEventListener(id === 'fq' ? 'input' : 'change', () => { clearTimeout(t); t = setTimeout(load, 250); }));
  await load();
}

async function car(id) {
  const c = await api('/api/cars/' + id);
  const imgs = c.images;
  app.innerHTML = `<section><div class="wrap"><a class="crumb" href="#/cars">← All cars</a><div class="detail">
  <div class="gallery"><div class="main" id="mainImg" ${bg(imgs[0])}></div>${imgs.length > 1 ? `<div class="thumbs">${imgs.map((u, i) => `<button class="${i ? '' : 'on'}" data-u="${esc(u)}" aria-label="Photo ${i + 1}" ${bg(u)}></button>`).join('')}</div>` : ''}</div>
  <div><h1 style="font-size:1.9rem">${esc(c.title)}</h1><div class="price" style="font-size:1.6rem">${naira(c.price)}</div>
  ${c.status !== 'available' ? `<div class="notice ${c.status === 'sold' ? 'err' : 'ok'}">${c.status === 'sold' ? 'This car has been sold.' : 'This car is reserved.'}</div>` : ''}
  <div class="spec">${[['Condition', c.condition], ['Year', c.year], ['Colour', c.color], ['Transmission', c.transmission], ['Fuel', c.fuel], ['Mileage', c.mileage ? c.mileage.toLocaleString() + ' km' : '']].filter((x) => x[1]).map(([k, v]) => `<div><b>${k}</b>${esc(v)}</div>`).join('')}</div>
  <p style="white-space:pre-line">${esc(c.description)}</p>
  <p><a class="btn btn-wa" target="_blank" rel="noopener" href="${wa(`Hello, I'm interested in the ${c.title} on your website.`)}">Ask on WhatsApp</a></p></div></div>
  <div style="max-width:620px;margin-top:36px"><h2>Enquire about this car</h2>${formHtml('car', '', { cta: 'Send enquiry', msgLabel: 'Your offer or question' })}</div></div></section>`;
  document.querySelectorAll('.thumbs button').forEach((b) => b.addEventListener('click', () => {
    $('#mainImg').style.backgroundImage = `url('${b.dataset.u}')`;
    document.querySelectorAll('.thumbs button').forEach((x) => x.classList.toggle('on', x === b));
  }));
  wireForms({ car_id: c.id });
}

async function rentals() {
  const fleet = await api('/api/fleet');
  const opts = fleet.map((f) => `<option value="${f.id}">${esc(f.name)}</option>`).join('');
  app.innerHTML = `<section><div class="wrap"><h1 style="font-size:2.2rem">Car rentals</h1><p>Choose a car and your dates. We confirm availability and price by call or WhatsApp.</p>
  <div class="grid g3" style="margin:24px 0 36px">${fleet.map((f) => `<div class="card pad"><h3>${esc(f.name)}</h3><div class="meta">${esc(f.category)} · ${f.seats} seats</div><p>${esc(f.description)}</p>
    <div class="price" style="font-size:1rem">${f.daily_rate ? naira(f.daily_rate) + ' / day self-drive' : 'Ask for rate'}</div>${f.driver_rate ? `<div class="meta">${naira(f.driver_rate)} / day with driver</div>` : ''}</div>`).join('') || '<div class="empty">Fleet details coming soon. Send a request below.</div>'}</div>
  <div style="max-width:620px"><h2>Request a rental</h2>${formHtml('rental', `
    <div class="field"><label>Car</label><select name="car"><option value="">Any / not sure</option>${opts}</select></div>
    <div class="row2"><div class="field"><label>Start date</label><input type="date" name="start"></div><div class="field"><label>End date</label><input type="date" name="end"></div></div>
    <div class="field"><label>Driver?</label><select name="driver"><option>With driver</option><option>Self-drive</option></select></div>`, { cta: 'Request rental' })}</div></div></section>`;
  wireForms();
}

function chauffeur() {
  app.innerHTML = `<section><div class="wrap"><h1 style="font-size:2.2rem">Chauffeur service</h1>
  <p>Just landed in Lagos? Your ride is sorted. Airport pickups, business meetings, city trips and interstate journeys. Sit back while a professional chauffeur handles the drive.</p>
  <div style="max-width:620px;margin-top:24px">${formHtml('chauffeur', `
    <div class="field"><label>Service</label><select name="service"><option>Airport pickup</option><option>Business meetings / full day</option><option>City trip</option><option>Interstate journey</option><option>Event / wedding</option></select></div>
    <div class="row2"><div class="field"><label>Date</label><input type="date" name="date"></div><div class="field"><label>Time</label><input type="time" name="time"></div></div>
    <div class="row2"><div class="field"><label>Pickup location / flight no.</label><input name="pickup"></div><div class="field"><label>Destination</label><input name="destination"></div></div>`, { cta: 'Book chauffeur' })}</div></div></section>`;
  wireForms();
}

function preorder() {
  app.innerHTML = `<section><div class="wrap"><h1 style="font-size:2.2rem">Pre-order your car</h1>
  <p>Can't find what you want in stock? Tell us the car, year range and budget. We source it and keep you updated.</p>
  <div style="max-width:620px;margin-top:24px">${formHtml('preorder', `
    <div class="row2"><div class="field"><label>Make</label><input name="make" placeholder="e.g. Lexus"></div><div class="field"><label>Model</label><input name="model" placeholder="e.g. RX 350"></div></div>
    <div class="row2"><div class="field"><label>Year range</label><input name="years" placeholder="2015 - 2018"></div><div class="field"><label>Budget (₦)</label><input name="budget" inputmode="numeric"></div></div>
    <div class="field"><label>Preferred colour</label><input name="colour"></div>`, { cta: 'Submit pre-order', msgLabel: 'Other requirements' })}</div></div></section>`;
  wireForms();
}

function contact() {
  app.innerHTML = `<section><div class="wrap"><h1 style="font-size:2.2rem">Contact & visit</h1><div class="detail">
  <div><p>${esc(S.about)}</p><div class="card pad"><p><b style="color:var(--text)">Call</b><br><a href="tel:${esc(S.phone)}" style="color:var(--gold)">${esc(S.phone)}</a></p>
  <p><b style="color:var(--text)">Location</b><br>${esc(S.address)}</p><p><b style="color:var(--text)">Hours</b><br>${esc(S.hours)}</p>
  <p style="margin:0"><a class="btn btn-wa" target="_blank" rel="noopener" href="${wa('Hello Praise Him Autos')}">WhatsApp us</a></p></div></div>
  <div>${formHtml('general', '', { cta: 'Send message', msgLabel: 'How can we help?' })}</div></div></div></section>`;
  wireForms();
}

// ---------- router ----------
const routes = { '': home, cars, rentals, chauffeur, preorder, contact };
async function route() {
  const [, name = '', arg] = location.hash.replace(/^#/, '').split('/');
  document.querySelectorAll('#menu a').forEach((a) => a.classList.toggle('on', a.getAttribute('href') === '#/' + name));
  $('#menu').classList.remove('open');
  window.scrollTo(0, 0);
  try { await (name === 'car' ? car(arg) : (routes[name] || home)()); }
  catch (e) { app.innerHTML = `<section><div class="wrap"><div class="empty">${esc(e.message)}<br><a href="#/cars" style="color:var(--gold)">Back to cars</a></div></div></section>`; }
}

(async () => {
  try { S = await api('/api/settings'); } catch { S = {}; }
  $('#brandName').textContent = S.business_name || 'Praise Him Autos';
  $('#navCall').href = 'tel:' + (S.phone || '');
  $('#waFloat').href = wa('Hello Praise Him Autos');
  $('#footer').innerHTML = `<div class="wrap"><div><b style="color:var(--text)">${esc(S.business_name)}</b><br>${esc(S.address)}<br>${esc(S.hours)}</div>
    <div>${esc(S.phone)}<br>${S.x_handle ? `<a href="https://x.com/${esc(S.x_handle)}" target="_blank" rel="noopener">@${esc(S.x_handle)} on X</a>` : ''}</div></div>`;
  $('#burger').addEventListener('click', () => { const o = $('#menu').classList.toggle('open'); $('#burger').setAttribute('aria-expanded', o); });
  window.addEventListener('hashchange', route);
  route();
})();
})();
