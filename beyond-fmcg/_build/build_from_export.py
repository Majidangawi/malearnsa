#!/usr/bin/env python3
"""Pull the Beyond Catalog OS export (Apps Script web app) and rebuild the static catalog data + images.
Env: EXPORT_URL (web app /exec URL), EXPORT_KEY (admin key). Exit 0 with no changes when the sheet is not dirty."""
import os, sys, json, io, re, urllib.request, urllib.parse
from PIL import Image
SITE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL, KEY = os.environ.get("EXPORT_URL", ""), os.environ.get("EXPORT_KEY", "")
if not URL or not KEY: print("EXPORT_URL/EXPORT_KEY not set — skipping"); sys.exit(0)
def get(params, attempts=4):
    """Apps Script occasionally answers 404/5xx on its redirect host for a few seconds — retry with backoff."""
    q = urllib.parse.urlencode(dict(params, key=KEY)); last = None
    for i in range(attempts):
        try:
            return json.loads(urllib.request.urlopen(urllib.request.Request(URL + "?" + q, headers={"User-Agent": "beyond-build"}), timeout=300).read().decode())
        except Exception as e:
            last = e; print(f"fetch {params.get('action')} attempt {i+1} failed: {str(e)[:120]}"); time.sleep(5 * (i + 1))
    raise last
force = os.environ.get("FORCE") == "1"
ex = get({"action": "export", "force": "1" if force else "0"})
if not ex.get("ok"): print("export error:", ex); sys.exit(1)
if ex.get("unchanged"): print("no changes"); sys.exit(0)
prods, brands, cats = ex["products"], ex["brands"], ex["categories"]
print("export:", ex["counts"])
# ---- ids ----
def num(s): m = re.search(r"\d+", str(s)); return int(m.group()) if m else None
brand_by_name = {b["name"]: b for b in brands}
KNOWN = {b["name"] for b in brands} | {c["name"] for c in cats}
def multi(s):
    s = str(s or "").strip()
    if not s: return []
    if "|" in s: return [x.strip() for x in s.split("|") if x.strip()]
    if s in KNOWN: return [s]
    parts = [x.strip() for x in s.split(",") if x.strip()]; out = []; i = 0
    while i < len(parts):
        for j in range(len(parts), i, -1):
            cand = ", ".join(parts[i:j])
            if cand in KNOWN or j == i + 1: out.append(cand); i = j; break
    return out
top_brands = [b for b in brands if b["level"] == "brand"]; subs = [b for b in brands if b["level"] == "sub_brand"]; lines = [b for b in brands if b["level"] == "product_line"]
cat_top = [c for c in cats if not c["parent_id"]]; cat_sub = [c for c in cats if c["parent_id"]]
def cat_ids(names, pool, parents=None):
    out = []
    for n in multi(names):
        for c in pool:
            if c["name"] == n and (parents is None or c["parent_id"] in parents): out.append(num(c["id"]))
    return out
def pick(name, pool, parents):
    """Rows named `name` under one of `parents`; else the unique global match; else nothing."""
    scoped = [r for r in pool if r["name"] == name and r["parent_id"] in parents]
    if scoped: return scoped
    glob = [r for r in pool if r["name"] == name]
    return glob if len(glob) == 1 else []
def brand_ids(p):
    tops = [b for n in multi(p["brand"]) for b in top_brands if b["name"] == n]
    top_ids = [t["id"] for t in tops]
    sub = [b for n in multi(p["sub_brand"]) for b in pick(n, subs, top_ids)]
    # lines imply their sub-brand when the sub-brand column is missing it
    line_rows = [l for n in multi(p["product_line"]) for l in pick(n, lines, [s["id"] for s in sub] or [s["id"] for s in subs if s["parent_id"] in top_ids])]
    for l in line_rows:
        par = next((s for s in subs if s["id"] == l["parent_id"]), None)
        if par and par not in sub: sub.append(par)
    return sorted(set(num(b["id"]) for b in tops + sub)), sorted(set(num(l["id"]) for l in line_rows))
