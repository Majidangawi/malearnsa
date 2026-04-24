#!/usr/bin/env python3
"""
Build-PDF — converts DEPLOYMENT-GUIDE.md into a branded, print-ready PDF.

Uses the Python `markdown` library + Chrome headless. No external services.

Usage:
    python3 build-pdf.py          # produces DEPLOYMENT-GUIDE.pdf next to the .md
"""

from pathlib import Path
import subprocess
import sys
import shutil

try:
    import markdown
except ImportError:
    sys.exit("Missing dep: pip3 install --user markdown pymdown-extensions")

KIT_DIR = Path(__file__).resolve().parent.parent
MD_PATH = KIT_DIR / "DEPLOYMENT-GUIDE.md"
HTML_PATH = KIT_DIR / "build" / "DEPLOYMENT-GUIDE.html"
PDF_PATH = KIT_DIR / "DEPLOYMENT-GUIDE.pdf"

CHROME_CANDIDATES = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    shutil.which("chrome") or "",
    shutil.which("chromium") or "",
]

PRINT_CSS = r"""
@page {
  size: A4;
  margin: 18mm 16mm 20mm 16mm;
  @bottom-center {
    content: counter(page) " / " counter(pages);
    font-family: -apple-system, system-ui, sans-serif;
    font-size: 9pt;
    color: #888;
  }
}

:root {
  --gold: #c9a84c;
  --ink: #0f0f0f;
  --ink-2: #3a3a3a;
  --ink-3: #6a6a6a;
  --rule: #e6e1d4;
}

html, body {
  font-family: 'Georgia', 'Times New Roman', serif;
  color: var(--ink);
  line-height: 1.55;
  font-size: 10.5pt;
  background: #fff;
}

body { max-width: 720px; margin: 0 auto; padding: 0; }

h1, h2, h3, h4 {
  font-family: -apple-system, system-ui, 'Helvetica Neue', sans-serif;
  color: var(--ink);
  line-height: 1.2;
  letter-spacing: -0.005em;
  page-break-after: avoid;
}

h1 {
  font-size: 22pt;
  font-weight: 700;
  margin: 1.2em 0 0.3em;
  border-bottom: 2px solid var(--gold);
  padding-bottom: 0.25em;
}
h1:first-of-type {
  margin-top: 0;
  font-size: 28pt;
  padding-top: 0;
}

h2 {
  font-size: 15pt;
  font-weight: 700;
  margin: 2em 0 0.5em;
  color: var(--gold);
  border-top: 0.5pt solid var(--rule);
  padding-top: 0.8em;
}

h3 {
  font-size: 12.5pt;
  font-weight: 700;
  margin: 1.4em 0 0.3em;
}

h4 {
  font-size: 11pt;
  font-weight: 700;
  margin: 1.1em 0 0.2em;
}

p { margin: 0 0 0.6em; orphans: 3; widows: 3; }

a { color: var(--ink); text-decoration: none; border-bottom: 0.5pt solid var(--gold); }

code {
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 0.88em;
  background: #f5f1e5;
  padding: 1px 4px;
  border-radius: 3px;
  color: var(--ink);
}

pre {
  background: #1a1a1a;
  color: #f5f1e5;
  padding: 10px 14px;
  border-radius: 4px;
  font-size: 9pt;
  line-height: 1.45;
  overflow-x: auto;
  page-break-inside: avoid;
  margin: 0.8em 0;
}
pre code { background: transparent; color: inherit; padding: 0; }

ul, ol { margin: 0.5em 0 0.8em 1.3em; padding: 0; }
li { margin-bottom: 0.25em; }

blockquote {
  border-left: 3px solid var(--gold);
  padding: 0.4em 0 0.4em 0.9em;
  color: var(--ink-2);
  font-style: italic;
  margin: 0.8em 0;
}

table {
  border-collapse: collapse;
  width: 100%;
  margin: 0.8em 0;
  font-size: 9.5pt;
  page-break-inside: avoid;
}
th, td {
  border: 0.5pt solid var(--rule);
  padding: 6px 10px;
  text-align: left;
  vertical-align: top;
}
th {
  background: #f5f1e5;
  color: var(--ink);
  font-weight: 700;
  font-family: -apple-system, system-ui, sans-serif;
}
tbody tr:nth-child(even) { background: #fbfaf5; }

hr {
  border: 0;
  border-top: 0.5pt solid var(--gold);
  margin: 1.5em auto;
  width: 100%;
  opacity: 0.5;
}

strong { color: var(--ink); }
em { color: var(--ink-2); }

/* Cover page */
.cover {
  page-break-after: always;
  padding-top: 80pt;
  text-align: center;
}
.cover .kicker {
  font-family: -apple-system, system-ui, sans-serif;
  font-size: 10pt;
  letter-spacing: 0.2em;
  color: var(--gold);
  text-transform: uppercase;
}
.cover h1 {
  font-size: 40pt;
  border: 0;
  margin: 20pt 0 14pt;
  padding: 0;
  line-height: 1.1;
}
.cover .sub {
  font-family: -apple-system, system-ui, sans-serif;
  font-size: 14pt;
  color: var(--ink-2);
  max-width: 480px;
  margin: 0 auto;
  line-height: 1.4;
}
.cover .meta {
  margin-top: 60pt;
  font-size: 10pt;
  color: var(--ink-3);
  font-family: -apple-system, system-ui, sans-serif;
  letter-spacing: 0.02em;
}
.cover .rule {
  width: 60pt;
  height: 1pt;
  background: var(--gold);
  margin: 28pt auto;
}

.toc {
  page-break-after: always;
}

.footer-credit {
  text-align: center;
  margin-top: 3em;
  color: var(--ink-3);
  font-size: 9pt;
  font-style: italic;
}

/* Avoid page break inside these patterns */
h1, h2, h3, h4, table, pre { page-break-inside: avoid; }
"""


