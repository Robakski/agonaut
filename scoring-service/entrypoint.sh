#!/bin/sh
# Entrypoint: runs as root initially to fix socket permissions,
# then drops to 'scorer' user via gosu for the actual service.
# This is the standard Docker pattern for non-root containers that
# need brief root access at startup.

set -e

# Fix dstack socket permissions so scorer user can access it
if [ -S /var/run/dstack.sock ]; then
    chmod 666 /var/run/dstack.sock
    echo "Fixed dstack.sock permissions for scorer user"
fi

# Fix data directory ownership
chown -R scorer:scorer /app/data 2>/dev/null || true

# Drop to non-root user and exec the service
exec gosu scorer uvicorn api:app --host 0.0.0.0 --port 8001 --workers 1
