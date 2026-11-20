// Marketing consent page (Majid, 2026-11-20). Sends email + yes/no to the token-validator (action=mkt_consent), which
// appends one proof row to the Token Pool tab «Marketing Consent». The newest answer for an email wins, so «no» withdraws.
(function () {
  'use strict';
  var API = 'https://script.google.com/macros/s/AKfycbznjcsYu8gLDZqFJGededAQaATad_L8vlhRQV04pOqh57HB5nFVRy9zUHAcg6goyj8DKA/exec';
  var VERSION = 'mkt-consent-2026-11-20';   // = the «أوافق» wording on this page and on the checkout, word for word
  var MSG = {
    yes: 'حفظنا موافقتك، شكراً لك. وتستطيع أن تغيّر اختيارك متى شئت من هذه الصفحة.',
    no: 'حفظنا اختيارك: لن نستخدم ظهورك خارج المجتمع في أي مادة جديدة.',
    bad_email: 'اكتب بريداً إلكترونياً صحيحاً.',
    busy: 'وصلتنا محاولات كثيرة من هذا البريد. حاول مرة أخرى بعد عشر دقائق.',
    other: 'تعذّر الحفظ الآن. حاول مرة أخرى بعد قليل، أو راسلنا على support@malearnsa.com.'
  };
  var form = document.getElementById('consent-form');
  var emailField = document.getElementById('email-field');
  var emailHelp = document.getElementById('email-help');
  var answerSet = document.getElementById('answer-set');
  var status = document.getElementById('status');
  var save = document.getElementById('save');
  var HELP = emailHelp.textContent;
  var busy = false;

  function show(kind, text) {
    status.className = 'status ' + (kind === 'ok' ? 'is-ok' : 'is-err');
    status.textContent = text;
  }
  function emailError(on) {
    emailField.setAttribute('data-state', on ? 'error' : '');
    emailHelp.textContent = on ? MSG.bad_email : HELP;
    form.email.setAttribute('aria-invalid', on ? 'true' : 'false');
  }
  form.addEventListener('input', function () { status.className = 'status'; status.textContent = ''; });
  form.addEventListener('change', function (e) { if (e.target.name === 'answer') answerSet.removeAttribute('data-state'); });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (busy) return;
    var email = form.email.value.trim();
    var pick = form.querySelector('input[name="answer"]:checked');
    var bad = false;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { emailError(true); bad = true; } else emailError(false);
    if (!pick) { answerSet.setAttribute('data-state', 'error'); bad = true; }
    if (bad) { (emailField.getAttribute('data-state') === 'error' ? form.email : form.querySelector('input[name="answer"]')).focus(); return; }

    busy = true; save.disabled = true; save.textContent = 'لحظة…';
    var body = new URLSearchParams({ action: 'mkt_consent', email: email, answer: pick.value, v: VERSION, website: form.website.value });
    fetch(API, { method: 'POST', body: body })      // form-urlencoded = a simple CORS request (no preflight)
      .then(function (res) { return res.json(); })
      .then(function (d) {
        if (d && d.ok) { show('ok', MSG[pick.value]); return; }
        if (d && d.error === 'bad_email') { emailError(true); form.email.focus(); return; }
        show('err', MSG[d && d.error] || MSG.other);
      })
      .catch(function () { show('err', MSG.other); })
      .then(function () { busy = false; save.disabled = false; save.textContent = 'احفظ اختياري'; });
  });
})();
