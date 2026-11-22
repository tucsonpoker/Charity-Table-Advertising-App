// Cactus Charity Tables — small progressive enhancements. Everything works without JavaScript.
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Prevent double submits and confirm destructive actions.
  document.addEventListener('submit', function (e) {
    var f = e.target;
    if (f.dataset.confirm && !window.confirm(f.dataset.confirm)) { e.preventDefault(); return; }
    if (f.dataset.sent) { e.preventDefault(); return; }
    f.dataset.sent = '1';
    $$('button', f).forEach(function (b) { b.setAttribute('aria-busy', 'true'); });
    setTimeout(function () { delete f.dataset.sent; $$('button', f).forEach(function (b) { b.removeAttribute('aria-busy'); }); }, 8000);
  });
  window.addEventListener('pageshow', function () { $$('form[data-sent]').forEach(function (f) { delete f.dataset.sent; }); $$('[aria-busy]').forEach(function (b) { b.removeAttribute('aria-busy'); }); });

  $$('select[data-autosubmit]').forEach(function (s) { s.addEventListener('change', function () { s.form.requestSubmit ? s.form.requestSubmit() : s.form.submit(); }); });

  // Sell form: show new-sponsor fields only when "New sponsor" is chosen.
  $$('select[data-toggle-new]').forEach(function (s) {
    var box = $('[data-new]', s.form);
    var sync = function () { var isNew = !s.value; box.hidden = !isNew; $$('input', box).forEach(function (i) { i.disabled = !isNew; }); var c = $('input[name=company]', box); if (c) c.required = isNew; };
    s.addEventListener('change', sync); sync();
  });

  // Instant search filter.
  $$('input[data-filter]').forEach(function (inp) {
    var list = $(inp.dataset.filter);
    inp.addEventListener('input', function () { var q = inp.value.trim().toLowerCase(); $$('li', list).forEach(function (li) { li.hidden = q && (li.dataset.name || li.textContent.toLowerCase()).indexOf(q) < 0; }); });
  });

  // Share / copy links (Web Share works on iPhone and Android).
  document.addEventListener('click', function (e) {
    var sh = e.target.closest('[data-share]');
    if (sh) {
      e.preventDefault();
      if (navigator.share) navigator.share({ title: sh.dataset.shareText || 'Link', text: sh.dataset.shareText || '', url: sh.dataset.share }).catch(function () {});
      else copy(sh.dataset.share, sh);
    }
    var cp = e.target.closest('[data-copy]');
    if (cp) { e.preventDefault(); var i = $(cp.dataset.copy); copy(i.value, cp); }
    var cal = e.target.closest('[data-cal-preview]');
    if (cal && !window.confirm('Google Calendar will receive only:\n\n' + cal.dataset.calPreview + '\n\nNo notes or contact details are sent. Continue?')) e.preventDefault();
  });
  function copy(text, btn) {
    var done = function () { var s = $('span', btn) || btn, t = s.textContent; s.textContent = 'Copied'; setTimeout(function () { s.textContent = t; }, 1600); };
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, function () {}); else { var i = document.createElement('textarea'); i.value = text; document.body.appendChild(i); i.select(); document.execCommand('copy'); i.remove(); done(); }
  }

  // Smooth count-up for money totals.
  if (!reduce) $$('[data-count]').forEach(function (el) {
    var end = Number(el.dataset.count) / 100; if (!end) return;
    var fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
    var t0 = null;
    var step = function (t) { t0 = t0 || t; var p = Math.min(1, (t - t0) / 1100), e2 = 1 - Math.pow(1 - p, 3); el.textContent = fmt.format(end * e2); if (p < 1) requestAnimationFrame(step); else el.textContent = fmt.format(end); };
    requestAnimationFrame(step);
  });

  // Gentle celebration after a sale.
  var conf = $('.confetti');
  if (conf && !reduce) {
    var colors = ['#ffd36a', '#ffffff', getComputedStyle(document.body).getPropertyValue('--brand') || '#166546', '#9be7b8', '#ff9f80'];
    for (var i = 0; i < 46; i++) { var p = document.createElement('i'); p.style.left = Math.random() * 100 + '%'; p.style.background = colors[i % colors.length]; p.style.animationDelay = Math.random() * 0.5 + 's'; p.style.animationDuration = 1.4 + Math.random() * 1.2 + 's'; conf.appendChild(p); }
    setTimeout(function () { conf.remove(); }, 3600);
    if (history.replaceState) history.replaceState(null, '', location.pathname);
  }
  setTimeout(function () { var t = $('[data-toast]'); if (t) t.remove(); }, 4600);

  // Logo → brand color: pick the most vivid, common color in the uploaded logo.
  $$('input[data-logo-color]').forEach(function (inp) {
    inp.addEventListener('change', function () {
      var f = inp.files && inp.files[0]; if (!f) return;
      var img = new Image(), url = URL.createObjectURL(f);
      img.onload = function () {
        try {
          var c = document.createElement('canvas'), n = 64; c.width = n; c.height = n;
          var x = c.getContext('2d'); x.drawImage(img, 0, 0, n, n);
          var d = x.getImageData(0, 0, n, n).data, buckets = {};
          for (var i = 0; i < d.length; i += 4) {
            var r = d[i], g = d[i + 1], b = d[i + 2], a = d[i + 3];
            if (a < 200) continue;
            var mx = Math.max(r, g, b), mn = Math.min(r, g, b), sat = mx ? (mx - mn) / mx : 0;
            if (sat < 0.25 || mx < 40 || mn > 235) continue;
            var k = (r >> 4) + ',' + (g >> 4) + ',' + (b >> 4);
            var e = buckets[k] || (buckets[k] = { n: 0, r: 0, g: 0, b: 0, s: 0 }); e.n++; e.r += r; e.g += g; e.b += b; e.s += sat;
          }
          var best = null; Object.keys(buckets).forEach(function (k) { var e = buckets[k], score = e.n * (0.5 + e.s / e.n); if (!best || score > best.score) best = { score: score, e: e }; });
          if (best) { var e = best.e, hex = '#' + [e.r, e.g, e.b].map(function (v) { return Math.round(v / e.n).toString(16).padStart(2, '0'); }).join(''); var t = $(inp.dataset.logoColor); if (t) t.value = hex; document.body.style.setProperty('--brand', hex); }
        } catch (err) { /* SVGs from some tools can't be read; keep manual color */ }
        URL.revokeObjectURL(url);
      };
      img.src = url;
    });
  });

  // Install button (Android/Chrome). iPhone uses Share → Add to Home Screen.
  var deferred; window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferred = e; var b = $('[data-install-btn]'); if (b) b.hidden = false; });
  var ib = $('[data-install-btn]'); if (ib) ib.addEventListener('click', function () { if (deferred) { deferred.prompt(); deferred = null; ib.hidden = true; } });
})();
