'use strict';
// Selling spaces, price approvals, sponsor leads, notes (shared/private), reminders, artwork.
const image = require('./image');

module.exports = (app) => {
  const { db, sec, ui, access, fail, render, redirect, binary } = app;
  const { esc, icon, money, form, field, textarea, select, button, linkBtn, pill, empty, avatar } = ui;
  const cents = (v) => { const n = Math.round(Number(String(v || '').replace(/[$,\s]/g, '')) * 100); if (!Number.isSafeInteger(n) || n < 0 || n > 100000000) fail(400, 'Please enter a valid dollar amount.'); return n; };
  const log = (eventId, actor, kind, text) => db.q('INSERT INTO activity(id,event_id,actor_id,kind,text) VALUES($1,$2,$3,$4,$5)', [db.uid(), eventId, actor, kind, String(text).slice(0, 300)]);

  async function positionFor(u, id) {
    if (!sec.isUuid(id)) return null;
    const p = await db.one(`SELECT p.*,t.label table_label,t.kind,t.stage,t.event_id,e.charity_id,e.deadline FROM positions p JOIN tables t ON t.id=p.table_id JOIN events e ON e.id=t.event_id WHERE p.id=$1`, [id]);
    return p && (await access.event(u, p.event_id)) ? p : null;
  }
  const needOpen = (p) => { if (p.stage !== 'open') fail(409, 'This table is locked for production. Ask Cactus to unlock it first.'); };

  // ---------- artwork storage (shared by volunteer upload and sponsor link) ----------
  app.saveArtwork = async (positionId, file, userId, viaLink) => {
    if (!file) fail(400, 'Please choose a file to upload.');
    if (file.truncated) fail(413, 'That file is over 15 MB. Please send a smaller version.');
    let mime = file.mime;
    if (mime === 'application/octet-stream' && /\.pdf$/i.test(file.filename)) mime = 'application/pdf';
    if (!image.ALLOWED[mime]) fail(415, 'Please upload a PNG, JPG, WebP, GIF, SVG or PDF file.');
    const g = image.grade(file.data, mime);
    await db.tx(async (t) => {
      await t.q('INSERT INTO artwork_files(id,position_id,mime,filename,data,width,height,quality,uploaded_by,via_link) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [db.uid(), positionId, mime, file.filename, file.data, g.w || null, g.h || null, g.quality, userId, viaLink]);
      await t.q(`UPDATE positions SET artwork_status='submitted',artwork_note=NULL WHERE id=$1`, [positionId]);
      const p = await t.one('SELECT t.event_id,p.code,s.company FROM positions p JOIN tables t ON t.id=p.table_id LEFT JOIN sponsors s ON s.id=p.sponsor_id WHERE p.id=$1', [positionId]);
      await t.q(`INSERT INTO activity(id,event_id,actor_id,kind,text) VALUES($1,$2,$3,'art',$4)`, [db.uid(), p.event_id, userId, `uploaded artwork for ${p.company || ui.spaceName(p.code)}${viaLink ? ' (via sponsor link)' : ''}`]);
    });
    return g;
  };

  // ---------- position (a single sellable space) ----------
  app.get(/^\/position\/([0-9a-f-]{36})$/, async (ctx) => {
    const u = ctx.user, p = await positionFor(u, ctx.params[0]);
    if (!p) fail(404, 'That space isn’t available to you.');
    const lead = access.isLead(u), open = p.stage === 'open';
    const s = p.sponsor_id ? await db.one('SELECT * FROM sponsors WHERE id=$1', [p.sponsor_id]) : null;
    const seller = p.seller_id ? await db.one('SELECT id,name,(photo_data IS NOT NULL) has_photo FROM users WHERE id=$1', [p.seller_id]) : null;
    const files = await db.all('SELECT id,mime,filename,width,height,quality,created_at,via_link FROM artwork_files WHERE position_id=$1 ORDER BY created_at DESC LIMIT 5', [p.id]);
    const late = p.deadline && new Date() > new Date(ui.dateOnly(p.deadline) + 'T23:59:59-07:00');
    let main = '';
    if (p.status === 'available') {
      const leads = await db.all(`SELECT id,company FROM workspace_prospects WHERE event_id=$1 AND sponsor_id IS NULL ORDER BY company`, [p.event_id]);
      const pre = ctx.url.searchParams.get('lead');
      main = open ? `<section class="card"><h2>Sell this space</h2>${late ? `<p class="alert">The sales deadline has passed. You can still record this sale — it will be flagged as late for Cactus.</p>` : ''}
        ${form(ctx, '/position/' + p.id + '/sell', `${select('Sponsor', 'lead_id', [['', '＋ New sponsor'], ...leads.map((l) => [l.id, l.company])], pre, { attrs: 'data-toggle-new' })}
        <div class="newsponsor stack" data-new>${field('Business or family name', 'company', { required: true, attrs: 'maxlength="120" autocomplete="organization"' })}${field('Contact person', 'contact', { attrs: 'maxlength="120"' })}<div class="two">${field('Phone', 'phone', { type: 'tel', attrs: 'autocomplete="tel" inputmode="tel"' })}${field('Email', 'email', { type: 'email', attrs: 'autocomplete="email"' })}</div></div>
        ${field('Agreed price ($)', 'price', { value: (p.asking_cents / 100).toFixed(0), required: true, attrs: 'inputmode="decimal"', hint: u.role === 'sales' ? `Asking price is ${money(p.asking_cents)}. A lower price is sent to your charity lead for approval.` : `Asking price is ${money(p.asking_cents)}.` })}
        <fieldset class="seg-choice"><legend>Status</legend><label><input type="radio" name="status" value="sold" checked><span>Sold · committed</span></label><label><input type="radio" name="status" value="pending"><span>Reserve for now</span></label></fieldset>
        ${button('Record sale', { ic: 'check' })}`, { cls: 'stack' })}</section>`
        : `<section class="card"><p class="muted">${icon('lock')} This table is locked, so this space can’t be sold right now.</p></section>`;
    } else {
      main = `<section class="card sponsor-card"><div class="card-h"><h2>${esc(s?.company || 'Sponsor')}</h2>${pill(p.status, ui.STATUS[p.status])}</div>
        ${s?.contact ? `<p>${esc(s.contact)}</p>` : ''}<div class="contact-btns">${s?.phone ? `<a class="btn btn-soft" href="tel:${esc(s.phone)}">${icon('phone')}<span>${esc(s.phone)}</span></a>` : ''}${s?.email ? `<a class="btn btn-soft" href="mailto:${esc(s.email)}">${icon('mail')}<span>Email</span></a>` : ''}</div>
        <dl class="facts"><div><dt>Agreed price</dt><dd>${money(p.agreed_cents)}</dd></div><div><dt>Sold by</dt><dd>${seller ? avatar(seller) + ' ' + esc(seller.name) : '—'}</dd></div></dl>
        ${p.needs_approval && p.status === 'pending' ? `<p class="alert">Below the ${money(p.asking_cents)} asking price — waiting for the charity lead to approve.</p>${lead ? form(ctx, '/position/' + p.id + '/approve', button('Approve price', { ic: 'check' }), { cls: 'inline' }) : ''}` : ''}
        ${p.status === 'pending' && !p.needs_approval && open ? form(ctx, '/position/' + p.id + '/confirm', button('Mark as sold', { ic: 'check' })) : ''}
        ${p.prospect_id ? `<p><a href="/sponsors/${esc(p.prospect_id)}">Notes & follow-ups for this sponsor ${icon('chev')}</a></p>` : ''}</section>
      <section class="card"><div class="card-h"><h2>Artwork</h2>${pill(p.artwork_status === 'approved' ? 'sold' : p.artwork_status === 'correction' ? 'warn' : p.artwork_status === 'submitted' ? 'pending' : 'available', ui.ART[p.artwork_status] || p.artwork_status)}</div>
        ${p.artwork_status === 'correction' && p.artwork_note ? `<p class="alert">Cactus: ${esc(p.artwork_note)}</p>` : ''}
        ${files.length ? `<ul class="files">${files.map((f) => `<li><a href="/artwork/file/${esc(f.id)}" target="_blank" rel="noopener">${f.mime.startsWith('image/') && f.mime !== 'image/svg+xml' ? `<img src="/artwork/file/${esc(f.id)}" alt="">` : `<span class="file-ic">${f.mime === 'application/pdf' ? 'PDF' : 'SVG'}</span>`}</a><div><strong>${esc(f.filename || 'Artwork')}</strong><small>${f.width ? f.width + ' × ' + f.height + ' px · ' : ''}${esc(ui.ago(f.created_at))}${f.via_link ? ' · from sponsor' : ''}</small>${pill(f.quality === 'good' ? 'sold' : f.quality === 'low' ? 'warn' : 'pending', f.quality === 'good' ? 'Looks sharp' : f.quality === 'low' ? 'Too small' : 'Needs review')}</div></li>`).join('')}</ul>` : '<p class="muted">No artwork yet.</p>'}
        ${open && p.artwork_status !== 'approved' ? `${form(ctx, '/position/' + p.id + '/artwork', `<div class="field"><label for="art">Upload logo</label><input id="art" type="file" name="art" required accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,application/pdf"><p class="hint">Original files print best — vector, PDF, or a large PNG. We check the size automatically.</p></div>${button('Upload artwork', { kind: 'soft', ic: 'image' })}`, { cls: 'stack', multipart: true })}
        ${form(ctx, '/position/' + p.id + '/artlink', button('Get a link for the sponsor to upload', { kind: 'ghost', ic: 'share' }))}` : ''}
        ${ctx.flash?.link ? `<div class="sharebox"><label for="lnk">Private upload link (valid 30 days)</label><input id="lnk" readonly value="${esc(ctx.flash.link)}"><div class="two"><button class="btn btn-primary" data-share="${esc(ctx.flash.link)}" data-share-text="Upload your logo for our charity table">${icon('share')}<span>Share</span></button><button class="btn btn-soft" data-copy="#lnk">Copy</button></div></div>` : ''}
        ${u.role === 'cactus' && p.artwork_status !== 'needed' ? artReview(ctx, p) : ''}</section>`;
    }
    let leadTools = '';
    if (lead && open) {
      const others = p.status !== 'available' ? await db.all(`SELECT p.id,p.code,t.label FROM positions p JOIN tables t ON t.id=p.table_id WHERE t.event_id=$1 AND t.stage='open' AND p.status='available' AND p.id<>$2 ORDER BY t.created_at,p.code`, [p.event_id, p.id]) : [];
      leadTools = `<details class="card add"><summary>${icon('shield')}<span>Charity lead tools</span></summary><div class="stack">
        ${form(ctx, '/position/' + p.id + '/price', field('Asking price ($)', 'price', { value: (p.asking_cents / 100).toFixed(0), required: true, attrs: 'inputmode="decimal"' }) + button('Update asking price', { kind: 'soft' }), { cls: 'stack' })}
        ${others.length ? form(ctx, '/position/' + p.id + '/move', select('Move this sponsor to', 'to', others.map((o) => [o.id, o.label + ' · ' + ui.spaceName(o.code)])) + `<p class="hint">The original salesperson keeps credit and is notified. Price, contact and artwork move too.</p>` + button('Move sponsorship', { kind: 'soft' }), { cls: 'stack' }) : ''}
        ${p.status !== 'available' ? form(ctx, '/position/' + p.id + '/release', button('Release this space', { kind: 'danger' }), { confirm: 'Release this space? The sponsor stays in your sponsor list, but this space becomes available again.' }) : ''}</div></details>`;
    }
    render(ctx, { title: ui.spaceName(p.code), active: '/tables', back: '/tables/' + p.table_id, body: `<div class="page-head"><div><p class="eyebrow">${esc(p.table_label)}</p><h1 class="page-h">${esc(ui.spaceName(p.code))}</h1></div><div class="raised"><span class="label">Asking</span><strong>${money(p.asking_cents)}</strong></div></div>${ctx.url.searchParams.get('celebrate') ? '<div class="confetti" aria-hidden="true"></div>' : ''}${main}${leadTools}` });
  });
  function artReview(ctx, p) {
    return `<div class="review">${form(ctx, '/position/' + p.id + '/art-review', `<input type="hidden" name="decision" value="approved">${button('Approve artwork', { ic: 'check' })}`, { cls: 'inline' })}
      ${form(ctx, '/position/' + p.id + '/art-review', `<input type="hidden" name="decision" value="correction">${textarea('What needs to change?', 'note', { required: true, attrs: 'maxlength="500"' })}${button('Needs changes', { kind: 'soft' })}`, { cls: 'stack' })}</div>`;
  }

  app.post(/^\/position\/([0-9a-f-]{36})\/sell$/, async (ctx) => {
    const u = ctx.user, f = ctx.form, p = await positionFor(u, ctx.params[0]);
    if (!p) fail(404, 'Not available.'); needOpen(p);
    if (!['sold', 'pending'].includes(f.status)) fail(400, 'Choose sold or reserve.');
    const price = cents(f.price);
    const below = price < p.asking_cents && u.role === 'sales';
    const status = below ? 'pending' : f.status;
    const company = await db.tx(async (t) => {
      const lock = await t.one('SELECT status FROM positions WHERE id=$1 FOR UPDATE', [p.id]);
      if (lock.status !== 'available') throw new app.HttpError(409, 'Someone just took this space. Please choose another.');
      let lead = null;
      if (f.lead_id) {
        lead = await t.one('SELECT * FROM workspace_prospects WHERE id=$1 AND event_id=$2', [f.lead_id, p.event_id]);
        if (!lead) throw new app.HttpError(400, 'Choose a sponsor from the list.');
      } else {
        const name = String(f.company || '').trim().slice(0, 120);
        if (!name) throw new app.HttpError(400, 'Enter the sponsor’s business or family name.');
        if (!String(f.phone || '').trim() && !String(f.email || '').trim()) throw new app.HttpError(400, 'Add a phone number or email so the team can reach the sponsor.');
        lead = { id: db.uid(), company: name, contact: String(f.contact || '').slice(0, 120), email: String(f.email || '').slice(0, 160), phone: String(f.phone || '').slice(0, 40) };
        await t.q('INSERT INTO workspace_prospects(id,event_id,owner_id,company,contact,email,phone,stage) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [lead.id, p.event_id, u.id, lead.company, lead.contact, lead.email, lead.phone, 'sold']);
      }
      let sponsorId = lead.sponsor_id;
      if (!sponsorId) {
        sponsorId = db.uid();
        await t.q('INSERT INTO sponsors(id,charity_id,company,contact,email,phone) VALUES($1,$2,$3,$4,$5,$6)', [sponsorId, p.charity_id, lead.company, lead.contact || '', lead.email || '', lead.phone || '']);
      }
      // Once a sponsor buys, its lead record links to the sponsor so there is one directory.
      await t.q(`UPDATE workspace_prospects SET sponsor_id=$1,stage='sold' WHERE id=$2`, [sponsorId, lead.id]);
      await t.q(`UPDATE positions SET status=$1,sponsor_id=$2,prospect_id=$3,agreed_cents=$4,seller_id=$5,needs_approval=$6,sold_at=now() WHERE id=$7`, [status, sponsorId, lead.id, price, u.id, below, p.id]);
      await t.q('INSERT INTO audit(id,actor_id,action,details) VALUES($1,$2,$3,$4)', [db.uid(), u.id, 'sale', `${p.id} ${status} ${price}`]);
      return lead.company;
    });
    const late = p.deadline && new Date() > new Date(ui.dateOnly(p.deadline) + 'T23:59:59-07:00');
    await log(p.event_id, u.id, 'sale', `${status === 'sold' ? 'sold' : 'reserved'} ${p.table_label} · ${ui.spaceName(p.code)} to ${company}${late ? ' (late)' : ''}`);
    redirect(ctx, '/position/' + p.id + (status === 'sold' ? '?celebrate=1' : ''), below ? 'Saved. The lower price was sent to your charity lead for approval.' : status === 'sold' ? `Sold to ${company}. Nice work!` : 'Space reserved.');
  });

  for (const [action, run] of Object.entries({
    approve: async (ctx, p) => { access.needLead(ctx.user); await db.q(`UPDATE positions SET status='sold',needs_approval=false WHERE id=$1 AND status='pending'`, [p.id]); await log(p.event_id, ctx.user.id, 'sale', `approved the price for ${p.table_label} · ${ui.spaceName(p.code)}`); return 'Price approved — marked as sold.'; },
    confirm: async (ctx, p) => { if (p.needs_approval) fail(400, 'This price still needs the lead’s approval.'); await db.q(`UPDATE positions SET status='sold' WHERE id=$1 AND status='pending'`, [p.id]); await log(p.event_id, ctx.user.id, 'sale', `confirmed ${p.table_label} · ${ui.spaceName(p.code)} as sold`); return 'Marked as sold.'; },
    price: async (ctx, p) => { access.needLead(ctx.user); await db.q('UPDATE positions SET asking_cents=$1 WHERE id=$2', [cents(ctx.form.price), p.id]); return 'Asking price updated.'; },
    release: async (ctx, p) => { access.needLead(ctx.user); await db.q(`UPDATE workspace_prospects SET stage='interested' WHERE id=$1 AND NOT EXISTS(SELECT 1 FROM positions x WHERE x.prospect_id=$1 AND x.id<>$2)`, [p.prospect_id, p.id]); await db.q(`UPDATE positions SET status='available',sponsor_id=NULL,prospect_id=NULL,agreed_cents=NULL,seller_id=NULL,needs_approval=false,artwork_status='needed',artwork_note=NULL,sold_at=NULL WHERE id=$1`, [p.id]); await log(p.event_id, ctx.user.id, 'release', `released ${p.table_label} · ${ui.spaceName(p.code)}`); return 'Space released and available again.'; },
    move: async (ctx, p) => {
      access.needLead(ctx.user);
      const to = await positionFor(ctx.user, ctx.form.to);
      if (!to || to.event_id !== p.event_id) fail(400, 'Choose a space in this event.'); needOpen(to);
      await db.tx(async (t) => {
        const a = await t.one('SELECT * FROM positions WHERE id=$1 FOR UPDATE', [p.id]), b = await t.one('SELECT status FROM positions WHERE id=$1 FOR UPDATE', [to.id]);
        if (b.status !== 'available' || a.status === 'available') throw new app.HttpError(409, 'That space was just taken. Choose another.');
        await t.q(`UPDATE positions SET status=$1,sponsor_id=$2,prospect_id=$3,agreed_cents=$4,seller_id=$5,needs_approval=$6,artwork_status=$7,artwork_note=$8,sold_at=$9 WHERE id=$10`, [a.status, a.sponsor_id, a.prospect_id, a.agreed_cents, a.seller_id, a.needs_approval, a.artwork_status, a.artwork_note, a.sold_at, to.id]);
        await t.q('UPDATE artwork_files SET position_id=$1 WHERE position_id=$2', [to.id, p.id]);
        await t.q(`UPDATE positions SET status='available',sponsor_id=NULL,prospect_id=NULL,agreed_cents=NULL,seller_id=NULL,needs_approval=false,artwork_status='needed',artwork_note=NULL,sold_at=NULL WHERE id=$1`, [p.id]);
      });
      await log(p.event_id, ctx.user.id, 'move', `moved a sponsor from ${p.table_label} · ${ui.spaceName(p.code)} to ${to.table_label} · ${ui.spaceName(to.code)}`);
      ctx.moved = to.id; return 'Sponsorship moved. The salesperson keeps credit.';
    },
    artwork: async (ctx, p) => { const g = await app.saveArtwork(p.id, (ctx.files || []).find((x) => x.name === 'art'), ctx.user.id, false); return { kind: g.quality === 'low' ? 'err' : 'ok', text: g.message }; },
    artlink: async (ctx, p) => { const tk = sec.token(); await db.q(`INSERT INTO artwork_links(token_hash,position_id,created_by,expires_at) VALUES($1,$2,$3,now()+interval '30 days')`, [sec.digest(tk), p.id, ctx.user.id]); const host = ctx.req.headers['x-forwarded-host'] || ctx.req.headers.host; return { text: 'Upload link ready. Share it with the sponsor.', link: `https://${host}/art/${tk}` }; },
    'art-review': async (ctx, p) => {
      access.needCactus(ctx.user);
      const d = ctx.form.decision; if (!['approved', 'correction'].includes(d)) fail(400, 'Choose a decision.');
      const note = d === 'correction' ? String(ctx.form.note || '').trim().slice(0, 500) : null;
      if (d === 'correction' && !note) fail(400, 'Please explain what needs to change.');
      await db.q('UPDATE positions SET artwork_status=$1,artwork_note=$2 WHERE id=$3', [d, note, p.id]);
      await log(p.event_id, ctx.user.id, 'art', d === 'approved' ? `approved artwork for ${ui.spaceName(p.code)} on ${p.table_label}` : `asked for new artwork for ${ui.spaceName(p.code)} on ${p.table_label}`);
      return d === 'approved' ? 'Artwork approved.' : 'Change request sent to the team.';
    },
  })) {
    app.post(new RegExp(`^/position/([0-9a-f-]{36})/${action}$`), async (ctx) => {
      const p = await positionFor(ctx.user, ctx.params[0]); if (!p) fail(404, 'Not available.');
      if (!['art-review', 'artlink'].includes(action)) needOpen(p);
      const msg = await run(ctx, p);
      redirect(ctx, '/position/' + (ctx.moved || p.id), msg);
    });
  }

  app.get(/^\/artwork\/file\/([0-9a-f-]{36})$/, async (ctx) => {
    const f = await db.one('SELECT a.mime,a.data,a.position_id FROM artwork_files a WHERE a.id=$1', [ctx.params[0]]);
    if (!f || !(await positionFor(ctx.user, f.position_id))) fail(404, 'Not available.');
    binary(ctx, f.mime, f.data);
  });

  app.get('/artwork', async (ctx) => {
    const e = ctx.event; if (!e) return redirect(ctx, '/');
    const rows = await db.all(`SELECT p.id,p.code,p.artwork_status,p.artwork_note,t.label,s.company,(SELECT quality FROM artwork_files a WHERE a.position_id=p.id ORDER BY created_at DESC LIMIT 1) q FROM positions p JOIN tables t ON t.id=p.table_id LEFT JOIN sponsors s ON s.id=p.sponsor_id WHERE t.event_id=$1 AND p.status<>'available' ORDER BY CASE p.artwork_status WHEN 'correction' THEN 0 WHEN 'needed' THEN 1 WHEN 'submitted' THEN 2 ELSE 3 END,t.created_at,p.code`, [e.id]);
    const groups = { correction: 'Needs changes', needed: 'Still needed', submitted: 'Waiting for Cactus review', approved: 'Approved' };
    render(ctx, { title: 'Artwork', active: '/more', back: '/more', body: `<h1 class="page-h">Artwork</h1>${rows.length ? Object.entries(groups).map(([k, t]) => { const r = rows.filter((x) => x.artwork_status === k); return r.length ? `<section class="card"><h2>${t} <span class="count-chip">${r.length}</span></h2><ul class="rows">${r.map((x) => `<li><a class="row" href="/position/${esc(x.id)}">${icon('image', k === 'correction' ? 'ic-warn' : 'ic-accent')}<span><strong>${esc(x.company || '—')}</strong><small>${esc(x.label)} · ${esc(ui.spaceName(x.code))}${x.q === 'low' ? ' · file looks too small' : ''}</small></span>${icon('chev')}</a></li>`).join('')}</ul></section>` : ''; }).join('') : empty('No artwork yet', 'Once spaces are sold, their artwork status shows up here.')}` });
  });

  app.get('/approvals', async (ctx) => {
    access.needLead(ctx.user); const e = ctx.event; if (!e) return redirect(ctx, '/');
    const rows = await db.all(`SELECT p.id,p.code,p.asking_cents,p.agreed_cents,t.label,s.company,u.name seller FROM positions p JOIN tables t ON t.id=p.table_id LEFT JOIN sponsors s ON s.id=p.sponsor_id LEFT JOIN users u ON u.id=p.seller_id WHERE t.event_id=$1 AND p.needs_approval AND p.status='pending' ORDER BY p.sold_at`, [e.id]);
    render(ctx, { title: 'Price approvals', active: '/more', back: '/', body: `<h1 class="page-h">Price approvals</h1>${rows.length ? `<section class="card"><ul class="rows">${rows.map((r) => `<li><a class="row" href="/position/${esc(r.id)}">${icon('bell', 'ic-accent')}<span><strong>${esc(r.company)} · ${money(r.agreed_cents)}</strong><small>Asking ${money(r.asking_cents)} · ${esc(r.label)} · ${esc(ui.spaceName(r.code))} · ${esc(r.seller || '')}</small></span>${icon('chev')}</a></li>`).join('')}</ul></section>` : empty('All caught up', 'No discounted sales are waiting for approval.')}` });
  });

  // ---------- sponsors (shared event directory) ----------
  const STAGES = { new: 'New lead', contacted: 'Contacted', interested: 'Interested', sold: 'Sponsor', declined: 'Not this year' };
  async function leadFor(u, id) {
    if (!sec.isUuid(id)) return null;
    const l = await db.one('SELECT w.*,u.name owner_name,u.id owner_uid,(u.photo_data IS NOT NULL) owner_photo FROM workspace_prospects w JOIN users u ON u.id=w.owner_id WHERE w.id=$1', [id]);
    return l && (await access.event(u, l.event_id)) ? l : null;
  }
  app.get('/sponsors', async (ctx) => {
    const e = ctx.event; if (!e) return redirect(ctx, '/');
    const rows = await db.all(`SELECT w.id,w.company,w.contact,w.stage,u.name owner,u.id uid,(u.photo_data IS NOT NULL) has_photo,(SELECT count(*) FROM positions p WHERE p.prospect_id=w.id)::int spaces FROM workspace_prospects w JOIN users u ON u.id=w.owner_id WHERE w.event_id=$1 ORDER BY CASE w.stage WHEN 'interested' THEN 0 WHEN 'contacted' THEN 1 WHEN 'new' THEN 2 WHEN 'sold' THEN 3 ELSE 4 END,w.company`, [e.id]);
    render(ctx, { title: 'Sponsors', active: '/sponsors', body: `<div class="page-head"><h1 class="page-h">Sponsors</h1>${linkBtn('/sponsors/new', 'Add', { ic: 'plus' })}</div>
      ${rows.length ? `<div class="field search"><label class="sr" for="q">Search sponsors</label><input id="q" type="search" placeholder="Search by name" data-filter="#sp-list" autocomplete="off"></div>
      <section class="card"><ul class="rows" id="sp-list">${rows.map((r) => `<li data-name="${esc((r.company + ' ' + r.contact).toLowerCase())}"><a class="row" href="/sponsors/${esc(r.id)}">${avatar({ id: r.uid, name: r.owner, has_photo: r.has_photo })}<span><strong>${esc(r.company)}</strong><small>${esc(r.contact || 'No contact yet')} · ${esc(r.owner)}${r.spaces ? ` · ${r.spaces} space${r.spaces > 1 ? 's' : ''}` : ''}</small></span>${pill(r.stage === 'sold' ? 'sold' : r.stage === 'interested' ? 'pending' : r.stage === 'declined' ? 'muted' : 'available', STAGES[r.stage] || r.stage)}</a></li>`).join('')}</ul></section>
      <p class="hint center">Everyone on your event team sees this list, so nobody calls the same sponsor twice.</p>` : empty('No sponsors yet', 'Add businesses and families you plan to approach. Your team will see them, so no one doubles up.', linkBtn('/sponsors/new', 'Add a sponsor lead', { ic: 'plus' }))}` });
  });
  app.get('/sponsors/new', async (ctx) => {
    if (!ctx.event) return redirect(ctx, '/');
    render(ctx, { title: 'Add sponsor lead', active: '/sponsors', back: '/sponsors', body: `<h1 class="page-h">Add a sponsor lead</h1><section class="card">${form(ctx, '/sponsors/new', `${field('Business or family name', 'company', { required: true, attrs: 'maxlength="120" autocomplete="organization"' })}${field('Contact person', 'contact', { attrs: 'maxlength="120"' })}<div class="two">${field('Phone', 'phone', { type: 'tel', attrs: 'inputmode="tel" autocomplete="tel"' })}${field('Email', 'email', { type: 'email', attrs: 'autocomplete="email"' })}</div>${select('Where things stand', 'stage', Object.entries(STAGES).filter(([k]) => k !== 'sold'), 'new')}${textarea('First note', 'note', { attrs: 'maxlength="2000"' })}<fieldset class="seg-choice"><legend>Who can see this note?</legend><label><input type="radio" name="visibility" value="private" checked><span>Only me</span></label><label><input type="radio" name="visibility" value="shared"><span>My team</span></label></fieldset>${button('Save lead', { ic: 'check' })}`, { cls: 'stack' })}</section>` });
  });
  app.post('/sponsors/new', async (ctx) => {
    const e = ctx.event; if (!e) fail(400, 'Choose an event first.');
    const f = ctx.form, company = String(f.company || '').trim().slice(0, 120);
    if (!company) fail(400, 'Enter the business or family name.');
    const dup = await db.one('SELECT w.id,u.name FROM workspace_prospects w JOIN users u ON u.id=w.owner_id WHERE w.event_id=$1 AND lower(w.company)=lower($2)', [e.id, company]);
    if (dup) return redirect(ctx, '/sponsors/' + dup.id, { kind: 'err', text: `${company} is already on the list (${dup.name} is working it). Add your notes here.` });
    const id = db.uid();
    await db.q('INSERT INTO workspace_prospects(id,event_id,owner_id,company,contact,email,phone,stage) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [id, e.id, ctx.user.id, company, String(f.contact || '').slice(0, 120), String(f.email || '').slice(0, 160), String(f.phone || '').slice(0, 40), STAGES[f.stage] && f.stage !== 'sold' ? f.stage : 'new']);
    if (String(f.note || '').trim()) await db.q('INSERT INTO workspace_notes(id,prospect_id,author_id,visibility,body) VALUES($1,$2,$3,$4,$5)', [db.uid(), id, ctx.user.id, f.visibility === 'shared' ? 'shared' : 'private', String(f.note).trim().slice(0, 2000)]);
    redirect(ctx, '/sponsors/' + id, 'Sponsor lead saved.');
  });

  app.get(/^\/sponsors\/([0-9a-f-]{36})$/, async (ctx) => {
    const u = ctx.user, l = await leadFor(u, ctx.params[0]);
    if (!l) fail(404, 'That sponsor isn’t available to you.');
    const shared = await db.all(`SELECT n.*,u.name,u.id uid,(u.photo_data IS NOT NULL) has_photo FROM workspace_notes n JOIN users u ON u.id=n.author_id WHERE n.prospect_id=$1 AND n.visibility='shared' ORDER BY n.created_at DESC`, [l.id]);
    // Private notes: filtered in SQL to the author. Hidden entirely during Cactus "View as".
    const mine = ctx.realUser ? [] : await db.all(`SELECT * FROM workspace_notes WHERE prospect_id=$1 AND visibility='private' AND author_id=$2 ORDER BY created_at DESC`, [l.id, u.id]);
    const hiddenCount = ctx.realUser ? (await db.one(`SELECT count(*)::int n FROM workspace_notes WHERE prospect_id=$1 AND visibility='private' AND author_id=$2`, [l.id, u.id])).n : 0;
    const rem = await db.all(`SELECT * FROM workspace_reminders WHERE prospect_id=$1 AND owner_id=$2 ORDER BY done,due_at`, [l.id, u.id]);
    const spaces = await db.all(`SELECT p.id,p.code,p.status,t.label FROM positions p JOIN tables t ON t.id=p.table_id WHERE p.prospect_id=$1`, [l.id]);
    const avail = l.stage !== 'sold' || true ? await db.all(`SELECT p.id,p.code,p.asking_cents,t.label FROM positions p JOIN tables t ON t.id=p.table_id WHERE t.event_id=$1 AND t.stage='open' AND p.status='available' ORDER BY t.created_at,(p.code LIKE 'P%') DESC,length(p.code),p.code`, [l.event_id]) : [];
    const canEdit = l.owner_id === u.id || access.isLead(u);
    const cal = (r) => { const s = new Date(r.due_at), e2 = new Date(s.getTime() + 30 * 60e3), f = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(r.title)}&dates=${f(s)}/${f(e2)}`; };
    render(ctx, { title: l.company, active: '/sponsors', back: '/sponsors', body: `
      <div class="page-head"><div><p class="eyebrow">${esc(STAGES[l.stage] || l.stage)}</p><h1 class="page-h">${esc(l.company)}</h1><p class="muted">${avatar({ id: l.owner_uid, name: l.owner_name, has_photo: l.owner_photo })} Worked by ${esc(l.owner_name)}</p></div></div>
      <section class="card">${l.contact ? `<p><strong>${esc(l.contact)}</strong></p>` : ''}<div class="contact-btns">${l.phone ? `<a class="btn btn-soft" href="tel:${esc(l.phone)}">${icon('phone')}<span>${esc(l.phone)}</span></a>` : ''}${l.email ? `<a class="btn btn-soft" href="mailto:${esc(l.email)}">${icon('mail')}<span>${esc(l.email)}</span></a>` : ''}</div>
        ${spaces.length ? `<ul class="rows">${spaces.map((s) => `<li><a class="row" href="/position/${esc(s.id)}">${icon('table', 'ic-accent')}<span>${esc(s.label)} · ${esc(ui.spaceName(s.code))}</span>${pill(s.status, ui.STATUS[s.status])}</a></li>`).join('')}</ul>` : ''}
        ${canEdit ? `<details class="add"><summary>${icon('more')}<span>Edit details</span></summary>${form(ctx, '/sponsors/' + l.id + '/edit', `${field('Business or family name', 'company', { value: l.company, required: true })}${field('Contact person', 'contact', { value: l.contact })}<div class="two">${field('Phone', 'phone', { type: 'tel', value: l.phone })}${field('Email', 'email', { type: 'email', value: l.email })}</div>${l.stage !== 'sold' ? select('Where things stand', 'stage', Object.entries(STAGES).filter(([k]) => k !== 'sold'), l.stage) : ''}${button('Save', { kind: 'soft' })}`, { cls: 'stack' })}</details>` : ''}</section>
      ${avail.length ? `<section class="card"><h2>Sell a space to ${esc(l.company)}</h2><form method="get" action="/go-sell" class="stack"><input type="hidden" name="lead" value="${esc(l.id)}">${select('Choose a space', 'p', avail.map((a) => [a.id, `${a.label} · ${ui.spaceName(a.code)} · ${money(a.asking_cents)}`]))}${button('Continue', { ic: 'chev' })}</form></section>` : ''}
      <section class="card"><h2>${icon('users', 'ic-accent')} Team notes</h2>${shared.length ? `<ul class="notes">${shared.map((n) => `<li>${avatar({ id: n.uid, name: n.name, has_photo: n.has_photo })}<div><p>${esc(n.body)}</p><small>${esc(n.name)} · ${esc(ui.fmtWhen(n.created_at))}</small></div></li>`).join('')}</ul>` : '<p class="muted">No team notes yet.</p>'}</section>
      <section class="card private"><h2>${icon('lock', 'ic-accent')} My private notes</h2><p class="hint">Only you can see these — not your team, not your lead.</p>${ctx.realUser ? `<p class="muted">${hiddenCount} private note${hiddenCount === 1 ? '' : 's'} hidden — private notes are never shown in “View as”.</p>` : mine.length ? `<ul class="notes">${mine.map((n) => `<li><div><p>${esc(n.body)}</p><small>${esc(ui.fmtWhen(n.created_at))}</small></div></li>`).join('')}</ul>` : ''}</section>
      <section class="card">${form(ctx, '/sponsors/' + l.id + '/note', `${textarea('Add a note', 'body', { required: true, attrs: 'maxlength="2000"' })}<fieldset class="seg-choice"><legend>Who can see it?</legend><label><input type="radio" name="visibility" value="private" checked><span>Only me</span></label><label><input type="radio" name="visibility" value="shared"><span>My team</span></label></fieldset>${button('Save note', { kind: 'soft' })}`, { cls: 'stack' })}</section>
      <section class="card"><h2>${icon('bell', 'ic-accent')} My follow-ups</h2>${rem.length ? `<ul class="rows">${rem.map((r) => `<li class="row ${r.done ? 'done' : ''}">${form(ctx, '/reminders/' + r.id + '/toggle', `<button class="check${r.done ? ' on' : ''}" aria-label="${r.done ? 'Mark not done' : 'Mark done'}">${icon('check')}</button>`, { cls: 'inline' })}<span><strong>${esc(r.title)}</strong><small>${esc(ui.fmtWhen(r.due_at))}</small></span>${r.done ? '' : `<a class="btn btn-ghost btn-sm" href="${esc(cal(r))}" target="_blank" rel="noopener" data-cal-preview="${esc(r.title + ' — ' + ui.fmtWhen(r.due_at))}">${icon('cal')}<span>Google Calendar</span></a>`}</li>`).join('')}</ul>` : '<p class="muted">No follow-ups yet.</p>'}
        ${form(ctx, '/sponsors/' + l.id + '/reminder', `<div class="two">${field('What to do', 'title', { value: 'Call ' + (l.contact || l.company), required: true, attrs: 'maxlength="140"' })}${field('When', 'due', { type: 'datetime-local', required: true })}</div><p class="hint">Google Calendar gets only the title and time — never your notes or the sponsor’s contact details.</p>${button('Add follow-up', { kind: 'soft', ic: 'plus' })}`, { cls: 'stack' })}</section>` });
  });
  app.get('/go-sell', async (ctx) => {
    const p = ctx.url.searchParams.get('p'), lead = ctx.url.searchParams.get('lead');
    if (!sec.isUuid(p) || !sec.isUuid(lead)) fail(400, 'Choose a space.');
    redirect(ctx, `/position/${p}?lead=${lead}`);
  });
  app.post(/^\/sponsors\/([0-9a-f-]{36})\/(note|reminder|edit)$/, async (ctx) => {
    const u = ctx.user, l = await leadFor(u, ctx.params[0]); if (!l) fail(404, 'Not available.');
    const f = ctx.form, what = ctx.params[1];
    if (what === 'note') {
      const body = String(f.body || '').trim().slice(0, 2000); if (!body) fail(400, 'Write a note first.');
      await db.q('INSERT INTO workspace_notes(id,prospect_id,author_id,visibility,body) VALUES($1,$2,$3,$4,$5)', [db.uid(), l.id, u.id, f.visibility === 'shared' ? 'shared' : 'private', body]);
      if (f.visibility === 'shared') await log(l.event_id, u.id, 'note', `added a team note on ${l.company}`);
      return redirect(ctx, '/sponsors/' + l.id, f.visibility === 'shared' ? 'Team note added.' : 'Private note saved.');
    }
    if (what === 'reminder') {
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(f.due || '')) fail(400, 'Choose a date and time.');
      const due = new Date(f.due + ':00-07:00'); // Arizona time (no daylight saving)
      await db.q('INSERT INTO workspace_reminders(id,prospect_id,owner_id,title,due_at) VALUES($1,$2,$3,$4,$5)', [db.uid(), l.id, u.id, String(f.title || 'Follow up').trim().slice(0, 140), due]);
      return redirect(ctx, '/sponsors/' + l.id, 'Follow-up added to your list.');
    }
    if (!(l.owner_id === u.id || access.isLead(u))) fail(403, 'Only the person working this lead, or your charity lead, can edit it.');
    const company = String(f.company || '').trim().slice(0, 120) || l.company;
    await db.q('UPDATE workspace_prospects SET company=$1,contact=$2,phone=$3,email=$4,stage=CASE WHEN stage=$6 THEN stage ELSE $5 END WHERE id=$7', [company, String(f.contact || '').slice(0, 120), String(f.phone || '').slice(0, 40), String(f.email || '').slice(0, 160), STAGES[f.stage] && f.stage !== 'sold' ? f.stage : l.stage, 'sold', l.id]);
    if (l.sponsor_id) await db.q('UPDATE sponsors SET company=$1,contact=$2,phone=$3,email=$4 WHERE id=$5', [company, String(f.contact || '').slice(0, 120), String(f.phone || '').slice(0, 40), String(f.email || '').slice(0, 160), l.sponsor_id]);
    redirect(ctx, '/sponsors/' + l.id, 'Saved.');
  });
  app.post(/^\/reminders\/([0-9a-f-]{36})\/toggle$/, async (ctx) => {
    const r = await db.one('SELECT r.*,w.event_id FROM workspace_reminders r JOIN workspace_prospects w ON w.id=r.prospect_id WHERE r.id=$1 AND r.owner_id=$2', [ctx.params[0], ctx.user.id]);
    if (!r) fail(404, 'Not available.');
    await db.q('UPDATE workspace_reminders SET done=NOT done WHERE id=$1', [r.id]);
    redirect(ctx, ctx.form.back === 'my' ? '/my' : '/sponsors/' + r.prospect_id, r.done ? 'Follow-up reopened.' : 'Done. Nice.');
  });

  // ---------- My list: personal workspace ----------
  app.get('/my', async (ctx) => {
    const u = ctx.user, e = ctx.event; if (!e) return redirect(ctx, '/');
    const rem = await db.all(`SELECT r.*,w.company FROM workspace_reminders r JOIN workspace_prospects w ON w.id=r.prospect_id WHERE r.owner_id=$1 AND w.event_id=$2 AND NOT r.done ORDER BY r.due_at`, [u.id, e.id]);
    const leads = await db.all(`SELECT id,company,contact,stage FROM workspace_prospects WHERE owner_id=$1 AND event_id=$2 ORDER BY CASE stage WHEN 'interested' THEN 0 WHEN 'contacted' THEN 1 WHEN 'new' THEN 2 WHEN 'sold' THEN 3 ELSE 4 END,company`, [u.id, e.id]);
    const sold = await db.all(`SELECT p.id,p.code,p.status,p.agreed_cents,p.artwork_status,t.label,s.company FROM positions p JOIN tables t ON t.id=p.table_id LEFT JOIN sponsors s ON s.id=p.sponsor_id WHERE t.event_id=$1 AND p.seller_id=$2 AND p.status<>'available' ORDER BY p.sold_at DESC`, [e.id, u.id]);
    const now = Date.now();
    render(ctx, { title: 'My list', active: '/my', body: `<h1 class="page-h">My list</h1>
      <section class="card"><h2>Follow-ups</h2>${rem.length ? `<ul class="rows">${rem.map((r) => `<li class="row">${form(ctx, '/reminders/' + r.id + '/toggle', `<input type="hidden" name="back" value="my"><button class="check" aria-label="Mark done">${icon('check')}</button>`, { cls: 'inline' })}<a href="/sponsors/${esc(r.prospect_id)}"><strong>${esc(r.title)}</strong><small class="${new Date(r.due_at) < now ? 'overdue' : ''}">${esc(r.company)} · ${new Date(r.due_at) < now ? 'Overdue · ' : ''}${esc(ui.fmtWhen(r.due_at))}</small></a></li>`).join('')}</ul>` : '<p class="muted">You’re all caught up.</p>'}</section>
      <section class="card"><div class="card-h"><h2>My sponsor leads</h2><a href="/sponsors/new">Add</a></div>${leads.length ? `<ul class="rows">${leads.map((l) => `<li><a class="row" href="/sponsors/${esc(l.id)}"><span><strong>${esc(l.company)}</strong><small>${esc(l.contact || '')}</small></span>${pill(l.stage === 'sold' ? 'sold' : l.stage === 'interested' ? 'pending' : 'available', STAGES[l.stage])}</a></li>`).join('')}</ul>` : '<p class="muted">Leads you add appear here.</p>'}</section>
      <section class="card"><h2>My sales</h2>${sold.length ? `<ul class="rows">${sold.map((s) => `<li><a class="row" href="/position/${esc(s.id)}"><span><strong>${esc(s.company)} · ${money(s.agreed_cents)}</strong><small>${esc(s.label)} · ${esc(ui.spaceName(s.code))} · ${esc(ui.ART[s.artwork_status] || '')}</small></span>${pill(s.status, ui.STATUS[s.status])}</a></li>`).join('')}</ul>` : '<p class="muted">Your first sale will show up here.</p>'}</section>` });
  });
};
