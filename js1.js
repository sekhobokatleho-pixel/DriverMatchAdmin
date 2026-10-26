const app = document.getElementById('app');
const C = window.DM || {};
if (typeof supabase === 'undefined') { app.innerHTML = '<p style="color:#c0392b">The Supabase library did not load. Check your connection and reload.</p>'; throw new Error('supabase library missing'); }
if (!window.DM) { app.innerHTML = '<p style="color:#c0392b">config.js did not load. Upload config.js into the same folder as index.html in GitHub, then reload.</p>'; throw new Error('config.js missing'); }
const sb = supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY);
window.addEventListener('error', e => { app.insertAdjacentHTML('afterbegin', '<p style="color:#c0392b">Error: ' + String(e.message).replace(/</g,'&lt;') + '</p>'); });
const VIEWS = [['home','Home'],['drivers','Drivers'],['owners','Owners'],['matches','Matches'],['payments','Payments'],['reports','Reports'],['settings','Settings']];
const S = { view:'home', sec:'pending', openId:null, q:'', mstat:'all', rstat:'open', data:null, errs:[], msg:'', msgType:'err' };

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const low = s => String(s || '').toLowerCase();
const norm = s => { s = low(s) || 'pending'; if (s === 'approved' || s === 'verified') return 'approved'; if (s === 'rejected') return 'rejected'; return 'pending'; };
const fdate = d => d ? new Date(d).toLocaleDateString('en-ZA') : '';
const rand = c => 'R' + ((c || 0) / 100).toFixed(2);
const flash = (m, t) => { S.msg = m; S.msgType = t || 'err'; };
const PAID = ['paid','complete','completed','success','successful'];

/* ---------- login ---------- */
function renderLogin(err){
  app.innerHTML = `<div class="top"><h1>DriverMatch Admin</h1></div>
  <div class="card">
    <input id="em" type="email" placeholder="Admin email" autocomplete="username" value="${esc(C.ADMIN_EMAIL)}">
    <input id="pw" type="password" placeholder="Password" autocomplete="current-password">
    <div class="err">${esc(err || '')}</div>
    <button class="p" id="go">Log in</button>
  </div>`;
  document.getElementById('go').onclick = async () => {
    const { error } = await sb.auth.signInWithPassword({ email: document.getElementById('em').value.trim(), password: document.getElementById('pw').value });
    if (error) return renderLogin(error.message);
    start();
  };
}

/* ---------- data ---------- */
async function loadAll(){
  S.errs = [];
  const T = async (n, ord) => {
    let q = sb.from(n).select('*'); if (ord) q = q.order(ord, { ascending:false });
    const r = await q; if (r.error) { S.errs.push(n + ': ' + r.error.message); return []; } return r.data || [];
  };
  const [dp, pr, vh, dc, rq, py, rp, st] = await Promise.all([
    T('driver_profiles'), T('profiles'), T('vehicles'), T('documents','created_at'),
    T('requests','created_at'), T('payments','created_at'), T('reports','created_at'), T('settings')
  ]);
  const profiles = {}; pr.forEach(p => profiles[p.id] = p);
  const vmap = {}; vh.forEach(v => vmap[v.id] = v);
  S.data = { drivers:dp, vehicles:vh, docs:dc, reqs:rq, pays:py, reports:rp, settings:st, profiles, vmap };
}
const nm = id => { const p = S.data.profiles[id]; return p ? (p.full_name || p.email || 'User') : 'Unknown'; };
const vcode = id => S.data.vmap[id]?.vehicle_code || 'Vehicle';

async function notify(uid, title, body){
  const { error } = await sb.from('notifications').insert({ user_id: uid, title, body, is_read: false });
  return !error;
}

/* ---------- shell ---------- */
function shell(inner){
  const D = S.data;
  const openR = D.reports.filter(r => rnorm(r.status) === 'open').length;
  const badge = v => v === 'drivers' ? cntBadge(D.drivers.filter(d => d.verification_status === 'pending').length)
    : v === 'owners' ? cntBadge(D.vehicles.filter(x => norm(x.status) === 'pending').length)
    : v === 'reports' ? cntBadge(openR) : '';
  app.innerHTML = `<div class="top"><h1>DriverMatch Admin</h1><button class="sm" data-act="logout">Log out</button></div>
  <div class="nav">${VIEWS.map(([v,l]) => `<button data-act="nav" data-v="${v}" class="${S.view===v?'on':''}">${l}${badge(v)}</button>`).join('')}</div>
  ${S.errs.length ? `<div class="banner"><b>Some data could not load:</b><br>${S.errs.map(esc).join('<br>')}<br>Run the admin SQL, then tap Refresh on Home.</div>` : ''}
  <div class="${S.msgType}">${esc(S.msg)}</div>${inner}`;
}
const cntBadge = n => n ? `<span class="badge">${n}</span>` : '';

function render(){
  if (S.openId && (S.view === 'drivers' || S.view === 'owners')) return renderDetail();
  const fn = { home:vHome, drivers:vPeople, owners:vPeople, matches:vMatches, payments:vPayments, reports:vReports, settings:vSettings }[S.view];
  shell(fn());
  if (S.view === 'drivers' || S.view === 'owners') renderPeopleList();
  if (S.view === 'matches') renderMatchList();
}

/* ---------- home ---------- */
function vHome(){
  const D = S.data;
  const dr = D.drivers.filter(d => d.verification_status !== 'incomplete');
  const paid = D.pays.filter(p => PAID.includes(low(p.status)));
  const income = paid.reduce((a, p) => a + (p.amount_cents || 0), 0);
  const box = (n, l) => `<div class="card stat"><b>${n}</b><span class="mu">${l}</span></div>`;
  return `<div class="stats">
    ${box(dr.length, 'Drivers')}
    ${box(dr.filter(d => d.verification_status === 'pending').length, 'Drivers pending')}
    ${box(D.vehicles.length, 'Vehicles')}
    ${box(D.vehicles.filter(v => norm(v.status) === 'pending').length, 'Vehicles pending')}
    ${box(D.reqs.filter(r => r.status === 'pending').length, 'Requests pending')}
    ${box(D.reqs.filter(r => r.status === 'accepted').length, 'Matches made')}
    ${box(D.reports.filter(r => rnorm(r.status) === 'open').length, 'Open reports')}
    ${box(rand(income), 'Income (' + paid.length + ' payments)')}
  </div><div class="acts"><button data-act="refresh">Refresh data</button></div>`;
  }
