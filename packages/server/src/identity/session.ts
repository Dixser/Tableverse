import type { User } from '@tableverse/shared';
import type { UserRepository } from './userRepository.js';

export interface SessionResult {
  user: User;
  sessionToken: string;
}

/**
 * Phase 1 identity (no OAuth, per tech-stack.md): if a valid sessionToken
 * is presented, resolve the User it belongs to. Otherwise mint a brand new
 * User + token from the given displayName. This is the entire "auth"
 * mechanism for the MVP.
 */
export async function resolveOrCreateSession(
  userRepository: UserRepository,
  input: { sessionToken?: string; displayName?: string },
): Promise<SessionResult> {
  if (input.sessionToken) {
    const user = await userRepository.getBySessionToken(input.sessionToken);
    if (user) {
      return { user, sessionToken: input.sessionToken };
    }
  }
  const displayName = input.displayName?.trim();
  if (!displayName) {
    throw new Error(
      'displayName is required to create a new session (no valid sessionToken presented)',
    );
  }
  return userRepository.createUser(displayName);
}
