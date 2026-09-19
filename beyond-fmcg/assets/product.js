/* Beyond FMCG demo — product details page. */
(async function () {
  const { ICONS, esc, img, fmt } = BF;
  BF.header({ page: "product" });
  const id = +new URLSearchParams(location.search).get("id");
  const [tax, catalog, d] = await Promise.all([
    fetch(BF.base + "data/taxonomy.json").then(r => r.json()),
    fetch(BF.base + "data/catalog.json").then(r => r.json()),
    fetch(BF.base + "data/p/" + id + ".json").then(r => r.ok ? r.json() : null).catch(() => null)
  ]);
  BF.footer(tax.categories);
  const p = catalog.find(x => x.id === id);
  const root = document.querySelector("#pd");
  if (!p || !d) { root.innerHTML = `<div class="empty" style="padding:80px 20px"><b>Product not found</b><a class="btn btn-ghost" href="index.html">Back to catalog</a></div>`; return; }
  document.title = `${p.n} · Beyond FMCG`;

  const topBrand = tax.brands.find(b => p.b.includes(b.id));
  const subBrand = topBrand && topBrand.subs.find(s => p.b.includes(s.id));
  const images = d.images && d.images.length ? d.images : (p.i ? [p.i] : []);
  const specRows = Object.entries(d.spec).filter(([, v]) => v);
  const tabs = [];
  if (d.ingredients) tabs.push({ k: "ingredients", t: "Ingredients", html: `<h2>Ingredients</h2><div class="html">${d.ingredients}</div>` });
  if (d.nutrition) tabs.push({ k: "nutrition", t: "Nutrition facts", html: `<h2>Nutrition facts</h2><img src="${img("nutrition", d.nutrition)}" alt="Nutrition facts for ${esc(p.n)}" loading="lazy" onerror="this.outerHTML='<p style=color:var(--muted)>Nutrition label will be provided with the quotation.</p>'">` });
  if (d.features) tabs.push({ k: "features", t: "Features", html: `<h2>Features</h2><div class="html">${d.features}</div>` });
  if (d.prep) tabs.push({ k: "prep", t: "Preparation", html: `<h2>Preparation</h2><div class="html">${d.prep}</div>` });

  root.innerHTML = `
    <nav class="crumbs" aria-label="Breadcrumb"><a href="index.html">Catalog</a><span>›</span>${topBrand ? `<a href="index.html?brand=${topBrand.id}#catalog">${esc(topBrand.n)}</a><span>›</span>` : ""}<span style="color:var(--ink)">${esc(p.n)}</span></nav>
    <div class="pd">
      <div class="pd-gallery">
        <div class="pd-main" id="pd-main">${images[0] ? `<img src="${img("products", images[0])}" alt="${esc(p.n)}">` : `<div class="noimg" style="color:var(--faint)">Image coming soon</div>`}</div>
        ${images.length > 1 ? `<div class="pd-thumbs">${images.map((f, i) => `<button class="${i ? "" : "on"}" data-img="${esc(f)}" aria-label="Image ${i + 1}"><img src="${img("products", f)}" alt=""></button>`).join("")}</div>` : ""}
      </div>
      <div>
        <div class="brand">${esc(p.bn)}${subBrand ? ` · ${esc(subBrand.n)}` : ""}</div>
        <h1>${esc(p.n)}</h1>
        <div class="sub">${d.spec["Case Count"] ? `Case count: <b>${esc(d.spec["Case Count"])}</b> · ` : ""}Product code: <b>${esc(p.c || "—")}</b>${p.cn ? ` · ${esc(p.cn)}` : ""}</div>
        ${d.desc ? `<div class="pd-desc">${d.desc}</div>` : ""}
        <div class="actions">
          <div class="qty"><button type="button" id="q-minus" aria-label="Fewer cases">−</button><input id="qty" type="number" min="1" value="1" aria-label="Cases"><span>cases</span><button type="button" id="q-plus" aria-label="More cases">+</button></div>
          <button class="btn btn-primary" id="req">Request price</button>
          <a class="btn btn-ghost" href="index.html#catalog">Continue browsing</a>
        </div>
        <div class="spec"><h3>Product details</h3><dl>${specRows.map(([k, v]) => `<div class="row"><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl></div>
      </div>
    </div>
    ${tabs.length ? `<div class="tabs" role="tablist">${tabs.map((t, i) => `<button class="tab ${i ? "" : "on"}" role="tab" data-tab="${t.k}" aria-selected="${i ? "false" : "true"}">${t.t}</button>`).join("")}</div>
    <div class="panel" id="panel">${tabs[0].html}</div>` : ""}`;

  root.querySelectorAll(".pd-thumbs button").forEach(b => b.addEventListener("click", () => {
    root.querySelectorAll(".pd-thumbs button").forEach(x => x.classList.remove("on")); b.classList.add("on");
    root.querySelector("#pd-main").innerHTML = `<img src="${img("products", b.dataset.img)}" alt="${esc(p.n)}">`;
  }));
  root.querySelectorAll(".tab").forEach(b => b.addEventListener("click", () => {
    root.querySelectorAll(".tab").forEach(x => { x.classList.remove("on"); x.setAttribute("aria-selected", "false"); }); b.classList.add("on"); b.setAttribute("aria-selected", "true");
    root.querySelector("#panel").innerHTML = tabs.find(t => t.k === b.dataset.tab).html;
  }));
  const qty = root.querySelector("#qty");
  root.querySelector("#q-minus").addEventListener("click", () => qty.value = Math.max(1, (+qty.value || 1) - 1));
  root.querySelector("#q-plus").addEventListener("click", () => qty.value = (+qty.value || 1) + 1);
  BF.bindRequestButton(root.querySelector("#req"), p, () => Math.max(1, +qty.value || 1));

  // related: same sub-brand, else same top brand
  const pool = catalog.filter(x => x.id !== p.id && (subBrand ? x.b.includes(subBrand.id) : topBrand && x.b.includes(topBrand.id))).slice(0, 8);
  if (pool.length) {
    document.querySelector("#related").innerHTML = `<div class="wrap"><h2>More from ${esc(subBrand ? subBrand.n : topBrand.n)}</h2><div class="grid">${pool.map(x => `<article class="card">
      <a class="ph" href="product.html?id=${x.id}">${x.i ? `<img src="${img("products", x.i)}" alt="${esc(x.n)}" loading="lazy">` : `<div class="noimg">Image coming soon</div>`}</a>
      <div class="body"><div class="brand">${esc(x.bn)}</div><h4><a href="product.html?id=${x.id}">${esc(x.n)}</a></h4>
      <div class="meta"><div class="code">Code <b>${esc(x.c || "—")}</b></div><button class="btn btn-primary btn-sm" data-req="${x.id}">Request price</button></div></div></article>`).join("")}</div></div>`;
    document.querySelectorAll("#related [data-req]").forEach(b => BF.bindRequestButton(b, catalog.find(x => x.id === +b.dataset.req)));
  }
})();
