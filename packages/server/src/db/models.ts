import {
  DataTypes,
  Model,
  Sequelize,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from 'sequelize';

export class UserModel extends Model<
  InferAttributes<UserModel>,
  InferCreationAttributes<UserModel>
> {
  declare userId: string;
  declare displayName: string;
  declare sessionToken: string;
  declare createdAt: CreationOptional<Date>;
}

export class RoomModel extends Model<
  InferAttributes<RoomModel>,
  InferCreationAttributes<RoomModel>
> {
  declare roomId: string;
  declare inviteCode: string;
  declare hostUserId: string;
  declare selectedGameId: string | null;
  declare currentMatchId: string | null;
  declare status: 'lobby' | 'in_game';
  declare allowMultiSeat: boolean;
  declare gameSettings: string; // JSON-serialized Record<string, unknown>
  // JSON-serialized RoomMember[] ({userID, role}[]) — kept as a single
  // column rather than a join table per plan.md: small enough for the MVP
  // to not need one. This is unlike seat *assignments* below, which get
  // their own table because they're written far more frequently.
  declare members: string;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

// Seat assignments live in their own table (not a column on Room), per
// plan.md's decision: claim/release writes shouldn't require a
// read-modify-write of the whole Room row, and seats must survive
// independently of gameSettings resets.
export class RoomSeatModel extends Model<
  InferAttributes<RoomSeatModel>,
  InferCreationAttributes<RoomSeatModel>
> {
  declare roomId: string;
  declare playerId: string;
  declare userId: string;
  declare claimedAt: CreationOptional<Date>;
}

// boardgame.io match storage (StorageAPI), kept in the same SQLite database
// as the room/user tables but in its own table, on the other side of the
// StorageAPI seam — see bgio/storage/sqliteStorageAdapter.ts. This is
// match persistence (tech-stack.md), a separate concern from Room
// persistence above; the two are joined only by Room.currentMatchID.
export class MatchModel extends Model<
  InferAttributes<MatchModel>,
  InferCreationAttributes<MatchModel>
> {
  declare matchId: string;
  declare state: string; // JSON-serialized State<G>
  declare initialState: string; // JSON-serialized State<G>
  declare metadata: string; // JSON-serialized Server.MatchData
  declare log: string; // JSON-serialized LogEntry[]
}

export interface Models {
  User: typeof UserModel;
  Room: typeof RoomModel;
  RoomSeat: typeof RoomSeatModel;
  Match: typeof MatchModel;
}

export function defineModels(sequelize: Sequelize): Models {
  UserModel.init(
    {
      userId: { type: DataTypes.TEXT, primaryKey: true },
      displayName: { type: DataTypes.TEXT, allowNull: false },
      sessionToken: { type: DataTypes.TEXT, allowNull: false, unique: true },
      createdAt: DataTypes.DATE,
    },
    { sequelize, tableName: 'users', updatedAt: false },
  );

  RoomModel.init(
    {
      roomId: { type: DataTypes.TEXT, primaryKey: true },
      inviteCode: { type: DataTypes.TEXT, allowNull: false, unique: true },
      hostUserId: { type: DataTypes.TEXT, allowNull: false },
      selectedGameId: { type: DataTypes.TEXT, allowNull: true },
      currentMatchId: { type: DataTypes.TEXT, allowNull: true },
      status: {
        type: DataTypes.TEXT,
        allowNull: false,
        defaultValue: 'lobby',
      },
      allowMultiSeat: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      gameSettings: {
        type: DataTypes.TEXT,
        allowNull: false,
        defaultValue: '{}',
      },
      members: {
        type: DataTypes.TEXT,
        allowNull: false,
        defaultValue: '[]',
      },
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    },
    { sequelize, tableName: 'rooms' },
  );

  RoomSeatModel.init(
    {
      roomId: { type: DataTypes.TEXT, primaryKey: true },
      playerId: { type: DataTypes.TEXT, primaryKey: true },
      userId: { type: DataTypes.TEXT, allowNull: false },
      claimedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    { sequelize, tableName: 'room_seats', timestamps: false },
  );

  MatchModel.init(
    {
      matchId: { type: DataTypes.TEXT, primaryKey: true },
      state: { type: DataTypes.TEXT, allowNull: false },
      initialState: { type: DataTypes.TEXT, allowNull: false },
      metadata: { type: DataTypes.TEXT, allowNull: false },
      log: { type: DataTypes.TEXT, allowNull: false, defaultValue: '[]' },
    },
    { sequelize, tableName: 'matches', timestamps: false },
  );

  return {
    User: UserModel,
    Room: RoomModel,
    RoomSeat: RoomSeatModel,
    Match: MatchModel,
  };
}
