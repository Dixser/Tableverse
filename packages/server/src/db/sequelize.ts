import { Sequelize } from 'sequelize';

/**
 * SQLite for the MVP, per tech-stack.md's persistence decision. The
 * dialect is the only thing that changes on the documented upgrade path to
 * PostgreSQL — no code outside this file should construct a Sequelize
 * instance or know the dialect.
 */
export function createSequelize(storage: string = ':memory:'): Sequelize {
  return new Sequelize({
    dialect: 'sqlite',
    storage,
    logging: false,
  });
}
