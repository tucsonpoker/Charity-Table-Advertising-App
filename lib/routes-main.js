'use strict';
// Dashboard, event switching, profile, tables and the live table view.
module.exports = (app) => {
  const { db, sec, ui, access, fail, render, redirect, binary } = app;
  const { esc, icon, money, form, field, button, linkBtn, pill, empty, avatar } = ui;

  async function eventStats(eventId) {
    return db.one(`SELECT count(p.id)::int spaces,
      count(p.id) FILTER (WHERE p.status='sold')::int sold,
      count(p.id) FILTER (WHERE p.status='pending')::int pending,
      coalesce(sum(p.agreed_cents) FILTER (WHERE p.status='sold'),0)::bigint raised,
      coalesce(sum(p.asking_cents) FILTER (WHERE p.status<>'sold'),0)::bigint unsold,
      coalesce(sum(p.asking_cents) FILTER (WHERE p.status='available'),0)::bigint avail,
      coalesce(sum(p.asking_cents),0)::bigint potential,
      count(p.id) FILTER (WHERE p.status='sold' AND p.artwork_status<>'approved')::int art_open,
      count(DISTINCT t.id)::int tables
      FROM tables t LEFT JOIN positions p ON p.table_id=t.id WHERE t.event_id=$1`, [eventId]);
  }
  app.eventStats = eventStats;
  const daysUntil = (d) => (d ? Math.ceil((new Date(ui.dateOnly(d) + 'T23:59:59-07:00') - Date.now()) / 864e5) : null);

  function noEvent(ctx) {
    const u = ctx.user;
    if (u.role === 'cactus') return render(ctx, { title: 'Welcome', active: '/', body: `<section class="hero"><p class="eyebrow">Welcome to Cactus</p><h1>Let’s set up your first charity.</h1><p>Add the charity’s name and logo, then create their event. Their lead will see a branded app from the very first visit.</p>${linkBtn('/admin', 'Set up a charity', { ic: 'plus' })}</section>` });
    if (u.role === 'manager') return render(ctx, { title: 'Create your event', active: '/', body: `<section class="card"><h1>Create your event</h1><p class="muted">Start with the name and date. You can add tables next.</p>${form(ctx, '/events/new', field('Event name', 'name', { required: true, value: 'Poker Night' }) + field('Event date', 'event_date', { type: 'date' }) + field('Sales & artwork deadline', 'deadline', { type: 'date', hint: 'A soft deadline. Late sales are still allowed and flagged for Cactus.' }) + button('Create event', { ic: 'plus' }), { cls: 'stack' })}</section>` });
    return render(ctx, { title: 'Almost there', active: '/', body: empty('You’re on the team', 'Your charity lead hasn’t added you to an event yet. Once they do, it will show up here automatically.') });
  }

  app.get('/', async (ctx) => {
    const u = ctx.user, e = ctx.event;
    if (!e) return noEvent(ctx);
    const s = await eventStats(e.id);
    const days = daysUntil(e.deadline);
    const pct = s.spaces ? Math.round((s.sold / s.spaces) * 100) : 0;
    const reminders = await db.all(`SELECT r.*,w.company,w.id pid FROM workspace_reminders r JOIN workspace_prospects w ON w.id=r.prospect_id WHERE r.owner_id=$1 AND w.event_id=$2 AND NOT r.done ORDER BY r.due_at LIMIT 4`, [u.id, e.id]);
    const feed = await db.all(`SELECT a.*,u.name,u.id uid,(u.photo_data IS NOT NULL) has_photo FROM activity a LEFT JOIN users u ON u.id=a.actor_id WHERE a.event_id=$1 ORDER BY a.created_at DESC LIMIT 8`, [e.id]);
    const mine = await db.one(`SELECT count(*)::int n,coalesce(sum(agreed_cents),0)::bigint c FROM positions p JOIN tables t ON t.id=p.table_id WHERE t.event_id=$1 AND p.seller_id=$2 AND p.status='sold'`, [e.id, u.id]);
    let attention = '';
    if (access.isLead(u)) {
      const a = await db.one(`SELECT
        (SELECT count(*) FROM positions p JOIN tables t ON t.id=p.table_id WHERE t.event_id=$1 AND p.needs_approval AND p.status='pending')::int approvals,
        (SELECT count(*) FROM recovery_requests r JOIN users x ON x.email=r.email WHERE NOT r.resolved AND x.charity_id=$2)::int resets,
        (SELECT count(*) FROM tables t WHERE t.event_id=$1 AND t.stage='proof')::int proofs,
        (SELECT count(*) FROM positions p JOIN tables t ON t.id=p.table_id WHERE t.event_id=$1 AND p.artwork_status='submitted')::int art_review`, [e.id, e.charity_id]);
      const items = [
        a.approvals && ['/approvals', `${a.approvals} price ${a.approvals === 1 ? 'approval' : 'approvals'} waiting`, 'bell'],
        a.proofs && ['/tables', `${a.proofs} table ${a.proofs === 1 ? 'proof' : 'proofs'} ready for your approval`, 'image'],
        a.resets && ['/team', `${a.resets} password reset ${a.resets === 1 ? 'request' : 'requests'}`, 'lock'],
        u.role === 'cactus' && a.art_review && ['/artwork', `${a.art_review} artwork ${a.art_review === 1 ? 'file' : 'files'} to review`, 'image'],
      ].filter(Boolean);
      if (items.length) attention = `<section class="card attention"><h2>Needs your attention</h2><ul class="rows">${items.map(([h, t, i]) => `<li><a class="row" href="${h}">${icon(i, 'ic-accent')}<span>${esc(t)}</span>${icon('chev')}</a></li>`).join('')}</ul></section>`;
    }
    let moneyCard = '';
    if (access.isLead(u)) {
      const c = await db.one(`SELECT coalesce(sum(CASE kind WHEN 'standard' THEN 15000 WHEN 'center' THEN 55000 ELSE 60000 END),0)::bigint charges,count(*)::int n FROM tables WHERE event_id=$1`, [e.id]);
      const net = Number(s.raised) - Number(c.charges);
      moneyCard = `<section class="card money rise"><h2>Money</h2><p class="muted small">Only charity leads and Cactus see this.</p>
        <dl class="money-grid"><div><dt>Sponsorships sold</dt><dd>${money(s.raised)}</dd></div><div><dt>Table charges · ${c.n}</dt><dd>− ${money(c.charges)}</dd></div><div class="net ${net < 0 ? 'neg' : ''}"><dt>Net so far</dt><dd>${net < 0 ? '− ' + money(-net) : money(net)}</dd></div><div><dt>Not yet sold</dt><dd>${money(s.unsold)}</dd></div></dl>
        <p class="hint">Table charges: Standard $150, Center only $550, Platinum $600. “Not yet sold” is the asking price of open and reserved spaces.</p></section>`;
    }
    const firstName = u.name.split(' ')[0];
    const body = `
<section class="hero rise">
  <div class="hero-top"><div><p class="eyebrow">Hi, ${esc(firstName)}</p><h1>${esc(e.name)}</h1><p class="hero-sub">${e.event_date ? esc(ui.fmtDate(e.event_date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })) : 'Date to be announced'}${e.venue ? ' · ' + esc(e.venue) : ''}</p></div>
  ${days !== null ? `<div class="count" ${days < 0 ? 'data-late' : ''}><strong>${days < 0 ? 'Past' : days}</strong><span>${days < 0 ? 'deadline' : days === 1 ? 'day left' : 'days left'}</span><small>Deadline ${esc(ui.fmtDate(e.deadline, { month: 'short', day: 'numeric' }))}</small></div>` : ''}</div>
  <div class="hero-stats">
    <div><span class="label">Raised so far</span><strong class="big" data-count="${Number(s.raised)}">${money(s.raised)}</strong></div>
    <div><span class="label">Spaces sold</span><strong class="big">${s.sold}<small> / ${s.spaces}</small></strong></div>
  </div>
  <div class="bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="${pct}% of spaces sold"><span style="--w:${pct}%"></span></div>
  <p class="bar-cap">${pct}% sold${s.pending ? ` · ${s.pending} reserved` : ''} · ${money(s.avail)} still available</p>
</section>
<div class="quick">
  ${linkBtn('/tables', 'Sell a space', { ic: 'table' })}
  ${linkBtn('/sponsors/new', 'Add sponsor', { kind: 'soft', ic: 'plus' })}
</div>
${attention}${moneyCard}
<div class="grid2">
<section class="card"><div class="card-h"><h2>My follow-ups</h2><a href="/my">See all</a></div>
  ${reminders.length ? `<ul class="rows">${reminders.map((r) => `<li><a class="row" href="/sponsors/${esc(r.pid)}">${icon('bell', new Date(r.due_at) < new Date() ? 'ic-warn' : 'ic-accent')}<span><strong>${esc(r.title)}</strong><small>${esc(r.company)} · ${esc(ui.fmtWhen(r.due_at))}</small></span>${icon('chev')}</a></li>`).join('')}</ul>` : `<p class="muted">No follow-ups scheduled. Add one from any sponsor lead.</p>`}
  <div class="mini-stat"><span>Your sales</span><strong>${mine.n} · ${money(mine.c)}</strong></div>
</section>
<section class="card"><h2>Team activity</h2>
  ${feed.length ? `<ul class="feed">${feed.map((f) => `<li>${(f.name ? avatar({ id: f.uid, name: f.name, has_photo: f.has_photo }) : `<span class="av av-sm av-sys" aria-hidden="true">${icon('image')}</span>`)}<p>${f.name ? `<strong>${esc(f.name)}</strong> ${esc(f.text)}` : esc(feedText(f.text))}<small>${esc(ui.ago(f.created_at))}</small></p></li>`).join('')}</ul>` : `<p class="muted">Sales and new teammates will appear here.</p>`}
</section></div>`;
    render(ctx, { title: 'Dashboard', active: '/', body });
  });

  app.post('/switch-event', async (ctx) => {
    const e = await access.event(ctx.user, ctx.form.event_id);
    if (!e) fail(403, 'That event isn’t available to you.');
    ctx.setCookies.push(`ev=${e.id}; Path=/; Secure; SameSite=Lax; HttpOnly; Max-Age=31536000`);
    redirect(ctx, '/');
  }, { viewAsOk: true });

  app.post('/events/new', async (ctx) => {
    access.needLead(ctx.user);
    const f = ctx.form, charityId = ctx.user.role === 'cactus' ? f.charity_id : ctx.user.charity_id;
    if (!sec.isUuid(charityId) || !(await db.one('SELECT 1 FROM charities WHERE id=$1', [charityId]))) fail(400, 'Choose a charity first.');
    const name = String(f.name || '').trim().slice(0, 120);
    if (!name) fail(400, 'Please give the event a name.');
    const d = (x) => (/^\d{4}-\d{2}-\d{2}$/.test(x || '') ? x : null);
    const id = db.uid();
    await db.q('INSERT INTO events(id,charity_id,name,event_date,deadline,venue) VALUES($1,$2,$3,$4,$5,$6)', [id, charityId, name, d(f.event_date), d(f.deadline), String(f.venue || '').slice(0, 120) || null]);
    ctx.setCookies.push(`ev=${id}; Path=/; Secure; SameSite=Lax; HttpOnly; Max-Age=31536000`);
    redirect(ctx, '/tables', 'Event created. Now add your tables.');
  });

  app.post('/events/edit', async (ctx) => {
    access.needLead(ctx.user);
    const e = await access.event(ctx.user, ctx.form.event_id); if (!e) fail(403, 'Not available.');
    const d = (x) => (/^\d{4}-\d{2}-\d{2}$/.test(x || '') ? x : null), f = ctx.form;
    await db.q('UPDATE events SET name=$1,event_date=$2,deadline=$3,venue=$4 WHERE id=$5', [String(f.name || e.name).trim().slice(0, 120) || e.name, d(f.event_date), d(f.deadline), String(f.venue || '').slice(0, 120) || null, e.id]);
    redirect(ctx, '/more', 'Event details saved.');
  });

  // ---------- welcome / add to home screen ----------
  app.get('/welcome', async (ctx) => render(ctx, { title: 'Welcome', body: `<section class="hero rise"><p class="eyebrow">You’re in</p><h1>Welcome, ${esc(ctx.user.name.split(' ')[0])}.</h1><p class="hero-sub">Put this app on your home screen so it’s one tap away.</p></section>
    <section class="card"><h2>Add to your home screen</h2>
      <div class="install" data-install><button class="btn btn-primary" data-install-btn hidden>${icon('plus')}<span>Install app</span></button></div>
      <div class="howto"><div><h3>iPhone (Safari)</h3><ol><li>Tap the <strong>Share</strong> button ${icon('share')}</li><li>Choose <strong>Add to Home Screen</strong></li><li>Tap <strong>Add</strong></li></ol></div>
      <div><h3>Android (Chrome)</h3><ol><li>Tap the <strong>⋮</strong> menu</li><li>Choose <strong>Add to Home screen</strong> or <strong>Install app</strong></li><li>Confirm</li></ol></div></div>
      <p class="hint">Your phone asks you to confirm — the app never installs itself.</p>
      ${linkBtn('/', 'Go to my dashboard', { kind: 'soft' })}</section>` }));

  // ---------- More (mobile menu) ----------
  app.get('/more', async (ctx) => {
    const u = ctx.user;
    const items = [['/profile', 'My profile', 'users'], ['/artwork', 'Artwork', 'image'], u.role !== 'sales' && ['/team', 'Team & invitations', 'shield'], u.role !== 'sales' && ['/approvals', 'Price approvals', 'bell'], u.role !== 'sales' && ctx.event && ['/event', 'Event details & deadline', 'cal'], (u.role === 'cactus' || ctx.realUser) && ['/admin', 'Cactus admin', 'star'], ['/welcome', 'Add to home screen', 'phone']].filter(Boolean);
    render(ctx, { title: 'More', active: '/more', body: `<h1 class="page-h">More</h1>${ctx.events && ctx.events.length > 1 ? `<section class="card"><h2>Event</h2>${form(ctx, '/switch-event', ui.select('Working on', 'event_id', ctx.events.map((x) => [x.id, x.charity_name + ' — ' + x.name]), ctx.event?.id, { attrs: 'data-autosubmit' }) + '<noscript><button class="btn btn-soft">Switch</button></noscript>')}</section>` : ''}<section class="card"><ul class="rows">${items.map(([h, t, i]) => `<li><a class="row" href="${h}">${icon(i, 'ic-accent')}<span>${t}</span>${icon('chev')}</a></li>`).join('')}</ul></section>${form(ctx, '/logout', button('Sign out', { kind: 'ghost', ic: 'out' }))}` });
  });

  // ---------- profile ----------
  app.get('/profile', async (ctx) => {
    const u = ctx.user;
    render(ctx, { title: 'My profile', active: '/profile', body: `<h1 class="page-h">My profile</h1>
    <section class="card profile-card">${avatar(u, 'lg')}<div><h2>${esc(u.name)}</h2><p class="muted">${esc(u.email)} · ${ui.ROLE[u.role]}</p></div></section>
    <section class="card"><h2>Name & photo</h2>${form(ctx, '/profile', field('Full name', 'name', { value: u.name, required: true, attrs: 'autocomplete="name" maxlength="120"' }) + `<div class="field"><label for="pp">Profile photo <span class="opt">optional</span></label><input id="pp" type="file" name="photo" accept="image/png,image/jpeg,image/webp"></div>` + button('Save profile'), { cls: 'stack', multipart: true })}</section>
    <section class="card"><h2>Change password</h2>${form(ctx, '/profile/password', `<input type="email" name="username" value="${esc(u.email)}" autocomplete="username" aria-label="Email" hidden>` + field('Current password', 'current', { type: 'password', required: true, attrs: 'autocomplete="current-password"' }) + field('New password', 'next', { type: 'password', required: true, attrs: 'minlength="10" autocomplete="new-password"', hint: 'At least 10 characters.' }) + button('Update password', { kind: 'soft' }), { cls: 'stack' })}</section>
    ${form(ctx, '/logout', button('Sign out', { kind: 'ghost', ic: 'out' }))}` });
  });
  app.post('/profile', async (ctx) => {
    const name = String(ctx.form.name || '').trim().replace(/\s+/g, ' ').slice(0, 120);
    if (name.length < 3) fail(400, 'Please enter your full name.');
    const photo = (ctx.files || []).find((x) => x.name === 'photo' && ['image/png', 'image/jpeg', 'image/webp'].includes(x.mime) && !x.truncated && x.data.length < 5e6);
    if (photo) await db.q('UPDATE users SET name=$1,photo_mime=$2,photo_data=$3 WHERE id=$4', [name, photo.mime, photo.data, ctx.user.id]);
    else await db.q('UPDATE users SET name=$1 WHERE id=$2', [name, ctx.user.id]);
    redirect(ctx, '/profile', 'Profile saved.');
  });
  app.post('/profile/password', async (ctx) => {
    const r = await db.one('SELECT password_hash FROM users WHERE id=$1', [ctx.user.id]);
    if (!sec.verifyPassword(String(ctx.form.current || ''), r.password_hash)) fail(400, 'Your current password wasn’t right.');
    if (String(ctx.form.next || '').length < 10) fail(400, 'Your new password needs at least 10 characters.');
    await db.q('UPDATE users SET password_hash=$1 WHERE id=$2', [sec.hashPassword(ctx.form.next), ctx.user.id]);
    await db.q('DELETE FROM sessions WHERE user_id=$1 AND id<>$2', [ctx.user.id, ctx.sid]);
    redirect(ctx, '/profile', 'Password updated. Other devices were signed out.');
  });
  app.get(/^\/photo\/([0-9a-f-]{36})$/, async (ctx) => {
    const p = await db.one('SELECT photo_mime,photo_data,charity_id FROM users WHERE id=$1', [ctx.params[0]]);
    if (!p?.photo_data || (ctx.user.role !== 'cactus' && ctx.realUser?.role !== 'cactus' && p.charity_id !== ctx.user.charity_id)) fail(404, 'No photo.');
    binary(ctx, p.photo_mime, p.photo_data);
  });

  // Older sponsor-link entries were stored as "uploaded artwork for X (via sponsor link)" with no person.
  function feedText(t) { const m = /^uploaded artwork for (.+) \(via sponsor link\)$/.exec(t || ''); return m ? `${m[1]} uploaded their artwork` : (t || '').charAt(0).toUpperCase() + (t || '').slice(1); }

  // ---------- tables ----------
  const TYPES = { platinum: 'Platinum · 10 edge spaces + center', center: 'Center only', standard: 'Standard · no sponsor spaces' };
  app.get('/tables', async (ctx) => {
    const e = ctx.event; if (!e) return noEvent(ctx);
    const u = ctx.user;
    const tables = await db.all(`SELECT t.*,count(p.id)::int spaces,count(p.id) FILTER (WHERE p.status='sold')::int sold,coalesce(sum(p.agreed_cents) FILTER (WHERE p.status='sold'),0)::bigint raised FROM tables t LEFT JOIN positions p ON p.table_id=t.id WHERE t.event_id=$1 GROUP BY t.id ORDER BY t.created_at`, [e.id]);
    const pos = await db.all(`SELECT p.id,p.table_id,p.code,p.status,p.asking_cents,p.filler FROM positions p JOIN tables t ON t.id=p.table_id WHERE t.event_id=$1`, [e.id]);
    tables.sort((a, b) => a.label.localeCompare(b.label, 'en', { numeric: true }));
    const cards = tables.map((t) => {
      const res = pos.filter((p) => p.table_id === t.id && p.status === 'pending').length;
      const open = Math.max(0, t.spaces - t.sold - res);
      const pct = (n) => (t.spaces ? (n / t.spaces) * 100 : 0).toFixed(1);
      const sub = t.kind === 'standard' ? 'Standard table' : t.kind === 'center' ? 'Center only' : `Platinum · ${t.spaces} spaces`;
      const tag = t.stage !== 'open' ? pill('locked', ui.STAGE[t.stage]) : t.spaces && t.sold === t.spaces ? pill('sold', 'Sold out') : '';
      return `<a class="tcard rise" href="/tables/${esc(t.id)}"><div class="tcard-art">${ui.tableSVG(pos.filter((p) => p.table_id === t.id), t.kind, { small: true })}</div>
        <div class="tcard-h"><div><strong>${esc(t.label)}</strong><small>${sub}</small></div><div class="amt">${money(t.raised)}<small>raised</small></div></div>
        ${t.spaces ? `<div class="tbar" aria-hidden="true"><i class="s" style="width:${pct(t.sold)}%"></i><i class="r" style="width:${pct(res)}%"></i></div>
        <div class="tstats"><span style="--c:var(--brand)">${t.sold} sold</span>${res ? `<span style="--c:#f6b93b">${res} reserved</span>` : ''}<span style="--c:#cfd8d2">${open} open</span>${tag}</div>` : tag ? `<div class="tstats">${tag}</div>` : ''}</a>`;
    }).join('');
    const lead = access.isLead(u);
    render(ctx, { title: 'Tables', active: '/tables', body: `<div class="page-head"><h1 class="page-h">Tables</h1>${lead ? linkBtn('/tables/new', 'Add table', { kind: 'soft', ic: 'plus', cls: 'btn-sm' }) : ''}</div>
      ${tables.length ? `<div class="tgrid">${cards}</div>` : empty('No tables yet', lead ? 'Tap “Add table” to start selling spaces.' : 'Your charity lead will add tables soon.')}` });
  });

  app.get('/tables/new', async (ctx) => {
    access.needLead(ctx.user);
    const e = ctx.event; if (!e) return noEvent(ctx);
    const n = (await db.one('SELECT count(*)::int n FROM tables WHERE event_id=$1', [e.id])).n;
    const counts = Array.from({ length: 20 }, (_, i) => [i + 1, i === 0 ? '1 table' : `${i + 1} tables`]);
    render(ctx, { title: 'Add tables', active: '/tables', back: '/tables', body: `<h1 class="page-h">Add tables</h1><section class="card">${form(ctx, '/tables/new', `<input type="hidden" name="event_id" value="${esc(e.id)}">`
      + ui.select('How many tables?', 'count', counts, 1)
      + ui.select('Table type', 'kind', Object.entries(TYPES), 'platinum')
      + `<div data-show-when="kind=platinum">${ui.select('Center space', 'center_parts', [[1, 'One full center ($1,999)'], [2, 'Split into two halves'], [4, 'Split into four quarters']], 1)}
         <div data-show-when="center_parts=2,4">${field('Price for each center piece ($)', 'piece_price', { type: 'number', required: true, attrs: 'min="1" step="1" inputmode="numeric"', hint: 'Required when the center is split. Edge spaces start at $299.' })}</div></div>`
      + field('First table number', 'start', { type: 'number', required: true, value: String(n + 1), attrs: 'min="1" max="999" inputmode="numeric"', hint: `Tables are named “Table ${n + 1}”, “Table ${n + 2}” and so on. You can rename any table later.` })
      + button('Add tables', { ic: 'plus' }), { cls: 'stack' })}</section>` });
  });

  app.get('/event', async (ctx) => {
    access.needLead(ctx.user);
    const e = ctx.event; if (!e) return noEvent(ctx);
    render(ctx, { title: 'Event details', active: '/more', back: '/more', body: `<h1 class="page-h">Event details</h1><section class="card">${form(ctx, '/events/edit', `<input type="hidden" name="event_id" value="${esc(e.id)}">` + field('Event name', 'name', { value: e.name, required: true }) + field('Event date', 'event_date', { type: 'date', value: ui.dateOnly(e.event_date) }) + field('Sales & artwork deadline', 'deadline', { type: 'date', value: ui.dateOnly(e.deadline), hint: 'Soft deadline — late sales are allowed and flagged.' }) + field('Venue', 'venue', { value: e.venue || '' }) + button('Save details'), { cls: 'stack' })}</section>` });
  });

  app.post('/tables/new', async (ctx) => {
    access.needLead(ctx.user);
    const f = ctx.form, e = await access.event(ctx.user, f.event_id); if (!e) fail(403, 'Not available.');
    const kind = f.kind || 'platinum';
    if (!['standard', 'center', 'platinum'].includes(kind)) fail(400, 'Choose a table type.');
    const count = Number(f.count || 1);
    if (!Number.isInteger(count) || count < 1 || count > 20) fail(400, 'Choose between 1 and 20 tables.');
    // Center splits apply to Platinum tables only (center-only splits are not confirmed).
    const parts = kind === 'platinum' ? Number(f.center_parts || 1) : 1;
    if (![1, 2, 4].includes(parts)) fail(400, 'Choose how the center is split.');
    let piece = 0;
    if (parts > 1) {
      piece = Math.round(Number(String(f.piece_price || '').replace(/[$,\s]/g, '')) * 100);
      if (!Number.isFinite(piece) || piece < 100 || piece > 10000000) fail(400, 'Enter the price for each center piece. There is no default for split centers.');
    }
    const existing = (await db.one('SELECT count(*)::int n FROM tables WHERE event_id=$1', [e.id])).n;
    if (existing + count > 200) fail(400, 'That would be more than 200 tables for one event.');
    let start = Number(f.start || existing + 1); if (!Number.isInteger(start) || start < 1 || start > 999) start = existing + 1;
    await db.tx(async (t) => {
      for (let k = 0; k < count; k++) {
        const id = db.uid();
        await t.q('INSERT INTO tables(id,event_id,label,kind,center_parts) VALUES($1,$2,$3,$4,$5)', [id, e.id, 'Table ' + (start + k), kind, parts]);
        if (kind === 'standard') continue;
        const codes = [...(kind === 'platinum' ? Array.from({ length: 10 }, (_, i) => 'P' + (i + 1)) : []), ...(parts === 1 ? ['CENTER'] : Array.from({ length: parts }, (_, i) => 'CENTER-' + (i + 1)))];
        for (const code of codes) await t.q('INSERT INTO positions(id,table_id,code,asking_cents) VALUES($1,$2,$3,$4)', [db.uid(), id, code, code.startsWith('P') ? 29900 : parts === 1 ? 199900 : piece]);
      }
    });
    redirect(ctx, '/tables', count === 1 ? 'Table added.' : `${count} tables added.`);
  });

  async function tableFor(u, id) {
    if (!sec.isUuid(id)) return null;
    const t = await db.one('SELECT t.*,e.charity_id FROM tables t JOIN events e ON e.id=t.event_id WHERE t.id=$1', [id]);
    return t && (await access.event(u, t.event_id)) ? t : null;
  }
  app.tableFor = tableFor;

  app.get(/^\/tables\/([0-9a-f-]{36})$/, async (ctx) => {
    const u = ctx.user, t = await tableFor(u, ctx.params[0]);
    if (!t) fail(404, 'That table isn’t available to you.');
    await app.useEvent(ctx, t.event_id);
    const pos = await db.all(`SELECT p.*,s.company,x.name seller FROM positions p LEFT JOIN sponsors s ON s.id=p.sponsor_id LEFT JOIN users x ON x.id=p.seller_id WHERE p.table_id=$1 ORDER BY (p.code LIKE 'P%') DESC,length(p.code),p.code`, [t.id]);
    const raised = pos.filter((p) => p.status === 'sold').reduce((a, p) => a + p.agreed_cents, 0);
    const list = pos.map((p) => `<li><a class="row" href="/position/${esc(p.id)}"><span class="code code-${esc(p.status)}">${esc(p.code === 'CENTER' ? 'C' : p.code.startsWith('CENTER-') ? 'C' + p.code.slice(7) : p.code.slice(1))}</span><span><strong>${esc(p.company || (p.filler ? 'Filler: ' + p.filler : ui.spaceName(p.code)))}</strong><small>${p.status === 'available' ? 'Asking ' + money(p.asking_cents) : `${ui.STATUS[p.status]} · ${money(p.agreed_cents)}${p.seller ? ' · ' + esc(p.seller) : ''}`}${p.needs_approval && p.status === 'pending' ? ' · awaiting price approval' : ''}</small></span>${pill(p.status, ui.STATUS[p.status])}</a></li>`).join('');
    const proof = await db.one('SELECT id,decision,decision_note,created_at FROM table_proofs WHERE table_id=$1 ORDER BY created_at DESC LIMIT 1', [t.id]);
    render(ctx, { title: t.label, active: '/tables', back: '/tables', body: `<div class="page-head"><div><h1 class="page-h">${esc(t.label)}</h1><p class="muted">${esc(TYPES[t.kind])}</p></div><div class="raised"><span class="label">Raised</span><strong>${money(raised)}</strong></div></div>
      ${t.stage !== 'open' ? `<div class="lockbar">${icon('lock')}<span><strong>${esc(ui.STAGE[t.stage])}.</strong> Spaces and artwork are locked${t.stage === 'production' ? '' : ' while Cactus reviews'}.</span></div>` : ''}
      <section class="card table-stage">${ui.tableSVG(pos, t.kind)}${t.stage && t.stage !== 'open' ? '' : '<p class="hint center">Tap any space to sell it or see who bought it.</p>'}</section>
      ${await require('./production').panel(app, ctx, t, pos, proof)}
      ${pos.length ? `<section class="card"><h2>All spaces</h2><ul class="rows">${list}</ul></section>` : ''}` });
  });
};
