const STORAGE_KEY = 'apiUrl';

export const DEFAULT_API_URL = 'https://patel-autoprint.onrender.com';

export function getApiUrl() {
  return localStorage.getItem(STORAGE_KEY) || DEFAULT_API_URL;
}

export function setApiUrl(url) {
  const trimmed = (url || '').trim().replace(/\/+$/, '');
  if (trimmed) {
    localStorage.setItem(STORAGE_KEY, trimmed);
  }
}
