'use strict';
// Team management (invitations, resets) and the Cactus admin area (charities, branding, demo, View as).
module.exports = (app) => {
  const { db, sec, ui, access, fail, render, redirect } = app;
  const { esc, icon, form, field, textarea, select, button, linkBtn, pill, avatar, money } = ui;
  require('./production').routes(app);
  const origin = (ctx) => 'https://' + (ctx.req.headers['x-forwarded-host'] || ctx.req.headers.host);
  const shareBox = (link, label, text) => `<div class="sharebox rise"><label for="sl">${esc(label)}</label><input id="sl" readonly value="${esc(link)}"><div class="two"><button class="btn btn-primary" data-share="${esc(link)}" data-share-text="${esc(text)}">${icon('share')}<span>Share</span></button><button class="btn btn-soft" data-copy="#sl">Copy link</button></div><p class="hint">Send it by text or email. For privacy, this link is shown only once.</p></div>`;

  // ---------- Team ----------
  app.get('/team', async (ctx) => {
    access.needLead(ctx.user);
    const e = ctx.event; if (!e) return redirect(ctx, '/');
    const members = await db.all(`SELECT u.id,u.name,u.email,u.role,u.active,(u.photo_data IS NOT NULL) has_photo,
        (SELECT count(*) FROM positions p JOIN tables t ON t.id=p.table_id WHERE t.event_id=$1 AND p.seller_id=u.id AND p.status='sold')::int sales,
        (SELECT coalesce(sum(agreed_cents),0) FROM positions p JOIN tables t ON t.id=p.table_id WHERE t.event_id=$1 AND p.seller_id=u.id AND p.status='sold')::bigint raised
      FROM users u WHERE u.charity_id=$2 AND (u.role='manager' OR EXISTS(SELECT 1 FROM event_members m WHERE m.event_id=$1 AND m.user_id=u.id)) ORDER BY u.active DESC,u.role,raised DESC,u.name`, [e.id, e.charity_id]);
    const others = await db.all(`SELECT id,name FROM users u WHERE charity_id=$1 AND role='sales' AND active AND NOT EXISTS(SELECT 1 FROM event_members m WHERE m.event_id=$2 AND m.user_id=u.id) ORDER BY name`, [e.charity_id, e.id]);
    const invites = await db.all(`SELECT id,email,role,created_at FROM account_links WHERE kind='invite' AND used_at IS NULL AND charity_id=$1 AND (event_id IS NULL OR event_id=$2) AND (expires_at IS NULL OR expires_at>now()) ORDER BY created_at DESC`, [e.charity_id, e.id]);
    const resets = await db.all(`SELECT r.email,r.requested_at,u.name FROM recovery_requests r JOIN users u ON u.email=r.email WHERE NOT r.resolved AND u.charity_id=$1 ORDER BY r.requested_at DESC`, [e.charity_id]);
    const vols = await db.volunteerCount(e.charity_id, db, true);
    const f = ctx.flash?.link ? shareBox(ctx.flash.link, ctx.flash.label || 'Private link', ctx.flash.share || 'Join our charity team') : '';
    render(ctx, { title: 'Team', active: '/team', body: `<h1 class="page-h">Team</h1>${f}
      ${resets.length ? `<section class="card attention"><h2>Password help requests</h2><ul class="rows">${resets.map((r) => `<li class="row">${icon('lock', 'ic-warn')}<span><strong>${esc(r.name)}</strong><small>${esc(r.email)} · ${esc(ui.ago(r.requested_at))}</small></span>${form(ctx, '/team/reset', `<input type="hidden" name="email" value="${esc(r.email)}">` + button('Create reset link', { kind: 'soft', attrs: 'class="btn btn-soft btn-sm"' }), { cls: 'inline' })}</li>`).join('')}</ul></section>` : ''}
      <section class="card"><h2>Invite a teammate</h2><p class="muted">${vols} of ${db.VOLUNTEER_LIMIT} volunteer spots used (includes invitations not yet accepted).</p>${form(ctx, '/team/invite', `${field('Their email', 'email', { type: 'email', required: true, attrs: 'autocomplete="off" inputmode="email" autocapitalize="none"' })}${ctx.user.role === 'cactus' ? select('Role', 'role', [['sales', 'Volunteer (sales)'], ['manager', 'Charity lead']], 'sales') : '<input type="hidden" name="role" value="sales">'}<p class="hint">They’ll get a personal link that works once. They choose their own password.</p>${button('Create invitation link', { ic: 'plus' })}`, { cls: 'stack' })}
        ${others.length ? `<details class="add"><summary>${icon('users')}<span>Add an existing teammate to this event</span></summary>${form(ctx, '/team/add', select('Teammate', 'user_id', others.map((o) => [o.id, o.name])) + button('Add to event', { kind: 'soft' }), { cls: 'stack' })}</details>` : ''}</section>
      ${invites.length ? `<section class="card"><h2>Waiting to join</h2><ul class="rows">${invites.map((i) => `<li class="row invite-row">${icon('mail', 'ic-accent')}<span><strong>${esc(i.email)}</strong><small>${i.role === 'manager' ? 'Charity lead' : 'Volunteer'} · invited ${esc(ui.ago(i.created_at))}</small></span><div class="row-actions">${form(ctx, '/team/invite', `<input type="hidden" name="email" value="${esc(i.email)}"><input type="hidden" name="role" value="${esc(i.role)}">` + button('New link', { kind: 'ghost', attrs: 'class="btn btn-ghost btn-sm"' }), { cls: 'inline' })}${form(ctx, '/team/cancel-invite', `<input type="hidden" name="id" value="${esc(i.id)}">` + button('Cancel', { kind: 'ghost', attrs: 'class="btn btn-ghost btn-sm"' }), { cls: 'inline' })}</div></li>`).join('')}</ul></section>` : ''}
      <section class="card"><h2>${esc(e.name)} team</h2><ul class="rows">${members.map((m) => `<li class="row${m.active ? '' : ' done'}">${avatar(m)}<span><strong>${esc(m.name)}</strong><small>${ui.ROLE[m.role]} · ${m.sales} sold · ${money(m.raised)}${m.active ? '' : ' · deactivated'}</small></span>
        ${m.id !== ctx.user.id && m.role === 'sales' ? form(ctx, '/team/toggle', `<input type="hidden" name="user_id" value="${esc(m.id)}">` + button(m.active ? 'Deactivate' : 'Reactivate', { kind: 'ghost', attrs: 'class="btn btn-ghost btn-sm"' }), { cls: 'inline', confirm: m.active ? `Deactivate ${m.name}? Their sales stay recorded.` : '' }) : ''}</li>`).join('')}</ul></section>
      <section class="card"><h2>Your team’s sign-in page</h2><p class="muted">Bookmark or share this branded page.</p>${ctx.charity ? `<p><a class="tap" href="/c/${esc(ctx.charity.slug)}">${esc(origin(ctx))}/c/${esc(ctx.charity.slug)}</a></p>` : ''}</section>` });
  });

  app.post('/team/invite', async (ctx) => {
    access.needLead(ctx.user);
    const e = ctx.event; if (!e) fail(400, 'Create an event first.');
    const email = String(ctx.form.email || '').trim().toLowerCase();
    if (!sec.isEmail(email)) fail(400, 'Please enter a valid email address.');
    const role = ctx.user.role === 'cactus' && ctx.form.role === 'manager' ? 'manager' : 'sales';
    const existing = await db.one('SELECT id,charity_id,active FROM users WHERE email=$1', [email]);
    if (existing) {
      if (existing.charity_id === e.charity_id && existing.active) { await db.q('INSERT INTO event_members(event_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [e.id, existing.id]); return redirect(ctx, '/team', 'They already have an account — added to this event.'); }
      fail(400, 'That email already has an account with another team.');
    }
    if (role === 'sales' && await db.volunteerCount(e.charity_id, db, true, email) >= db.VOLUNTEER_LIMIT) fail(400, db.LIMIT_MSG);
    const tk = sec.token();
    await db.tx(async (t) => {
      await t.q(`UPDATE account_links SET used_at=now() WHERE kind='invite' AND email=$1 AND used_at IS NULL`, [email]); // old links stop working
      await t.q(`INSERT INTO account_links(id,token_hash,kind,email,charity_id,role,created_by,expires_at,event_id) VALUES($1,$2,'invite',$3,$4,$5,$6,now()+interval '14 days',$7)`, [db.uid(), sec.digest(tk), email, e.charity_id, role, ctx.user.id, e.id]);
    });
    redirect(ctx, '/team', { text: 'Invitation ready.', link: `${origin(ctx)}/join?token=${tk}`, label: `Invitation for ${email} (valid 14 days)`, share: `You’re invited to join ${ctx.charity?.name || 'our'} sponsorship team` });
  });
  app.post('/team/reset', async (ctx) => {
    access.needLead(ctx.user);
    const email = String(ctx.form.email || '').trim().toLowerCase();
    const u = await db.one('SELECT id,charity_id,role FROM users WHERE email=$1 AND active', [email]);
    if (!u || (ctx.user.role !== 'cactus' && (u.charity_id !== ctx.user.charity_id || u.role === 'cactus'))) fail(403, 'Not available.');
    const tk = sec.token();
    await db.q(`INSERT INTO account_links(id,token_hash,kind,email,charity_id,role,created_by,expires_at) VALUES($1,$2,'reset',$3,$4,$5,$6,now()+interval '1 hour')`, [db.uid(), sec.digest(tk), email, u.charity_id, u.role, ctx.user.id]);
    redirect(ctx, ctx.form.back === 'admin' ? '/admin' : '/team', { text: 'Reset link ready.', link: `${origin(ctx)}/reset?token=${tk}`, label: `Password reset for ${email} (valid 1 hour)`, share: 'Here’s your private link to reset your password' });
  });
  app.post('/team/add', async (ctx) => {
    access.needLead(ctx.user); const e = ctx.event;
    const u = await db.one('SELECT id FROM users WHERE id=$1 AND charity_id=$2 AND active', [ctx.form.user_id, e.charity_id]);
    if (!u) fail(400, 'Choose a teammate.');
    await db.q('INSERT INTO event_members(event_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [e.id, u.id]);
    redirect(ctx, '/team', 'Added to this event.');
  });
  app.post('/team/cancel-invite', async (ctx) => {
    access.needLead(ctx.user);
    const r = await db.one(`UPDATE account_links SET used_at=now() WHERE id=$1 AND kind='invite' AND used_at IS NULL AND ($2::uuid IS NULL OR charity_id=$2) RETURNING id`, [ctx.form.id, ctx.user.role === 'cactus' ? null : ctx.user.charity_id]);
    if (!r) fail(403, 'Not available.');
    redirect(ctx, '/team', 'Invitation cancelled. That link no longer works.');
  });
  app.post('/team/toggle', async (ctx) => {
    access.needLead(ctx.user);
    const u = await db.one(`SELECT id,active,charity_id FROM users WHERE id=$1 AND role='sales' AND ($2::uuid IS NULL OR charity_id=$2)`, [ctx.form.user_id, ctx.user.role === 'cactus' ? null : ctx.user.charity_id]);
    if (!u) fail(403, 'Not available.');
    if (!u.active && await db.volunteerCount(u.charity_id) >= db.VOLUNTEER_LIMIT) fail(400, db.LIMIT_MSG);
    await db.q('UPDATE users SET active=NOT active WHERE id=$1', [u.id]);
    if (u.active) await db.q('DELETE FROM sessions WHERE user_id=$1', [u.id]);
    redirect(ctx, '/team', u.active ? 'Deactivated. Their sales stay recorded.' : 'Reactivated.');
  });

  // ---------- Cactus admin ----------
  const isAdmin = (ctx) => ctx.user.role === 'cactus' || ctx.realUser?.role === 'cactus';
  app.get('/admin', async (ctx) => {
    if (!isAdmin(ctx)) fail(403, 'Only Cactus can open this page.');
    const charities = await db.all(`SELECT c.id,c.name,c.slug,c.is_demo,c.brand_color,(c.logo_data IS NOT NULL) has_logo,
       (SELECT count(*) FROM events e WHERE e.charity_id=c.id)::int events,
       (SELECT e.id FROM events e WHERE e.charity_id=c.id ORDER BY e.event_date DESC NULLS LAST LIMIT 1) latest_event,
       (SELECT coalesce(sum(p.agreed_cents),0) FROM positions p JOIN tables t ON t.id=p.table_id JOIN events e ON e.id=t.event_id WHERE e.charity_id=c.id AND p.status='sold')::bigint raised
       FROM charities c ORDER BY c.is_demo,c.name`);
    const users = await db.all(`SELECT u.id,u.name,u.email,u.role,u.active,(u.photo_data IS NOT NULL) has_photo,c.name charity FROM users u LEFT JOIN charities c ON c.id=u.charity_id ORDER BY u.role='cactus' DESC,c.name NULLS FIRST,u.role,u.name`);
    const demo = await db.all('SELECT d.email,d.password,d.label FROM demo_credentials d JOIN users u ON u.email=d.email ORDER BY d.label');
    const total = charities.filter((c) => !c.is_demo).reduce((a, c) => a + Number(c.raised), 0);
    const ro = !!ctx.realUser;
    const f = ctx.flash?.link ? shareBox(ctx.flash.link, ctx.flash.label || 'Private link', ctx.flash.share || '') : '';
    render(ctx, { title: 'Cactus admin', active: '/admin', body: `<h1 class="page-h">Cactus admin</h1>${f}
      <section class="hero hero-slim"><div class="hero-stats"><div><span class="label">Raised across charities</span><strong class="big" data-count="${total}">${money(total)}</strong></div><div><span class="label">Charities</span><strong class="big">${charities.filter((c) => !c.is_demo).length}</strong></div></div></section>
      <section class="card"><h2>Charities</h2><ul class="rows">${charities.map((c) => `<li class="row">${c.has_logo ? `<img class="av av-sm" src="/logo/${esc(c.id)}" alt="">` : `<span class="av av-sm">${esc(c.name[0])}</span>`}<span><strong>${esc(c.name)}</strong><small>${c.events} event${c.events === 1 ? '' : 's'} · ${money(c.raised)} · <a class="tap" href="/c/${esc(c.slug)}">/c/${esc(c.slug)}</a></small></span>${c.is_demo ? pill('pending', 'Demo') : ''}${ctx.charity && ctx.charity.id === c.id ? pill('sold', 'Active') : ''}${c.latest_event ? form(ctx, '/switch-event', `<input type="hidden" name="event_id" value="${esc(c.latest_event)}">` + button('Open', { kind: 'soft', attrs: 'class="btn btn-soft btn-sm"' }), { cls: 'inline' }) : ''}<a class="btn btn-ghost btn-sm" href="/admin/charity/${esc(c.id)}">Edit</a></li>`).join('')}</ul>
        ${ro ? '' : `<details class="add"><summary>${icon('plus')}<span>Add a charity</span></summary>${charityForm(ctx, null)}</details>`}</section>
      ${demo.length ? `<section class="card demo"><h2>${icon('star', 'ic-accent')} Demo accounts</h2><p class="muted">Use these to test every screen as a charity lead or volunteer. Open a private browser window to stay signed in as yourself here.</p>
        <ul class="creds">${demo.map((d) => `<li><strong>${esc(d.label)}</strong><code>${esc(d.email)}</code><code>${esc(d.password)}</code></li>`).join('')}</ul><p class="hint">Demo sign-in page: <a class="tap" href="/c/demo">/c/demo</a></p></section>` : ''}
      <section class="card"><h2>All accounts</h2><p class="muted">“View as” shows exactly what that person sees, read-only. Their private notes stay hidden.</p>
        <div class="field search"><label class="sr" for="uq">Search accounts</label><input id="uq" type="search" placeholder="Search people" data-filter="#u-list"></div>
        <ul class="rows" id="u-list">${users.map((u) => `<li class="row${u.active ? '' : ' done'}" data-name="${esc((u.name + ' ' + u.email + ' ' + (u.charity || '')).toLowerCase())}">${avatar(u)}<span><strong>${esc(u.name)}</strong><small>${ui.ROLE[u.role]}${u.charity ? ' · ' + esc(u.charity) : ''} · ${esc(u.email)}</small></span>
          ${u.id !== (ctx.realUser || ctx.user).id && u.role !== 'cactus' ? form(ctx, '/admin/view-as', `<input type="hidden" name="user_id" value="${esc(u.id)}">` + button('View as', { kind: 'soft', ic: 'eye', attrs: 'class="btn btn-soft btn-sm"' }), { cls: 'inline' }) : ''}
          ${!ro && u.role !== 'cactus' && u.active ? form(ctx, '/team/reset', `<input type="hidden" name="email" value="${esc(u.email)}"><input type="hidden" name="back" value="admin">` + button('Reset link', { kind: 'ghost', attrs: 'class="btn btn-ghost btn-sm"' }), { cls: 'inline' }) : ''}</li>`).join('')}</ul></section>` });
  }, { viewAsOk: true });

  function charityForm(ctx, c) {
    return form(ctx, c ? '/admin/charity/' + c.id : '/admin/charity', `${field('Charity name', 'name', { value: c?.name || '', required: true, attrs: 'maxlength="120"' })}${textarea('Mission (one line)', 'mission', { value: c?.mission || '', attrs: 'maxlength="300"' })}
      <div class="field"><label for="logo">Logo ${c ? '<span class="opt">leave empty to keep current</span>' : ''}</label><input id="logo" type="file" name="logo" accept="image/png,image/jpeg,image/webp,image/svg+xml" data-logo-color="#bc"><p class="hint">We pick the app colors from the logo automatically. You can adjust them.</p></div>
      <div class="field"><label for="bc">Brand color</label><div class="colorrow"><input id="bc" type="color" name="brand_color" value="${esc(c?.brand_color || '#166546')}"><span class="hint">Text and buttons are kept readable automatically.</span></div></div>
      ${c ? '' : `<h3>First event</h3>${field('Event name', 'event_name', { value: 'Poker Night', required: true })}<div class="two">${field('Event date', 'event_date', { type: 'date' })}${field('Sales deadline', 'deadline', { type: 'date' })}</div>`}
      ${button(c ? 'Save branding' : 'Create charity & event', { ic: 'check' })}`, { cls: 'stack', multipart: true });
  }
  const saveLogo = (ctx) => (ctx.files || []).find((x) => x.name === 'logo' && ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'].includes(x.mime) && !x.truncated && x.data.length < 5e6);
  const color = (v) => (/^#[0-9a-f]{6}$/i.test(v || '') ? v.toLowerCase() : null);
  app.post('/admin/charity', async (ctx) => {
    access.needCactus(ctx.user);
    const f = ctx.form, name = String(f.name || '').trim().slice(0, 120); if (!name) fail(400, 'Enter the charity name.');
    const logo = saveLogo(ctx), id = db.uid(), eid = db.uid();
    let base = db.slugify(name), slug = base, n = 2; while (await db.one('SELECT 1 FROM charities WHERE slug=$1', [slug])) slug = base + '-' + n++;
    const d = (x) => (/^\d{4}-\d{2}-\d{2}$/.test(x || '') ? x : null);
    await db.tx(async (t) => {
      await t.q('INSERT INTO charities(id,name,slug,mission,brand_color,logo_mime,logo_data) VALUES($1,$2,$3,$4,$5,$6,$7)', [id, name, slug, String(f.mission || '').slice(0, 300) || null, color(f.brand_color), logo?.mime || null, logo?.data || null]);
      await t.q('INSERT INTO events(id,charity_id,name,event_date,deadline) VALUES($1,$2,$3,$4,$5)', [eid, id, String(f.event_name || 'Poker Night').slice(0, 120), d(f.event_date), d(f.deadline)]);
    });
    ctx.setCookies.push(`ev=${eid}; Path=/; Secure; SameSite=Lax; HttpOnly; Max-Age=31536000`);
    redirect(ctx, '/team', 'Charity created. Invite their charity lead next.');
  });
  app.get(/^\/admin\/charity\/([0-9a-f-]{36})$/, async (ctx) => {
    if (!isAdmin(ctx)) fail(403, 'Only Cactus can open this page.');
    const c = await db.one('SELECT id,name,slug,mission,brand_color,(logo_data IS NOT NULL) has_logo FROM charities WHERE id=$1', [ctx.params[0]]);
    if (!c) fail(404, 'Charity not found.');
    const events = await db.all('SELECT id,name,event_date FROM events WHERE charity_id=$1 ORDER BY event_date NULLS LAST', [c.id]);
    render(ctx, { title: c.name, active: '/admin', back: '/admin', body: `<h1 class="page-h">${esc(c.name)}</h1>
      <section class="card">${c.has_logo ? `<img class="logo-prev" src="/logo/${esc(c.id)}" alt="Current logo">` : ''}${ctx.realUser ? '' : charityForm(ctx, c)}</section>
      <section class="card"><h2>Events</h2><ul class="rows">${events.map((e) => `<li class="row">${icon('cal', 'ic-accent')}<span><strong>${esc(e.name)}</strong><small>${esc(ui.fmtDate(e.event_date) || 'No date')}</small></span>${form(ctx, '/switch-event', `<input type="hidden" name="event_id" value="${esc(e.id)}">` + button('Open', { kind: 'soft', attrs: 'class="btn btn-soft btn-sm"' }), { cls: 'inline' })}</li>`).join('')}</ul>
      ${ctx.realUser ? '' : `<details class="add"><summary>${icon('plus')}<span>Add an event</span></summary>${form(ctx, '/events/new', `<input type="hidden" name="charity_id" value="${esc(c.id)}">${field('Event name', 'name', { required: true })}<div class="two">${field('Event date', 'event_date', { type: 'date' })}${field('Sales deadline', 'deadline', { type: 'date' })}</div>${button('Add event', { kind: 'soft' })}`, { cls: 'stack' })}</details>`}</section>` });
  }, { viewAsOk: true });
  app.post(/^\/admin\/charity\/([0-9a-f-]{36})$/, async (ctx) => {
    access.needCactus(ctx.user);
    const f = ctx.form, logo = saveLogo(ctx);
    const name = String(f.name || '').trim().slice(0, 120); if (!name) fail(400, 'Enter the charity name.');
    await db.q('UPDATE charities SET name=$1,mission=$2,brand_color=coalesce($3,brand_color) WHERE id=$4', [name, String(f.mission || '').slice(0, 300) || null, color(f.brand_color), ctx.params[0]]);
    if (logo) await db.q('UPDATE charities SET logo_mime=$1,logo_data=$2 WHERE id=$3', [logo.mime, logo.data, ctx.params[0]]);
    redirect(ctx, '/admin/charity/' + ctx.params[0], 'Branding saved.');
  });

  app.post('/admin/view-as', async (ctx) => {
    const real = ctx.realUser || ctx.user; if (real.role !== 'cactus') fail(403, 'Only Cactus can do that.');
    const target = await db.one(`SELECT id,name FROM users WHERE id=$1 AND role<>'cactus'`, [ctx.form.user_id]); if (!target) fail(404, 'Account not found.');
    await db.q('UPDATE sessions SET view_as=$1 WHERE id=$2', [target.id, ctx.sid]);
    ctx.setCookies.push('ev=; Path=/; Max-Age=0; Secure; SameSite=Lax');
    await db.q('INSERT INTO audit(id,actor_id,action,details) VALUES($1,$2,$3,$4)', [db.uid(), real.id, 'view-as', target.id]);
    redirect(ctx, '/', `Viewing as ${target.name}. Read-only.`);
  }, { viewAsOk: true });
  app.post('/admin/view-as/stop', async (ctx) => {
    await db.q('UPDATE sessions SET view_as=NULL WHERE id=$1', [ctx.sid]);
    ctx.setCookies.push('ev=; Path=/; Max-Age=0; Secure; SameSite=Lax');
    redirect(ctx, '/admin', 'Back to your own account.');
  }, { viewAsOk: true });
};
