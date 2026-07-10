import { useCallback, useEffect, useState } from 'react';
import type { User } from '@tableverse/shared';
import { API_BASE_URL } from '../config.js';

const SESSION_TOKEN_STORAGE_KEY = 'tableverse:sessionToken';
export const SESSION_TOKEN_HEADER = 'x-session-token';

interface IdentityResponse {
  user: User;
  sessionToken: string;
}

async function callIdentityEndpoint(body: {
  sessionToken?: string;
  displayName?: string;
}): Promise<IdentityResponse> {
  const res = await fetch(`${API_BASE_URL}/api/identity`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const { error } = (await res.json()) as { error?: string };
    throw new Error(error ?? `Identity request failed (${res.status})`);
  }
  return res.json() as Promise<IdentityResponse>;
}

export interface SessionState {
  user: User | null;
  sessionToken: string | null;
  loading: boolean;
  error: string | null;
  /** Establishes a new session for a first-time visitor (no valid stored token yet). */
  identify: (displayName: string) => Promise<void>;
}

/**
 * Phase 1 identity per tech-stack.md: nickname + client-side session, no
 * OAuth. On mount, tries to resolve a previously stored session token
 * against the server; if none is stored or it's no longer valid, `user`
 * stays null until the caller invokes `identify(displayName)`.
 */
export function useSession(): SessionState {
  const [user, setUser] = useState<User | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(SESSION_TOKEN_STORAGE_KEY);
    if (!stored) {
      setLoading(false);
      return;
    }
    callIdentityEndpoint({ sessionToken: stored })
      .then((result) => {
        setUser(result.user);
        setSessionToken(result.sessionToken);
      })
      .catch(() => {
        // Stored token no longer resolves to a User -- fall through to
        // requiring identify() again, per the reconnection design's
        // documented limitation (localStorage cleared/invalid = new
        // session).
        localStorage.removeItem(SESSION_TOKEN_STORAGE_KEY);
      })
      .finally(() => setLoading(false));
  }, []);

  const identify = useCallback(async (displayName: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await callIdentityEndpoint({ displayName });
      setUser(result.user);
      setSessionToken(result.sessionToken);
      localStorage.setItem(SESSION_TOKEN_STORAGE_KEY, result.sessionToken);
    } catch (err) {
      setError((err as Error).message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { user, sessionToken, loading, error, identify };
}
