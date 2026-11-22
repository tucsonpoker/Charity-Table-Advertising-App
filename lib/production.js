'use strict';
// Production workflow per table: open → submitted → proof → approved → production.
// Locked (anything but "open") means spaces and artwork can't change until Cactus unlocks.
const FILLERS = { logo: 'Use the charity’s logo (free)', tribute: 'Tribute or mission message (free)', blank: 'Leave it blank on purpose' };

function panel(app, ctx, t, pos, proof) {
  const { ui } = app, { esc, icon, form, button, textarea } = ui, u = ctx.user;
  const lead = app.access.isLead(u), cactus = u.role === 'cactus';
  if (t.kind === 'standard') return '';
  const unsold = pos.filter((p) => p.status === 'available').length;
  const steps = ['open', 'submitted', 'proof', 'approved', 'production'];
  const idx = steps.indexOf(t.stage);
  const track = `<ol class="steps">${['Selling', 'Submitted', 'Proof', 'Approved', 'Production'].map((s, i) => `<li class="${i < idx ? 'ok' : i === idx ? 'now' : ''}"><span>${i < idx ? icon('check') : i + 1}</span>${s}</li>`).join('')}</ol>`;
  let actions = '';
  if (t.stage === 'open' && lead) actions = ui.linkBtn('/tables/' + t.id + '/submit', 'Submit for production', { kind: 'soft', ic: 'check' }) + (unsold ? `<p class="hint">${unsold} space${unsold > 1 ? 's are' : ' is'} still unsold — you’ll see options before submitting.</p>` : '');
  if (t.stage === 'submitted' && lead && !cactus) actions = `<p class="muted">Cactus is designing your table proof.</p>` + form(ctx, '/tables/' + t.id + '/stage', '<input type="hidden" name="to" value="withdraw">' + button('Withdraw to make changes', { kind: 'ghost' }));
  if (['submitted', 'proof'].includes(t.stage) && cactus) actions += form(ctx, '/tables/' + t.id + '/proof', `<div class="field"><label for="proof">Upload table proof</label><input id="proof" type="file" name="proof" required accept="image/png,image/jpeg,image/webp,application/pdf"></div>` + button('Send proof to charity lead', { kind: 'soft', ic: 'image' }), { cls: 'stack', multipart: true });
  if (proof) {
    const view = `<a class="proof" href="/proof/${esc(proof.id)}" target="_blank" rel="noopener">${icon('image')}<span>View latest proof · ${esc(ui.ago(proof.created_at))}</span></a>`;
    actions = view + (proof.decision === 'changes' ? `<p class="alert">Changes requested: ${esc(proof.decision_note)}</p>` : '') + actions;
    if (t.stage === 'proof' && lead) actions += `<div class="two">${form(ctx, '/tables/' + t.id + '/decide', '<input type="hidden" name="decision" value="approved">' + button('I approve', { ic: 'check' }))}</div>` + `<details class="add"><summary>${icon('more')}<span>Request changes</span></summary>${form(ctx, '/tables/' + t.id + '/decide', '<input type="hidden" name="decision" value="changes">' + textarea('What should change?', 'note', { required: true, attrs: 'maxlength="1000"' }) + button('Send to Cactus', { kind: 'soft' }), { cls: 'stack' })}</details>`;
  }
  if (t.stage === 'approved' && cactus) actions += form(ctx, '/tables/' + t.id + '/stage', '<input type="hidden" name="to" value="production">' + button('Authorize production', { ic: 'check' }), { confirm: 'Authorize this table for printing?' });
  if (t.stage !== 'open' && cactus) actions += form(ctx, '/tables/' + t.id + '/stage', '<input type="hidden" name="to" value="open">' + button('Unlock table', { kind: 'ghost', ic: 'lock' }), { confirm: 'Unlock this table so the charity can make changes again?' });
  return `<section class="card"><h2>Production</h2>${track}<div class="stack">${actions}</div></section>`;
}