# ---- images: repo filenames stay; drive:<id> → download + webp ----
os.makedirs(os.path.join(SITE, "img/products"), exist_ok=True); os.makedirs(os.path.join(SITE, "img/brands"), exist_ok=True)
def resolve_images(field, kind="products", maxpx=520):
    out = []
    raw = str(field or "")
    for token in [x.strip() for x in (raw.split("|") if "|" in raw or raw.startswith("http") else raw.split(",")) if x.strip()]:
        if token.startswith("drive:"):
            fid = token[6:]; fn = f"drv-{fid}.webp"; path = os.path.join(SITE, "img", kind, fn)
            if not os.path.exists(path):
                try:
                    data = urllib.request.urlopen(f"https://drive.google.com/uc?export=download&id={fid}", timeout=120).read()
                    im = Image.open(io.BytesIO(data)); im.load(); im = im.convert("RGBA" if im.mode in ("RGBA", "LA", "P") else "RGB"); im.thumbnail((maxpx, maxpx), Image.LANCZOS); im.save(path, "WEBP", quality=72, method=5)
                except Exception as e: print("image fail", fid, str(e)[:80]); continue
            out.append(fn)
        elif token.startswith("http://") or token.startswith("https://"):
            import hashlib
            fn = "u-" + hashlib.sha1(token.encode()).hexdigest()[:12] + ".webp"; path = os.path.join(SITE, "img", kind, fn)
            if not os.path.exists(path):
                try:
                    req = urllib.request.Request(token, headers={"User-Agent": "Mozilla/5.0 (BeyondCatalogBuilder)"})
                    data = urllib.request.urlopen(req, timeout=120).read()
                    im = Image.open(io.BytesIO(data)); im.load(); im = im.convert("RGBA" if im.mode in ("RGBA", "LA", "P") else "RGB"); im.thumbnail((maxpx, maxpx), Image.LANCZOS); im.save(path, "WEBP", quality=72, method=5)
                except Exception as e: print("image fail", token[:80], str(e)[:80]); continue
            out.append(fn)
        elif os.path.exists(os.path.join(SITE, "img", kind, token)): out.append(token)
    return out
def spec(p):
    return {"Product Code": p["code"] or None, "UPC": p["ean"] or None, "GTIN": None, "Unit Size": p["unit_size"] or None, "Case Count": p["case_count"] or None, "Net Weight": p["net_weight"] or None,
            "Volume": p["volume"] or None, "Height": p["height"] or None, "Width": p["width"] or None, "Length": p["length"] or None, "Cases Per Layer": p["cases_per_layer"] or None, "Layers Per Pallet": p["layers_per_pallet"] or None, "Best Before": p["best_before"] or None}
catalog, details = [], {}
for p in sorted(prods, key=lambda x: str(x["name"]).lower()):
    if str(p.get("visibility") or "").strip().lower() == "wholesale": continue   # wholesale-only: served to approved retailers by the API, not in the public catalog
    pid = num(p["id"]); imgs = resolve_images(p["images"])
    top_rows = [c["id"] for c in cat_top if c["name"] in multi(p["category"])]
    k = cat_ids(p["category"], cat_top) + cat_ids(p["sub_category"], cat_sub, top_rows)
    bids, plids = brand_ids(p)
    catalog.append({"id": pid, "n": str(p["name"]).strip(), "n_ar": str(p.get("name_ar") or ""), "c": str(p["code"]), "u": str(p["ean"]), "bn": ", ".join(multi(p["brand"])), "cn": ", ".join(multi(p["category"])), "b": bids, "pl": plids, "k": sorted(set(k)), "i": imgs[0] if imgs else None})
    ar = {"desc": p.get("desc_ar") or "", "ingredients": p.get("ingredients_ar") or "", "nutrition_html": p.get("nutrition_html_ar") or ""}
    details[str(pid)] = {"desc": p["desc"], "features": p["features"], "ingredients": p["ingredients"], "prep": p["prep"], "label": "", "nutrition": p["nutrition_image"] or None, "nutrition_html": p["nutrition_html"], "images": imgs, "ar": ar if any(ar.values()) else None, "spec": spec(p)}
