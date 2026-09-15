/* ============================================================
   Vibecheck Cinema — API client
   Thin wrapper around the Flask backend endpoints in app.py.
   Base URL is stored in localStorage so it's editable from
   Settings without touching code (e.g. if you deploy the API
   somewhere other than localhost:5000).
   ============================================================ */

const API = (() => {
  // Empty string = same-origin relative requests. This is correct when
  // Flask is serving this frontend itself (the default deploy setup --
  // see the top-level README / Dockerfile), including in local dev via
  // `python app.py`. If you split the frontend onto a different host
  // (e.g. Netlify) from the API (e.g. Render), set DEFAULT_BASE to your
  // deployed API's URL, e.g. 'https://vibecheck-api.onrender.com'.
  const DEFAULT_BASE = '';
  const STORAGE_KEY = 'vibecheck_api_base';

  function getBase() {
    // The local app's Node server owns the direct TMDB/YouTube routes. Ignore
    // any base URL saved by older cache-service builds.
    localStorage.removeItem(STORAGE_KEY);
    return DEFAULT_BASE;
  }

  function setBase(url) {
    localStorage.setItem(STORAGE_KEY, url.replace(/\/$/, ''));
  }

  async function request(path) {
    const url = `${getBase()}${path}`;
    let res;
    try {
      res = await fetch(url);
    } catch (err) {
      const e = new Error('network');
      e.cause = err;
      e.isNetwork = true;
      throw e;
    }
    let body = null;
    try { body = await res.json(); } catch (_) { /* no body */ }
    if (!res.ok) {
      const e = new Error((body && body.error) || `HTTP ${res.status}`);
      e.status = res.status;
      e.body = body;
      throw e;
    }
    return body;
  }

  return {
    getBase,
    setBase,
    health: () => request('/api/health'),
    search: (q, page = 1) => request(`/api/search?q=${encodeURIComponent(q)}&page=${page}`),
    nowPlaying: (page = 1) => request(`/api/movies/now-playing?page=${page}`),
    upcoming: (page = 1) => request(`/api/movies/upcoming?page=${page}`),
    topRated: (page = 1) => request(`/api/movies/top-rated?page=${page}`),
    popular: (page = 1) => request(`/api/movies/popular?page=${page}`),
    movieDetails: (id) => request(`/api/movies/${id}`),
    movieAnalysis: (id) => request(`/api/movies/${id}/analysis`),
    movieFull: (id) => request(`/api/movies/${id}/full`),
  };
})();
