# Vibe Login — Official handoff

## What is included

This project uses Firebase Authentication and Firestore for account management, mandatory email verification, cross-device verification polling, display-name uniqueness, Google sign-in, password reset, account deletion, and the supplied Vibecheck Cinema dashboard. The dashboard calls same-origin Express routes for TMDB metadata and YouTube review sentiment; provider keys are read only on the server.

## Firebase checklist

1. In Firebase Authentication, enable **Email/Password** and **Google** providers.
2. Add the published website domain and the Manus preview domain to **Authentication → Settings → Authorized domains**.
3. Create or select a Firestore database.
4. Publish the repository's `firestore.rules` in **Firestore Database → Rules**. These rules protect user profiles and reserve case-insensitive display names through the `usernames` collection.
5. Confirm the Firebase web configuration in `client/src/lib/firebase.ts` matches the intended Firebase project. Firebase web API keys are public identifiers; do not place TMDB or YouTube keys in frontend code.

## Server secrets

Configure these as server-side project secrets in the WebDev project settings:

- `TMDB_API_KEY`
- `YOUTUBE_API_KEY`

Do not commit `.env` files, Firebase service-account JSON files, or provider keys. The live health route is `/api/health`; it should return `ready: true` and an empty `missing_api_keys` array.

## Development and validation

```bash
pnpm install
pnpm dev
pnpm check
pnpm test
pnpm build
```

The full-stack entry point is `server/_core/index.ts`. The supplied cinema dashboard is served at `/cinema/app.html` and is displayed after successful Firebase login through `client/src/components/CinemaDashboard.tsx`.

## Live API routes

- `/api/health`
- `/api/search?q=movie title`
- `/api/movies/popular`
- `/api/movies/now-playing`
- `/api/movies/upcoming`
- `/api/movies/top-rated`
- `/api/movies/:id`
- `/api/movies/:id/analysis`
- `/api/movies/:id/full`

The current implementation keeps YouTube failures non-fatal to movie details: the analysis response returns `source_errors.youtube` when review comments are unavailable, while TMDB metadata remains usable.
