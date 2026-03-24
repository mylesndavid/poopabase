#!/bin/sh
set -e

echo "💩 Starting poopabase..."

# Start the API server in the background
cd /app/packages/cli
npx tsx src/index.ts serve --port 3141 --db /data/default.poop.db &
echo "  API server on :3141"

# Start the dashboard (standalone mode)
cd /app/packages/dashboard
if [ -d ".next/standalone" ]; then
  cd .next/standalone
  PORT=3008 node server.js &
else
  npx next start -p 3008 &
fi
echo "  Dashboard on :3008"

echo "  poopabase is running!"
wait
