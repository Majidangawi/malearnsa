/* Beyond FMCG demo — product details page. */
(async function () {
  const { ICONS, esc, img, fmt, t, catList, withLang } = BF;
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
  if (!p || !d) { root.innerHTML = `<div class="empty" style="padding:80px 20px"><b>${t("not_found")}</b><a class="btn btn-ghost" href="${withLang("index.html")}">${t("back")}</a></div>`; return; }
  document.title = `${p.n} · Beyond FMCG`;

  const topBrand = tax.brands.find(b => p.b.includes(b.id));
  const subBrand = topBrand && topBrand.subs.find(s => p.b.includes(s.id));
  const images = d.images && d.images.length ? d.images : (p.i ? [p.i] : []);
  const SPEC = window.BF_I18N.ui[BF.lang].spec;
  const specRows = Object.entries(d.spec).filter(([, v]) => v).map(([k, v]) => [SPEC[k] || k, k === "Best Before" ? String(v).replace(" days", " " + t("days")) : v]);
  const tabs = [];
  const A = (BF.lang === "ar" && d.ar) ? d.ar : null;
  const ingHtml = A && A.ingredients ? A.ingredients : d.ingredients, ingLtr = A && A.ingredients ? "" : " ltr";
  const descHtml = A && A.desc ? A.desc : d.desc, descLtr = A && A.desc ? "" : " ltr";
  const nutHtml = A && A.nutrition_html ? A.nutrition_html : d.nutrition_html;
  if (ingHtml) tabs.push({ k: "ingredients", tt: t("tab_ingredients"), html: `<h2>${t("tab_ingredients")}</h2><div class="html${ingLtr}">${ingHtml}</div>` });
  if (nutHtml) tabs.push({ k: "nutrition", tt: t("tab_nutrition"), html: `<h2>${t("tab_nutrition")}</h2><div class="html${A && A.nutrition_html ? "" : " ltr"}">${nutHtml}</div>` });
  else if (d.nutrition) tabs.push({ k: "nutrition", tt: t("tab_nutrition"), html: `<h2>${t("tab_nutrition")}</h2><img src="${img("nutrition", d.nutrition)}" alt="${esc(t("nutrition_alt", { n: p.n }))}" loading="lazy" onerror="this.outerHTML='<p style=color:var(--muted)>${esc(t("nutrition_missing"))}</p>'">` });
  if (d.features) tabs.push({ k: "features", tt: t("tab_features"), html: `<h2>${t("tab_features")}</h2><div class="html ltr">${d.features}</div>` });
  if (d.prep) tabs.push({ k: "prep", tt: t("tab_prep"), html: `<h2>${t("tab_prep")}</h2><div class="html ltr">${d.prep}</div>` });

  root.innerHTML = `
    <nav class="crumbs" aria-label="Breadcrumb"><a href="${withLang("index.html")}">${t("crumb_catalog")}</a><span>›</span>${topBrand ? `<a class="ltr" href="${withLang("index.html?brand=" + topBrand.id)}#catalog">${esc(topBrand.n)}</a><span>›</span>` : ""}<span class="cur" style="color:var(--ink)">${esc(p.n)}</span></nav>
    <div class="pd">
      <div class="pd-gallery">
        <div class="pd-main" id="pd-main">${images[0] ? `<img src="${img("products", images[0])}" alt="${esc(p.n)}">` : `<div class="noimg" style="color:var(--faint)">${t("no_image")}</div>`}</div>
        ${images.length > 1 ? `<div class="pd-thumbs">${images.map((f, i) => `<button class="${i ? "" : "on"}" data-img="${esc(f)}" aria-label="${t("img_n", { n: i + 1 })}"><img src="${img("products", f)}" alt=""></button>`).join("")}</div>` : ""}
      </div>
      <div>
        <div class="brand ltr">${esc(p.bn)}${subBrand ? ` · ${esc(subBrand.n)}` : ""}</div>
        <h1>${esc(p.n)}</h1>
        <div class="sub">${d.spec["Case Count"] ? `${t("case_count")}: <b class="ltr">${esc(d.spec["Case Count"])}</b> · ` : ""}${t("product_code")}: <b class="ltr">${esc(p.c || "—")}</b>${p.cn ? ` · ${esc(catList(p.cn))}` : ""}</div>
        ${descHtml ? `<div class="pd-desc${descLtr}">${descHtml}</div>` : ""}
        <div class="actions">
          <div class="qty"><button type="button" id="q-minus" aria-label="${t("fewer")}">−</button><input id="qty" type="number" min="1" value="1" aria-label="${t("cases_lbl")}"><span>${t("cases")}</span><button type="button" id="q-plus" aria-label="${t("more")}">+</button></div>
          <button class="btn btn-primary" id="req">${t("request")}</button>
          <a class="btn btn-ghost" href="${withLang("index.html")}#catalog">${t("continue")}</a>
        </div>
        <div class="spec"><h3>${t("details")}</h3><dl>${specRows.map(([k, v]) => `<div class="row"><dt>${esc(k)}</dt><dd class="ltr">${esc(v)}</dd></div>`).join("")}</dl></div>
      </div>
    </div>
    ${tabs.length ? `<div class="tabs" role="tablist">${tabs.map((x, i) => `<button class="tab ${i ? "" : "on"}" role="tab" data-tab="${x.k}" aria-selected="${i ? "false" : "true"}">${x.tt}</button>`).join("")}</div>
    <div class="panel" id="panel">${tabs[0].html}</div>` : ""}`;

  root.querySelectorAll(".pd-thumbs button").forEach(b => b.addEventListener("click", () => {
    root.querySelectorAll(".pd-thumbs button").forEach(x => x.classList.remove("on")); b.classList.add("on");
    root.querySelector("#pd-main").innerHTML = `<img src="${img("products", b.dataset.img)}" alt="${esc(p.n)}">`;
  }));
  root.querySelectorAll(".tab").forEach(b => b.addEventListener("click", () => {
    root.querySelectorAll(".tab").forEach(x => { x.classList.remove("on"); x.setAttribute("aria-selected", "false"); }); b.classList.add("on"); b.setAttribute("aria-selected", "true");
    root.querySelector("#panel").innerHTML = tabs.find(x => x.k === b.dataset.tab).html;
  }));
  const qty = root.querySelector("#qty");
  root.querySelector("#q-minus").addEventListener("click", () => qty.value = Math.max(1, (+qty.value || 1) - 1));
  root.querySelector("#q-plus").addEventListener("click", () => qty.value = (+qty.value || 1) + 1);
  BF.bindRequestButton(root.querySelector("#req"), p, () => Math.max(1, +qty.value || 1));

  const pool = catalog.filter(x => x.id !== p.id && (subBrand ? x.b.includes(subBrand.id) : topBrand && x.b.includes(topBrand.id))).slice(0, 8);
  if (pool.length) {
    document.querySelector("#related").innerHTML = `<div class="wrap"><h2>${t("more_from", { n: `<span class="ltr">${esc(subBrand ? subBrand.n : topBrand.n)}</span>` })}</h2><div class="grid">${pool.map(x => { const href = withLang("product.html?id=" + x.id); return `<article class="card">
      <a class="ph" href="${href}">${x.i ? `<img src="${img("products", x.i)}" alt="${esc(x.n)}" loading="lazy">` : `<div class="noimg">${t("no_image")}</div>`}</a>
      <div class="body"><div class="brand ltr">${esc(x.bn)}</div><h4><a href="${href}">${esc(x.n)}</a></h4>
      <div class="meta"><div class="code">${t("code")} <b class="ltr">${esc(x.c || "—")}</b></div><button class="btn btn-primary btn-sm" data-req="${x.id}">${t("request")}</button></div></div></article>`; }).join("")}</div></div>`;
    document.querySelectorAll("#related [data-req]").forEach(b => BF.bindRequestButton(b, catalog.find(x => x.id === +b.dataset.req)));
  }
})();
