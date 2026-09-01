// Single accessor for the backend API URL, resolved at RUNTIME.
//  - client: window.__ENV__.API_URL (set by /__env.js before hydration)
//  - server: process.env.API_URL (runtime container env)
//  - fallback: the (possibly still-baked) NEXT_PUBLIC_API_URL, then localhost — so a
//    misconfigured deploy degrades to prior behaviour instead of hard-breaking.
declare global {
  interface Window {
    __ENV__?: { API_URL?: string };
  }
}

const FALLBACK_API_URL = 'http://localhost:3007/api/v1';

export function getApiUrl(): string {
  if (typeof window !== 'undefined' && window.__ENV__?.API_URL) {
    return window.__ENV__.API_URL;
  }
  return process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || FALLBACK_API_URL;
}
