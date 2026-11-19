#!/usr/bin/env python3
"""Sync docs/index.html <pre id="agentPrompt"> from docs/agent-prompt.txt.

Single source of truth (audit M-13): edit the .txt, run this script, commit
both files. The script HTML-escapes the .txt and replaces the <pre> content
so the page copy is byte-identical to the .txt (after entity decoding).
"""
import html
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent
TXT = ROOT / "docs" / "agent-prompt.txt"
HTML = ROOT / "docs" / "index.html"

text = TXT.read_text(encoding="utf-8")
escaped = html.escape(text, quote=True)

page = HTML.read_text(encoding="utf-8")
pat = re.compile(r'(<pre id="agentPrompt" class="prompt-box">).*?(</pre>)', re.S)
new, n = pat.subn(lambda m: m.group(1) + escaped + m.group(2), page)
if n != 1:
    sys.exit('expected exactly 1 <pre id="agentPrompt"> block, found %d' % n)
HTML.write_text(new, encoding="utf-8")
print("synced %d bytes from %s into %s" % (len(text), TXT.name, HTML.name))
