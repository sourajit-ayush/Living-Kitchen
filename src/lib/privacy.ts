/**
 * Data export and deletion (docs/01 §7). Everything the app keeps on a device lives in
 * localStorage under "lk-" keys; a signed-in account also has rows in Supabase.
 */
export const LOCAL_PREFIX = "lk-";

type KeyStore = Pick<Storage, "length" | "key" | "getItem">;

function keys(storage: KeyStore): string[] {
  const out: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k) out.push(k);
  }
  return out;
}

/** This device's app data, parsed where it is JSON. */
export function readLocalData(storage: KeyStore): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const k of keys(storage)
    .filter((k) => k.startsWith(LOCAL_PREFIX))
    .sort()) {
    const raw = storage.getItem(k);
    try {
      data[k] = raw === null ? null : JSON.parse(raw);
    } catch {
      data[k] = raw;
    }
  }
  return data;
}

/** Keys to remove for "delete my data": the app's own, plus the sign-in session if given. */
export function keysToClear(storage: KeyStore, sessionKey: string | null): string[] {
  return keys(storage).filter((k) => k.startsWith(LOCAL_PREFIX) || k === sessionKey);
}

export type AccountExport = {
  email: string | null;
  profile: unknown;
  pantry: unknown[];
  savedRecipes: unknown[];
  shoppingList: unknown[];
  myRecipes: unknown[];
  photos: string[];
};

/** The download: what's on this device, and (signed in) what the account holds. */
export function buildExport(
  local: Record<string, unknown>,
  account: AccountExport | null,
  now = new Date(),
) {
  return {
    app: "The Living Kitchen",
    exportedAt: now.toISOString(),
    thisDevice: local,
    account,
  };
}

export function exportFileName(now = new Date()): string {
  return `living-kitchen-data-${now.toISOString().slice(0, 10)}.json`;
}
