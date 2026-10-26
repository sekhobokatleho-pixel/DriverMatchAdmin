/* ---------- people (drivers / owners) ---------- */
function people(){
  const D = S.data;
  if (S.view === 'drivers') return D.drivers.filter(d => d.verification_status !== 'incomplete').map(d => {
    const p = D.profiles[d.user_id] || {};
    return { id:d.user_id, uid:d.user_id, status:norm(d.verification_status), reason:d.rejection_reason,
      title:p.full_name || d.driver_code || 'Driver', place:[d.suburb, d.city].filter(Boolean).join(', '),
      blocked:!!p.blocked, raw:d, p, hay:low([p.full_name, p.phone, p.email, d.driver_code, d.suburb, d.city].join(' ')) };
  });
  return D.vehicles.map(v => {
    const p = D.profiles[v.owner_id] || {};
    return { id:v.id, uid:v.owner_id, status:norm(v.status), reason:v.rejection_reason,
      title:`${v.vehicle_code || 'Vehicle'} · ${[v.make, v.model, v.year].filter(Boolean).join(' ')}`,
      owner:p.full_name || 'Owner', place:[v.suburb, v.city].filter(Boolean).join(', '),
      blocked:!!p.blocked, raw:v, p, hay:low([p.full_name, p.phone, p.email, v.vehicle_code, v.make, v.model, v.suburb, v.city].join(' ')) };
  });
}
function vPeople(){
  return `<input id="q" data-search="people" placeholder="Search name, phone, email, code, area" value="${esc(S.q)}"><div id="list"></div>`;
}
function renderPeopleList(){
  const q = low(S.q).trim();
  const all = people(); const base = q ? all.filter(i => i.hay.includes(q)) : all;
  const cnt = k => base.filter(i => i.status === k).length;
  const list = base.filter(i => i.status === S.sec);
  document.getElementById('list').innerHTML = `
    <div class="chips">${['pending','approved','rejected'].map(k => `<button data-act="sec" data-s="${k}" class="${S.sec===k?'on':''}">${k[0].toUpperCase()+k.slice(1)} (${cnt(k)})</button>`).join('')}</div>
    ${list.length ? list.map(i => `<div class="card click" data-act="open" data-id="${esc(i.id)}">
      <div class="row"><b>${esc(i.title)}</b><span>${i.blocked ? '<span class="tag blocked">blocked</span>' : ''}<span class="tag ${i.status}">${i.status}</span></span></div>
      ${S.view === 'owners' ? `<div class="mu">Owner: ${esc(i.owner)}</div>` : `<div class="mu">${esc(i.p.phone || '')}</div>`}
      <div class="mu">${esc(i.place || 'No location')}</div></div>`).join('') : `<div class="mu">Nothing in ${S.sec}.</div>`}`;
}

async function renderDetail(){
  const D = S.data;
  const it = people().find(i => String(i.id) === String(S.openId));
  if (!it) { S.openId = null; return render(); }
  let docs, kv;
  const p = it.p;
  if (S.view === 'drivers') {
    docs = D.docs.filter(d => d.user_id === it.raw.user_id);
    kv = [['Name', p.full_name], ['Phone', p.phone], ['Email', p.email], ['Driver code', it.raw.driver_code], ['Licence', it.raw.licence_type],
      ['Location', it.place], ['Weekly offer', it.raw.weekly_offer ? 'R' + it.raw.weekly_offer : ''], ['Joined', fdate(it.raw.created_at)]];
  } else {
    const v = it.raw;
    docs = D.docs.filter(d => d.vehicle_id === v.id || (d.user_id === v.owner_id && !d.vehicle_id));
    kv = [['Owner', p.full_name], ['Phone', p.phone], ['Email', p.email], ['Vehicle', `${v.vehicle_code || ''} (${v.vehicle_type || ''})`],
      ['Make / model', [v.make, v.model, v.year].filter(Boolean).join(' ')], ['Kms', v.kms], ['Location', it.place], ['Weekly amount', v.weekly_amount ? 'R' + v.weekly_amount : '']];
  }
  shell(`<div class="top"><button data-act="back">← Back</button><span>${it.blocked ? '<span class="tag blocked">blocked</span>' : ''}<span class="tag ${it.status}">${it.status}</span></span></div>
    <h2>${esc(it.title)}</h2>
    <div class="card"><div class="kv">${kv.map(([k, v]) => `<span>${esc(k)}</span><span>${esc(v || '—')}</span>`).join('')}</div>
      ${it.reason ? `<div class="err">Reason: ${esc(it.reason)}</div>` : ''}</div>
    <h2>Documents (${docs.length})</h2><div id="docs"><div class="mu">Loading documents…</div></div>
    <div class="card"><textarea id="why" rows="2" placeholder="Reason (required for rejecting or revoking; sent to the user)"></textarea>
      <div class="acts">
        ${it.status !== 'approved' ? '<button class="p" data-act="setstat" data-to="approved">Approve</button>' : ''}
        ${it.status === 'approved' ? '<button class="d" data-act="setstat" data-to="rejected">Revoke</button>' : ''}
        ${it.status === 'pending' ? '<button class="d" data-act="setstat" data-to="rejected">Reject</button>' : ''}
        <button data-act="block" data-to="${it.blocked ? 'no' : 'yes'}">${it.blocked ? 'Unblock user' : 'Block user'}</button>
      </div></div>`);
  const box = document.getElementById('docs');
  if (!docs.length) { box.innerHTML = '<div class="mu">No documents uploaded.</div>'; return; }
  box.innerHTML = (await Promise.all(docs.map(async d => {
    const { data, error } = await sb.storage.from(C.DOC_BUCKET).createSignedUrl(d.file_path, 900);
    const url = data?.signedUrl; const isImg = /\.(jpe?g|png|gif|webp)$/i.test(d.file_path || ''); const ds = norm(d.status);
    return `<div class="doc"><div class="row"><b>${esc((d.doc_type || 'document').replace(/_/g, ' '))}</b><span class="tag ${ds}">${ds}</span></div>
      <div class="mu">${fdate(d.created_at)}${d.admin_note ? ' · Note: ' + esc(d.admin_note) : ''}</div>
      ${error ? `<div class="err">Cannot open file: ${esc(error.message)}</div>` : (isImg ? `<a href="${url}" target="_blank"><img src="${url}" alt="document"></a>` : `<a href="${url}" target="_blank">Open file</a>`)}
      <div class="acts"><button class="sm p" data-act="docset" data-id="${esc(d.id)}" data-to="approved">Approve doc</button><button class="sm d" data-act="docset" data-id="${esc(d.id)}" data-to="rejected">Reject doc</button></div></div>`;
  }))).join('');
}

