#!/usr/bin/env bash
# Run every suite. Each one prints lines starting with PASS or FAIL.
cd "$(dirname "$0")/.." || exit 1
rc=0
./tests/syntax.sh || rc=1
for f in tests/test_*.js; do
  echo ""
  echo "==================== $f"
  node "$f" || rc=1
done
echo ""
if [ $rc -eq 0 ]; then echo "ALL SUITES GREEN"; else echo "SOMETHING IS RED"; fi
exit $rc
