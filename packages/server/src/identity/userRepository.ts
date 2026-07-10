import { nanoid } from 'nanoid';
import type { User } from '@tableverse/shared';
import type { Models } from '../db/models.js';

function toUser(row: {
  userId: string;
  displayName: string;
  createdAt: Date;
}): User {
  return {
    id: row.userId,
    displayName: row.displayName,
    createdAt: row.createdAt.toISOString(),
  };
}

export class UserRepository {
  constructor(private readonly models: Models) {}

  async createUser(displayName: string): Promise<{
    user: User;
    sessionToken: string;
  }> {
    const sessionToken = nanoid(32);
    const row = await this.models.User.create({
      userId: nanoid(16),
      displayName,
      sessionToken,
    });
    return { user: toUser(row), sessionToken };
  }

  async getBySessionToken(sessionToken: string): Promise<User | null> {
    const row = await this.models.User.findOne({ where: { sessionToken } });
    return row ? toUser(row) : null;
  }

  async getById(userId: string): Promise<User | null> {
    const row = await this.models.User.findByPk(userId);
    return row ? toUser(row) : null;
  }
}
