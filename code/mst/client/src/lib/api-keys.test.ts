import { describe, expect, it } from "vitest";

describe("movie API credentials", () => {
  it("can authenticate against TMDB and YouTube Data API v3", async () => {
    const tmdbKey = process.env.TMDB_API_KEY;
    const youtubeKey = process.env.YOUTUBE_API_KEY;
    expect(tmdbKey).toBeTruthy();
    expect(youtubeKey).toBeTruthy();

    const [tmdbResponse, youtubeResponse] = await Promise.all([
      fetch(`https://api.tmdb.org/3/configuration?api_key=${encodeURIComponent(tmdbKey || "")}`),
      fetch(`https://www.googleapis.com/youtube/v3/videos?part=id&id=dQw4w9WgXcQ&key=${encodeURIComponent(youtubeKey || "")}`),
    ]);

    expect(tmdbResponse.ok, `TMDB returned ${tmdbResponse.status}`).toBe(true);
    expect(youtubeResponse.ok, `YouTube returned ${youtubeResponse.status}`).toBe(true);
  }, 20_000);
});
