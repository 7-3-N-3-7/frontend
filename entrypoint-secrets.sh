#!/bin/sh
# entrypoint-secrets.sh
# Reads all files in /run/secrets/ and exports their contents as environment variables.

if [ -d "/run/secrets" ]; then
  for secret in /run/secrets/*; do
    if [ -f "$secret" ]; then
      secret_name=$(basename "$secret")
      # Optional: you can uppercase the secret name if you want, but typically 
      # the secret name should match the desired environment variable name exactly.
      # We'll just use the secret filename directly as the variable name.
      export "$secret_name"="$(cat "$secret")"
    fi
  done
fi

# Execute the main container command
exec "$@"