def find_chrome():
    for path in CHROME_CANDIDATES:
        if path and Path(path).exists():
            return path
    sys.exit(
        "Could not find Chrome/Chromium. Install Chrome or set CHROME_PATH.\n"
        "On macOS: https://www.google.com/chrome/"
    )


def build_html(md_text: str) -> str:
    md = markdown.Markdown(
        extensions=[
            "extra",
            "tables",
            "fenced_code",
            "toc",
            "sane_lists",
            "attr_list",
        ],
        extension_configs={"toc": {"toc_depth": "2-3"}},
    )
    body = md.convert(md_text)
    # Manually split out a cover + push the first H1 below the cover
    cover_html = (
        '<section class="cover">'
        '<div class="kicker">Practical Handbook</div>'
        '<h1>LLM SEO<br>Deployment Guide</h1>'
        '<div class="rule"></div>'
        '<div class="sub">A step-by-step technical handbook for deploying AI-discovery '
        'files to any business website — static HTML, WordPress, Webflow, Shopify, Framer, '
        'Squarespace, and more.</div>'
        '<div class="meta">MA Learn · Version 1.0 · 2026</div>'
        '</section>'
    )
    # Strip the first H1 from the markdown body — the cover replaces it
    if body.startswith("<h1"):
        end = body.find("</h1>") + len("</h1>")
        body = body[end:]
        # Also strip the immediately following <hr>/whitespace
        body = body.lstrip()

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>LLM SEO Deployment Guide</title>
<style>{PRINT_CSS}</style>
</head>
<body>
{cover_html}
{body}
<div class="footer-credit">© 2026 Majid Angawi · MA Learn · malearnsa.com</div>
</body>
</html>"""
    return html


def main():
    if not MD_PATH.exists():
        sys.exit(f"Missing source: {MD_PATH}")

    chrome = find_chrome()
    print(f"[1/4] chrome: {chrome}")

    md_text = MD_PATH.read_text(encoding="utf-8")
    print(f"[2/4] read {MD_PATH.name}: {len(md_text)} chars")

    html = build_html(md_text)
    HTML_PATH.write_text(html, encoding="utf-8")
    print(f"[3/4] wrote {HTML_PATH.relative_to(KIT_DIR)}: {len(html)} chars")

    args = [
        chrome,
        "--headless=new",
        "--disable-gpu",
        "--no-pdf-header-footer",
        f"--print-to-pdf={PDF_PATH}",
        "--print-to-pdf-no-header",
        "--virtual-time-budget=5000",
        HTML_PATH.as_uri(),
    ]
    result = subprocess.run(args, capture_output=True, text=True, timeout=60)
    if result.returncode != 0:
        sys.stderr.write(result.stderr[-2000:])
        sys.exit(f"Chrome exited with code {result.returncode}")

    size_kb = PDF_PATH.stat().st_size // 1024
    print(f"[4/4] wrote {PDF_PATH.relative_to(KIT_DIR)}: {size_kb} KB")


if __name__ == "__main__":
    main()
