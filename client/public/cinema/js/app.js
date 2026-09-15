/* ============================================================
   Vibecheck Cinema — app logic
   Talks to the Flask backend via API (js/api.js). Watchlist and
   watch history are kept in localStorage on the client.
   ============================================================ */

const WATCHLIST_KEY = 'vibecheck_watchlist';
const HISTORY_KEY = 'vibecheck_history';

/* ---------------- small helpers ---------------- */
function el(tag, cls, html) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
}
function yearOf(dateStr) { return dateStr ? dateStr.slice(0, 4) : '—'; }
function ratingClass(v) {
  if (v == null) return '';
  if (v >= 7) return 'rating-hi';
  if (v >= 5) return 'rating-md';
  return 'rating-lo';
}
function timeAgo(ts) {
  if (!ts) return '—';
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hr ago`;
  return `${Math.floor(s / 86400)} day${Math.floor(s / 86400) === 1 ? '' : 's'} ago`;
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function showToast(title, body, icon = 'check_circle') {
  const region = document.getElementById('toastRegion');
  if (!region) return;
  const toast = el('div', 'toast');
  toast.innerHTML = `<span class="material-symbols-outlined text-cyber-cyan text-[19px]">${icon}</span><div><strong>${escapeHtml(title)}</strong><span>${escapeHtml(body)}</span></div>`;
  region.appendChild(toast);
  window.setTimeout(() => {
    toast.classList.add('toast-out');
    window.setTimeout(() => toast.remove(), 220);
  }, 3200);
}
function updateDashboardStats() {
  const saved = getWatchlist().length;
  const analyzed = getHistory().length;
  const savedEl = document.getElementById('dashboardWatchlistStat');
  const analyzedEl = document.getElementById('dashboardHistoryStat');
  if (savedEl) savedEl.textContent = saved;
  if (analyzedEl) analyzedEl.textContent = analyzed;
  const count = document.getElementById('watchlistViewCount');
  if (count) count.textContent = `${saved} saved`;
}

/* ---------------- watchlist (localStorage) ---------------- */
function getWatchlist() {
  try { return JSON.parse(localStorage.getItem(WATCHLIST_KEY)) || []; }
  catch (_) { return []; }
}
function isSaved(id) { return getWatchlist().some(m => m.id === id); }
function toggleWatchlist(movie) {
  const list = getWatchlist();
  const idx = list.findIndex(m => m.id === movie.id);
  if (idx >= 0) list.splice(idx, 1);
  else list.unshift({ id: movie.id, title: movie.title, poster_url: movie.poster_url, vote_average: movie.vote_average, release_date: movie.release_date });
  localStorage.setItem(WATCHLIST_KEY, JSON.stringify(list));
  const saved = idx < 0;

  updateWatchlistBadge();
  updateDashboardStats();
  renderDashboardWatchlist();

  if (document.getElementById('view-watchlist')?.classList.contains('active')) loadWatchlist();
  if (document.getElementById('view-settings')?.classList.contains('active')) renderSavedPreview();

  // Synchronize all heart buttons on page matching this movie id
  document.querySelectorAll(`.movie-card[data-id="${movie.id}"] .heart-btn`).forEach(btn => {
    btn.classList.toggle('saved', saved);
    btn.innerHTML = `<span class="material-symbols-outlined text-[16px]" style="font-variation-settings:'FILL' ${saved ? 1 : 0};">favorite</span>`;
  });

  return saved;
}

function updateWatchlistBadge() {
  const n = getWatchlist().length;
  const badge = document.getElementById('watchlistBadge');
  if (badge) {
    badge.textContent = n;
    badge.classList.toggle('hidden', n === 0);
  }
  const mobileBadge = document.getElementById('mobileWatchlistBadge');
  if (mobileBadge) {
    mobileBadge.textContent = n;
    mobileBadge.classList.toggle('hidden', n === 0);
  }
  const dashBadge = document.getElementById('dashboardWatchlistCountBadge');
  if (dashBadge) {
    dashBadge.textContent = `${n} saved`;
  }
}

function clearWatchlist() {
  if (!getWatchlist().length) return;
  if (!window.confirm('Clear all titles from your watchlist?')) return;
  localStorage.removeItem(WATCHLIST_KEY);
  updateWatchlistBadge();
  updateDashboardStats();
  renderDashboardWatchlist();
  if (document.getElementById('view-watchlist')?.classList.contains('active')) loadWatchlist();
  if (document.getElementById('view-settings')?.classList.contains('active')) renderSavedPreview();
  document.querySelectorAll('.heart-btn').forEach(btn => {
    btn.classList.remove('saved');
    btn.innerHTML = `<span class="material-symbols-outlined text-[16px]" style="font-variation-settings:'FILL' 0;">favorite</span>`;
  });
  showToast('Watchlist cleared', 'All titles have been removed from your watchlist.', 'delete_sweep');
}

function renderDashboardWatchlist() {
  const grid = document.getElementById('dashboardWatchlistGrid');
  const clearBtn = document.getElementById('dashboardClearWatchlistBtn');
  if (!grid) return;
  const list = getWatchlist();
  if (clearBtn) clearBtn.classList.toggle('hidden', list.length === 0);

  if (!list.length) {
    grid.innerHTML = `
      <div class="col-span-full text-center py-12 px-4 rounded-xl border border-dashed border-white/10 bg-surface-container-lowest/40 neon-glow-hover transition-all">
        <span class="material-symbols-outlined text-[44px] text-secondary/60 mb-2" style="font-variation-settings:'FILL' 0;">bookmark_border</span>
        <h4 class="font-headline-md text-on-surface text-[17px] mb-1 font-semibold">Your Watchlist is Empty</h4>
        <p class="font-body-md text-[13px] text-on-surface-variant max-w-md mx-auto leading-relaxed">
          Save movies you want to check out! Tap the heart icon (<span class="text-secondary">❤</span>) on any movie above to add it to your personal watchlist here.
        </p>
      </div>
    `;
    return;
  }
  renderGrid(grid, list);
}

/* ---------------- watch history (localStorage) ---------------- */
function getHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; }
  catch (_) { return []; }
}
function recordHistory(movie, positivePct) {
  const list = getHistory().filter(m => m.id !== movie.id);
  list.unshift({
    id: movie.id, title: movie.title, poster_url: movie.poster_url,
    genres: movie.genres || [], viewed_at: Date.now(),
    positive_pct: positivePct != null ? positivePct : null,
  });
  localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, 25)));
}
function clearHistory() {
  if (!getHistory().length) { showToast('Nothing to clear', 'Your watch history is already empty.', 'info'); return; }
  if (!window.confirm('Clear your local watch history?')) return;
  localStorage.removeItem(HISTORY_KEY);
  updateDashboardStats();
  showToast('History cleared', 'Your local watch history has been removed.', 'delete_sweep');
  loadSettings();
}

/* ---------------- movie card ---------------- */
function movieCard(movie) {
  const card = el('div', 'movie-card group');
  card.dataset.id = movie.id;

  const wrap = el('div', 'poster-wrap');
  if (movie.poster_url) {
    wrap.innerHTML = `<img src="${movie.poster_url}" alt="${escapeHtml(movie.title)} poster" loading="lazy"/>`;
  } else {
    wrap.innerHTML = `<div class="w-full h-full flex items-center justify-center text-outline-variant"><span class="material-symbols-outlined text-[48px]">movie</span></div>`;
  }
  if (movie.vote_average != null) {
    wrap.appendChild(el('div', `rating-badge ${ratingClass(movie.vote_average)}`, `★ ${movie.vote_average.toFixed(1)}`));
  }
  const heart = el('button', `heart-btn ${isSaved(movie.id) ? 'saved' : ''}`, `<span class="material-symbols-outlined text-[16px]" style="font-variation-settings:'FILL' ${isSaved(movie.id) ? 1 : 0};">favorite</span>`);
  heart.addEventListener('click', (e) => {
    e.stopPropagation();
    const saved = toggleWatchlist(movie);
    heart.classList.toggle('saved', saved);
    heart.innerHTML = `<span class="material-symbols-outlined text-[16px]" style="font-variation-settings:'FILL' ${saved ? 1 : 0};">favorite</span>`;
    if (document.getElementById('view-watchlist').classList.contains('active')) loadWatchlist();
    if (document.getElementById('view-settings').classList.contains('active')) renderSavedPreview();
    showToast(saved ? 'Added to watchlist' : 'Removed from watchlist', movie.title, saved ? 'bookmark_added' : 'bookmark_remove');
  });
  wrap.appendChild(heart);
  card.appendChild(wrap);
  card.appendChild(el('div', 'mt-2 font-body-md text-[14px] font-semibold text-on-surface truncate', escapeHtml(movie.title)));
  card.appendChild(el('div', 'font-label-xs text-label-xs text-on-surface-variant', yearOf(movie.release_date)));
  card.addEventListener('click', () => openDetail(movie.id));
  return card;
}

function skeletonGrid(container, n = 10) {
  container.innerHTML = '';
  for (let i = 0; i < n; i++) {
    const c = el('div', 'movie-card');
    c.appendChild(el('div', 'skeleton rounded-lg', ''));
    c.querySelector('.skeleton').style.aspectRatio = '2/3';
    container.appendChild(c);
  }
}
function skeletonRail(container, n = 8) {
  container.innerHTML = '';
  for (let i = 0; i < n; i++) {
    const c = el('div', 'skeleton rounded-lg shrink-0');
    c.style.width = '150px'; c.style.aspectRatio = '2/3';
    container.appendChild(c);
  }
}
function renderGrid(container, movies) {
  container.innerHTML = '';
  if (!movies || movies.length === 0) {
    container.appendChild(emptyState('No titles here yet', 'Try a different search, filter, or come back after saving titles.'));
    return;
  }
  movies.forEach(m => container.appendChild(movieCard(m)));
}
function renderRail(container, movies) {
  container.innerHTML = '';
  (movies || []).forEach(m => {
    const card = movieCard(m);
    card.classList.add('shrink-0');
    card.style.width = '150px';
    container.appendChild(card);
  });
}
function emptyState(title, body) {
  const wrap = el('div', 'col-span-full text-center py-16 text-on-surface-variant');
  wrap.appendChild(el('h4', 'font-headline-md text-on-surface mb-2', title));
  wrap.appendChild(el('p', 'font-body-md text-[14px]', body));
  return wrap;
}
function errorBlock(container, err, retry) {
  container.innerHTML = '';
  const isNetwork = err && err.isNetwork;
  const wrap = el('div', 'col-span-full text-center py-16 glass-panel rounded-xl');
  wrap.appendChild(el('h4', 'font-headline-md text-on-surface mb-2', isNetwork ? "Can't reach the API" : 'Something went wrong'));
  wrap.appendChild(el('p', 'font-body-md text-[14px] text-on-surface-variant max-w-md mx-auto', isNetwork
    ? `No response from ${API.getBase()}. Start the backend with "python app.py" in movie_sentiment_backend, then retry.`
    : (err && err.message) || 'Unknown error.'));
  const btn = el('button', 'mt-4 px-4 py-2 border border-white/20 rounded-lg hover:bg-white/5 transition-colors font-label-sm text-label-sm', 'Retry');
  btn.addEventListener('click', retry);
  wrap.appendChild(btn);
  container.appendChild(wrap);
}

/* ---------------- navigation ---------------- */
function setActiveView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === `view-${name}`));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === name));
  document.getElementById('mobileNav').classList.add('hidden');
  window.scrollTo({ top: 0, behavior: 'auto' });
  if (name === 'dashboard' && !dashboardLoaded) loadDashboard();
  if (name === 'trending' && !trendingLoaded) loadTrending();
  if (name === 'watchlist') loadWatchlist();
  if (name === 'settings') loadSettings();
}
document.querySelectorAll('.nav-item[data-view]').forEach(btn => {
  btn.addEventListener('click', () => setActiveView(btn.dataset.view));
});
document.querySelectorAll('[data-view-link]').forEach(elm => {
  elm.addEventListener('click', () => setActiveView(elm.dataset.viewLink));
});
document.getElementById('mobileMenuBtn').addEventListener('click', () => document.getElementById('mobileNav').classList.remove('hidden'));
document.getElementById('mobileNavClose').addEventListener('click', () => document.getElementById('mobileNav').classList.add('hidden'));
document.getElementById('dashboardClearWatchlistBtn')?.addEventListener('click', clearWatchlist);

/* ---------------- dashboard ---------------- */
let dashboardLoaded = false;
async function loadDashboard() {
  dashboardLoaded = true;
  const popularEl = document.getElementById('popularRail');
  const topRatedEl = document.getElementById('topRatedRail');
  const nowPlayingEl = document.getElementById('nowPlayingGrid');
  skeletonRail(popularEl); skeletonRail(topRatedEl); skeletonGrid(nowPlayingEl);
  renderDashboardWatchlist();

  try {
    const [popular, topRated, nowPlaying] = await Promise.all([API.popular(), API.topRated(), API.nowPlaying()]);
    renderRail(popularEl, popular.results);
    renderRail(topRatedEl, topRated.results);
    renderGrid(nowPlayingEl, nowPlaying.results);
  } catch (err) {
    errorBlock(nowPlayingEl, err, () => { dashboardLoaded = false; loadDashboard(); });
    popularEl.innerHTML = ''; topRatedEl.innerHTML = '';
  }
}

/* ---------------- trending ---------------- */
let trendingLoaded = false;
let trendingSource = 'popular';
async function loadTrending() {
  trendingLoaded = true;
  await refreshTrending();
}
document.querySelectorAll('#trendingTabs .chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('#trendingTabs .chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    trendingSource = chip.dataset.source;
    refreshTrending();
  });
});
async function refreshTrending() {
  const list = document.getElementById('trendingList');
  list.innerHTML = '';
  for (let i = 0; i < 8; i++) list.appendChild(el('div', 'skeleton h-20 rounded-lg', ''));

  const call = trendingSource === 'now-playing' ? API.nowPlaying : trendingSource === 'upcoming' ? API.upcoming : API.popular;
  try {
    const res = await call();
    list.innerHTML = '';
    if (!res.results || !res.results.length) { list.appendChild(emptyState('Nothing here yet', 'Try another tab.')); return; }
    res.results.slice(0, 15).forEach((m, i) => list.appendChild(trendingRow(m, i + 1)));
  } catch (err) {
    errorBlock(list, err, refreshTrending);
  }
}
function trendingRow(movie, rank) {
  const row = el('div', 'glass-panel rounded-xl p-3 flex items-center gap-4 neon-glow-hover transition-all cursor-pointer');
  row.appendChild(el('div', 'font-display-lg text-[28px] text-outline-variant w-12 text-center shrink-0', `${rank}`));
  const poster = el('div', 'w-12 h-16 rounded overflow-hidden shrink-0 bg-surface-container');
  if (movie.poster_url) poster.innerHTML = `<img src="${movie.poster_url}" class="w-full h-full object-cover" loading="lazy"/>`;
  row.appendChild(poster);
  const info = el('div', 'flex-1 min-w-0');
  info.appendChild(el('div', 'font-body-md text-[15px] font-semibold text-on-surface truncate', escapeHtml(movie.title)));
  info.appendChild(el('div', 'font-label-xs text-label-xs text-on-surface-variant', yearOf(movie.release_date)));
  row.appendChild(info);
  if (movie.vote_average != null) {
    row.appendChild(el('div', `font-label-sm text-label-sm shrink-0 ${ratingClass(movie.vote_average).replace('rating-hi','text-neon-emerald').replace('rating-md','text-[#f2c94c]').replace('rating-lo','text-error')}`, `★ ${movie.vote_average.toFixed(1)}`));
  }
  const heart = el('button', `heart-btn !static !opacity-100 ${isSaved(movie.id) ? 'saved' : ''}`, `<span class="material-symbols-outlined text-[18px]" style="font-variation-settings:'FILL' ${isSaved(movie.id) ? 1 : 0};">favorite</span>`);
  heart.addEventListener('click', (e) => { e.stopPropagation(); const saved = toggleWatchlist(movie); heart.classList.toggle('saved', saved); heart.innerHTML = `<span class="material-symbols-outlined text-[18px]" style="font-variation-settings:'FILL' ${saved?1:0};">favorite</span>`; });
  row.appendChild(heart);
  row.addEventListener('click', () => openDetail(movie.id));
  return row;
}

/* ---------------- search (desktop + mobile) ---------------- */
async function loadSearchResults(query) {
  const panel = document.getElementById('searchResultsPanel');
  const grid = document.getElementById('searchResultsGrid');
  const title = document.getElementById('searchResultsTitle');
  if (!panel || !grid || !title) return;
  panel.classList.remove('hidden');
  title.textContent = `Search results for "${query}"`;
  skeletonGrid(grid, 5);
  try {
    const result = await API.search(query);
    renderGrid(grid, result.results);
  } catch (err) {
    errorBlock(grid, err, () => loadSearchResults(query));
  }
}
function clearSearchResults() {
  const panel = document.getElementById('searchResultsPanel');
  const grid = document.getElementById('searchResultsGrid');
  if (panel) panel.classList.add('hidden');
  if (grid) grid.innerHTML = '';
}
function wireSearch(formId, inputId) {
  const form = document.getElementById(formId);
  const input = document.getElementById(inputId);
  if (!form || !input) return;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (!q) return;
    setActiveView('dashboard');
    loadSearchResults(q);
  });
}
wireSearch('searchForm', 'searchInput');
wireSearch('searchFormMobile', 'searchInputMobile');
document.getElementById('clearSearchResultsBtn')?.addEventListener('click', clearSearchResults);

/* ---------------- watchlist view ---------------- */
function loadWatchlist() {
  renderGrid(document.getElementById('watchlistGrid'), getWatchlist());
  updateDashboardStats();
}
function renderSavedPreview() {
  const grid = document.getElementById('savedPreviewGrid');
  if (!grid) return;
  const list = getWatchlist().slice(0, 4);
  grid.innerHTML = '';
  if (!list.length) { grid.appendChild(emptyState('Nothing saved yet', 'Save a title from any view to see it here.')); return; }
  list.forEach(m => grid.appendChild(movieCard(m)));
}

/* ---------------- settings view ---------------- */
async function loadSettings() {
  renderWatchHistory();
  renderSavedPreview();
  updateAnalyzedStat();

  const connList = document.getElementById('connList');
  connList.innerHTML = '<div class="skeleton rounded-lg" style="height:120px;"></div>';
  try {
    const health = await API.health();
    const missing = new Set(health.missing_api_keys || []);
    connList.innerHTML = '';
    connList.appendChild(connRow('TMDB', 'The Movie Database', !missing.has('TMDB_API_KEY')));
    connList.appendChild(connRow('YouTube', 'YouTube Data v3', !missing.has('YOUTUBE_API_KEY')));
    setApiStatusPill(true);
    setLastSync(Date.now());
  } catch (err) {
    connList.innerHTML = '';
    errorBlock(connList, err, loadSettings);
    setApiStatusPill(false);
  }
}
function connRow(name, desc, ok) {
  const row = el('div', 'flex items-center justify-between p-3 rounded-lg bg-surface-container border border-white/5');
  const left = el('div', 'flex items-center gap-3');
  left.innerHTML = `
    <div class="w-8 h-8 rounded flex items-center justify-center border ${ok ? 'border-neon-emerald/30 bg-surface-container-high' : 'border-error/30 bg-surface-container-high'}">
      <span class="font-label-xs text-[10px] font-bold ${ok ? 'text-neon-emerald' : 'text-error'}">${name.slice(0,2).toUpperCase()}</span>
    </div>
    <div>
      <p class="font-label-sm text-label-sm text-on-surface">${name}</p>
      <p class="font-label-xs text-label-xs ${ok ? 'text-neon-emerald' : 'text-error'} flex items-center gap-1 mt-0.5">
        <span class="w-1.5 h-1.5 rounded-full ${ok ? 'bg-neon-emerald animate-pulse' : 'bg-error'}"></span> ${ok ? 'Connected' : 'Auth Expired'}
      </p>
    </div>`;
  row.appendChild(left);
  const right = el('div', 'font-label-xs text-label-xs text-on-surface-variant text-right max-w-[110px]', desc);
  if (!ok) { right.className = 'text-cyber-cyan font-label-xs text-label-xs cursor-pointer hover:underline'; right.textContent = 'Reconnect'; }
  row.appendChild(right);
  return row;
}
function setApiStatusPill(ok) {
  const dot = document.getElementById('apiStatusDot');
  const label = document.getElementById('apiStatusLabel');
  dot.style.background = ok ? '#00ff9f' : '#ffb4ab';
  label.textContent = ok ? 'API online' : 'API unreachable';
  const stat = document.getElementById('dashboardApiStat');
  if (stat) { stat.textContent = ok ? 'Online' : 'Offline'; stat.style.color = ok ? '#00ff9f' : '#ffb4ab'; }
}
let lastSyncTs = null;
function setLastSync(ts) {
  lastSyncTs = ts;
  document.getElementById('lastSyncLabel').textContent = timeAgo(ts);
}
document.getElementById('forceSyncBtn').addEventListener('click', async () => {
  const btn = document.getElementById('forceSyncBtn');
  btn.disabled = true;
  btn.classList.add('animate-pulse');
  try { await API.health(); setLastSync(Date.now()); setApiStatusPill(true); showToast('Sync complete', 'All configured data connections are responding.', 'sync'); }
  catch (_) { setApiStatusPill(false); showToast('Sync unavailable', 'The API did not respond. Check the backend and retry.', 'cloud_off'); }
  btn.classList.remove('animate-pulse');
  btn.disabled = false;
});
setInterval(() => { if (lastSyncTs) document.getElementById('lastSyncLabel').textContent = timeAgo(lastSyncTs); }, 30000);

function renderWatchHistory() {
  const list = document.getElementById('watchHistoryList');
  const hist = getHistory();
  document.getElementById('historyCount').textContent = `${hist.length} title${hist.length === 1 ? '' : 's'}`;
  list.innerHTML = '';
  if (!hist.length) {
    list.appendChild(emptyState('No history yet', 'Open a title from any view to run its sentiment analysis — it will show up here.'));
    return;
  }
  hist.forEach(item => {
    const row = el('div', 'flex gap-4 p-3 rounded-lg hover:bg-white/5 transition-colors border border-transparent hover:border-white/10 group cursor-pointer');
    const poster = el('div', 'w-16 h-24 rounded bg-surface-container overflow-hidden shrink-0');
    if (item.poster_url) poster.innerHTML = `<img class="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-300" src="${item.poster_url}" loading="lazy"/>`;
    row.appendChild(poster);
    const info = el('div', 'flex-1 flex flex-col justify-center min-w-0');
    const top = el('div', 'flex justify-between items-start mb-1 gap-2');
    top.appendChild(el('h5', 'font-body-md text-body-md font-semibold text-on-surface truncate', escapeHtml(item.title)));
    top.appendChild(el('span', 'font-label-xs text-label-xs text-on-surface-variant shrink-0', timeAgo(item.viewed_at)));
    info.appendChild(top);
    info.appendChild(el('p', 'font-label-sm text-label-sm text-on-surface-variant mb-2 truncate', (item.genres || []).join(' • ') || '—'));
    const pct = item.positive_pct;
    const barColor = pct == null ? 'bg-outline-variant' : pct >= 65 ? 'bg-neon-emerald' : pct <= 35 ? 'bg-error' : 'bg-electric-violet';
    const barWrap = el('div', 'flex items-center gap-2');
    barWrap.innerHTML = `
      <div class="w-full h-1 bg-surface-container rounded-full overflow-hidden"><div class="h-full ${barColor}" style="width:${pct != null ? pct : 0}%"></div></div>
      <span class="font-label-xs text-label-xs shrink-0">${pct != null ? pct + '%' : 'n/a'}</span>`;
    info.appendChild(barWrap);
    row.appendChild(info);
    row.addEventListener('click', () => openDetail(item.id));
    list.appendChild(row);
  });
}
function updateAnalyzedStat() {
  document.getElementById('analyzedStat').innerHTML = `<span class="material-symbols-outlined text-[14px]">database</span> ${getHistory().length} titles analyzed`;
}
document.getElementById('clearHistoryBtn').addEventListener('click', clearHistory);

/* ---------------- pipeline progress (drives the Settings pipeline widget) ---------------- */
let pipelineTimer = null;
function pipelineStart(title) {
  document.getElementById('pipelineStatus').textContent = 'Processing';
  document.getElementById('pipelineStatus').classList.add('animate-pulse');
  document.getElementById('pipelineDetail').textContent = `Analyzing “${title}”…`;
  let pct = 8;
  document.getElementById('pipelineBar').style.width = pct + '%';
  document.getElementById('pipelinePct').textContent = pct + '%';
  clearInterval(pipelineTimer);
  pipelineTimer = setInterval(() => {
    pct = Math.min(pct + Math.random() * 12, 92);
    document.getElementById('pipelineBar').style.width = pct + '%';
    document.getElementById('pipelinePct').textContent = Math.round(pct) + '%';
  }, 350);
}
function pipelineFinish(ok, reviewCount) {
  clearInterval(pipelineTimer);
  document.getElementById('pipelineStatus').classList.remove('animate-pulse');
  document.getElementById('pipelineBar').style.width = '100%';
  document.getElementById('pipelinePct').textContent = '100%';
  document.getElementById('pipelineStatus').textContent = ok ? 'Complete' : 'Failed';
  document.getElementById('pipelineDetail').textContent = ok ? `${reviewCount || 0} reviews scored` : 'Could not complete analysis';
  setTimeout(() => {
    document.getElementById('pipelineStatus').textContent = 'Idle';
    document.getElementById('pipelineBar').style.width = '0%';
    document.getElementById('pipelinePct').textContent = '0%';
    document.getElementById('pipelineDetail').textContent = 'No title analyzing';
  }, 4000);
}

/* ---------------- detail drawer ---------------- */
const overlay = document.getElementById('drawerOverlay');
const drawer = document.getElementById('drawer');
const drawerBody = document.getElementById('drawerBody');
let detailRequestToken = 0;
function stopDrawerMedia() {
  drawerBody.querySelectorAll('iframe, video, audio').forEach((media) => {
    if (media.tagName === 'IFRAME') media.src = 'about:blank';
    media.remove();
  });
}
function closeDrawer() {
  detailRequestToken += 1;
  stopDrawerMedia();
  drawerBody.innerHTML = '';
  overlay.classList.remove('open');
  drawer.classList.remove('open');
}
overlay.addEventListener('click', closeDrawer);
document.getElementById('drawerCloseBtn').addEventListener('click', closeDrawer);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });

async function openDetail(id) {
  const requestToken = ++detailRequestToken;
  stopDrawerMedia();
  overlay.classList.add('open');
  drawer.classList.add('open');
  drawerBody.innerHTML = `<div class="text-center py-16"><p class="font-headline-md text-on-surface mb-2">Loading title…</p><p class="font-body-md text-[14px] text-on-surface-variant">Fetching metadata and running sentiment analysis on live reviews.</p></div>`;
  document.getElementById('drawerBackdrop').style.backgroundImage = 'none';
  pipelineStart('title');

  try {
    const full = await API.movieFull(id);
    if (requestToken !== detailRequestToken || !drawer.classList.contains('open')) return;
    document.getElementById('pipelineDetail').textContent = `Analyzing "${full.movie.title}"…`;
    renderDrawer(full.movie, full.analysis);
    recordHistory(full.movie, full.analysis ? full.analysis.overall_positive_pct : null);
    if (document.getElementById('view-settings').classList.contains('active')) { renderWatchHistory(); updateAnalyzedStat(); }
    updateDashboardStats();
    showToast('Analysis complete', `${full.movie.title} is ready to explore.`, 'psychology');
    pipelineFinish(true, full.analysis ? full.analysis.reviews_analyzed : 0);
  } catch (err) {
    drawerBody.innerHTML = '';
    errorBlock(drawerBody, err, () => openDetail(id));
    pipelineFinish(false);
  }
}

function renderDrawer(movie, analysis) {
  document.getElementById('drawerBackdrop').style.backgroundImage = movie.backdrop_url ? `url(${movie.backdrop_url})` : 'none';
  const saved = isSaved(movie.id);
  const genreTags = (movie.genres || []).map(g => `<span class="px-2 py-0.5 rounded-full bg-white/5 border border-white/10 font-label-xs text-label-xs">${escapeHtml(g)}</span>`).join('');

  drawerBody.innerHTML = `
    <div class="flex gap-4 -mt-16 mb-4">
      <div class="w-28 h-40 rounded-lg overflow-hidden border-2 border-cyber-cyan shrink-0 shadow-[0_0_15px_rgba(0,240,255,0.3)] bg-surface-container">
        ${movie.poster_url ? `<img src="${movie.poster_url}" class="w-full h-full object-cover" alt="${escapeHtml(movie.title)} poster"/>` : ''}
      </div>
      <div class="flex-1 pt-16 min-w-0">
        <h1 class="font-headline-md text-headline-md text-on-surface font-bold truncate">${escapeHtml(movie.title)}</h1>
        ${movie.tagline ? `<div class="font-label-sm text-label-sm text-on-surface-variant italic mt-1">"${escapeHtml(movie.tagline)}"</div>` : ''}
      </div>
    </div>
    <div class="flex flex-wrap gap-2 mb-4">
      <span class="px-2 py-0.5 rounded-full bg-white/5 border border-white/10 font-label-xs text-label-xs">${yearOf(movie.release_date)}</span>
      ${movie.runtime ? `<span class="px-2 py-0.5 rounded-full bg-white/5 border border-white/10 font-label-xs text-label-xs">${movie.runtime} min</span>` : ''}
      ${movie.vote_average != null ? `<span class="px-2 py-0.5 rounded-full bg-white/5 border border-white/10 font-label-xs text-label-xs">★ ${movie.vote_average.toFixed(1)} (${movie.vote_count || 0})</span>` : ''}
      ${genreTags}
    </div>
    <div class="flex items-center gap-3 mb-4">
      <button class="px-4 py-2 bg-gradient-to-r from-cyber-cyan to-electric-violet text-surface-charcoal font-label-sm text-label-sm rounded-lg font-bold" id="drawerSaveBtn">${saved ? 'Saved to watchlist' : 'Add to watchlist'}</button>
      ${movie.director ? `<span class="font-label-xs text-label-xs text-on-surface-variant">Dir. ${escapeHtml(movie.director)}</span>` : ''}
    </div>
    ${movie.overview ? `<p class="font-body-md text-[14px] text-on-surface-variant leading-relaxed mb-4">${escapeHtml(movie.overview)}</p>` : ''}
    ${movie.trailer ? `<div class="trailer-frame mb-6"><iframe class="trailer-frame__player" src="${movie.trailer.youtube_embed_url}?playsinline=1&rel=0&modestbranding=1" title="${escapeHtml(movie.trailer.name)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen loading="eager"></iframe></div>` : ''}
    ${(movie.cast && movie.cast.length) ? `<div class="flex flex-wrap gap-2 mb-6">${movie.cast.map(c => `<span class="px-2 py-1 rounded-lg bg-surface-container border border-white/5 font-label-xs text-label-xs">${escapeHtml(c.name)}${c.character ? ` <span class="text-on-surface-variant">as ${escapeHtml(c.character)}</span>` : ''}</span>`).join('')}</div>` : ''}
    <div id="analysisBlock"></div>
  `;

  document.getElementById('drawerSaveBtn').addEventListener('click', (e) => {
    const nowSaved = toggleWatchlist(movie);
    e.target.textContent = nowSaved ? 'Saved to watchlist' : 'Add to watchlist';
    showToast(nowSaved ? 'Added to watchlist' : 'Removed from watchlist', movie.title, nowSaved ? 'bookmark_added' : 'bookmark_remove');
    if (document.getElementById('view-watchlist').classList.contains('active')) loadWatchlist();
    if (document.getElementById('view-settings').classList.contains('active')) renderSavedPreview();
  });

  renderAnalysis(document.getElementById('analysisBlock'), analysis, movie.title);
}

function renderAnalysis(container, analysis, title) {
  container.innerHTML = '';
  const positiveReviews = analysis && Array.isArray(analysis.positive_reviews) ? analysis.positive_reviews : [];
  const negativeReviews = analysis && Array.isArray(analysis.negative_reviews) ? analysis.negative_reviews : [];
  if (!analysis || !analysis.reviews_analyzed) {
    container.appendChild(el('h3', 'font-headline-md text-on-surface text-[18px] mb-3', 'Lexicon review analysis'));
    container.appendChild(emptyState('No classified review sentences found yet',
      analysis && analysis.source_errors
        ? Object.values(analysis.source_errors).join(' · ')
        : `No review comments were available for ${title} yet. Try again later.`));
    return;
  }

  const positive = analysis.positive || analysis.pros || [];
  const negative = analysis.negative || analysis.cons || [];
  const verdict = analysis.overall_verdict || 'Not enough data';
  const pct = analysis.overall_positive_pct == null ? '—' : `${analysis.overall_positive_pct}%`;
  container.appendChild(el('section', 'rounded-xl border border-white/10 bg-white/[0.025] p-4 mb-6', `
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div><p class="font-label-xs text-label-xs text-on-surface-variant uppercase tracking-widest">Lexicon sentiment</p><h3 class="font-headline-md text-on-surface text-[20px] mt-1">${escapeHtml(verdict)}</h3></div>
      <div class="text-right"><div class="font-headline-md text-cyber-cyan text-[24px]">${pct}</div><div class="font-label-xs text-label-xs text-on-surface-variant">positive sentences</div></div>
    </div>
    ${analysis.summary ? `<p class="font-body-md text-[13px] text-on-surface-variant leading-relaxed mt-3">${escapeHtml(analysis.summary)}</p>` : ''}
  `));

  const groups = el('div', 'grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6');
  const positiveColumn = aspectColumn('Positive', positive, 'pro');
  const negativeColumn = aspectColumn('Negative', negative, 'con');
  groups.appendChild(positiveColumn);
  groups.appendChild(negativeColumn);
  container.appendChild(groups);

  const sentimentSection = renderSentimentReviews(positiveReviews, negativeReviews);
  if (sentimentSection) container.appendChild(sentimentSection);
}

function renderSentimentReviews(positiveReviews, negativeReviews) {
  const positive = Array.isArray(positiveReviews) ? positiveReviews : [];
  const negative = Array.isArray(negativeReviews) ? negativeReviews : [];
  if (!positive.length && !negative.length) return null;

  const section = el('section', 'mt-8');
  section.appendChild(el('div', 'mb-3', `
    <h3 class="font-headline-md text-on-surface text-[18px]">Positive and negative review sentences</h3>
    <p class="font-body-md text-[13px] text-on-surface-variant mt-1">Each sentence below was scored with the editable words and negation rules in <code>lexicon.py</code>.</p>
  `));
  const grid = el('div', 'grid grid-cols-1 lg:grid-cols-2 gap-4');
  const columns = [
    ['Positive reviews', positive, 'positive'],
    ['Negative reviews', negative, 'negative'],
  ];
  columns.forEach(([label, items, kind]) => {
    const column = el('div', `sentiment-review-column ${kind}`);
    column.appendChild(el('div', 'flex items-center justify-between gap-3 mb-2', `
      <h4 class="font-label-sm text-label-sm font-bold text-on-surface">${label}</h4>
      <span class="font-label-xs text-label-xs text-on-surface-variant">${items.length} sentence${items.length === 1 ? '' : 's'}</span>
    `));
    if (!items.length) {
      column.appendChild(el('p', 'font-label-xs text-label-xs text-on-surface-variant border border-white/10 rounded-lg p-3', `No ${kind} sentences found yet.`));
    } else {
      items.slice(0, 12).forEach(item => column.appendChild(reviewSnippet(item)));
    }
    grid.appendChild(column);
  });
  section.appendChild(grid);
  return section;
}


function reviewSnippet(item) {
  const aspectMeta = Array.isArray(item.aspects) && item.aspects.length ? item.aspects.join(', ') : null;
  const meta = [item.source, item.author, aspectMeta].filter(Boolean).map(escapeHtml).join(' · ');
  const article = el('article', 'rounded-lg border border-white/10 bg-surface-container/50 p-3');
  article.innerHTML = `
    <div class="flex items-center justify-between gap-2 mb-1">
      <span class="font-label-xs text-label-xs text-on-surface-variant truncate">${meta || 'YouTube review'}</span>
    </div>
    <p class="font-body-md text-[13px] text-on-surface leading-relaxed whitespace-pre-line">“${escapeHtml(item.text || '')}”</p>
    ${item.sentiment ? `<span class="inline-block mt-2 font-label-xs text-label-xs ${item.sentiment === 'positive' ? 'text-[#00ff9f]' : item.sentiment === 'negative' ? 'text-[#ffb4ab]' : 'text-on-surface-variant'}">${escapeHtml(item.sentiment)}</span>` : ''}
  `;
  if (item.url && /^https?:\/\//i.test(item.url)) {
    const link = el('a', 'inline-block mt-2 font-label-xs text-label-xs text-cyber-cyan hover:underline', 'Open original');
    link.href = item.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    article.appendChild(link);
  }
  return article;
}

function aspectColumn(label, items, kind) {
  const col = el('div');
  const color = kind === 'pro' ? '#00ff9f' : '#ffb4ab';
  col.appendChild(el('div', 'flex items-center gap-2 font-label-sm text-label-sm font-bold mb-2', `<span class="w-2 h-2 rounded-full" style="background:${color}"></span>${label}`));
  if (!items || items.length === 0) {
    col.appendChild(el('p', 'font-label-xs text-label-xs text-on-surface-variant', `No standout ${label.toLowerCase()} yet.`));
    return col;
  }
  items.forEach(item => col.appendChild(aspectCard(item, kind, color)));
  return col;
}
function aspectCard(item, kind, color) {
  const card = el('div', 'aspect-card');
  const total = item.pro_mentions + item.con_mentions;
  const share = total ? Math.round(100 * (kind === 'pro' ? item.pro_mentions : item.con_mentions) / total) : 0;
  const head = el('button', 'w-full flex items-center justify-between p-3 text-left');
  head.innerHTML = `
    <div class="min-w-0">
      <div class="font-label-sm text-label-sm font-semibold text-on-surface">${escapeHtml(item.aspect)}</div>
      <div class="font-label-xs text-label-xs text-on-surface-variant mt-0.5">${item.pro_mentions} pro · ${item.con_mentions} con · ${share}% margin</div>
    </div>
    <span class="material-symbols-outlined text-on-surface-variant shrink-0 transition-transform aspect-chevron">expand_more</span>`;
  head.addEventListener('click', () => {
    card.classList.toggle('open');
    head.querySelector('.aspect-chevron').style.transform = card.classList.contains('open') ? 'rotate(180deg)' : 'rotate(0deg)';
  });
  const examples = el('div', 'aspect-examples');
  const inner = el('div', 'px-3 pb-3 space-y-2');
  if (item.examples && item.examples.length) {
    item.examples.forEach(ex => inner.appendChild(el('div', 'font-body-md text-[13px] italic p-2 rounded bg-white/5 border-l-2', `"${escapeHtml(ex)}"`)).style.setProperty('border-color', color));
  } else {
    inner.appendChild(el('div', 'font-label-xs text-label-xs text-on-surface-variant', 'No example sentence captured.'));
  }
  examples.appendChild(inner);
  card.appendChild(head);
  card.appendChild(examples);
  return card;
}

/* ---------------- boot ---------------- */
(async function boot() {
  updateWatchlistBadge();
  updateDashboardStats();
  renderDashboardWatchlist();
  setActiveView('dashboard');
  try { await API.health(); setApiStatusPill(true); setLastSync(Date.now()); }
  catch (_) { setApiStatusPill(false); }
})();


/* ---------------- interaction utilities ---------------- */
document.querySelectorAll('[data-scroll-target]').forEach(btn => {
  btn.addEventListener('click', () => {
    const target = document.getElementById(btn.dataset.scrollTarget);
    if (!target) return;
    target.scrollBy({ left: Number(btn.dataset.scrollDirection || 1) * 360, behavior: 'smooth' });
  });
});
const quickHintBtn = document.getElementById('quickHintBtn');
if (quickHintBtn) {
  quickHintBtn.addEventListener('click', () => {
    showToast('Quick tip', 'Open any title to see the review sentences behind its sentiment score.', 'lightbulb');
  });
}
document.addEventListener('keydown', (event) => {
  if (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
    event.preventDefault();
    const input = window.matchMedia('(min-width: 768px)').matches ? document.getElementById('searchInput') : document.getElementById('searchInputMobile');
    input?.focus();
  }
});
