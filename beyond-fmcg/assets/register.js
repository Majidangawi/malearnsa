/* Beyond FMCG — retailer registration page. */
(async function () {
  const { t, esc, ICONS } = BF; BF.header({ page: "register" });
  const tax = await fetch(BF.base + "data/taxonomy.json").then(r => r.json()); BF.applySettings(tax.settings); BF.footer(tax.categories);
  const D = window.BF_I18N.ui[BF.lang]; const root = document.querySelector("#reg");
  root.innerHTML = `<h1>${t("reg_title")}</h1><p class="lead">${t("reg_p")}</p><div class="card"><form id="reg-form" novalidate>
    <div class="field"><label>${t("f_company")}</label><input name="company" required placeholder="${t("f_company_ph")}"></div>
    <div class="f2"><div class="field"><label>${t("f_contact")}</label><input name="name" required placeholder="${t("f_name_ph")}"></div><div class="field"><label>${t("f_phone")}</label><input name="phone" type="tel" dir="ltr" placeholder="${t("f_phone_ph")}"></div></div>
    <div class="field"><label>${t("f_email")}</label><input name="email" type="email" required dir="ltr" placeholder="${t("f_email_ph")}"></div>
    <div class="f2"><div class="field"><label>${t("f_cr")}</label><input name="cr_number" dir="ltr" inputmode="numeric"></div><div class="field"><label>${t("f_vat")}</label><input name="vat_number" dir="ltr" inputmode="numeric"></div></div>
    <div class="f2"><div class="field"><label>${t("f_region")}</label><select name="region"><option value="">${t("f_select")}</option>${D.regions.map(r => `<option>${r}</option>`).join("")}</select></div><div class="field"><label>${t("f_business")}</label><select name="business"><option value="">${t("f_select")}</option>${D.business.map(r => `<option>${r}</option>`).join("")}</select></div></div>
    <input type="text" name="website" tabindex="-1" autocomplete="off" class="hp" aria-hidden="true">
    <button class="btn btn-primary" type="submit" style="width:100%">${t("reg_submit")}</button></form></div>`;
  root.querySelector("#reg-form").addEventListener("submit", async e => { e.preventDefault(); const f = e.target;
    if (!f.company.value.trim() || !f.name.value.trim() || !f.email.value.trim()) { BF.toast(t("t_need")); return; }
    const b = f.querySelector("button"); b.disabled = true; b.textContent = t("sending");
    let res; try { res = await BF.post({ type: "registration", company: f.company.value.trim(), name: f.name.value.trim(), email: f.email.value.trim(), phone: f.phone.value.trim(), cr_number: f.cr_number.value.trim(), vat_number: f.vat_number.value.trim(), region: f.region.value, business: f.business.value, website: f.website.value }); } catch (err) { res = { ok: false }; }
    if (!res || !res.ok) { b.disabled = false; b.textContent = t("reg_submit"); BF.toast(t("err_send")); return; }
    root.querySelector(".card").innerHTML = `<div class="success"><div class="ok">${ICONS.check}</div><h3>${t("reg_ok_title")}</h3><p class="hint">${t("reg_ok_p", { name: esc(f.name.value), email: esc(f.email.value) })}</p><a class="btn btn-primary" href="${BF.withLang("index.html")}">${t("ok_btn")}</a></div>`;
  });
})();
