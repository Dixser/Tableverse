import type {
  Server as BgioServer,
  LogEntry,
  State,
  StorageAPI,
} from 'boardgame.io';
import type { Models } from '../../db/models.js';
import { Async } from '../vendor.js';

/**
 * boardgame.io StorageAPI implementation over the same SQLite database used
 * for room/user data, per tech-stack.md's persistence decision (SQLite for
 * the MVP; swap the Sequelize dialect for the documented Postgres upgrade
 * path — no code here or in room/game logic assumes a specific dialect).
 *
 * Extends boardgame.io/internal's `Async` base class (not the public
 * `boardgame.io` entry point, which only exposes StorageAPI as a type) —
 * `internal` is the subpath boardgame.io itself uses to ship its own
 * storage adapters (e.g. FlatFile), so it's the correct integration point
 * for a custom one.
 */
export class SqliteStorageAdapter extends Async {
  constructor(private readonly models: Models) {
    super();
  }

  async connect(): Promise<void> {
    // Sequelize connection is established by createSequelize/defineModels
    // before this adapter is constructed — nothing further to do here.
  }

  async createMatch(
    matchID: string,
    opts: { initialState: State; metadata: BgioServer.MatchData },
  ): Promise<void> {
    await this.models.Match.create({
      matchId: matchID,
      state: JSON.stringify(opts.initialState),
      initialState: JSON.stringify(opts.initialState),
      metadata: JSON.stringify(opts.metadata),
      log: '[]',
    });
  }

  async setState(
    matchID: string,
    state: State,
    deltalog?: LogEntry[],
  ): Promise<void> {
    const row = await this.models.Match.findByPk(matchID);
    if (!row) {
      throw new Error(`setState: match ${matchID} not found`);
    }
    row.state = JSON.stringify(state);
    if (deltalog && deltalog.length > 0) {
      const existingLog = JSON.parse(row.log) as LogEntry[];
      row.log = JSON.stringify([...existingLog, ...deltalog]);
    }
    await row.save();
  }

  async setMetadata(
    matchID: string,
    metadata: BgioServer.MatchData,
  ): Promise<void> {
    const row = await this.models.Match.findByPk(matchID);
    if (!row) {
      throw new Error(`setMetadata: match ${matchID} not found`);
    }
    row.metadata = JSON.stringify(metadata);
    await row.save();
  }

  async fetch<O extends StorageAPI.FetchOpts>(
    matchID: string,
    opts: O,
  ): Promise<StorageAPI.FetchResult<O>> {
    const row = await this.models.Match.findByPk(matchID);
    const result: {
      state?: State;
      log?: LogEntry[];
      metadata?: BgioServer.MatchData;
      initialState?: State;
    } = {};
    if (row) {
      if (opts.state) result.state = JSON.parse(row.state) as State;
      if (opts.log) result.log = JSON.parse(row.log) as LogEntry[];
      if (opts.metadata) {
        result.metadata = JSON.parse(row.metadata) as BgioServer.MatchData;
      }
      if (opts.initialState) {
        result.initialState = JSON.parse(row.initialState) as State;
      }
    }
    return result as StorageAPI.FetchResult<O>;
  }

  async wipe(matchID: string): Promise<void> {
    await this.models.Match.destroy({ where: { matchId: matchID } });
  }

  async listMatches(opts?: { gameName?: string }): Promise<string[]> {
    const rows = await this.models.Match.findAll();
    const ids: string[] = [];
    for (const row of rows) {
      if (!opts?.gameName) {
        ids.push(row.matchId);
        continue;
      }
      const metadata = JSON.parse(row.metadata) as BgioServer.MatchData;
      if (metadata.gameName === opts.gameName) ids.push(row.matchId);
    }
    return ids;
  }
}
