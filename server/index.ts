import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_IMAGES = "https://image.tmdb.org/t/p/w500";
const YOUTUBE_BASE = "https://www.googleapis.com/youtube/v3";
const cache = new Map<string, { expires: number; value: unknown }>();
const CACHE_TTL = 10 * 60 * 1000;

const positiveWords = new Set("amazing awesome beautiful brilliant compelling excellent fantastic fascinating fun funny good great incredible love loved masterpiece perfect powerful remarkable solid stunning superb entertaining enjoyable emotional favorite well-written worth watch recommend".split(" "));
const negativeWords = new Set("awful bad boring confusing disappointing dislike disliked dull fails failure flat forgettable horrible hate hated lazy mediocre messy predictable poor terrible tedious weak worst waste wasted disappointing".split(" "));
const aspectKeywords: Record<string, string[]> = { Acting: ["acting", "actor", "actress", "cast", "performance", "performances"], Story: ["story", "plot", "writing", "script", "narrative", "character"], Visuals: ["visual", "cinematography", "effects", "animation", "beautiful", "scene"], Music: ["music", "soundtrack", "score", "song", "sound"], Pacing: ["pace", "pacing", "slow", "fast", "length"] };

function cached<T>(key: string, value: T) { cache.set(key, { expires: Date.now() + CACHE_TTL, value }); return value; }
function cacheGet<T>(key: string) { const item = cache.get(key); if (!item || item.expires < Date.now()) return null; return item.value as T; }
function imageUrl(pathname: string | null | undefined) { return pathname ? `${TMDB_IMAGES}${pathname}` : null; }
function safeMessage(error: unknown) { return error instanceof Error ? error.message.split(" for url:")[0] : "Provider request failed"; }

async function tmdb<T>(pathname: string, params: Record<string, string | number> = {}) {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) throw new Error("TMDB_API_KEY is not configured on the server.");
  const url = new URL(`${TMDB_BASE}${pathname}`);
  url.searchParams.set("api_key", apiKey);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, String(value)));
  const key = `tmdb:${url.pathname}:${url.search}`;
  const previous = cacheGet<T>(key); if (previous) return previous;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`TMDB returned ${response.status}`);
  return cached(key, await response.json() as T);
}

function simplifyMovie(movie: any) {
  return { id: movie.id, title: movie.title, release_date: movie.release_date, overview: movie.overview, poster_url: imageUrl(movie.poster_path), backdrop_url: imageUrl(movie.backdrop_path), vote_average: movie.vote_average, popularity: movie.popularity };
}
function simplifyList(data: any) { return { page: data.page, total_pages: data.total_pages, results: (data.results || []).map(simplifyMovie) }; }

async function movieDetails(id: string) {
  const data = await tmdb<any>(`/movie/${encodeURIComponent(id)}`, { append_to_response: "credits,videos" });
  const cast = (data.credits?.cast || []).slice(0, 8).map((person: any) => ({ name: person.name, character: person.character }));
  const director = (data.credits?.crew || []).find((person: any) => person.job === "Director")?.name || null;
  const trailers = (data.videos?.results || []).filter((video: any) => video.site === "YouTube" && ["Trailer", "Teaser"].includes(video.type));
  const trailer = trailers[0]?.key ? { name: trailers[0].name, youtube_key: trailers[0].key, youtube_url: `https://www.youtube.com/watch?v=${trailers[0].key}`, youtube_embed_url: `https://www.youtube.com/embed/${trailers[0].key}` } : null;
  return { id: data.id, title: data.title, tagline: data.tagline, overview: data.overview, release_date: data.release_date, runtime: data.runtime, genres: (data.genres || []).map((genre: any) => genre.name), poster_url: imageUrl(data.poster_path), backdrop_url: imageUrl(data.backdrop_path), vote_average: data.vote_average, vote_count: data.vote_count, director, cast, trailer };
}

async function youtubeReviews(title: string) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error("YOUTUBE_API_KEY is not configured on the server.");
  const searchUrl = new URL(`${YOUTUBE_BASE}/search`);
  searchUrl.searchParams.set("part", "snippet"); searchUrl.searchParams.set("q", `${title} movie review`); searchUrl.searchParams.set("type", "video"); searchUrl.searchParams.set("maxResults", "5"); searchUrl.searchParams.set("relevanceLanguage", "en"); searchUrl.searchParams.set("order", "relevance"); searchUrl.searchParams.set("key", key);
  const searchResponse = await fetch(searchUrl); if (!searchResponse.ok) throw new Error(`YouTube returned ${searchResponse.status}`);
  const searchData = await searchResponse.json() as any; const reviews: Array<{ text: string; source: string; author: string | null; url: string | null }> = [];
  for (const item of searchData.items || []) {
    const videoId = item.id?.videoId; if (!videoId) continue;
    const commentsUrl = new URL(`${YOUTUBE_BASE}/commentThreads`); commentsUrl.searchParams.set("part", "snippet"); commentsUrl.searchParams.set("videoId", videoId); commentsUrl.searchParams.set("maxResults", "40"); commentsUrl.searchParams.set("order", "relevance"); commentsUrl.searchParams.set("textFormat", "plainText"); commentsUrl.searchParams.set("key", key);
    const commentsResponse = await fetch(commentsUrl); if (!commentsResponse.ok) continue;
    const commentsData = await commentsResponse.json() as any;
    for (const comment of commentsData.items || []) { const snippet = comment.snippet?.topLevelComment?.snippet; if (snippet?.textDisplay) reviews.push({ text: snippet.textDisplay, source: "YouTube", author: snippet.authorDisplayName || null, url: `https://www.youtube.com/watch?v=${videoId}` }); }
  }
  return reviews;
}

