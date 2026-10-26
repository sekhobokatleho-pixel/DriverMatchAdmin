/* ---------- matches ---------- */
function vMatches(){
  return `<input id="q" data-search="matches" placeholder="Search driver, owner or vehicle" value="${esc(S.q)}"><div id="list"></div>`;
}
function renderMatchList(){
  const D = S.data, q = low(S.q).trim();
  const rows = D.reqs.map(r => {
    const v = D.vmap[r.vehicle_id] || {};
    return { r, driver: nm(r.driver_id), owner: nm(v.owner_id), code: v.vehicle_code || 'Vehicle', hay: low([nm(r.driver_id), nm(v.owner_id), v.vehicle_code].join(' ')) };
  }).filter(x => !q || x.hay.includes(q));
  const stats = ['all','pending','accepted','declined','cancelled'];
  const list = rows.filter(x => S.mstat === 'all' || x.r.status === S.mstat);
  document.getElementById('list').innerHTML = `
    <div class="chips">${stats.map(k => `<button data-act="mstat" data-s="${k}" class="${S.mstat===k?'on':''}">${k[0].toUpperCase()+k.slice(1)} (${k === 'all' ? rows.length : rows.filter(x => x.r.status === k).length})</button>`).join('')}</div>
    ${list.length ? list.map(x => `<div class="card"><div class="row"><b>${esc(x.driver)} ↔ ${esc(x.code)}</b><span class="tag ${x.r.status}">${x.r.status}</span></div>
      <div class="mu">Owner: ${esc(x.owner)}</div><div class="mu">Started by ${esc(x.r.initiated_by)} · ${fdate(x.r.created_at)}${x.r.responded_at ? ' · Responded ' + fdate(x.r.responded_at) : ''}</div></div>`).join('') : '<div class="mu">No requests here.</div>'}`;
}

/* ---------- payments ---------- */
function vPayments(){
  const D = S.data; const paid = D.pays.filter(p => PAID.includes(low(p.status)));
  const total = paid.reduce((a, p) => a + (p.amount_cents || 0), 0);
  return `<div class="card"><b>${rand(total)}</b> <span class="mu">received from ${paid.length} paid of ${D.pays.length} payments</span></div>
    ${D.pays.length ? D.pays.map(p => `<div class="card"><div class="row"><b>${rand(p.amount_cents)}</b><span class="tag ${PAID.includes(low(p.status)) ? 'paid' : ''}">${esc(p.status || 'unknown')}</span></div>
      <div class="mu">${esc(nm(p.user_id))} · ${esc(p.kind || '')}${p.vehicle_id ? ' · ' + esc(vcode(p.vehicle_id)) : ''}</div>
      <div class="mu">${fdate(p.created_at)}${p.pf_payment_id ? ' · PayFast ' + esc(p.pf_payment_id) : ''}</div></div>`).join('') : '<div class="mu">No payments yet.</div>'}`;
}

/* ---------- reports ---------- */
const rnorm = s => { s = low(s); return s === 'resolved' ? 'resolved' : s === 'reviewed' ? 'reviewed' : 'open'; };
function vReports(){
  const D = S.data; const all = D.reports;
  const chips = ['open','reviewed','resolved','all'];
  const list = all.filter(r => S.rstat === 'all' || rnorm(r.status) === S.rstat);
  return `<div class="chips">${chips.map(k => `<button data-act="rstat" data-s="${k}" class="${S.rstat===k?'on':''}">${k[0].toUpperCase()+k.slice(1)} (${k === 'all' ? all.length : all.filter(r => rnorm(r.status) === k).length})</button>`).join('')}</div>
    ${list.length ? list.map(r => { const rs = rnorm(r.status); return `<div class="card"><div class="row"><b>${esc(r.reason || 'Report')}</b><span class="tag ${rs}">${rs}</span></div>
      <div class="mu">From ${esc(nm(r.reporter_id))} · ${fdate(r.created_at)}</div>
      ${r.details ? `<div style="margin:6px 0">${esc(r.details)}</div>` : ''}
      ${r.request_id ? `<div class="mu">Request ${esc(String(r.request_id).slice(0, 8))}…</div>` : ''}
      <div class="acts">${rs !== 'reviewed' ? `<button class="sm" data-act="rset" data-id="${esc(r.id)}" data-to="reviewed">Mark reviewed</button>` : ''}
      ${rs !== 'resolved' ? `<button class="sm p" data-act="rset" data-id="${esc(r.id)}" data-to="resolved">Resolve</button>` : ''}
      ${rs !== 'open' ? `<button class="sm" data-act="rset" data-id="${esc(r.id)}" data-to="open">Reopen</button>` : ''}</div></div>`; }).join('') : '<div class="mu">No reports here.</div>'}`;
}
async function setReport(id, to){
  const { data, error } = await sb.from('reports').update({ status: to }).eq('id', id).select();
  if (error) { flash(error.message + ' (the allowed report statuses may differ; send me this message)'); return render(); }
  if (!data || !data.length) { flash('Update blocked. Run the admin SQL.'); return render(); }
  const r = S.data.reports.find(x => x.id === id); if (r) r.status = to;
  flash('Report marked ' + to + '.', 'ok'); render();
}

