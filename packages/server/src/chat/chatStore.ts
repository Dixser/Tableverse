export interface ChatMessage {
  id: string;
  roomID: string;
  authorUserID: string;
  /** Snapshotted at send time (matches the existing matchData/player-name
   * snapshot pattern from feature 009 -- a member who later changes their
   * display name, or leaves the room, doesn't rewrite history). */
  authorDisplayName: string;
  /** Frozen at send time, per spec.md's resolved decision. */
  authorWasSeated: boolean;
  body: string;
  sentAt: string; // ISO
}

/** In-memory, per-room capped ring buffer -- same "single-server-instance design for the MVP" precedent as PresenceStore. */
export class ChatStore {
  private readonly messagesByRoom = new Map<string, ChatMessage[]>();
  private static readonly MAX_PER_ROOM = 200;

  append(message: ChatMessage): void {
    const messages = this.messagesByRoom.get(message.roomID) ?? [];
    messages.push(message);
    if (messages.length > ChatStore.MAX_PER_ROOM) {
      messages.splice(0, messages.length - ChatStore.MAX_PER_ROOM);
    }
    this.messagesByRoom.set(message.roomID, messages);
  }

  /**
   * Per spec.md's resolved decision, "seated" is frozen at send time on
   * each message, not re-evaluated against the viewer's current status --
   * only viewerIsSeated (the CURRENT viewer's own status) varies here.
   */
  historyFor(roomID: string, viewerIsSeated: boolean): ChatMessage[] {
    const messages = this.messagesByRoom.get(roomID) ?? [];
    return messages.filter((m) => m.authorWasSeated || !viewerIsSeated);
  }
}
