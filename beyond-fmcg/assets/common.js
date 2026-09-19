/* Beyond FMCG demo — shared: header/footer, request list (localStorage), inquiry modal, toast. */
window.BF = (function () {
  const LS_KEY = "bf_request_list_v1";
  const ICONS = {
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h10M4 18h7"/><path d="m16 16 2 2 4-4"/></svg>',
    filter: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M7 12h10M10 18h4"/></svg>',
    chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
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
  const imgBase = document.body.dataset.imgBase || (base + "img/");

  // ---------- request list ----------
  function getList() { try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]"); } catch (e) { return []; } }
  function saveList(l) { try { localStorage.setItem(LS_KEY, JSON.stringify(l)); } catch (e) {} updateBadge(); document.dispatchEvent(new CustomEvent("bf:list", { detail: l })); }
  function inList(id) { return getList().some(x => x.id === id); }
  function add(p, qty) {
    const l = getList(); const ex = l.find(x => x.id === p.id);
    if (ex) { ex.qty = (ex.qty || 1) + (qty || 0); } else { l.push({ id: p.id, n: p.n, c: p.c, i: p.i, bn: p.bn, qty: qty || 1 }); }
    saveList(l); toast(ex ? "Quantity updated in your request list" : "Added to your price request list");
  }
  function remove(id) { saveList(getList().filter(x => x.id !== id)); }
  function setQty(id, q) { const l = getList(); const it = l.find(x => x.id === id); if (it) { it.qty = Math.max(1, q | 0); saveList(l); } }
  function clear() { saveList([]); }
  function updateBadge() { const n = getList().length; document.querySelectorAll("[data-badge]").forEach(b => b.textContent = n ? String(n) : ""); }

  // ---------- toast ----------
  let toastT;
  function toast(msg) {
    let t = document.querySelector(".toast"); if (!t) { t = document.createElement("div"); t.className = "toast"; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 2200);
  }

  // ---------- image helper ----------
  function img(kind, file) { if (!file) return null; if (/^https?:/.test(file)) return file; return imgBase + kind + "/" + encodeURIComponent(file); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  function fmt(n) { return Number(n).toLocaleString("en-US"); }

  // ---------- header / footer ----------
  function header(opts) {
    opts = opts || {};
    const el = document.querySelector("#hdr"); if (!el) return;
    el.className = "hdr";
    el.innerHTML = `<div class="wrap">
      <a class="logo" href="${base}index.html" aria-label="Beyond FMCG home">${LOGO_SVG}<span><b>Beyond <span>FMCG</span></b><small>Import &amp; Distribution · KSA</small></span></a>
      <nav class="hdr-nav" aria-label="Main"><a href="${base}index.html#catalog" class="${opts.page === "catalog" ? "on" : ""}">Catalog</a><a href="${base}index.html#brands">Brands</a><a href="${base}index.html#contact">Contact</a></nav>
      <div class="hdr-sp"></div>
      ${opts.search ? `<label class="hdr-search"><span class="sr">Search products</span>${ICONS.search}<input id="q" type="search" placeholder="Search products, codes, UPC…" autocomplete="off"></label>` : ""}
      ${opts.print ? `<button class="icon-btn" id="print-btn" title="Print / export catalog" aria-label="Print catalog">${ICONS.print}</button>` : ""}
      <button class="icon-btn" id="open-list" title="Price request list" aria-label="Open price request list">${ICONS.list}<span class="badge" data-badge></span></button>
    </div>`;
    el.querySelector("#open-list").addEventListener("click", openModal);
    const pb = el.querySelector("#print-btn"); if (pb) pb.addEventListener("click", () => window.print());
    updateBadge();
  }

  function footer(categories) {
    const el = document.querySelector("#foot"); if (!el) return;
    el.className = "foot"; el.id = "contact";
    const cats = (categories || []).map(c => `<li><a href="${base}index.html?cat=${c.id}#catalog">${esc(c.n)}</a></li>`).join("");
    el.innerHTML = `<div class="wrap">
      <div>
        <a class="logo" href="${base}index.html">${LOGO_SVG}<span><b>Beyond <span>FMCG</span></b><small>Import &amp; Distribution · KSA</small></span></a>
        <div class="tag">Your gateway to the world's leading consumer brands.</div>
        <p>Beyond FMCG imports and distributes international food and consumer brands to supermarkets, hypermarkets, pharmacies and retailers across Saudi Arabia. We handle sourcing, import, compliance and delivery end to end, so you can focus on your shelves.</p>
        <div class="social"><a href="#" aria-label="LinkedIn">${ICONS.li}</a><a href="#" aria-label="Instagram">${ICONS.ig}</a><a href="#" aria-label="Facebook">${ICONS.fb}</a></div>
      </div>
      <div><h4>Categories</h4><ul>${cats}</ul></div>
      <div><h4>Get in touch</h4>
        <form id="contact-form" novalidate>
          <div class="fr one"><input class="f-in" placeholder="Name" required></div>
          <div class="fr"><input class="f-in" type="email" placeholder="Email" required><input class="f-in" placeholder="Phone number"></div>
          <div class="fr one"><input class="f-in" placeholder="Company"></div>
          <div class="fr one"><textarea class="f-in" placeholder="Message"></textarea></div>
          <button class="btn btn-white" type="submit">Contact us</button>
        </form>
      </div>
    </div>
    <div class="foot-bar"><div class="wrap"><span>© ${new Date().getFullYear()} Beyond FMCG. All rights reserved.</span><span>Riyadh · Jeddah · Dammam</span></div></div>`;
    el.querySelector("#contact-form").addEventListener("submit", e => { e.preventDefault(); e.target.reset(); toast("Thanks — our team will get back to you shortly."); });
  }

  // ---------- inquiry modal ----------
  const REGIONS = ["Riyadh", "Makkah (Jeddah / Makkah / Taif)", "Eastern Province", "Madinah", "Qassim", "Asir", "Tabuk", "Hail", "Northern Borders", "Jazan", "Najran", "Al Bahah", "Al Jouf", "Nationwide"];
  const BUSINESS = ["Supermarket / Hypermarket", "Convenience store", "Pharmacy", "Wholesaler", "Distributor", "HORECA / Food service", "E-commerce", "Other"];
  let overlay;
  function ensureModal() {
    if (overlay) return overlay;
    overlay = document.createElement("div"); overlay.className = "overlay"; overlay.setAttribute("role", "dialog"); overlay.setAttribute("aria-modal", "true"); overlay.setAttribute("aria-label", "Price request");
    overlay.innerHTML = `<div class="modal" style="position:relative">
      <button class="icon-btn x" id="modal-x" aria-label="Close">${ICONS.x}</button>
      <div class="col" id="modal-form-col">
        <h3>Request a price</h3><p class="hint">Tell us who you are and we'll send a quotation for the products in your list.</p>
        <form id="rq-form" novalidate>
          <div class="field"><label>Full name</label><input name="name" required placeholder="Your full name"></div>
          <div class="f2"><div class="field"><label>Email</label><input name="email" type="email" required placeholder="you@company.com"></div>
          <div class="field"><label>Phone</label><input name="phone" type="tel" placeholder="+966 5x xxx xxxx"></div></div>
          <div class="field"><label>Company</label><input name="company" placeholder="Business name"></div>
          <div class="f2"><div class="field"><label>Region you sell in</label><select name="region"><option value="">Select…</option>${REGIONS.map(r => `<option>${r}</option>`).join("")}</select></div>
          <div class="field"><label>Type of business</label><select name="business"><option value="">Select…</option>${BUSINESS.map(r => `<option>${r}</option>`).join("")}</select></div></div>
          <div class="field"><label>Notes (optional)</label><textarea name="notes" placeholder="Delivery city, expected volumes, timing…"></textarea></div>
          <button class="btn btn-primary" type="submit" style="width:100%">Submit price request</button>
        </form>
      </div>
      <div class="col"><h3>Your list <span id="rq-count" style="color:var(--muted);font-weight:400;font-size:15px"></span></h3><p class="hint">Quantities are in cases. Adjust or remove before sending.</p><div class="rq-list" id="rq-list"></div></div>
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
    if (!l.length) { box.innerHTML = `<div class="rq-empty">${ICONS.list}<div>Your request list is empty.<br>Add products from the catalog to request prices.</div></div>`; return; }
    box.innerHTML = l.map(it => `<div class="rq-item">
      <a class="im" href="${base}product.html?id=${it.id}">${it.i ? `<img src="${img("products", it.i)}" alt="">` : ""}</a>
      <div><a class="nm" href="${base}product.html?id=${it.id}">${esc(it.n)}</a><div class="cd">${esc(it.bn || "")}${it.c ? " · Code " + esc(it.c) : ""}</div></div>
      <div class="ctl"><input type="number" min="1" value="${it.qty || 1}" data-qty="${it.id}" aria-label="Cases"><small>cases</small><button class="rm" data-rm="${it.id}" aria-label="Remove">${ICONS.x}</button></div>
    </div>`).join("");
  }
  function openModal() { ensureModal(); renderList(); overlay.classList.add("open"); document.body.style.overflow = "hidden"; setTimeout(() => { const f = overlay.querySelector("input[name=name]"); if (f) f.focus(); }, 50); }
  function closeModal() { if (!overlay) return; overlay.classList.remove("open"); document.body.style.overflow = ""; }
  function onSubmit(e) {
    e.preventDefault(); const f = e.target; const l = getList();
    if (!f.name.value.trim() || !f.email.value.trim()) { toast("Please add your name and email"); (f.name.value.trim() ? f.email : f.name).focus(); return; }
    if (!l.length) { toast("Add at least one product to your list first"); return; }
    const ref = "BF-" + Date.now().toString(36).toUpperCase().slice(-6);
    overlay.querySelector("#modal-form-col").innerHTML = `<div class="success"><div class="ok">${ICONS.check}</div><h3>Request received</h3>
      <p class="hint">Reference <b>${ref}</b>. Our sales team will review your ${l.length} product${l.length > 1 ? "s" : ""} and send a quotation to <b>${esc(f.email.value)}</b> within one business day.</p>
      <button class="btn btn-primary" id="rq-done">Back to catalog</button></div>`;
    overlay.querySelector("#rq-done").addEventListener("click", () => { closeModal(); });
    clear(); renderList();
    setTimeout(() => { overlay = null; const o = document.querySelector(".overlay"); if (o) o.remove(); }, 400);
  }

  // request-price button helper used by both pages
  function bindRequestButton(btn, product, qtyFn) {
    function paint() { const on = inList(product.id); btn.classList.toggle("added", on); btn.innerHTML = on ? `${ICONS.check} In your list` : "Request price"; }
    btn.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); if (inList(product.id)) { openModal(); } else { add(product, qtyFn ? qtyFn() : 1); paint(); } });
    document.addEventListener("bf:list", paint); paint();
  }

  return { ICONS, LOGO_SVG, base, getList, add, remove, setQty, clear, inList, updateBadge, toast, img, esc, fmt, header, footer, openModal, closeModal, bindRequestButton };
})();
