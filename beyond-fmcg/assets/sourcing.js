/* Beyond FMCG — sourcing request page (custom form). */
(async function () {
  const { t, esc, withLang, ICONS } = BF; BF.header({ page: "sourcing" });
  const tax = await fetch(BF.base + "data/taxonomy.json").then(r => r.json()).catch(() => ({ categories: [], settings: {} }));
  BF.applySettings(tax.settings); BF.footer(tax.categories);
  const D = window.BF_I18N.ui[BF.lang];
  const root = document.querySelector("#sourcing");
  root.innerHTML = `<h1>${t("so_title")}</h1><p class="lead">${t("so_p")}</p><div class="card"><form id="so-form" novalidate>
    <div class="field"><label>${t("so_product")} *</label><input name="product" required placeholder="${t("so_product_ph")}"></div>
    <div class="f2"><div class="field"><label>${t("so_brand")}</label><input name="brand"></div><div class="field"><label>${t("so_origin")}</label><input name="origin"></div></div>
    <div class="f2"><div class="field"><label>${t("so_pack")}</label><input name="pack" placeholder="${t("so_pack_ph")}"></div><div class="field"><label>${t("so_qty")}</label><input name="qty" type="number" min="1" dir="ltr"></div></div>
    <div class="f2"><div class="field"><label>${t("so_price")}</label><input name="target_price" dir="ltr"></div><div class="field"><label>${t("so_link")}</label><input name="link" type="url" dir="ltr" placeholder="https://"></div></div>
    <div class="field"><label>${t("so_notes")}</label><textarea name="notes"></textarea></div>
    <hr class="sep">
    <div class="f2"><div class="field"><label>${t("f_company")} *</label><input name="company" required placeholder="${t("f_company_ph")}"></div><div class="field"><label>${t("f_contact")} *</label><input name="name" required placeholder="${t("f_name_ph")}"></div></div>
    <div class="f2"><div class="field"><label>${t("f_email")} *</label><input name="email" type="email" required dir="ltr" placeholder="${t("f_email_ph")}"></div><div class="field"><label>${t("f_phone")}</label><input name="phone" type="tel" dir="ltr" placeholder="${t("f_phone_ph")}"></div></div>
    <div class="f2"><div class="field"><label>${t("f_region")}</label><select name="region"><option value="">${t("f_select")}</option>${D.regions.map(r => `<option>${r}</option>`).join("")}</select></div><div class="field"><label>${t("f_business")}</label><select name="business"><option value="">${t("f_select")}</option>${D.business.map(r => `<option>${r}</option>`).join("")}</select></div></div>
    <input type="text" name="website" tabindex="-1" autocomplete="off" class="hp" aria-hidden="true">
    <button class="btn btn-primary" type="submit" style="width:100%">${t("so_submit")}</button></form></div>`;
  root.querySelector("#so-form").addEventListener("submit", async e => { e.preventDefault(); const f = e.target;
    if (!f.product.value.trim() || !f.company.value.trim() || !f.name.value.trim() || !f.email.value.trim()) { BF.toast(t("t_need")); return; }
    const b = f.querySelector("button[type=submit]"); b.disabled = true; b.textContent = t("sending");
    const v = k => f[k].value.trim();
    let res; try { res = await BF.post({ type: "sourcing", product: v("product"), brand: v("brand"), origin: v("origin"), pack: v("pack"), qty: v("qty"), target_price: v("target_price"), link: v("link"), notes: v("notes"), company: v("company"), name: v("name"), email: v("email"), phone: v("phone"), region: f.region.value, business: f.business.value, website: f.website.value }); } catch (err) { res = { ok: false }; }
    if (!res || !res.ok) { b.disabled = false; b.textContent = t("so_submit"); BF.toast(t("err_send")); return; }
    root.querySelector(".card").innerHTML = `<div class="success"><div class="ok">${ICONS.check}</div><h3>${t("so_ok_title")}</h3><p class="hint">${t("so_ok_p", { ref: esc(res.ref), email: esc(f.email.value) })}</p><a class="btn btn-primary" href="${withLang("index.html")}">${t("ok_btn")}</a></div>`;
  });
})();
