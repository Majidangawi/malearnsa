/* Beyond FMCG — privacy notice (bilingual, company name from Settings). */
(async function () {
  const { t, esc } = BF; BF.header({ page: "privacy" });
  const tax = await fetch(BF.base + "data/taxonomy.json").then(r => r.json()).catch(() => ({ categories: [], settings: {} }));
  BF.applySettings(tax.settings); BF.footer(tax.categories);
  const c = esc((tax.settings && tax.settings.company_name) || "Beyond FMCG");
  document.querySelector("#privacy").innerHTML = `<h1>${t("pv_title")}</h1><div class="card"><p>${t("pv_p1", { c })}</p><p>${t("pv_p2", { c })}</p><p>${t("pv_p3")}</p><p>${t("pv_p4")}</p></div>`;
})();
