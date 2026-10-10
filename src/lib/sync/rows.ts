/**
 * Rows that sync between this device and an account (pantry, recipe book, shopping list).
 * `key` is the row's identity on every device, `updatedAt` decides conflicts (last writer wins),
 * and a removal is a tombstone (`deletedAt`) so it can reach the other devices.
 */
export type SyncMeta = { key: string; updatedAt: number; deletedAt?: number | null };

/** Tombstones are forgotten after this long (every device has long since seen them). */
export const TOMBSTONE_MS = 30 * 24 * 60 * 60 * 1000;

/** The rows that are really there. */
export function live<T extends SyncMeta>(rows: T[]): T[] {
  return rows.filter((r) => !r.deletedAt);
}

/**
 * Merge this device's rows with the account's: per key the newer write wins (a tie keeps the
 * account's copy). `toPush` holds the device's winners the account doesn't have yet, except
 * tombstones for rows the account never had.
 */
export function mergeByKey<T extends SyncMeta>(
  local: T[],
  remote: T[],
): { merged: T[]; toPush: T[] } {
  const byKey = new Map(remote.map((r) => [r.key, r]));
  const toPush: T[] = [];
  for (const l of local) {
    const r = byKey.get(l.key);
    if (!r) {
      if (!l.deletedAt) toPush.push(l);
      byKey.set(l.key, l);
    } else if (l.updatedAt > r.updatedAt) {
      toPush.push(l);
      byKey.set(l.key, l);
    }
  }
  return { merged: [...byKey.values()], toPush };
}

/** Rows written since the last successful push (by key and time). */
export function changedSince<T extends SyncMeta>(rows: T[], pushed: Map<string, number>): T[] {
  return rows.filter((r) => (pushed.get(r.key) ?? -1) < r.updatedAt);
}

export function purgeTombstones<T extends SyncMeta>(rows: T[], now = Date.now()): T[] {
  return rows.filter((r) => !r.deletedAt || now - r.deletedAt < TOMBSTONE_MS);
}

/** Insert or replace a row by key, stamping the write time. */
export function upsertRow<T extends SyncMeta>(
  rows: T[],
  row: Omit<T, "updatedAt">,
  now = Date.now(),
) {
  const next = { ...row, updatedAt: now } as T;
  const i = rows.findIndex((r) => r.key === row.key);
  return i < 0 ? [...rows, next] : rows.map((r, j) => (j === i ? next : r));
}

/** Change a live row by key (no-op if missing or deleted). */
export function patchRow<T extends SyncMeta>(
  rows: T[],
  key: string,
  patch: Partial<T>,
  now = Date.now(),
): T[] {
  return rows.map((r) => (r.key === key && !r.deletedAt ? { ...r, ...patch, updatedAt: now } : r));
}

export function tombstone<T extends SyncMeta>(rows: T[], key: string, now = Date.now()): T[] {
  return rows.map((r) => (r.key === key ? { ...r, deletedAt: now, updatedAt: now } : r));
}

/** FNV-1a: a short, stable fingerprint (recipe keys, so the same recipe merges across devices). */
export function fingerprint(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}