async function setPerson(to){
  const it = people().find(i => String(i.id) === String(S.openId)); if (!it) return;
  const why = (document.getElementById('why')?.value || '').trim();
  if (to === 'rejected' && !why) return flashDetail('Please type a reason first.');
  const isD = S.view === 'drivers';
  const patch = isD ? { verification_status: to === 'approved' ? 'verified' : 'rejected', rejection_reason: to === 'approved' ? null : why }
                    : { status: to, rejection_reason: to === 'approved' ? null : why };
  const { data, error } = await (isD ? sb.from('driver_profiles').update(patch).eq('user_id', it.raw.user_id) : sb.from('vehicles').update(patch).eq('id', it.raw.id)).select();
  if (error) return flashDetail(error.message);
  if (!data || !data.length) return flashDetail('Update was blocked. Run the admin SQL.');
  const label = isD ? 'profile' : 'vehicle ' + (it.raw.vehicle_code || '');
  const sent = await notify(it.uid, to === 'approved' ? `Your ${label} was approved` : `Your ${label} was not approved`,
    to === 'approved' ? 'You are now approved on DriverMatch.' : 'Reason: ' + why);
  await loadAll(); S.sec = to; S.openId = null;
  flash(`Moved to ${to}.` + (sent ? ' User notified.' : ' (Could not notify the user; check the notifications policy.)'), sent ? 'ok' : 'err');
  render();
}
function flashDetail(m){ S.msg = m; S.msgType = 'err'; renderDetail(); }

async function setDoc(id, to){
  let note = null;
  if (to === 'rejected') { note = (prompt('Why is this document rejected?') || '').trim(); if (!note) return; }
  const { data, error } = await sb.from('documents').update({ status: to, admin_note: note }).eq('id', id).select();
  if (error) return flashDetail(error.message);
  if (!data || !data.length) return flashDetail('Document update was blocked. Run the admin SQL.');
  const d = S.data.docs.find(x => x.id === id);
  if (d) { d.status = to; d.admin_note = note; if (to === 'rejected') await notify(d.user_id, 'A document needs attention', `${(d.doc_type || 'Document').replace(/_/g, ' ')}: ${note}`); }
  flash(`Document ${to}.`, 'ok'); renderDetail();
}

async function setBlock(to){
  const it = people().find(i => String(i.id) === String(S.openId)); if (!it) return;
  const { data, error } = await sb.from('profiles').update({ blocked: to === 'yes' }).eq('id', it.uid).select();
  if (error) return flashDetail(error.message + ' (run the admin SQL to add the blocked column)');
  if (!data || !data.length) return flashDetail('Blocked. Run the admin SQL.');
  S.data.profiles[it.uid].blocked = (to === 'yes');
  flash(to === 'yes' ? 'User blocked.' : 'User unblocked.', 'ok'); renderDetail();
      }
