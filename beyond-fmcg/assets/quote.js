/* Beyond FMCG — quotation page (magic link): view, accept or decline. */
(async function () {
  const { t, esc, withLang, ICONS } = BF; BF.header({ page: "quote" }); fetch(BF.base + "data/taxonomy.json").then(r => r.json()).then(tax => BF.footer(tax.categories)).catch(() => BF.footer([]));
  const root = document.querySelector("#quote"); const token = new URLSearchParams(location.search).get("t") || "";
  const API = document.body.dataset.api || BF.API; const money = n => Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  root.innerHTML = `<h1>${t("q_title")}</h1><div class="card"><p class="hint">${t("loading")}</p></div>`;
  let d; try { d = await fetch(API + "?action=quote&t=" + encodeURIComponent(token), { redirect: "follow" }).then(r => r.json()); } catch (e) { d = { ok: false }; }
  if (!d || !d.ok) { root.innerHTML = `<h1>${t("q_title")}</h1><div class="card"><p>${t("q_invalid")}</p><a class="btn btn-primary" href="${withLang("index.html")}">${t("ok_btn")}</a></div>`; return; }
  const cur = esc(d.currency || "SAR");
  const rows = d.items.map(it => `<tr><td>${esc(it.product_name)}</td><td class="ltr">${esc(it.cases)}</td><td class="ltr">${money(it.unit_price)}</td><td class="ltr">${money(it.line_total)}</td></tr>`).join("");
  const statusMsg = { sent: t("q_status_sent"), won: t("q_status_won"), lost: t("q_status_lost"), expired: t("q_status_expired"), draft: t("q_status_draft") }[d.status] || d.status;
  root.innerHTML = `<h1>${t("q_title")}</h1><p class="lead">${t("q_ref")} <b class="ltr">${esc(d.ref)}</b> · ${t("q_req")} <span class="ltr">${esc(d.request_ref)}</span> · ${esc(d.company || d.name)}</p>
    <div class="card"><p class="hint">${d.sent_at ? t("q_valid", { n: d.validity_days, d: String(d.sent_at).slice(0, 10) }) : ""}</p>
    <div class="qt-wrap"><table class="qt"><thead><tr><th>${t("q_product")}</th><th>${t("q_cases")}</th><th>${t("q_unit")} (${cur})</th><th>${t("q_line")} (${cur})</th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="qt-totals"><span>${t("q_subtotal")} <b class="ltr">${money(d.subtotal)}</b></span><span>${t("q_vat")} <b class="ltr">${money(d.vat)}</b></span><span class="grand">${t("q_total")} <b class="ltr">${money(d.total)} ${cur}</b></span></div>
    <div class="qt-status ${esc(d.status)}"><b>${statusMsg}</b></div>
    ${d.pdf ? `<p><a class="btn btn-ghost" href="${esc(d.pdf)}" target="_blank" rel="noopener">${t("q_pdf")}</a></p>` : ""}
    ${d.status === "sent" ? `<form id="qa" novalidate><div class="field"><label>${t("q_note")}</label><textarea name="note"></textarea></div><div class="cta"><button class="btn btn-primary" type="button" data-d="accept">${t("q_accept")}</button><button class="btn btn-ghost" type="button" data-d="decline">${t("q_decline")}</button></div><div id="qamsg"></div></form>` : ""}
    </div>`;
  const form = root.querySelector("#qa"); if (!form) return;
  form.addEventListener("click", async e => { const b = e.target.closest("[data-d]"); if (!b) return; const dec = b.dataset.d;
    if (!confirm(t(dec === "accept" ? "q_confirm_accept" : "q_confirm_decline", { ref: d.ref }))) return;
    form.querySelectorAll("button").forEach(x => x.disabled = true); let res; try { res = await BF.post({ type: "quote_answer", token, decision: dec, note: form.note.value.trim() }); } catch (err) { res = { ok: false }; }
    if (res && res.ok) { form.innerHTML = `<div class="success"><div class="ok">${ICONS.check}</div><h3>${t(dec === "accept" ? "q_done_accept" : "q_done_decline")}</h3><a class="btn btn-primary" href="${withLang("index.html")}">${t("ok_btn")}</a></div>`; root.querySelector(".qt-status").innerHTML = `<b>${dec === "accept" ? t("q_status_won") : t("q_status_lost")}</b>`; }
    else { form.querySelectorAll("button").forEach(x => x.disabled = false); const k = { expired: "q_err_expired", already_answered: "q_err_answered", not_found: "q_err_notfound" }[res && res.error] || "err_send"; form.querySelector("#qamsg").innerHTML = `<p class="err">${t(k)}</p>`; BF.toast(t(k)); } });
})();
