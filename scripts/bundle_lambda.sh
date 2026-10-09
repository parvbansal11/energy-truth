#!/usr/bin/env bash
# Build the Lambda zip asset without Docker: manylinux wheels for x86_64 / Python 3.12.
# Output: work/lambda/ (code + deps) consumed by infra/lib/api-stack.ts.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/work/lambda"
rm -rf "$OUT" && mkdir -p "$OUT"
"$ROOT/.venv/bin/python" -m pip install -q \
  --platform manylinux2014_x86_64 --implementation cp --python-version 3.12 --only-binary=:all: \
  --target "$OUT" -r "$ROOT/apps/api/requirements.txt"
# boto3/botocore ship with the Lambda runtime
rm -rf "$OUT"/boto3* "$OUT"/botocore* "$OUT"/s3transfer* "$OUT"/**/__pycache__ 2>/dev/null || true
find "$OUT" -name "__pycache__" -type d -prune -exec rm -rf {} + ; find "$OUT" -type d \( -name tests -o -name testing \) -path "*/numpy/*" -prune -exec rm -rf {} + ; rm -rf "$OUT"/pandas/tests "$OUT"/*.dist-info/RECORD
cp -R "$ROOT/apps/api/app.py" "$ROOT/apps/api/handler.py" "$OUT/"
mkdir -p "$OUT/packages"
for p in core connectors fusion chronos agents; do
  rsync -a --exclude "__pycache__" --exclude "tests" "$ROOT/packages/$p" "$OUT/packages/"
done
du -sh "$OUT"
