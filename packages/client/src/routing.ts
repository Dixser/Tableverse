const ROOM_PATH_PATTERN = /^\/room\/([^/]+)\/?$/;

/** Reads an invite code out of a `/room/:inviteCode` URL, if present. */
export function getInviteCodeFromLocation(): string | null {
  const match = ROOM_PATH_PATTERN.exec(window.location.pathname);
  return match ? decodeURIComponent(match[1]!) : null;
}

/**
 * Updates the address bar to `/room/:inviteCode` without a page reload, so
 * the URL a user's browser shows is itself a shareable invite link.
 */
export function setRoomUrl(inviteCode: string): void {
  const path = `/room/${encodeURIComponent(inviteCode)}`;
  if (window.location.pathname !== path) {
    window.history.pushState(null, '', path);
  }
}

/** Resets the address bar to the home ("/") route. */
export function setHomeUrl(): void {
  if (window.location.pathname !== '/') {
    window.history.pushState(null, '', '/');
  }
}
