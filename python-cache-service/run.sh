#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "Warning: .env was not found. Copy .env.example to .env and fill in your keys."
fi

if [ ! -d venv ]; then
  python3 -m venv venv
fi

source venv/bin/activate
pip install -r requirements.txt

echo "Starting the cache service on http://localhost:8000"
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
