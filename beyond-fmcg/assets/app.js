/* Beyond FMCG demo — catalog page: filters, search, grid, load-more. */
(async function () {
  const { ICONS, esc, img, fmt, t, cat, catList, withLang } = BF;
  BF.header({ page: "catalog", search: true, print: true });
  document.querySelectorAll("[data-i18n]").forEach(el => { el.innerHTML = t(el.dataset.i18n); });

  const [tax, catalog] = await Promise.all([
    fetch(BF.base + "data/taxonomy.json").then(r => r.json()),
    fetch(BF.base + "data/catalog.json").then(r => r.json())
  ]);
  BF.applySettings(tax.settings); BF.footer(tax.categories);

  // ---------- lookups ----------
  const brandName = {}, lineName = {}, catName = {}, promoIds = new Set();
  tax.brands.forEach(b => { brandName[b.id] = b.n; b.subs.forEach(s => { brandName[s.id] = s.n; s.lines.forEach(l => lineName[l.id] = l.n); }); });
  tax.categories.forEach(c => { catName[c.id] = cat(c.n); c.subs.forEach(s => catName[s.id] = cat(s.n)); });
  tax.promotions.forEach(c => { catName[c.id] = cat(c.n); promoIds.add(c.id); c.subs.forEach(s => { catName[s.id] = cat(s.n); promoIds.add(s.id); }); });

  // ---------- state ----------
  const PAGE = 24;
  const state = { q: "", brands: new Set(), lines: new Set(), cats: new Set(), specials: false, sort: "featured", shown: PAGE };
  const params = new URLSearchParams(location.search);
  if (params.get("brand")) params.get("brand").split(",").forEach(x => state.brands.add(+x));
  if (params.get("cat")) params.get("cat").split(",").forEach(x => state.cats.add(+x));
  if (params.get("q")) state.q = params.get("q");
  if (params.get("specials")) state.specials = true;

  // ---------- hero ----------
  document.querySelector("#stat-products").textContent = fmt(tax.totals.products);
  document.querySelector("#stat-brands").textContent = fmt(tax.totals.brands);
  document.querySelector("#stat-cats").textContent = fmt(tax.totals.categories);
  const logos = tax.logos.filter(l => !/\.svg$/i.test(l.logo)).slice(0, 16);
  document.querySelector("#mosaic").innerHTML = logos.map(l => `<figure><img src="${img("brands", l.logo)}" alt="${esc(l.n)}" loading="eager"></figure>`).join("");

  // ---------- brands strip ----------
  document.querySelector("#brand-row").innerHTML = tax.brands.map(b => `<a class="brand-tile" href="?brand=${b.id}#catalog" data-brand="${b.id}">
    <div class="lg">${b.logo ? `<img src="${img("brands", b.logo)}" alt="${esc(b.n)}" loading="lazy">` : `<span class="mono" aria-hidden="true">${esc(b.n.slice(0, 1))}</span>`}</div><b class="ltr">${esc(b.n)}</b><span>${t("n_products", { n: fmt(b.count) })}</span></a>`).join("");
  document.querySelector("#brand-row").addEventListener("click", e => {
    const a = e.target.closest("[data-brand]"); if (!a) return; e.preventDefault();
    clearAll(false); state.brands.add(+a.dataset.brand); syncSidebar(); apply(); document.querySelector("#catalog").scrollIntoView({ behavior: "smooth" });
  });

  // ---------- sidebar ----------
  const side = document.querySelector("#filters");
  function node(kind, id, name, count, children, level, latin) {
    const has = children && children.length;
    return `<li><div class="node" style="padding-inline-start:${level ? 0 : 2}px">
      <label><input type="checkbox" data-kind="${kind}" data-id="${id}"><span class="${latin ? "ltr" : ""}" title="${esc(name)}">${esc(name)}</span></label>
      <span class="cnt">${fmt(count)}</span>
      ${has ? `<button class="tg" aria-expanded="false" aria-label="${t("expand")} ${esc(name)}">${ICONS.chev}</button>` : ""}
    </div>${has ? `<ul class="tree" hidden>${children}</ul>` : ""}</li>`;
  }
  side.innerHTML = `<div class="filters-body">
    <h3>${t("filters")} <button class="clear-all" id="clear-all" type="button">${t("clear_all")}</button></h3>
    <div class="grp" style="border-top:0;padding-top:8px"><div class="lbl" style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--accent);font-weight:600;margin-bottom:8px">${t("quick")}</div>
      <button class="quick" id="specials" type="button">${ICONS.spark} <span style="flex:1;text-align:start">${t("specials")}</span> ${ICONS.arrow}</button></div>
    <details class="grp" open><summary class="grp-h">${t("promotions")} <span class="chev">${ICONS.chev}</span></summary>
      <ul class="tree">${tax.promotions.map(c => node("cat", c.id, cat(c.n), c.count, c.subs.map(s => node("cat", s.id, cat(s.n), s.count, "", 1)).join(""), 0)).join("") || `<li class="node" style="color:var(--faint);font-size:13px">${t("no_promo")}</li>`}</ul></details>
    <details class="grp" open><summary class="grp-h">${t("brands")} <span class="chev">${ICONS.chev}</span></summary>
      <ul class="tree">${tax.brands.map(b => node("brand", b.id, b.n, b.count, b.subs.map(s => node("brand", s.id, s.n, s.count, s.lines.map(l => node("line", l.id, l.n, l.count, "", 2, true)).join(""), 1, true)).join(""), 0, true)).join("")}</ul></details>
    <details class="grp" open><summary class="grp-h">${t("categories")} <span class="chev">${ICONS.chev}</span></summary>
      <ul class="tree">${tax.categories.map(c => node("cat", c.id, cat(c.n), c.count, c.subs.map(s => node("cat", s.id, cat(s.n), s.count, "", 1)).join(""), 0)).join("")}</ul></details></div>
    <div class="filters-foot"><button class="btn btn-ghost btn-sm" id="side-clear" type="button">${t("clear")}</button><button class="btn btn-primary btn-sm" id="side-done" type="button">${t("show_results")}</button></div>`;

  side.addEventListener("click", e => {
    const tg = e.target.closest(".tg"); if (!tg) return;
    const ul = tg.closest("li").querySelector(":scope > ul"); const open = tg.getAttribute("aria-expanded") === "true";
    tg.setAttribute("aria-expanded", String(!open)); ul.hidden = open;
  });
  const setFor = k => ({ brand: state.brands, line: state.lines, cat: state.cats }[k]);
  side.addEventListener("change", e => {
    const cb = e.target; if (!cb.matches("input[type=checkbox]")) return;
    const set = setFor(cb.dataset.kind); const id = +cb.dataset.id;
    cb.checked ? set.add(id) : set.delete(id);
    if (cb.checked) cb.closest("li").querySelectorAll(":scope > ul input:checked").forEach(c => { c.checked = false; setFor(c.dataset.kind).delete(+c.dataset.id); });
    if (cb.checked) { const ul = cb.closest("li").querySelector(":scope > ul"); const tg = cb.closest("li").querySelector(":scope > .node .tg"); if (ul && tg) { ul.hidden = false; tg.setAttribute("aria-expanded", "true"); } }
    apply();
  });
  document.querySelector("#specials").addEventListener("click", () => { state.specials = !state.specials; syncSidebar(); apply(); });
  document.querySelector("#clear-all").addEventListener("click", () => clearAll(true));
  document.querySelector("#side-clear").addEventListener("click", () => clearAll(true));
  document.querySelector("#side-done").addEventListener("click", closeSide);
  function clearAll(render) { state.brands.clear(); state.lines.clear(); state.cats.clear(); state.specials = false; state.q = ""; const q = document.querySelector("#q"); if (q) q.value = ""; syncSidebar(); if (render) apply(); }
  function syncSidebar() {
    side.querySelectorAll("input[type=checkbox]").forEach(cb => { cb.checked = setFor(cb.dataset.kind).has(+cb.dataset.id); if (cb.checked) { let li = cb.closest("li"); while (li) { const ul = li.querySelector(":scope > ul"), tg = li.querySelector(":scope > .node .tg"); if (ul && tg) { ul.hidden = false; tg.setAttribute("aria-expanded", "true"); } li = li.parentElement.closest("li"); } } });
    document.querySelector("#specials").classList.toggle("on", state.specials);
  }

  // mobile drawer
  document.querySelector("#mob-filter").addEventListener("click", () => { side.classList.add("open"); document.body.style.overflow = "hidden"; });
  function closeSide() { side.classList.remove("open"); document.body.style.overflow = ""; }
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeSide(); });

  // search + sort
  const qEl = document.querySelector("#q"); qEl.value = state.q; let qT;
  qEl.addEventListener("input", () => { clearTimeout(qT); qT = setTimeout(() => { state.q = qEl.value.trim(); apply(); }, 180); });
  const sortEl = document.querySelector("#sort");
  sortEl.innerHTML = `<option value="featured">${t("sort_featured")}</option><option value="name">${t("sort_az")}</option><option value="name-desc">${t("sort_za")}</option><option value="brand">${t("sort_brand")}</option>`;
  sortEl.addEventListener("change", e => { state.sort = e.target.value; apply(); });

  // ---------- filtering ----------
  function matches(p) {
    if (state.brands.size || state.lines.size) {
      const hb = p.b.some(id => state.brands.has(id)), hl = p.pl.some(id => state.lines.has(id));
      if (!hb && !hl) return false;
    }
    if (state.cats.size && !p.k.some(id => state.cats.has(id))) return false;
    if (state.specials && !p.k.some(id => promoIds.has(id))) return false;
    if (state.q) { const q = state.q.toLowerCase(); if (!(p.n.toLowerCase().includes(q) || p.c.includes(q) || p.u.includes(q) || p.bn.toLowerCase().includes(q) || catList(p.cn).toLowerCase().includes(q))) return false; }
    return true;
  }
  let current = [];
  function apply() {
    state.shown = PAGE;
    current = catalog.filter(matches);
    if (state.sort === "featured") current = current.slice().sort((a, b) => ((a.o == null ? 1e9 : a.o) - (b.o == null ? 1e9 : b.o)) || a.n.localeCompare(b.n));
    else if (state.sort === "name-desc") current = current.slice().reverse();
    else if (state.sort === "brand") current = current.slice().sort((a, b) => a.bn.localeCompare(b.bn) || a.n.localeCompare(b.n));
    renderChips(); renderGrid(); updateUrl();
  }
  function updateUrl() {
    const u = new URLSearchParams();
    if (state.brands.size) u.set("brand", [...state.brands].join(","));
    if (state.cats.size) u.set("cat", [...state.cats].join(","));
    if (state.q) u.set("q", state.q); if (state.specials) u.set("specials", "1");
    u.set("lang", BF.lang);
    history.replaceState(null, "", location.pathname + "?" + u.toString() + location.hash);
  }
  function renderChips() {
    const chips = [];
    if (state.specials) chips.push({ k: "specials", label: t("chip_specials") });
    state.brands.forEach(id => chips.push({ k: "brand", id, label: brandName[id], latin: true }));
    state.lines.forEach(id => chips.push({ k: "line", id, label: lineName[id], latin: true }));
    state.cats.forEach(id => chips.push({ k: "cat", id, label: catName[id] }));
    if (state.q) chips.push({ k: "q", label: `“${state.q}”` });
    const box = document.querySelector("#chips");
    box.innerHTML = chips.map(c => `<span class="chip"><span class="${c.latin ? "ltr" : ""}">${esc(c.label || "")}</span><button data-k="${c.k}" data-id="${c.id || ""}" aria-label="${t("remove_filter")}">${ICONS.x}</button></span>`).join("") + (chips.length > 1 ? `<button class="clear-all" id="chips-clear" type="button">${t("clear_all")}</button>` : "");
    box.querySelectorAll("button[data-k]").forEach(b => b.addEventListener("click", () => {
      const k = b.dataset.k, id = +b.dataset.id;
      if (k === "specials") state.specials = false; else if (k === "q") { state.q = ""; qEl.value = ""; } else setFor(k).delete(id);
      syncSidebar(); apply();
    }));
    const cc = box.querySelector("#chips-clear"); if (cc) cc.addEventListener("click", () => clearAll(true));
  }
  const grid = document.querySelector("#grid"), more = document.querySelector("#more"), count = document.querySelector("#count");
  function card(p) {
    const href = withLang("product.html?id=" + p.id);
    return `<article class="card">
      <a class="ph" href="${href}">${p.i ? `<img src="${img("products", p.i)}" alt="${esc(p.n)}" loading="lazy" width="300" height="300">` : `<div class="noimg">${t("no_image")}</div>`}</a>
      <div class="body"><div class="brand ltr">${esc(p.bn)}</div><h4><a href="${href}">${esc(p.n)}</a></h4>
        <div class="meta"><div class="code">${t("code")} <b class="ltr">${esc(p.c || "—")}</b>${p.u ? `<br>${t("upc")} <span class="ltr">${esc(p.u)}</span>` : ""}</div><button class="btn btn-primary btn-sm" data-req="${p.id}">${t("request")}</button></div></div>
    </article>`;
  }
  function renderGrid() {
    const slice = current.slice(0, state.shown);
    grid.innerHTML = slice.length ? slice.map(card).join("") : `<div class="empty"><b>${t("no_match")}</b>${t("no_match_p")}</div>`;
    count.innerHTML = t("showing", { a: fmt(slice.length), b: fmt(current.length) });
    more.hidden = state.shown >= current.length;
    grid.querySelectorAll("[data-req]").forEach(b => { const p = catalog.find(x => x.id === +b.dataset.req); BF.bindRequestButton(b, p); });
  }
  more.querySelector("button").addEventListener("click", () => { state.shown += PAGE; const prev = state.shown - PAGE; renderGrid(); const el = grid.children[prev]; if (el) el.querySelector("a").focus({ preventScroll: true }); });

  syncSidebar(); apply();
  if (location.hash === "#catalog" || params.get("brand") || params.get("cat") || params.get("q")) setTimeout(() => document.querySelector("#catalog").scrollIntoView({ behavior: "instant", block: "start" }), 50);
})();
