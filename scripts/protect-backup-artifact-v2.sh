#!/usr/bin/env bash
set -euo pipefail
umask 077

mode="${1:-}"
input="${2:-}"
output="${3:-}"
passphrase="${FINANCIAL_APP_BACKUP_PASSPHRASE:-}"

if [[ "$mode" != "encrypt" && "$mode" != "decrypt" ]] || [[ ! -f "$input" || -z "$output" ]]; then
  echo "backup_v2_protection_invalid_arguments" >&2
  exit 1
fi
if [[ ${#passphrase} -lt 32 || "$passphrase" == *$'\n'* || "$passphrase" == *$'\r'* ]]; then
  echo "backup_v2_protection_requires_dedicated_passphrase_at_least_32_characters" >&2
  exit 1
fi
if [[ -e "$output" || -L "$output" ]]; then
  echo "backup_v2_protection_output_already_exists" >&2
  exit 1
fi

partial=""
gnupg_dir=""
cleanup() {
  if [[ -n "$partial" ]]; then rm -f -- "$partial"; fi
  if [[ -n "$gnupg_dir" ]]; then
    gpgconf --homedir "$gnupg_dir" --kill gpg-agent >/dev/null 2>&1 || true
    rm -rf -- "$gnupg_dir"
  fi
}
trap cleanup EXIT
gnupg_dir="$(mktemp -d)"
partial="$(mktemp "${output}.partial.XXXXXX")"
options=(--homedir "$gnupg_dir" --batch --yes --no-tty --quiet --pinentry-mode loopback --passphrase-fd 0 --no-symkey-cache)
if [[ "$mode" == "encrypt" ]]; then
  options+=(--symmetric --cipher-algo AES256)
else
  options+=(--decrypt)
fi

# Never place the passphrase in command arguments or publish partial plaintext.
if ! printf '%s\n' "$passphrase" | gpg "${options[@]}" --output "$partial" -- "$input" 2>/dev/null; then
  echo "backup_v2_protection_${mode}_failed" >&2
  exit 1
fi
mv -- "$partial" "$output"
partial=""
echo "backup_v2_protection_${mode}_ok"
