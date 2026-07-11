#!/usr/bin/env bash
set -euo pipefail
input=${1:?evidence directory required}
output=${2:?encrypted output path required}
: "${E2E_EVIDENCE_KEY:?E2E_EVIDENCE_KEY is required}"
test -d "$input"
tar -C "$input" --sort=name --mtime='UTC 1970-01-01' -czf - . |
  openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000 -pass env:E2E_EVIDENCE_KEY -out "$output"
openssl dgst -sha256 -hmac "$E2E_EVIDENCE_KEY" -binary "$output" | base64 > "$output.hmac"
