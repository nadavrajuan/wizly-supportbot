#!/usr/bin/env bash
# Update Google OAuth credentials in the running cluster.
# Usage: ./scripts/update-google-oauth.sh <client-id> <client-secret>

set -euo pipefail

if [ $# -ne 2 ]; then
  echo "Usage: $0 <google-client-id> <google-client-secret>"
  exit 1
fi

GOOGLE_CLIENT_ID="$1"
GOOGLE_CLIENT_SECRET="$2"

kubectl patch secret wizly-supportbot-secrets -n wizly-supportbot --type merge \
  -p "{\"stringData\":{\"GOOGLE_CLIENT_ID\":\"$GOOGLE_CLIENT_ID\",\"GOOGLE_CLIENT_SECRET\":\"$GOOGLE_CLIENT_SECRET\"}}"

kubectl rollout restart deployment/wizly-supportbot -n wizly-supportbot
echo "Google OAuth credentials updated. Pod restarting..."
