#!/usr/bin/env bash
# Pull the script out of index.html and let node parse it. Catches a typo in
# a second instead of after a browser launch.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${TMPDIR:-/tmp}/xmoto_syntax_$$.js"
node -e '
const fs=require("fs");
const html=fs.readFileSync(process.argv[1],"utf8");
let parts=[...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
if(!parts.length){
  // while the file is still being written the closing tag may be missing
  const i=html.search(/<script(?![^>]*\bsrc=)[^>]*>/);
  if(i>=0) parts=[html.slice(html.indexOf(">",i)+1)];
}
if(!parts.length){console.error("no inline script found");process.exit(2);}
fs.writeFileSync(process.argv[2],parts.join("\n;\n"));
' "$ROOT/index.html" "$OUT" || exit 2
node --check "$OUT"
rc=$?
if [ $rc -eq 0 ]; then echo "PASS syntax: index.html script parses"; else echo "FAIL syntax: index.html script does not parse"; fi
rm -f "$OUT"
exit $rc