function routes(app) {
  const { db, ui, access, fail, render, redirect, binary } = app;
  const { esc, form, button, field, money, icon } = ui;
  const log = (e, a, text) => db.q(`INSERT INTO activity(id,event_id,actor_id,kind,text) VALUES($1,$2,$3,'production',$4)`, [db.uid(), e, a, text]);

  app.get(/^\/tables\/([0-9a-f-]{36})\/submit$/, async (ctx) => {
    access.needLead(ctx.user);
    const t = await app.tableFor(ctx.user, ctx.params[0]); if (!t) fail(404, 'Not available.');
    await app.useEvent(ctx, t.event_id);
    if (t.stage !== 'open') return redirect(ctx, '/tables/' + t.id);
    const unsold = await db.all(`SELECT id,code,asking_cents FROM positions WHERE table_id=$1 AND status='available' ORDER BY (code LIKE 'P%') DESC,length(code),code`, [t.id]);
    const charity = ctx.charity;
    render(ctx, { title: 'Submit for production', active: '/tables', back: '/tables/' + t.id, body: `<h1 class="page-h">Submit ${esc(t.label)}</h1>
      ${unsold.length ? `<section class="card"><h2>${unsold.length} space${unsold.length > 1 ? 's are' : ' is'} still open</h2><p class="muted">Before you submit, here are a few ideas so no space goes to waste:</p>
        <ul class="ideas"><li>${icon('star', 'ic-accent')}<span><strong>Last-chance price.</strong> Offer a quick discount to a sponsor who said “maybe.” Lower the asking price from the space’s page.</span></li>
        <li>${icon('star', 'ic-accent')}<span><strong>Your charity’s logo.</strong> A free filler that keeps the table looking complete.</span></li>
        <li>${icon('star', 'ic-accent')}<span><strong>A tribute or mission message.</strong> For example, “In memory of …” honoring someone who fits ${esc(charity?.name || 'your')} mission.</span></li></ul></section>` : ''}
      <section class="card">${form(ctx, '/tables/' + t.id + '/submit', `${unsold.map((p) => `<fieldset class="filler"><legend>${esc(ui.spaceName(p.code))} · asking ${money(p.asking_cents)}</legend>${Object.entries({ logo: 'Charity logo', tribute: 'Tribute / message', blank: 'Leave blank' }).map(([k, v], i) => `<label><input type="radio" name="f_${esc(p.id)}" value="${k}" ${i === 0 ? 'checked' : ''}><span>${v}</span></label>`).join('')}${field('Message (for tribute)', 't_' + p.id, { attrs: 'maxlength="140" placeholder="In memory of …"' })}</fieldset>`).join('')}
        ${unsold.length ? `<label class="ack"><input type="checkbox" name="ack" value="1" required><span>I understand these spaces will print with the choices above. Free fillers don’t count toward fundraising totals.</span></label>` : ''}
        <p class="hint">Submitting locks this table while Cactus prepares your proof. You can withdraw it to make changes.</p>${button('Submit for production', { ic: 'check' })}`, { cls: 'stack' })}</section>` });
  });
  app.post(/^\/tables\/([0-9a-f-]{36})\/submit$/, async (ctx) => {
    access.needLead(ctx.user);
    const t = await app.tableFor(ctx.user, ctx.params[0]); if (!t) fail(404, 'Not available.');
    if (t.stage !== 'open') fail(409, 'This table was already submitted.');
    const unsold = await db.all(`SELECT id FROM positions WHERE table_id=$1 AND status='available'`, [t.id]);
    if (unsold.length && ctx.form.ack !== '1') fail(400, 'Please confirm how the open spaces should print.');
    await db.tx(async (x) => {
      for (const p of unsold) {
        const choice = FILLERS[ctx.form['f_' + p.id]] ? ctx.form['f_' + p.id] : 'blank';
        await x.q('UPDATE positions SET filler=$1,filler_text=$2 WHERE id=$3', [choice, choice === 'tribute' ? String(ctx.form['t_' + p.id] || '').slice(0, 140) : null, p.id]);
      }
      await x.q(`UPDATE tables SET stage='submitted' WHERE id=$1 AND stage='open'`, [t.id]);
    });
    await log(t.event_id, ctx.user.id, `submitted ${t.label} for production`);
    redirect(ctx, '/tables/' + t.id, 'Submitted. Cactus will prepare your proof.');
  });
  app.post(/^\/tables\/([0-9a-f-]{36})\/stage$/, async (ctx) => {
    const u = ctx.user, t = await app.tableFor(u, ctx.params[0]); if (!t) fail(404, 'Not available.');
    const to = ctx.form.to;
    if (to === 'withdraw') { access.needLead(u); if (t.stage !== 'submitted') fail(409, 'Only a submitted table can be withdrawn.'); await db.q(`UPDATE tables SET stage='open' WHERE id=$1`, [t.id]); await db.q('UPDATE positions SET filler=NULL,filler_text=NULL WHERE table_id=$1', [t.id]); await log(t.event_id, u.id, `withdrew ${t.label} to make changes`); return redirect(ctx, '/tables/' + t.id, 'Withdrawn. You can make changes and resubmit.'); }
    access.needCactus(u);
    if (to === 'production') { if (t.stage !== 'approved') fail(409, 'The charity lead must approve the proof first.'); await db.q(`UPDATE tables SET stage='production' WHERE id=$1`, [t.id]); await log(t.event_id, u.id, `authorized ${t.label} for production`); return redirect(ctx, '/tables/' + t.id, 'Authorized for production.'); }
    if (to === 'open') { await db.q(`UPDATE tables SET stage='open' WHERE id=$1`, [t.id]); await log(t.event_id, u.id, `unlocked ${t.label}`); return redirect(ctx, '/tables/' + t.id, 'Table unlocked.'); }
    fail(400, 'Unknown step.');
  });
  app.post(/^\/tables\/([0-9a-f-]{36})\/proof$/, async (ctx) => {
    access.needCactus(ctx.user);
    const t = await app.tableFor(ctx.user, ctx.params[0]); if (!t) fail(404, 'Not available.');
    if (!['submitted', 'proof'].includes(t.stage)) fail(409, 'The table must be submitted first.');
    const f = (ctx.files || []).find((x) => x.name === 'proof');
    if (!f || f.truncated || !['image/png', 'image/jpeg', 'image/webp', 'application/pdf'].includes(f.mime)) fail(400, 'Upload the proof as PNG, JPG, WebP or PDF (max 15 MB).');
    await db.q('INSERT INTO table_proofs(id,table_id,mime,data,uploaded_by) VALUES($1,$2,$3,$4,$5)', [db.uid(), t.id, f.mime, f.data, ctx.user.id]);
    await db.q(`UPDATE tables SET stage='proof' WHERE id=$1`, [t.id]);
    await log(t.event_id, ctx.user.id, `sent the ${t.label} proof for approval`);
    redirect(ctx, '/tables/' + t.id, 'Proof sent to the charity lead.');
  });
  app.post(/^\/tables\/([0-9a-f-]{36})\/decide$/, async (ctx) => {
    access.needLead(ctx.user);
    const t = await app.tableFor(ctx.user, ctx.params[0]); if (!t) fail(404, 'Not available.');
    if (t.stage !== 'proof') fail(409, 'There’s no proof waiting for approval.');
    const proof = await db.one('SELECT id FROM table_proofs WHERE table_id=$1 ORDER BY created_at DESC LIMIT 1', [t.id]);
    const d = ctx.form.decision, note = String(ctx.form.note || '').trim().slice(0, 1000);
    if (d === 'changes' && !note) fail(400, 'Tell Cactus what to change.');
    await db.q('UPDATE table_proofs SET decision=$1,decision_note=$2,decided_by=$3,decided_at=now() WHERE id=$4', [d === 'approved' ? 'approved' : 'changes', d === 'approved' ? null : note, ctx.user.id, proof.id]);
    await db.q('UPDATE tables SET stage=$1 WHERE id=$2', [d === 'approved' ? 'approved' : 'submitted', t.id]);
    await log(t.event_id, ctx.user.id, d === 'approved' ? `approved the ${t.label} proof` : `requested changes to the ${t.label} proof`);
    redirect(ctx, '/tables/' + t.id, d === 'approved' ? 'Proof approved. Cactus will authorize printing.' : 'Change request sent to Cactus.');
  });
  app.get(/^\/proof\/([0-9a-f-]{36})$/, async (ctx) => {
    const p = await db.one('SELECT table_id,mime,data FROM table_proofs WHERE id=$1', [ctx.params[0]]);
    if (!p || !(await app.tableFor(ctx.user, p.table_id))) fail(404, 'Not available.');
    binary(ctx, p.mime, p.data);
  });
}
module.exports = { panel, routes };