function scoreSentence(sentence: string) { const words = sentence.toLowerCase().replace(/[^a-z0-9\s']/g, " ").split(/\s+/).filter(Boolean); let score = 0; for (const word of words) { if (positiveWords.has(word)) score += 1; if (negativeWords.has(word)) score -= 1; } return score; }
function aspectsFor(sentence: string) { const lower = sentence.toLowerCase(); return Object.entries(aspectKeywords).filter(([, words]) => words.some((word) => lower.includes(word))).map(([aspect]) => aspect); }
function analyzeReviews(reviews: Array<{ text: string; source: string; author: string | null; url: string | null }>, title: string) {
  const positiveReviews: any[] = []; const negativeReviews: any[] = []; const stats = new Map<string, { positive: number; negative: number; examples: string[] }>(); let positive = 0; let negative = 0;
  for (const review of reviews) { for (const sentence of review.text.split(/[.!?]+/).map((part) => part.trim()).filter(Boolean)) { const score = scoreSentence(sentence); if (!score) continue; const aspects = aspectsFor(sentence); if (score > 0) positive++; else negative++; const item = { text: sentence, sentiment: score > 0 ? "positive" : "negative", aspects, source: review.source, author: review.author, url: review.url }; if (score > 0 && positiveReviews.length < 40) positiveReviews.push(item); if (score < 0 && negativeReviews.length < 40) negativeReviews.push(item); for (const aspect of aspects) { const entry = stats.get(aspect) || { positive: 0, negative: 0, examples: [] }; score > 0 ? entry.positive++ : entry.negative++; if (entry.examples.length < 3) entry.examples.push(sentence); stats.set(aspect, entry); } } }
  const pros: any[] = []; const cons: any[] = []; stats.forEach((value, aspect) => { if (value.positive > value.negative) pros.push({ aspect, pro_mentions: value.positive, con_mentions: value.negative, examples: value.examples }); if (value.negative > value.positive) cons.push({ aspect, pro_mentions: value.positive, con_mentions: value.negative, examples: value.examples }); });
  const total = positive + negative; const pct = total ? Math.round((positive / total) * 1000) / 10 : null; const verdict = pct == null ? "Not enough data" : pct >= 65 ? "Mostly Positive" : pct <= 35 ? "Mostly Negative" : "Mixed";
  return { movie_title: title, reviews_analyzed: reviews.length, sentences_scored: total, overall_verdict: verdict, overall_positive_pct: pct, positive: pros.slice(0, 8), negative: cons.slice(0, 8), pros: pros.slice(0, 8), cons: cons.slice(0, 8), positive_reviews: positiveReviews, negative_reviews: negativeReviews, summary: total ? `Based on ${reviews.length} audience reviews, ${title} has a ${verdict.toLowerCase()} reception (${pct}% positive sentiment).` : `We couldn't find enough audience reviews for ${title} yet to generate a pros/cons summary.` };
}

async function fullMovie(id: string) { const movie = await movieDetails(id); let reviews: any[] = []; let sourceErrors: Record<string, string> = {}; try { reviews = await youtubeReviews(movie.title); } catch (error) { sourceErrors.youtube = safeMessage(error); } const analysis = analyzeReviews(reviews, movie.title); return { movie, analysis: { ...analysis, source_errors: Object.keys(sourceErrors).length ? sourceErrors : null } }; }

async function startServer() {
  const app = express(); const server = createServer(app);
  app.get("/api/health", (_req, res) => res.json({ status: "ok", missing_api_keys: [!process.env.TMDB_API_KEY ? "TMDB_API_KEY" : null, !process.env.YOUTUBE_API_KEY ? "YOUTUBE_API_KEY" : null].filter(Boolean), ready: Boolean(process.env.TMDB_API_KEY && process.env.YOUTUBE_API_KEY) }));
  app.get("/api/search", async (req, res) => { try { const query = String(req.query.q || "").trim(); if (!query) return res.status(400).json({ error: "Query param 'q' is required" }); const data = await tmdb<any>("/search/movie", { query, page: Number(req.query.page || 1) }); res.json({ query, page: data.page, total_results: data.total_results, total_pages: data.total_pages, results: (data.results || []).map(simplifyMovie) }); } catch (error) { res.status(502).json({ error: safeMessage(error) }); } });
  for (const [route, tmdbPath] of [["popular", "/movie/popular"], ["now-playing", "/movie/now_playing"], ["upcoming", "/movie/upcoming"], ["top-rated", "/movie/top_rated"]] as const) app.get(`/api/movies/${route}`, async (req, res) => { try { res.json(simplifyList(await tmdb<any>(tmdbPath, { page: Number(req.query.page || 1) }))); } catch (error) { res.status(502).json({ error: safeMessage(error) }); } });
  app.get("/api/movies/:id/full", async (req, res) => { try { res.json(await fullMovie(req.params.id)); } catch (error) { res.status(502).json({ error: safeMessage(error) }); } });
  app.get("/api/movies/:id", async (req, res) => { try { res.json(await movieDetails(req.params.id)); } catch (error) { res.status(502).json({ error: safeMessage(error) }); } });
  app.get("/api/movies/:id/analysis", async (req, res) => { try { res.json((await fullMovie(req.params.id)).analysis); } catch (error) { res.status(502).json({ error: safeMessage(error) }); } });

  const staticPath = process.env.NODE_ENV === "production" ? path.resolve(__dirname, "public") : path.resolve(__dirname, "..", "dist", "public");
  app.use(express.static(staticPath));
  app.get("*", (_req, res) => res.sendFile(path.join(staticPath, "index.html")));
  const port = process.env.PORT || 3000; server.listen(port, () => console.log(`Server running on http://localhost:${port}/`));
}

startServer().catch(console.error);
