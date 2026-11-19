/**
 * Shared caching for the public street and message reads.
 *
 * Visitors all need the same list, and the page already treats five minutes
 * as fresh enough (see REFRESH_INTERVAL_MS in public/index.html). Vercel's
 * CDN keeps one copy for that long. Browsers are told to recheck every time,
 * so a tab's five-minute refresh hits the CDN instead of Airtable.
 *
 * Only a successful response is cacheable. A 500 is marked no-store so a
 * failed Airtable call cannot replace the last good list. stale-if-error
 * lets the CDN keep serving that list for up to an hour if a refresh fails.
 */

export const PUBLIC_DATA_CACHE_SECONDS = 5 * 60;
const STALE_WHILE_REVALIDATE_SECONDS = 60;
const STALE_IF_ERROR_SECONDS = 60 * 60;

const CDN_CACHE_CONTROL =
  `public, s-maxage=${PUBLIC_DATA_CACHE_SECONDS}, stale-while-revalidate=${STALE_WHILE_REVALIDATE_SECONDS}, stale-if-error=${STALE_IF_ERROR_SECONDS}`;

const flights = new Map();

export function setPublicReadCache(res) {
  // max-age=0 is for the browser. The CDN directives live on the CDN headers
  // so a browser recheck still shares the cached copy. no-store must never
  // appear on this response: Vercel will not cache it if it does.
  res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
  res.setHeader('CDN-Cache-Control', CDN_CACHE_CONTROL);
  res.setHeader('Vercel-CDN-Cache-Control', CDN_CACHE_CONTROL);
}

export function setUncached(res) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('CDN-Cache-Control', 'no-store');
  res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
}

/**
 * Collapse overlapping reads on one serverless instance into a single
 * Airtable walk. The CDN is what shares that result across visitors; this
 * only covers the burst that arrives before the CDN has stored it.
 * Nothing is kept after the request finishes, so a warm instance cannot
 * stretch the five-minute window by handing an old copy back to the CDN.
 */
export function singleFlight(key, fn) {
  const existing = flights.get(key);
  if (existing) return existing;

  const promise = Promise.resolve()
    .then(fn)
    .finally(() => {
      if (flights.get(key) === promise) flights.delete(key);
    });

  flights.set(key, promise);
  return promise;
}

export function resetSingleFlightForTests() {
  flights.clear();
}
