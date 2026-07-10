import type { Context, Next } from 'koa';
import type { User } from '@tableverse/shared';
import type { UserRepository } from './userRepository.js';

export const SESSION_TOKEN_HEADER = 'x-session-token';

declare module 'koa' {
  interface DefaultState {
    user?: User;
  }
}

/**
 * For routes that require an already-established identity (everything
 * except the identity endpoint itself). Rejects with 401 if the header is
 * missing or doesn't resolve to a User.
 */
export function requireSession(userRepository: UserRepository) {
  return async (ctx: Context, next: Next): Promise<void> => {
    const token = ctx.get(SESSION_TOKEN_HEADER);
    const user = token ? await userRepository.getBySessionToken(token) : null;
    if (!user) {
      ctx.status = 401;
      ctx.body = { error: 'invalid or missing session token' };
      return;
    }
    ctx.state.user = user;
    await next();
  };
}
