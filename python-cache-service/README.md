# Vibecheck Cinema Cache Service

FastAPI + SQLAlchemy + Supabase PostgreSQL service that caches TMDB and YouTube
API responses so that once one person looks up a movie, everyone after them
gets the same data straight from the database instead of triggering a new
TMDB/YouTube API call.

Firebase is untouched — it's still handling login/auth exactly as before, in
the Node app. This service only handles movie data.

## How it works

1. The React app (through the Node/Express server) asks for movie data,
   e.g. "details for movie 27205".
2. This service checks the `cached_responses` table in your Supabase Postgres
   database first.
   - **Found and not expired** → returned immediately. No TMDB/YouTube call.
   - **Missing or expired** → calls the real TMDB/YouTube API once, saves the
     result to Postgres, then returns it.
3. The next person (or the same person again) who asks for that same movie
   gets it from Postgres — instant, and doesn't use up your TMDB/YouTube quota.

Different kinds of data expire at different rates, since some change more
often than others:

| Data | Cache lifetime |
|---|---|
| Popular / Now Playing / Upcoming / Top Rated lists | 6 hours |
| Search results | 12 hours |
| Movie details | 30 days |
| YouTube review sentiment analysis | 3 days |

## Step-by-step setup

### 1. Get a Supabase Postgres connection string
1. Go to your Supabase project → **Project Settings → Database**.
2. Under **Connection string**, copy the **URI** (make sure you use the
   "Session pooler" or direct connection string, not the JDBC one).
3. It looks like:
   `postgresql://postgres:[YOUR-PASSWORD]@db.xxxxxxxx.supabase.co:5432/postgres`

### 2. Configure this service
1. In this folder (`python-cache-service/`), copy `.env.example` to `.env`.
2. Paste your Supabase connection string into `DATABASE_URL`.
3. Paste the same `TMDB_API_KEY` and `YOUTUBE_API_KEY` you already use in the
   main project's `.env`.

### 3. Install Python (one-time)
Install Python 3.11 or newer from [python.org](https://www.python.org/downloads/)
if you don't already have it. On Windows, tick "Add python.exe to PATH"
during install.

### 4. Run the service
- **Windows:** double-click `run.bat` in this folder.
- **Mac/Linux:** run `./run.sh` in this folder.

Either script will:
1. Create a Python virtual environment (first run only).
2. Install dependencies from `requirements.txt`.
3. Create the `cached_responses` table in your Supabase database automatically
   (first run only — no manual SQL needed).
4. Start the service at `http://localhost:8000`.

Leave this window open while using the website — it needs to keep running
alongside the Node app.

### 5. Point the Node app at this service
In the main project's `.env` (the root `vibe-login-official-source/.env`,
next to `package.json`), add:

```
CINEMA_SERVICE_URL=http://localhost:8000
```

Then start the Node app as usual (`run.bat` at the project root, or
`pnpm dev`). The Node server now forwards all `/api/movies/*` and
`/api/search` requests to this service instead of calling TMDB/YouTube
directly.

### 6. Verify it's working
1. With both services running, open `http://localhost:8000/api/health`
   directly in a browser — you should see `"ready": true`.
2. Use the site's movie search once. Check your Supabase project →
   **Table Editor → cached_responses** — you should see a new row appear.
3. Search for the same thing again (or have a different browser/device do
   it) — it should return instantly, and the `hit_count` column on that row
   will increase instead of a new row being created.

## Checking what's cached
Open the Supabase Table Editor and look at `cached_responses`:
- `cache_key` — what was requested (e.g. `movie:27205:details`)
- `endpoint` — the kind of request (`movie_list`, `search`, `movie_details`, `reviews`)
- `expires_at` — when this entry will be refreshed from the real API next
- `hit_count` — how many times this row served a request instead of an API call

## Production notes
- This uses `create_all` for simplicity (no migration tool). If you need to
  change the schema later, either drop the `cached_responses` table and let
  it recreate, or introduce Alembic.
- If you deploy this service separately from the Node app (e.g. different
  hosts), set `CINEMA_SERVICE_URL` in the Node app to this service's real
  URL, and add that Node app's origin to `CORS_ORIGINS` in this service's
  `.env`.
