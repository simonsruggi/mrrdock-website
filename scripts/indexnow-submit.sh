#!/usr/bin/env bash
# Submit URLs to IndexNow (Bing, Yandex, Naver, Seznam).
# No args: submits every URL in URLS.txt. With args: submits those URLs only.
set -euo pipefail

DOMAIN="mrrdock.simoneruggiero.com"
KEY="0d1299bf-c78f-4ef1-9c1e-181bdd6da087"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ $# -gt 0 ]; then
  URLS=("$@")
else
  URLS=()
  while IFS= read -r line; do
    [ -n "$line" ] && URLS+=("$line")
  done < "$ROOT/URLS.txt"
fi

echo "IndexNow: ${#URLS[@]} URL per $DOMAIN"

PAYLOAD=$(python3 - "$DOMAIN" "$KEY" "${URLS[@]}" <<'PY'
import json, sys
host, key, *urls = sys.argv[1:]
print(json.dumps({
    "host": host,
    "key": key,
    "keyLocation": f"https://{host}/{key}.txt",
    "urlList": urls,
}))
PY
)

HTTP=$(curl -sS -o /tmp/indexnow_resp -w "%{http_code}" -X POST "https://api.indexnow.org/indexnow" \
  -H "Content-Type: application/json; charset=utf-8" \
  -d "$PAYLOAD")

echo "HTTP $HTTP"
cat /tmp/indexnow_resp 2>/dev/null && echo
case "$HTTP" in
  200|202) echo "OK" ;;
  403) echo "403: chiave non ancora raggiungibile su https://$DOMAIN/$KEY.txt — riprova dopo il deploy" ; exit 1 ;;
  *) echo "Errore IndexNow" ; exit 1 ;;
esac
