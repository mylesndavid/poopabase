#!/bin/sh
set -e

echo "💩 Starting poopabase..."

# Start the API server in the background
cd /app/packages/cli
npx tsx src/index.ts serve --port 3141 --db /data/default.poop.db &
API_PID=$!
echo "  API server starting on :3141"

# Start the dashboard
cd /app/packages/dashboard
npx next start -p 3008 &
DASH_PID=$!
echo "  Dashboard starting on :3008"

echo "  poopabase is running!"

# Wait for either process to exit
wait $API_PID $DASH_PID