# ---- taxonomy with counts ----
def count(pred): return sum(1 for c in catalog if pred(c))
btree = []
for b in sorted(top_brands, key=lambda x: (float(x["order"] or 0), x["name"])):
    bid = num(b["id"]); c = count(lambda x: bid in x["b"])
    if not c: continue
    sub_nodes = []
    for s in [s for s in subs if s["parent_id"] == b["id"]]:
        sid = num(s["id"]); sc = count(lambda x: sid in x["b"])
        if not sc: continue
        ln = [{"id": num(l["id"]), "n": l["name"], "count": count(lambda x, l=l: num(l["id"]) in x["pl"])} for l in lines if l["parent_id"] == s["id"]]
        sub_nodes.append({"id": sid, "n": s["name"], "count": sc, "lines": [x for x in ln if x["count"]]})
    btree.append({"id": bid, "n": b["name"], "route": re.sub(r"[^a-z0-9]+", "-", b["name"].lower()).strip("-"), "desc": b["desc"], "logo": (resolve_images(b["logo"], "brands", 480) or [None])[0], "count": c, "subs": sub_nodes})
ctree, promo = [], []
for c in sorted(cat_top, key=lambda x: (float(x["order"] or 0), x["name"])):
    cid = num(c["id"])
    node = {"id": cid, "n": c["name"], "count": count(lambda x: cid in x["k"]), "subs": [{"id": num(s["id"]), "n": s["name"], "count": count(lambda x, s=s: num(s["id"]) in x["k"])} for s in cat_sub if s["parent_id"] == c["id"]]}
    node["subs"] = [s for s in node["subs"] if s["count"]]
    (promo if c["type"] == "PROMOTION" else ctree).append(node)
logos = [{"n": b["n"], "logo": b["logo"]} for b in btree if b["logo"]]
tax = {"brands": btree, "categories": ctree, "promotions": promo, "logos": logos, "totals": {"products": len(catalog), "brands": len(btree), "categories": len(ctree)}, "settings": ex.get("settings", {}), "built_at": ex["at"]}
D = os.path.join(SITE, "data"); os.makedirs(os.path.join(D, "p"), exist_ok=True)
json.dump(catalog, open(os.path.join(D, "catalog.json"), "w"), separators=(",", ":"), ensure_ascii=False)
json.dump(tax, open(os.path.join(D, "taxonomy.json"), "w"), separators=(",", ":"), ensure_ascii=False)
for pid, d in details.items(): json.dump(d, open(os.path.join(D, "p", pid + ".json"), "w"), separators=(",", ":"), ensure_ascii=False)
for fn in os.listdir(os.path.join(D, "p")):                      # drop detail files of unpublished/archived products
    if fn.endswith(".json") and fn[:-5] not in details: os.remove(os.path.join(D, "p", fn))
print("built:", tax["totals"])
# ---- inject public settings into the HTML pages (no layout shift, no extra fetch) ----
_inj = json.dumps(tax["settings"], ensure_ascii=False).replace("</", "<\\/")
for _page in ("index.html", "product.html", "register.html", "quote.html", "account.html", "privacy.html"):
    _p = os.path.join(SITE, _page)
    if not os.path.exists(_p): continue
    _s = open(_p, encoding="utf-8").read()
    _n = re.sub(r'(<script id="bf-settings" type="application/json">)[\s\S]*?(</script>)', lambda m: m.group(1) + _inj + m.group(2), _s, count=1)
    if _n != _s: open(_p, "w", encoding="utf-8").write(_n)
get({"action": "published"})
