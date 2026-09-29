#!/usr/bin/env bash
set -euo pipefail

root="$(mktemp -d)"
trap 'rm -rf -- "$root"' EXIT
export FINANCIAL_APP_BACKUP_PASSPHRASE="synthetic-contract-passphrase-never-used-for-real-backups"
printf 'synthetic financial backup\n' > "$root/source.txt"
tar -czf "$root/source.tgz" -C "$root" source.txt
bash scripts/protect-backup-artifact-v2.sh encrypt "$root/source.tgz" "$root/backup.gpg"
bash scripts/protect-backup-artifact-v2.sh decrypt "$root/backup.gpg" "$root/recovered.tgz"
cmp "$root/source.tgz" "$root/recovered.tgz"

reject_decrypt() {
  local input="$1" output="$2"
  if bash scripts/protect-backup-artifact-v2.sh decrypt "$input" "$output"; then
    echo "invalid protected backup was incorrectly accepted" >&2
    exit 1
  fi
  if [[ -e "$output" ]]; then
    echo "failed decryption left a plaintext output" >&2
    exit 1
  fi
}

FINANCIAL_APP_BACKUP_PASSPHRASE="wrong-synthetic-contract-passphrase-for-negative-test" \
  reject_decrypt "$root/backup.gpg" "$root/wrong-key.tgz"
FINANCIAL_APP_BACKUP_PASSPHRASE="" reject_decrypt "$root/backup.gpg" "$root/missing-key.tgz"
node --input-type=module - "$root/backup.gpg" "$root/tampered.gpg" <<'NODE'
import { readFileSync, writeFileSync } from 'node:fs';
const bytes = readFileSync(process.argv[2]);
bytes[bytes.length - 1] ^= 1;
writeFileSync(process.argv[3], bytes);
NODE
reject_decrypt "$root/tampered.gpg" "$root/tampered.tgz"
echo "backup encryption, exact recovery, wrong-key and tamper rejection passed"