/* ---------- settings ---------- */
function vSettings(){
  const st = S.data.settings;
  return `<div class="mu" style="margin-bottom:8px">Fees and other values. Amounts are in rand.</div>
    ${st.length ? st.map(s => `<div class="card"><b>${esc(s.key)}</b>
      <div class="setrow" style="margin-top:8px"><span>R</span><input type="number" step="0.01" data-setin="${esc(s.key)}" value="${((s.value_cents || 0) / 100).toFixed(2)}">
      <button class="p" data-act="saveset" data-key="${esc(s.key)}">Save</button></div></div>`).join('') : '<div class="mu">No settings found.</div>'}`;
}
async function saveSetting(key){
  const el = [...app.querySelectorAll('[data-setin]')].find(x => x.dataset.setin === key);
  const cents = Math.round(parseFloat(el.value) * 100);
  if (isNaN(cents) || cents < 0) { flash('Enter a valid amount.'); return render(); }
  const { data, error } = await sb.from('settings').update({ value_cents: cents }).eq('key', key).select();
  if (error) { flash(error.message); return render(); }
  if (!data || !data.length) { flash('Update blocked. Run the admin SQL.'); return render(); }
  const s = S.data.settings.find(x => x.key === key); if (s) s.value_cents = cents;
  flash(`Saved ${key}.`, 'ok'); render();
}

/* ---------- events ---------- */
app.addEventListener('click', async e => {
  const t = e.target.closest('[data-act]'); if (!t) return;
  const a = t.dataset.act;
  if (a === 'logout') { await sb.auth.signOut(); return renderLogin(); }
  if (a === 'nav') { S.view = t.dataset.v; S.openId = null; S.q = ''; S.msg = ''; return render(); }
  if (a === 'refresh') { await loadAll(); flash('Data refreshed.', 'ok'); return render(); }
  if (a === 'sec') { S.sec = t.dataset.s; return renderPeopleList(); }
  if (a === 'open') { S.openId = t.dataset.id; S.msg = ''; return renderDetail(); }
  if (a === 'back') { S.openId = null; S.msg = ''; return render(); }
  if (a === 'setstat') return setPerson(t.dataset.to);
  if (a === 'docset') return setDoc(t.dataset.id, t.dataset.to);
  if (a === 'block') return setBlock(t.dataset.to);
  if (a === 'mstat') { S.mstat = t.dataset.s; return renderMatchList(); }
  if (a === 'rstat') { S.rstat = t.dataset.s; S.msg = ''; return render(); }
  if (a === 'rset') return setReport(t.dataset.id, t.dataset.to);
  if (a === 'saveset') return saveSetting(t.dataset.key);
});
app.addEventListener('input', e => {
  const t = e.target; if (!t.dataset.search) return;
  S.q = t.value;
  if (t.dataset.search === 'people') renderPeopleList(); else renderMatchList();
});

/* ---------- start ---------- */
async function start(){
  if (!C.SUPABASE_ANON_KEY || C.SUPABASE_ANON_KEY.startsWith('PASTE')) { app.innerHTML = '<div class="err">config.js is missing your anon key.</div>'; return; }
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return renderLogin();
  app.innerHTML = '<div class="mu">Loading…</div>';
  try { await loadAll(); render(); }
  catch (e) { app.innerHTML = `<div class="err">${esc(e.message)}</div><button data-act="logout">Log out</button>`; }
}
start();
