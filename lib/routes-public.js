'use strict';
// Sign-in, invitations, password reset, sponsor artwork links, and public images.
module.exports = (app) => {
  const { db, sec, ui, fail, send, redirect, readForm, readMultipart, binary } = app;
  const { esc, icon, field, button } = ui;
  const PUB = { public: true };
  const SESSION_DAYS = 30;

  async function startSession(ctx, userId) {
    const sid = sec.token();
    await db.q(`INSERT INTO sessions(id,user_id,expires_at) VALUES($1,$2,now()+interval '${SESSION_DAYS} days')`, [sid, userId]);
    await db.q('DELETE FROM sessions WHERE expires_at<now()');
    ctx.setCookies.push(`sid=${sid}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS * 86400}`);
  }
  // Visitor address: Railway's proxy adds the real address as the LAST X-Forwarded-For entry;
  // earlier entries can be typed in by the visitor, so they are ignored.
  const ip = (ctx) => { const x = String(ctx.req.headers['x-forwarded-for'] || '').split(',').map((v) => v.trim()).filter(Boolean); return x.length ? x[x.length - 1] : String(ctx.req.socket.remoteAddress || ''); };

  // Branded hero used on sign-in, invitation, and reset screens.
  async function brandFor(slug) {
    if (!slug) return null;
    const c = await db.one('SELECT id,name,slug,mission,brand_color,(logo_data IS NOT NULL) has_logo FROM charities WHERE slug=$1', [slug]);
    if (!c) return null;
    c.event = await db.one(`SELECT name,event_date FROM events WHERE charity_id=$1 ORDER BY (event_date>=current_date) DESC NULLS LAST,event_date LIMIT 1`, [c.id]);
    return c;
  }
  function authPage(ctx, { title, brand, body, status = 200 }) {
    const hero = brand
      ? `<div class="auth-hero">${brand.has_logo ? `<img class="auth-logo" src="/logo/${esc(brand.id)}" alt="${esc(brand.name)} logo">` : `<span class="auth-mark">${esc(brand.name[0])}</span>`}
         <p class="eyebrow">Your fundraising headquarters</p><h1>${esc(brand.name)}${brand.event ? `<span>${esc(brand.event.name)}${brand.event.event_date ? ' · ' + ui.fmtDate(brand.event.event_date, { month: 'long', day: 'numeric', year: 'numeric' }) : ''}</span>` : ''}</h1></div>`
      : `<div class="auth-hero"><span class="auth-mark">C</span><p class="eyebrow">Cactus Charity Tables</p><h1>Sell table sponsorships,<span>beautifully organized.</span></h1></div>`;
    const flash = ctx.flash ? `<p class="alert ${ctx.flash.kind === 'err' ? '' : 'alert-ok'}" role="alert">${esc(ctx.flash.text)}</p>` : '';
    send(ctx, status, ui.page({ title, theme: brand?.brand_color, bare: true, body: `<main id="main" class="auth"><div class="auth-glow" aria-hidden="true"></div>${hero}<div class="auth-card">${flash}${body}</div><p class="auth-foot">Powered by Cactus · Tucson, Arizona</p></main>` }));
  }
  const signInForm = (ctx, slug, next = '', error = '', email = '') => `<h2>Sign in</h2>${error ? `<p class="alert" role="alert">${esc(error)}</p>` : ''}
    <form method="post" action="/login" class="stack">${slug ? `<input type="hidden" name="slug" value="${esc(slug)}">` : ''}<input type="hidden" name="next" value="${esc(next)}">
    ${field('Email', 'email', { type: 'email', value: email, required: true, attrs: 'autocomplete="username" inputmode="email" autocapitalize="none"' })}
    ${field('Password', 'password', { type: 'password', required: true, attrs: 'autocomplete="current-password"' })}
    ${button('Sign in', { attrs: 'type="submit"' })}</form>
    <p class="center"><a class="tap" href="/recover${slug ? '?c=' + esc(slug) : ''}">Forgot your password?</a></p>`;

  app.get('/login', async (ctx) => {
    if (ctx.user) return redirect(ctx, '/');
    const slug = ctx.url.searchParams.get('c') || ctx.cookies.brand || '';
    authPage(ctx, { title: 'Sign in', brand: await brandFor(slug), body: signInForm(ctx, slug, ctx.url.searchParams.get('next') || '') });
  }, PUB);
  // Each charity's branded entry link, e.g. /c/demo
  app.get(/^\/c\/([a-z0-9-]{1,60})$/, async (ctx) => {
    const brand = await brandFor(ctx.params[0]);
    if (!brand) return redirect(ctx, '/login');
    ctx.setCookies.push(`brand=${brand.slug}; Path=/; Secure; SameSite=Lax; Max-Age=31536000`);
    if (ctx.user) return redirect(ctx, '/');
    authPage(ctx, { title: brand.name, brand, body: signInForm(ctx, brand.slug) });
  }, PUB);

  app.post('/login', async (ctx) => {
    const f = await readForm(ctx.req);
    const email = String(f.email || '').trim().toLowerCase(), slug = String(f.slug || '').slice(0, 60);
    const brand = await brandFor(slug);
    // Lockout is per device+email (8 misses), per device (40), and a very high per-email ceiling (100)
    // so a stranger cannot lock a charity lead out by guessing from their own phone.
    const kDev = 'login:' + ip(ctx) + '|' + email, kIp = 'login-ip:' + ip(ctx), kEm = 'login-em:' + email, W = 15 * 60e3;
    if (sec.failures(kDev) >= 8 || sec.failures(kIp) >= 40 || sec.failures(kEm) >= 100)
      return authPage(ctx, { title: 'Sign in', brand, status: 429, body: signInForm(ctx, slug, '', 'Too many attempts. Please wait 15 minutes, or use “Forgot your password?”.', email) });
    const u = await db.one('SELECT id,password_hash FROM users WHERE email=$1 AND active=true', [email]);
    if (!u || !sec.verifyPassword(String(f.password || ''), u.password_hash)) {
      sec.recordFailure(kDev, W); sec.recordFailure(kIp, W); sec.recordFailure(kEm, W);
      return authPage(ctx, { title: 'Sign in', brand, status: 401, body: signInForm(ctx, slug, '', 'That email and password don’t match. Check for typos, or reset your password.', email) });
    }
    sec.clearFailures(kDev);
    await startSession(ctx, u.id);
    const next = /^\/[a-z0-9/_-]*$/i.test(f.next || '') && !String(f.next).startsWith('//') ? f.next : '/';
    redirect(ctx, next);
  }, PUB);

  app.post('/logout', async (ctx) => {
    if (ctx.sid) await db.q('DELETE FROM sessions WHERE id=$1', [ctx.sid]);
    ctx.setCookies.push('sid=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
    redirect(ctx, '/login', 'You’re signed out.');
  }, { viewAsOk: true });

  // ----- password recovery (no email service: the charity lead shares a private reset link) -----
  app.get('/recover', async (ctx) => {
    const brand = await brandFor(ctx.url.searchParams.get('c') || ctx.cookies.brand);
    authPage(ctx, { title: 'Reset password', brand, body: `<h2>Forgot your password?</h2><p class="muted">Enter your email. Your charity lead will see the request on their Team page and send you a private reset link.</p>
      <form method="post" action="/recover" class="stack">${field('Your email', 'email', { type: 'email', required: true, attrs: 'autocomplete="email" inputmode="email" autocapitalize="none"' })}${button('Request a reset link', { attrs: 'type="submit"' })}</form>
      <p class="center"><a class="tap" href="/login">Back to sign in</a></p>` });
  }, PUB);
  app.post('/recover', async (ctx) => {
    const f = await readForm(ctx.req), email = String(f.email || '').trim().toLowerCase();
    if (!sec.limited('recover:' + ip(ctx), 10, 60 * 60e3) && sec.isEmail(email))
      await db.q(`INSERT INTO recovery_requests(email) SELECT email FROM users WHERE email=$1 AND active=true ON CONFLICT(email) DO UPDATE SET requested_at=now(),resolved=false`, [email]);
    // Same answer whether or not the account exists (prevents account guessing).
    authPage(ctx, { title: 'Request sent', brand: await brandFor(ctx.cookies.brand), body: `<div class="done">${icon('check')}</div><h2>Request sent</h2><p class="muted">If that email has an account, your charity lead has been asked to send you a private reset link. You can also text or call them to speed things up.</p><p class="center"><a class="tap" href="/login">Back to sign in</a></p>` });
  }, PUB);

  // ----- invitation and reset links -----
  async function linkFor(token, kind) {
    if (!/^[a-f0-9]{64}$/.test(token || '')) return null;
    return db.one(`SELECT l.*,c.slug FROM account_links l LEFT JOIN charities c ON c.id=l.charity_id WHERE l.token_hash=$1 AND l.kind=$2 AND l.used_at IS NULL AND (l.expires_at IS NULL OR l.expires_at>now())`, [sec.digest(token), kind]);
  }
  const badLink = (ctx, brand) => authPage(ctx, { title: 'Link unavailable', brand, status: 400, body: `<h2>This link can’t be used</h2><p class="muted">It may have already been used, expired, or been copied incompletely. Ask your charity lead to send a fresh link.</p><p class="center"><a href="/login">Go to sign in</a></p>` });
  function joinForm(link, token, kind, error = '', name = '') {
    return `<h2>${kind === 'invite' ? 'Create your account' : 'Choose a new password'}</h2>${error ? `<p class="alert" role="alert">${esc(error)}</p>` : ''}
    <form method="post" action="/${kind === 'invite' ? 'join' : 'reset'}?token=${esc(token)}" enctype="multipart/form-data" class="stack">
    ${kind === 'invite' ? field('Full name', 'name', { value: name, required: true, attrs: 'autocomplete="name" maxlength="120"', hint: 'This is how your teammates will see you.' }) : ''}
    ${field('Email', 'email', { type: 'email', value: link.email, required: true, attrs: 'readonly autocomplete="username"', hint: 'You’ll use this email to sign in.' })}
    ${field('Create a password', 'password', { type: 'password', required: true, attrs: 'minlength="10" maxlength="200" autocomplete="new-password" data-strength', hint: 'At least 10 characters. Your phone may offer to save it for you.' })}
    ${kind === 'invite' ? `<div class="field"><label for="ph">Profile photo <span class="opt">optional</span></label><input id="ph" type="file" name="photo" accept="image/png,image/jpeg,image/webp"></div>` : ''}
    ${button(kind === 'invite' ? 'Create my account' : 'Save new password', { attrs: 'type="submit"' })}</form>`;
  }
  for (const kind of ['invite', 'reset']) {
    const pathName = kind === 'invite' ? '/join' : '/reset';
    app.get(pathName, async (ctx) => {
      const token = ctx.url.searchParams.get('token');
      const link = await linkFor(token, kind);
      if (!link) return badLink(ctx, await brandFor(ctx.cookies.brand));
      const brand = await brandFor(link.slug);
      authPage(ctx, { title: kind === 'invite' ? 'Join your team' : 'Reset password', brand, body: joinForm(link, token, kind) });
    }, PUB);
    app.post(pathName, async (ctx) => {
      const token = ctx.url.searchParams.get('token');
      const { fields: f, files } = await readMultipart(ctx.req, 5 * 1024 * 1024).catch(async () => ({ fields: await readForm(ctx.req).catch(() => ({})), files: [] }));
      const link = await linkFor(token, kind);
      if (!link) return badLink(ctx, null);
      const brand = await brandFor(link.slug);
      const name = String(f.name || '').trim().replace(/\s+/g, ' ');
      const pw = String(f.password || '');
      let error = '';
      if (kind === 'invite' && (name.length < 3 || !name.includes(' '))) error = 'Please enter your full name (first and last).';
      else if (pw.length < 10 || pw.length > 200) error = 'Your password needs at least 10 characters.';
      const photo = files.find((x) => x.name === 'photo' && ['image/png', 'image/jpeg', 'image/webp'].includes(x.mime) && !x.truncated);
      if (error) return authPage(ctx, { title: 'Join your team', brand, status: 400, body: joinForm(link, token, kind, error, name) });
      let userId;
      try {
        userId = await db.tx(async (t) => {
          const locked = await t.one('SELECT * FROM account_links WHERE id=$1 AND used_at IS NULL AND (expires_at IS NULL OR expires_at>now()) FOR UPDATE', [link.id]);
          if (!locked) throw new app.HttpError(400, 'This link was just used.');
          let id;
          if (kind === 'invite') {
            if (link.role === 'sales') {
              await t.q('SELECT id FROM charities WHERE id=$1 FOR UPDATE', [link.charity_id]); // one join at a time per charity
              if (await db.volunteerCount(link.charity_id, t) >= db.VOLUNTEER_LIMIT) throw new app.HttpError(400, 'This team is full right now. Please ask your charity lead.');
            }
            id = db.uid();
            await t.q('INSERT INTO users(id,email,password_hash,name,role,charity_id,photo_mime,photo_data) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [id, link.email, sec.hashPassword(pw), name.slice(0, 120), link.role, link.charity_id, photo?.mime || null, photo?.data || null]);
            if (link.event_id) await t.q('INSERT INTO event_members(event_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [link.event_id, id]);
            if (link.event_id) await t.q(`INSERT INTO activity(id,event_id,actor_id,kind,text) VALUES($1,$2,$3,'join','joined the team')`, [db.uid(), link.event_id, id]);
          } else {
            const u = await t.one('UPDATE users SET password_hash=$1 WHERE email=$2 AND active=true RETURNING id', [sec.hashPassword(pw), link.email]);
            if (!u) throw new app.HttpError(400, 'That account is no longer active.');
            id = u.id;
            await t.q('DELETE FROM sessions WHERE user_id=$1', [id]);
            await t.q('UPDATE recovery_requests SET resolved=true WHERE email=$1', [link.email]);
          }
          await t.q(`UPDATE account_links SET used_at=now() WHERE id=$1`, [link.id]);
          return id;
        });
      } catch (e) {
        const msg = e.code === '23505' ? 'An account already uses this email. Try signing in, or use “Forgot your password?”.' : e instanceof app.HttpError ? e.message : 'We couldn’t finish that. Your link still works — please try again.';
        if (!(e instanceof app.HttpError) && e.code !== '23505') console.error('Account link failed', e.code || e.message);
        return authPage(ctx, { title: 'Join your team', brand, status: 400, body: joinForm(link, token, kind, msg, name) });
      }
      await startSession(ctx, userId);
      redirect(ctx, kind === 'invite' ? '/welcome' : '/', kind === 'invite' ? 'Welcome to the team!' : 'Password updated. You’re signed in.');
    }, PUB);
  }

  // ----- sponsor artwork upload via private link (no account needed) -----
  async function artLink(token) {
    if (!/^[a-f0-9]{64}$/.test(token || '')) return null;
    return db.one(`SELECT a.position_id,p.code,p.artwork_status,p.artwork_note,t.label,t.stage,e.name event,c.id cid,c.name charity,c.brand_color,(c.logo_data IS NOT NULL) has_logo,c.slug,s.company
      FROM artwork_links a JOIN positions p ON p.id=a.position_id JOIN tables t ON t.id=p.table_id JOIN events e ON e.id=t.event_id JOIN charities c ON c.id=e.charity_id LEFT JOIN sponsors s ON s.id=p.sponsor_id
      WHERE a.token_hash=$1 AND a.expires_at>now()`, [sec.digest(token)]);
  }
  app.get(/^\/art\/([a-f0-9]{64})$/, async (ctx) => {
    const a = await artLink(ctx.params[0]);
    if (!a) return badLink(ctx, null);
    const brand = { id: a.cid, name: a.charity, brand_color: a.brand_color, has_logo: a.has_logo, event: { name: a.event } };
    const locked = a.stage !== 'open';
    authPage(ctx, { title: 'Upload your logo', brand, body: `<h2>Thank you, ${esc(a.company || 'sponsor')}</h2><p class="muted">Upload your logo for <strong>${esc(a.label)} · ${esc(ui.spaceName(a.code))}</strong>. The original, largest file you have prints best (vector, PDF, or a large PNG).</p>
      ${a.artwork_status === 'correction' && a.artwork_note ? `<p class="alert" role="alert">Cactus asked for changes: ${esc(a.artwork_note)}</p>` : ''}
      ${a.artwork_status === 'approved' ? `<p class="alert alert-ok">Your artwork has been approved. Thank you!</p>` : locked ? `<p class="alert">This table is already in production, so artwork can’t be changed online. Please contact the charity.</p>` :
      `<form method="post" action="/art/${esc(ctx.params[0])}" enctype="multipart/form-data" class="stack"><div class="field"><label for="art">Logo file</label><input id="art" type="file" name="art" required accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,application/pdf"><p class="hint">PNG, JPG, SVG or PDF, up to 15 MB.</p></div>${button('Upload logo', { attrs: 'type="submit"' })}</form>`}` });
  }, PUB);
  app.post(/^\/art\/([a-f0-9]{64})$/, async (ctx) => {
    const a = await artLink(ctx.params[0]);
    if (!a || a.stage !== 'open' || a.artwork_status === 'approved') return badLink(ctx, null);
    if (sec.limited('art:' + ctx.params[0], 20, 60 * 60e3)) fail(429, 'Too many uploads. Please try again later.');
    const { files } = await readMultipart(ctx.req);
    const r = await app.saveArtwork(a.position_id, files.find((x) => x.name === 'art'), null, true);
    const brand = { id: a.cid, name: a.charity, brand_color: a.brand_color, has_logo: a.has_logo, event: { name: a.event } };
    authPage(ctx, { title: 'Logo received', brand, body: r.quality === 'low'
      ? `<h2>We need a bigger file</h2><p class="alert" role="alert">${esc(r.message)}</p><p class="muted">We saved it, but it will likely look blurry on the table. If you have a larger version, please upload it.</p><p class="center"><a class="btn btn-primary" href="/art/${esc(ctx.params[0])}">Upload a better file</a></p>`
      : `<div class="done">${icon('check')}</div><h2>Logo received</h2><p class="muted">${esc(r.message)}</p><p class="muted">You can close this page. We’ll contact you if anything else is needed.</p>` });
  }, PUB);

  // ----- images -----
  app.get(/^\/logo\/([0-9a-f-]{36})$/, async (ctx) => {
    const c = await db.one('SELECT logo_mime,logo_data FROM charities WHERE id=$1', [ctx.params[0]]);
    if (!c?.logo_data) fail(404, 'No logo.');
    binary(ctx, c.logo_mime, c.logo_data, 'public, max-age=600');
  }, PUB);
};
