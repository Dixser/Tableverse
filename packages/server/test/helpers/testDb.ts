import { Sequelize } from 'sequelize';
import { createSequelize } from '../../src/db/sequelize.js';
import { defineModels, type Models } from '../../src/db/models.js';

export interface TestDb {
  sequelize: Sequelize;
  models: Models;
}

export async function createTestDb(): Promise<TestDb> {
  const sequelize = createSequelize(':memory:');
  const models = defineModels(sequelize);
  await sequelize.sync({ force: true });
  return { sequelize, models };
}
