/* Beyond FMCG demo — shared: i18n, header/footer, request list (localStorage), inquiry modal, toast. */
window.BF = (function () {
  const LS_KEY = "bf_request_list_v1", LS_LANG = "bf_lang";
  // ---------- language ----------
  const qp = new URLSearchParams(location.search);
  let lang = qp.get("lang"); if (lang !== "ar" && lang !== "en") { try { lang = localStorage.getItem(LS_LANG) || "en"; } catch (e) { lang = "en"; } }
  if (lang !== "ar") lang = "en";
  try { localStorage.setItem(LS_LANG, lang); } catch (e) {}
  document.documentElement.lang = lang; document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  const D = window.BF_I18N.ui[lang], CAT = window.BF_I18N.cat;
  function t(key, vars) { let s = D[key]; if (s == null) s = window.BF_I18N.ui.en[key]; if (s == null) return key; if (vars) for (const k in vars) s = s.split("{" + k + "}").join(vars[k]); return s; }
  function cat(name) { return lang === "ar" ? (CAT[name] || name) : name; }
  function catList(names) { return String(names || "").split(",").map(x => cat(x.trim())).filter(Boolean).join(lang === "ar" ? "، " : ", "); }
  function withLang(url) { return url + (url.includes("?") ? "&" : "?") + "lang=" + lang; }

  const ICONS = {
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h10M4 18h7"/><path d="m16 16 2 2 4-4"/></svg>',
    chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="flip"><path d="m9 6 6 6-6 6"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5L20 7"/></svg>',
    spark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"/></svg>',
    print: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v7H6z"/></svg>',
    fb: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13.5 22v-8h2.7l.4-3.2h-3.1V8.8c0-.9.3-1.6 1.6-1.6h1.7V4.3c-.3 0-1.3-.1-2.5-.1-2.5 0-4.1 1.5-4.1 4.2v2.4H7.4V14h2.8v8h3.3z"/></svg>',
    li: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6.5 8.5H3.6V21h2.9V8.5zM5 7.2a1.7 1.7 0 1 0 0-3.4 1.7 1.7 0 0 0 0 3.4zM21 21h-2.9v-6.1c0-1.5 0-3.3-2-3.3s-2.3 1.6-2.3 3.2V21H11V8.5h2.8v1.7h.1c.4-.7 1.3-1.5 2.8-1.5 3 0 3.5 2 3.5 4.5V21z"/></svg>',
    ig: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/></svg>'
  };
  const LOGO_SVG = '<svg viewBox="0 0 40 40" fill="none" aria-hidden="true"><rect width="40" height="40" rx="11" fill="#0B2545"/><path d="M11 27V13h8.2c3.1 0 5 1.6 5 4 0 1.6-.9 2.8-2.3 3.3 1.9.4 3.1 1.8 3.1 3.7 0 2.6-2 4-5.3 4H11zm3.4-8.2h4.2c1.5 0 2.3-.7 2.3-1.8 0-1.2-.8-1.8-2.3-1.8h-4.2v3.6zm0 5.6h4.7c1.6 0 2.5-.7 2.5-1.9s-.9-1.9-2.5-1.9h-4.7v3.8z" fill="#fff"/><path d="M27 12l4 8-4 8" stroke="#8FE3D0" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const base = document.body.dataset.base || "./";
  const API = document.body.dataset.api || "https://script.google.com/macros/s/AKfycbwzA26Mfu_3dQNXndRjjReH5wExBEWBmXEo1HLe5pbLHYeEB39c63VcqT8AT1FGMcan/exec";
  const PAGE_T0 = Date.now();
  async function post(payload) { const r = await fetch(API, { method: "POST", body: JSON.stringify(Object.assign({ lang, elapsed_ms: Date.now() - PAGE_T0 }, payload)), headers: { "Content-Type": "text/plain;charset=utf-8" }, redirect: "follow" }); return r.json(); }
  const imgBase = document.body.dataset.imgBase || (base + "img/");
  const LOGO_HTML = `<img src="${base}brand/beyond-fmcg-logo-black.svg" alt="Beyond FMCG" width="146" height="36">`;
  const LOGO_HTML_W = `<img src="${base}brand/beyond-fmcg-logo-white.svg" alt="Beyond FMCG" width="162" height="40">`;

  // ---------- request list ----------
  function getList() { try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]"); } catch (e) { return []; } }
  function saveList(l) { try { localStorage.setItem(LS_KEY, JSON.stringify(l)); } catch (e) {} updateBadge(); document.dispatchEvent(new CustomEvent("bf:list", { detail: l })); }
  function inList(id) { return getList().some(x => x.id === id); }
  function add(p, qty) {
    const l = getList(); const ex = l.find(x => x.id === p.id);
    if (ex) { ex.qty = (ex.qty || 1) + (qty || 0); } else { l.push({ id: p.id, n: p.n, c: p.c, i: p.i, bn: p.bn, qty: qty || 1 }); }
    saveList(l); toast(ex ? t("t_updated") : t("t_added"));
  }
  function remove(id) { saveList(getList().filter(x => x.id !== id)); }
  function setQty(id, q) { const l = getList(); const it = l.find(x => x.id === id); if (it) { it.qty = Math.max(1, q | 0); saveList(l); } }
  function clear() { saveList([]); }
  function updateBadge() { const n = getList().length; document.querySelectorAll("[data-badge]").forEach(b => b.textContent = n ? String(n) : ""); }

  // ---------- toast ----------
  let toastT;
  function toast(msg) {
    let el = document.querySelector(".toast"); if (!el) { el = document.createElement("div"); el.className = "toast"; document.body.appendChild(el); }
    el.textContent = msg; el.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove("show"), 2200);
  }

  // ---------- helpers ----------
  function img(kind, file) { if (!file) return null; if (/^https?:/.test(file)) return file; return imgBase + kind + "/" + encodeURIComponent(file); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  function fmt(n) { return Number(n).toLocaleString("en-US"); }

  // ---------- header / footer ----------
  function header(opts) {
    opts = opts || {};
    const el = document.querySelector("#hdr"); if (!el) return;
    el.className = "hdr";
    el.innerHTML = `<div class="wrap">
      <a class="logo" href="${withLang(base + "index.html")}" aria-label="Beyond FMCG">${LOGO_HTML}</a>
      <nav class="hdr-nav" aria-label="Main"><a href="${withLang(base + "index.html")}#catalog" class="${opts.page === "catalog" ? "on" : ""}">${t("nav_catalog")}</a><a href="${withLang(base + "index.html")}#brands">${t("nav_brands")}</a><a href="${withLang(base + "index.html")}#contact">${t("nav_contact")}</a><a href="${withLang(base + "register.html")}" class="${opts.page === "register" ? "on" : ""}">${t("nav_register")}</a></nav>
      <div class="hdr-sp"></div>
      ${opts.search ? `<label class="hdr-search"><span class="sr">${t("search_lbl")}</span>${ICONS.search}<input id="q" type="search" placeholder="${t("search_ph")}" autocomplete="off"></label>` : ""}
      <button class="lang-btn" id="lang-btn" type="button" aria-label="Switch language" lang="${lang === "ar" ? "en" : "ar"}">${t("lang_switch")}</button>
      ${opts.print ? `<button class="icon-btn" id="print-btn" title="${t("print")}" aria-label="${t("print")}">${ICONS.print}</button>` : ""}
      <button class="icon-btn" id="open-list" title="${t("list_btn")}" aria-label="${t("list_btn")}">${ICONS.list}<span class="badge" data-badge></span></button>
    </div>`;
    el.querySelector("#open-list").addEventListener("click", openModal);
    el.querySelector("#lang-btn").addEventListener("click", () => {
      const next = lang === "ar" ? "en" : "ar"; try { localStorage.setItem(LS_LANG, next); } catch (e) {}
      const u = new URL(location.href); u.searchParams.set("lang", next); location.href = u.toString();
    });
    const pb = el.querySelector("#print-btn"); if (pb) pb.addEventListener("click", () => window.print());
    updateBadge();
  }

  function footer(categories) {
    const el = document.querySelector("#foot"); if (!el) return;
    el.className = "foot"; el.id = "contact";
    const cats = (categories || []).map(c => `<li><a href="${withLang(base + "index.html?cat=" + c.id)}#catalog">${esc(cat(c.n))}</a></li>`).join("");
    el.innerHTML = `<div class="wrap">
      <div>
        <a class="logo" href="${withLang(base + "index.html")}">${LOGO_HTML_W}</a>
        <div class="tag">${t("foot_tag")}</div>
        <p>${t("foot_p")}</p>
        <div class="social"><a href="#" aria-label="LinkedIn">${ICONS.li}</a><a href="#" aria-label="Instagram">${ICONS.ig}</a><a href="#" aria-label="Facebook">${ICONS.fb}</a></div>
      </div>
      <div><h4>${t("foot_cats")}</h4><ul>${cats}</ul></div>
      <div><h4>${t("foot_contact")}</h4>
        <form id="contact-form" novalidate>
          <div class="fr one"><input class="f-in" name="name" placeholder="${t("c_name")}" required></div>
          <div class="fr"><input class="f-in" name="email" type="email" placeholder="${t("c_email")}" required><input class="f-in" name="phone" placeholder="${t("c_phone")}"></div>
          <div class="fr one"><input class="f-in" name="company" placeholder="${t("c_company")}"></div>
          <div class="fr one"><textarea class="f-in" name="message" placeholder="${t("c_msg")}"></textarea></div>
          <input type="text" name="website" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true">
          <button class="btn btn-white" type="submit">${t("c_btn")}</button>
        </form>
      </div>
    </div>
    <div class="foot-bar"><div class="wrap"><span>${t("rights", { y: new Date().getFullYear() })}</span><span>${t("cities")}</span></div></div>`;
    el.querySelector("#contact-form").addEventListener("submit", async e => { e.preventDefault(); const f = e.target;
      if (!f.name.value.trim() || !f.email.value.trim()) { toast(t("t_need")); return; }
      const b = f.querySelector("button"); b.disabled = true;
      let res; try { res = await post({ type: "contact", name: f.name.value.trim(), email: f.email.value.trim(), phone: f.phone.value.trim(), company: f.company.value.trim(), message: f.message.value.trim(), website: f.website.value }); } catch (err) { res = { ok: false }; }
      b.disabled = false; if (res && res.ok) { f.reset(); toast(t("c_sent")); } else toast(t("err_send")); });
  }

  // ---------- inquiry modal ----------
  let overlay;
  function ensureModal() {
    if (overlay) return overlay;
    overlay = document.createElement("div"); overlay.className = "overlay"; overlay.setAttribute("role", "dialog"); overlay.setAttribute("aria-modal", "true"); overlay.setAttribute("aria-label", t("m_title"));
    overlay.innerHTML = `<div class="modal" style="position:relative">
      <button class="icon-btn x" id="modal-x" aria-label="${t("close")}">${ICONS.x}</button>
      <div class="col" id="modal-form-col">
        <h3>${t("m_title")}</h3><p class="hint">${t("m_hint")}</p>
        <form id="rq-form" novalidate>
          <div class="field"><label>${t("rq_type")}</label><div class="seg"><label class="seg-opt"><input type="radio" name="rtype" value="rfq" checked> <span>${t("rq_price")}</span></label><label class="seg-opt"><input type="radio" name="rtype" value="sample"> <span>${t("rq_sample")}</span></label></div></div>
          <input type="text" name="website" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true">
          <div class="field"><label>${t("f_name")}</label><input name="name" required placeholder="${t("f_name_ph")}"></div>
          <div class="f2"><div class="field"><label>${t("f_email")}</label><input name="email" type="email" required placeholder="${t("f_email_ph")}" dir="ltr"></div>
          <div class="field"><label>${t("f_phone")}</label><input name="phone" type="tel" placeholder="${t("f_phone_ph")}" dir="ltr"></div></div>
          <div class="field"><label>${t("f_company")}</label><input name="company" placeholder="${t("f_company_ph")}"></div>
          <div class="f2"><div class="field"><label>${t("f_region")}</label><select name="region"><option value="">${t("f_select")}</option>${D.regions.map(r => `<option>${r}</option>`).join("")}</select></div>
          <div class="field"><label>${t("f_business")}</label><select name="business"><option value="">${t("f_select")}</option>${D.business.map(r => `<option>${r}</option>`).join("")}</select></div></div>
          <div class="field"><label>${t("f_notes")}</label><textarea name="notes" placeholder="${t("f_notes_ph")}"></textarea></div>
          <button class="btn btn-primary" type="submit" style="width:100%">${t("submit")}</button>
        </form>
      </div>
      <div class="col"><h3>${t("your_list")} <span id="rq-count" style="color:var(--muted);font-weight:400;font-size:15px"></span></h3><p class="hint">${t("list_hint")}</p><div class="rq-list" id="rq-list"></div></div>
    </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener("click", e => { if (e.target === overlay) closeModal(); });
    overlay.querySelector("#modal-x").addEventListener("click", closeModal);
    document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });
    overlay.querySelector("#rq-form").addEventListener("submit", onSubmit);
    overlay.querySelector("#rq-list").addEventListener("input", e => { if (e.target.matches("input[data-qty]")) setQty(+e.target.dataset.qty, +e.target.value); });
    overlay.querySelector("#rq-list").addEventListener("click", e => { const b = e.target.closest("[data-rm]"); if (b) { remove(+b.dataset.rm); renderList(); } });
    return overlay;
  }
  function renderList() {
    const l = getList(); const box = overlay.querySelector("#rq-list"); overlay.querySelector("#rq-count").textContent = l.length ? `(${l.length})` : "";
    if (!l.length) { box.innerHTML = `<div class="rq-empty">${ICONS.list}<div>${t("list_empty")}</div></div>`; return; }
    box.innerHTML = l.map(it => `<div class="rq-item">
      <a class="im" href="${withLang(base + "product.html?id=" + it.id)}">${it.i ? `<img src="${img("products", it.i)}" alt="">` : ""}</a>
      <div><a class="nm" href="${withLang(base + "product.html?id=" + it.id)}">${esc(it.n)}</a><div class="cd"><span class="ltr">${esc(it.bn || "")}</span>${it.c ? ` · ${t("code")} <span class="ltr">${esc(it.c)}</span>` : ""}</div></div>
      <div class="ctl"><input type="number" min="1" value="${it.qty || 1}" data-qty="${it.id}" aria-label="${t("cases_lbl")}"><small>${t("cases")}</small><button class="rm" data-rm="${it.id}" aria-label="${t("remove")}">${ICONS.x}</button></div>
    </div>`).join("");
  }
  function openModal() { ensureModal(); renderList(); overlay.classList.add("open"); document.body.style.overflow = "hidden"; setTimeout(() => { const f = overlay.querySelector("input[name=name]"); if (f) f.focus(); }, 50); }
  function closeModal() { if (!overlay) return; overlay.classList.remove("open"); document.body.style.overflow = ""; }
  async function onSubmit(e) {
    e.preventDefault(); const f = e.target; const l = getList();
    if (!f.name.value.trim() || !f.email.value.trim()) { toast(t("t_need")); (f.name.value.trim() ? f.email : f.name).focus(); return; }
    if (!l.length) { toast(t("t_empty")); return; }
    const type = (f.querySelector("input[name=rtype]:checked") || {}).value || "rfq";
    const btn = f.querySelector("button[type=submit]"); btn.disabled = true; const label = btn.textContent; btn.textContent = t("sending");
    let res;
    try { res = await post({ type, name: f.name.value.trim(), email: f.email.value.trim(), phone: f.phone.value.trim(), company: f.company.value.trim(), region: f.region.value, business: f.business.value, notes: f.notes.value.trim(), website: f.website.value, items: l.map(it => ({ id: it.id, n: it.n, c: it.c, qty: it.qty || 1 })) }); }
    catch (err) { res = { ok: false, error: String(err) }; }
    if (!res || !res.ok) { btn.disabled = false; btn.textContent = label; toast(t("err_send")); return; }
    const ref = res.ref;
    overlay.querySelector("#modal-form-col").innerHTML = `<div class="success"><div class="ok">${ICONS.check}</div><h3>${type === "sample" ? t("ok_sample_title") : t("ok_title")}</h3>
      <p class="hint">${(type === "sample" ? t("ok_sample_p", { ref, n: l.length, email: esc(f.email.value) }) : t("ok_p", { ref, n: l.length, email: esc(f.email.value) }))}</p>
      <button class="btn btn-primary" id="rq-done">${t("ok_btn")}</button></div>`;
    overlay.querySelector("#rq-done").addEventListener("click", () => { closeModal(); });
    clear(); renderList();
    setTimeout(() => { overlay = null; const o = document.querySelector(".overlay"); if (o) o.remove(); }, 400);
  }

  function bindRequestButton(btn, product, qtyFn) {
    function paint() { const on = inList(product.id); btn.classList.toggle("added", on); btn.innerHTML = on ? `${ICONS.check} ${t("in_list")}` : t("request"); }
    btn.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); if (inList(product.id)) { openModal(); } else { add(product, qtyFn ? qtyFn() : 1); paint(); } });
    document.addEventListener("bf:list", paint); paint();
  }

  return { lang, t, cat, catList, withLang, post, ICONS, LOGO_SVG, base, getList, add, remove, setQty, clear, inList, updateBadge, toast, img, esc, fmt, header, footer, openModal, closeModal, bindRequestButton };
})();
