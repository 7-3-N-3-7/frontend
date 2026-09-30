#!/bin/sh
if [ -d "/run/secrets" ]; then
  for secret in /run/secrets/*; do
    if [ -f "$secret" ]; then
      secret_name=$(basename "$secret")
      secret_name_upper=$(echo "$secret_name" | tr '[:lower:]' '[:upper:]')
      export "$secret_name_upper"="$(cat "$secret")"
    fi
  done
fi
exec "$@"
