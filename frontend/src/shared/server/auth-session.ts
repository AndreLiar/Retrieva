import 'server-only';

import { cookies } from 'next/headers';
import { unstable_noStore as noStore } from 'next/cache';

import type { User } from '@/types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3007/api/v1';

function buildCookieHeader(store: Awaited<ReturnType<typeof cookies>>) {
  return store
    .getAll()
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join('; ');
}

async function fetchJson<T>(url: string, init: RequestInit = {}): Promise<T | null> {
  try {
    const response = await fetch(url, {
      ...init,
      cache: 'no-store',
    });

    if (!response.ok) {
      return null;
    }

    return response.json() as Promise<T>;
  } catch {
    return null;
  }
}

export async function getServerSessionUser(): Promise<User | null> {
  noStore();

  const cookieStore = await cookies();
  const cookieHeader = buildCookieHeader(cookieStore);

  if (!cookieHeader) {
    return null;
  }

  const meResponse = await fetchJson<{ data?: { user?: User } }>(`${API_BASE_URL}/auth/me`, {
    headers: {
      cookie: cookieHeader,
    },
  });

  if (meResponse?.data?.user) {
    return meResponse.data.user;
  }

  const refreshResponse = await fetchJson<{
    data?: { accessToken?: string };
  }>(`${API_BASE_URL}/auth/refresh`, {
    method: 'POST',
    headers: {
      cookie: cookieHeader,
      'Content-Type': 'application/json',
    },
  });

  const accessToken = refreshResponse?.data?.accessToken;
  if (!accessToken) {
    return null;
  }

  const refreshedMeResponse = await fetchJson<{ data?: { user?: User } }>(
    `${API_BASE_URL}/auth/me`,
    {
      headers: {
        cookie: cookieHeader,
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  return refreshedMeResponse?.data?.user ?? null;
}
