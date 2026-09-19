/* Beyond FMCG demo — catalog page: filters, search, grid, load-more. */
(async function () {
  const { ICONS, esc, img, fmt } = BF;
  BF.header({ page: "catalog", search: true, print: true });

  const [tax, catalog] = await Promise.all([
    fetch(BF.base + "data/taxonomy.json").then(r => r.json()),
    fetch(BF.base + "data/catalog.json").then(r => r.json())
  ]);
  BF.footer(tax.categories);

  // ---------- lookups ----------
  const brandName = {}, lineName = {}, catName = {}, promoIds = new Set();
  tax.brands.forEach(b => { brandName[b.id] = b.n; b.subs.forEach(s => { brandName[s.id] = s.n; s.lines.forEach(l => lineName[l.id] = l.n); }); });
  tax.categories.forEach(c => { catName[c.id] = c.n; c.subs.forEach(s => catName[s.id] = s.n); });
  tax.promotions.forEach(c => { catName[c.id] = c.n; promoIds.add(c.id); c.subs.forEach(s => { catName[s.id] = s.n; promoIds.add(s.id); }); });

  // ---------- state ----------
  const PAGE = 24;
  const state = { q: "", brands: new Set(), lines: new Set(), cats: new Set(), promos: new Set(), specials: false, sort: "name", shown: PAGE };
  const params = new URLSearchParams(location.search);
  if (params.get("brand")) params.get("brand").split(",").forEach(x => state.brands.add(+x));
  if (params.get("cat")) params.get("cat").split(",").forEach(x => state.cats.add(+x));
  if (params.get("q")) state.q = params.get("q");
  if (params.get("specials")) state.specials = true;

  // ---------- hero ----------
  document.querySelector("#stat-products").textContent = fmt(tax.totals.products);
  document.querySelector("#stat-brands").textContent = fmt(tax.totals.brands);
  document.querySelector("#stat-cats").textContent = fmt(tax.totals.categories);
  const mosaic = document.querySelector("#mosaic");
  const logos = tax.logos.filter(l => !/\.svg$/i.test(l.logo)).slice(0, 16);
  mosaic.innerHTML = logos.map(l => `<figure><img src="${img("brands", l.logo)}" alt="${esc(l.n)}" loading="eager"></figure>`).join("");

  // ---------- brands strip ----------
  document.querySelector("#brand-row").innerHTML = tax.brands.map(b => `<a class="brand-tile" href="?brand=${b.id}#catalog" data-brand="${b.id}">
    <div class="lg">${b.logo ? `<img src="${img("brands", b.logo)}" alt="${esc(b.n)}" loading="lazy">` : `<span class="mono" aria-hidden="true">${esc(b.n.slice(0, 1))}</span>`}</div><b>${esc(b.n)}</b><span>${fmt(b.count)} products</span></a>`).join("");
  document.querySelector("#brand-row").addEventListener("click", e => {
    const a = e.target.closest("[data-brand]"); if (!a) return; e.preventDefault();
    clearAll(false); state.brands.add(+a.dataset.brand); syncSidebar(); apply(); document.querySelector("#catalog").scrollIntoView({ behavior: "smooth" });
  });

  // ---------- sidebar ----------
  const side = document.querySelector("#filters");
  function node(kind, id, name, count, children, level) {
    const has = children && children.length;
    return `<li><div class="node" style="padding-inline-start:${level ? 0 : 2}px">
      <label><input type="checkbox" data-kind="${kind}" data-id="${id}"><span title="${esc(name)}">${esc(name)}</span></label>
      <span class="cnt">${fmt(count)}</span>
      ${has ? `<button class="tg" aria-expanded="false" aria-label="Expand ${esc(name)}">${ICONS.chev}</button>` : ""}
    </div>${has ? `<ul class="tree" hidden>${children}</ul>` : ""}</li>`;
  }
  side.innerHTML = `<div class="filters-body">
    <h3>Filters <button class="clear-all" id="clear-all" type="button">Clear all</button></h3>
    <div class="grp" style="border-top:0;padding-top:8px"><div class="lbl" style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--accent);font-weight:600;margin-bottom:8px">Quick links</div>
      <button class="quick" id="specials" type="button">${ICONS.spark} <span style="flex:1;text-align:start">Show specials</span> ${ICONS.chev.replace("m6 9 6 6 6-6", "m9 6 6 6-6 6")}</button></div>
    <details class="grp" open><summary class="grp-h">Promotions <span class="chev">${ICONS.chev}</span></summary>
      <ul class="tree">${tax.promotions.map(c => node("cat", c.id, c.n, c.count, c.subs.map(s => node("cat", s.id, s.n, s.count, "", 1)).join(""), 0)).join("") || `<li class="node" style="color:var(--faint);font-size:13px">No promotions right now</li>`}</ul></details>
    <details class="grp" open><summary class="grp-h">Brands <span class="chev">${ICONS.chev}</span></summary>
      <ul class="tree">${tax.brands.map(b => node("brand", b.id, b.n, b.count, b.subs.map(s => node("brand", s.id, s.n, s.count, s.lines.map(l => node("line", l.id, l.n, l.count, "", 2)).join(""), 1)).join(""), 0)).join("")}</ul></details>
    <details class="grp" open><summary class="grp-h">Categories <span class="chev">${ICONS.chev}</span></summary>
      <ul class="tree">${tax.categories.map(c => node("cat", c.id, c.n, c.count, c.subs.map(s => node("cat", s.id, s.n, s.count, "", 1)).join(""), 0)).join("")}</ul></details></div>
    <div class="filters-foot"><button class="btn btn-ghost btn-sm" id="side-clear" type="button">Clear</button><button class="btn btn-primary btn-sm" id="side-done" type="button">Show results</button></div>`;

  side.addEventListener("click", e => {
    const tg = e.target.closest(".tg"); if (!tg) return;
    const ul = tg.closest("li").querySelector(":scope > ul"); const open = tg.getAttribute("aria-expanded") === "true";
    tg.setAttribute("aria-expanded", String(!open)); ul.hidden = open;
  });
  side.addEventListener("change", e => {
    const cb = e.target; if (!cb.matches("input[type=checkbox]")) return;
    const set = { brand: state.brands, line: state.lines, cat: state.cats }[cb.dataset.kind]; const id = +cb.dataset.id;
    cb.checked ? set.add(id) : set.delete(id);
    // choosing a parent implies children: uncheck children visually
    if (cb.checked) cb.closest("li").querySelectorAll("ul input:checked").forEach(c => { c.checked = false; ({ brand: state.brands, line: state.lines, cat: state.cats }[c.dataset.kind]).delete(+c.dataset.id); });
    if (cb.checked) { const ul = cb.closest("li").querySelector(":scope > ul"); const tg = cb.closest("li").querySelector(":scope > .node .tg"); if (ul && tg) { ul.hidden = false; tg.setAttribute("aria-expanded", "true"); } }
    apply();
  });
  document.querySelector("#specials").addEventListener("click", () => { state.specials = !state.specials; syncSidebar(); apply(); });
  document.querySelector("#clear-all").addEventListener("click", () => clearAll(true));
  document.querySelector("#side-clear").addEventListener("click", () => clearAll(true));
  document.querySelector("#side-done").addEventListener("click", closeSide);
  function clearAll(render) { state.brands.clear(); state.lines.clear(); state.cats.clear(); state.specials = false; state.q = ""; const q = document.querySelector("#q"); if (q) q.value = ""; syncSidebar(); if (render) apply(); }
  function syncSidebar() {
    side.querySelectorAll("input[type=checkbox]").forEach(cb => { const set = { brand: state.brands, line: state.lines, cat: state.cats }[cb.dataset.kind]; cb.checked = set.has(+cb.dataset.id); if (cb.checked) { let li = cb.closest("li"); while (li) { const ul = li.querySelector(":scope > ul"), tg = li.querySelector(":scope > .node .tg"); if (ul && tg) { ul.hidden = false; tg.setAttribute("aria-expanded", "true"); } li = li.parentElement.closest("li"); } } });
    document.querySelector("#specials").classList.toggle("on", state.specials);
  }

  // mobile drawer
  const mobBtn = document.querySelector("#mob-filter");
  mobBtn.addEventListener("click", () => { side.classList.add("open"); document.body.style.overflow = "hidden"; });
  function closeSide() { side.classList.remove("open"); document.body.style.overflow = ""; }
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeSide(); });

  // search
  const qEl = document.querySelector("#q"); qEl.value = state.q; let qT;
  qEl.addEventListener("input", () => { clearTimeout(qT); qT = setTimeout(() => { state.q = qEl.value.trim(); apply(); }, 180); });
  document.querySelector("#sort").addEventListener("change", e => { state.sort = e.target.value; apply(); });

  // ---------- filtering ----------
  function matches(p) {
    if (state.brands.size || state.lines.size) {
      const hb = p.b.some(id => state.brands.has(id)), hl = p.pl.some(id => state.lines.has(id));
      if (!hb && !hl) return false;
    }
    if (state.cats.size && !p.k.some(id => state.cats.has(id))) return false;
    if (state.specials && !p.k.some(id => promoIds.has(id))) return false;
    if (state.q) { const q = state.q.toLowerCase(); if (!(p.n.toLowerCase().includes(q) || p.c.includes(q) || p.u.includes(q) || p.bn.toLowerCase().includes(q))) return false; }
    return true;
  }
  let current = [];
  function apply() {
    state.shown = PAGE;
    current = catalog.filter(matches);
    if (state.sort === "name-desc") current = current.slice().reverse();
    else if (state.sort === "brand") current = current.slice().sort((a, b) => a.bn.localeCompare(b.bn) || a.n.localeCompare(b.n));
    renderChips(); renderGrid(); updateUrl();
  }
  function updateUrl() {
    const u = new URLSearchParams();
    if (state.brands.size) u.set("brand", [...state.brands].join(","));
    if (state.cats.size) u.set("cat", [...state.cats].join(","));
    if (state.q) u.set("q", state.q); if (state.specials) u.set("specials", "1");
    const s = u.toString(); history.replaceState(null, "", location.pathname + (s ? "?" + s : "") + location.hash);
  }
  function renderChips() {
    const chips = [];
    if (state.specials) chips.push({ k: "specials", label: "Specials" });
    state.brands.forEach(id => chips.push({ k: "brand", id, label: brandName[id] }));
    state.lines.forEach(id => chips.push({ k: "line", id, label: lineName[id] }));
    state.cats.forEach(id => chips.push({ k: "cat", id, label: catName[id] }));
    if (state.q) chips.push({ k: "q", label: `“${state.q}”` });
    const box = document.querySelector("#chips");
    box.innerHTML = chips.map(c => `<span class="chip">${esc(c.label || "")}<button data-k="${c.k}" data-id="${c.id || ""}" aria-label="Remove filter">${ICONS.x}</button></span>`).join("") + (chips.length > 1 ? `<button class="clear-all" id="chips-clear" type="button">Clear all</button>` : "");
    box.querySelectorAll("button[data-k]").forEach(b => b.addEventListener("click", () => {
      const k = b.dataset.k, id = +b.dataset.id;
      if (k === "specials") state.specials = false; else if (k === "q") { state.q = ""; qEl.value = ""; } else ({ brand: state.brands, line: state.lines, cat: state.cats }[k]).delete(id);
      syncSidebar(); apply();
    }));
    const cc = box.querySelector("#chips-clear"); if (cc) cc.addEventListener("click", () => clearAll(true));
  }
  const grid = document.querySelector("#grid"), more = document.querySelector("#more"), count = document.querySelector("#count");
  function card(p) {
    return `<article class="card">
      <a class="ph" href="product.html?id=${p.id}">${p.i ? `<img src="${img("products", p.i)}" alt="${esc(p.n)}" loading="lazy" width="300" height="300">` : `<div class="noimg">Image coming soon</div>`}</a>
      <div class="body"><div class="brand">${esc(p.bn)}</div><h4><a href="product.html?id=${p.id}">${esc(p.n)}</a></h4>
        <div class="meta"><div class="code">Code <b>${esc(p.c || "—")}</b>${p.u ? `<br>UPC ${esc(p.u)}` : ""}</div><button class="btn btn-primary btn-sm" data-req="${p.id}">Request price</button></div></div>
    </article>`;
  }
  function renderGrid() {
    const slice = current.slice(0, state.shown);
    grid.innerHTML = slice.length ? slice.map(card).join("") : `<div class="empty"><b>No products match these filters</b>Try clearing a filter or searching a different term.</div>`;
    count.innerHTML = `Showing <b>${fmt(slice.length)}</b> of <b>${fmt(current.length)}</b> products`;
    more.hidden = state.shown >= current.length;
    grid.querySelectorAll("[data-req]").forEach(b => { const p = catalog.find(x => x.id === +b.dataset.req); BF.bindRequestButton(b, p); });
  }
  more.querySelector("button").addEventListener("click", () => { state.shown += PAGE; const prev = state.shown - PAGE; renderGrid(); const el = grid.children[prev]; if (el) el.querySelector("a").focus({ preventScroll: true }); });

  syncSidebar(); apply();
  if (location.hash === "#catalog" || params.toString()) setTimeout(() => document.querySelector("#catalog").scrollIntoView({ behavior: "instant", block: "start" }), 50);
})();
