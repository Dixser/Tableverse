import { customAlphabet } from 'nanoid';

// 6 chars, uppercase alphanumeric minus visually ambiguous O/0/I/1 — see
// spec/features/001-platform-core/plan.md, "Room persistence layer".
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const LENGTH = 6;

export const generateInviteCode = customAlphabet(ALPHABET, LENGTH);
