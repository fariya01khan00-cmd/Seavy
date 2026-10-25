const rawEnvApiUrl =
  typeof import.meta.env?.VITE_API_URL === 'string'
    ? import.meta.env.VITE_API_URL.trim()
    : '';

export const API_URL = (rawEnvApiUrl || 'http://localhost:5000').replace(/\/+$/, '');

function extractNormalizedPath(pathOrUrl) {
  if (typeof pathOrUrl !== 'string' || !pathOrUrl.trim()) {
    return '/';
  }
  const trimmed = pathOrUrl.trim();
  if (trimmed.startsWith(API_URL) && API_URL.length > 0) {
    const rest = trimmed.slice(API_URL.length);
    return rest.startsWith('/') ? rest : `/${rest}`;
  }
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      return `${parsed.pathname}${parsed.search}`;
    } catch {
      return '/';
    }
  }
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

function isLocalhostTarget(urlStr) {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(urlStr);
}

/**
 * Builds the full endpoint URL from API_URL (`import.meta.env.VITE_API_URL || "http://localhost:5000"`).
 * When running inside a hosted HTTPS preview while API_URL points to localhost, resolves to same-origin `/api/...`.
 */
export function buildApiUrl(path) {
  const normalizedPath = extractNormalizedPath(path);
  const onHostedOrigin =
    typeof window !== 'undefined' &&
    window.location.hostname !== 'localhost' &&
    window.location.hostname !== '127.0.0.1';

  if (onHostedOrigin && isLocalhostTarget(API_URL)) {
    return normalizedPath;
  }
  return `${API_URL}${normalizedPath}`;
}

export const getApiEndpoint = buildApiUrl;

/**
 * Fetches against `${API_URL}/api/...` (configured via `import.meta.env.VITE_API_URL`)
 * with automatic fallback to same-origin `/api/...` when running integrated dev/preview servers.
 */
export async function apiFetch(pathOrUrl, options) {
  const normalizedPath = extractNormalizedPath(pathOrUrl);
  const targetUrl = buildApiUrl(normalizedPath);

  if (targetUrl !== normalizedPath) {
    try {
      return await fetch(targetUrl, options);
    } catch {
      return fetch(normalizedPath, options);
    }
  }

  return fetch(normalizedPath, options);
}
