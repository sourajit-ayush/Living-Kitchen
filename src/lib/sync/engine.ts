import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { useBook, type BookEntry } from "@/store/useBook";
import { useList, type ListItem } from "@/store/useList";
import { usePantry, type PantryItem } from "@/store/usePantry";
import {
  bookToRow,
  listToRow,
  pantryToRow,
  recipeSlug,
  rowToBook,
  rowToList,
  rowToPantry,
  type ListRow,
  type PantryRow,
  type SavedRowWithRecipe,
} from "./remote";
import { changedSince, mergeByKey, type SyncMeta } from "./rows";

export type SyncStatus = "syncing" | "synced" | "offline" | "error";

const PUSH_DEBOUNCE_MS = 800;
const PULL_DEBOUNCE_MS = 400;
/** Fallback pull while the page is visible, in case live updates silently stop. */
const POLL_MS = 60_000;

/**
 * Keeps the pantry, recipe book and shopping list in step with the account (docs/05 Phase 6).
 *
 * - **Sign-in:** pull everything, merge with what this device has (a guest's data joins the
 *   account: per row the newer write wins), push the device's winners.
 * - **While signed in:** local changes are pushed shortly after they happen; another device's
 *   changes arrive through Supabase Realtime (and on focus / reconnect as a safety net).
 *
 * The account's clock is the reference: after a push the device adopts the server's
 * `updated_at`, so both sides agree on what is newest.
 */
export function startSync(
  sb: SupabaseClient,
  userId: string,
  onStatus: (status: SyncStatus) => void,
): () => void {
  // Last write time the account is known to have, per table and key.
  const pushed = {
    pantry: new Map<string, number>(),
    book: new Map<string, number>(),
    list: new Map<string, number>(),
  };
  let stopped = false;
  let applying = false; // writes coming *from* the account must not be pushed back
  let pushTimer: ReturnType<typeof setTimeout> | undefined;
  let pullTimer: ReturnType<typeof setTimeout> | undefined;
  let running: Promise<void> = Promise.resolve();

  /** Serialise pulls and pushes so they never interleave. */
  const queue = (job: () => Promise<void>) => {
    running = running.then(async () => {
      if (stopped) return;
      if (typeof navigator !== "undefined" && !navigator.onLine) return onStatus("offline");
      onStatus("syncing");
      try {
        await job();
        if (!stopped) onStatus("synced");
      } catch (error) {
        if (stopped) return; // signed out mid-flight: nothing to report
        console.warn("[sync]", error);
        onStatus("error");
      }
    });
    return running;
  };

  const remember = <T extends SyncMeta>(map: Map<string, number>, rows: T[]) => {
    for (const r of rows) map.set(r.key, r.updatedAt);
  };

  /** Adopt the server's write times for rows that haven't changed locally since the push. */
  const adopt = <T extends SyncMeta>(
    rows: T[],
    returned: { key: string; updated_at: string }[],
    sent: T[],
  ): T[] => {
    const sentAt = new Map(sent.map((r) => [r.key, r.updatedAt]));
    const serverAt = new Map(returned.map((r) => [r.key, Date.parse(r.updated_at)]));
    return rows.map((r) =>
      serverAt.has(r.key) && sentAt.get(r.key) === r.updatedAt
        ? { ...r, updatedAt: serverAt.get(r.key)! }
        : r,
    );
  };

  /**
   * Write account data into the stores. A pull or push still in flight when sync stops (sign
   * out) must not put the account's data back on the device, so late results are dropped.
   */
  const apply = (fn: () => void) => {
    if (stopped) throw new Error("sync stopped");
    applying = true;
    try {
      fn();
    } finally {
      applying = false;
    }
  };

  async function pushPantry(rows: PantryItem[]) {
    if (!rows.length) return;
    const { data, error } = await sb
      .from("pantry_items")
      .upsert(
        rows.map((r) => pantryToRow(r, userId)),
        { onConflict: "user_id,key" },
      )
      .select("key, updated_at");
    if (error) throw error;
    const items = adopt(usePantry.getState().items, data ?? [], rows);
    apply(() => usePantry.getState().replace(items));
    remember(
      pushed.pantry,
      items.filter((i) => rows.some((r) => r.key === i.key)),
    );
  }

  async function pushList(rows: ListItem[]) {
    if (!rows.length) return;
    const { data, error } = await sb
      .from("shopping_list")
      .upsert(
        rows.map((r) => listToRow(r, userId)),
        { onConflict: "user_id,key" },
      )
      .select("key, updated_at");
    if (error) throw error;
    const items = adopt(useList.getState().items, data ?? [], rows);
    apply(() => useList.getState().replace(items));
    remember(
      pushed.list,
      items.filter((i) => rows.some((r) => r.key === i.key)),
    );
  }

  async function pushBook(rows: BookEntry[]) {
    if (!rows.length) return;
    // The recipe itself goes into `recipes` first (private until shared, Phase 7).
    const ids = new Map<string, string>();
    for (const e of rows) {
      if (e.remoteRecipeId) {
        ids.set(e.key, e.remoteRecipeId);
        continue;
      }
      if (e.deletedAt) continue; // never reached the account: nothing to delete
      const { data, error } = await sb
        .from("recipes")
        .upsert(
          {
            slug: recipeSlug(e.key, userId),
            author_id: userId,
            data: e.recipe,
            locale: e.recipe.locale,
          },
          { onConflict: "slug" },
        )
        .select("id")
        .single();
      if (error) throw error;
      ids.set(e.key, data.id as string);
    }
    const sendable = rows.filter((e) => ids.has(e.key));
    if (!sendable.length) return;
    const { data, error } = await sb
      .from("saved_recipes")
      .upsert(
        sendable.map((e) => bookToRow(e, userId, ids.get(e.key)!)),
        { onConflict: "user_id,key" },
      )
      .select("key, updated_at");
    if (error) throw error;
    const withIds = useBook
      .getState()
      .entries.map((e) => (ids.has(e.key) ? { ...e, remoteRecipeId: ids.get(e.key) } : e));
    const entries = adopt(withIds, data ?? [], sendable);
    apply(() => useBook.getState().replace(entries));
    remember(
      pushed.book,
      entries.filter((e) => sendable.some((r) => r.key === e.key)),
    );
  }

  /** Pull everything, merge with the device, push what the device has that the account lacks. */
  async function pullAndMerge() {
    const [pantry, book, list] = await Promise.all([
      sb.from("pantry_items").select("*").eq("user_id", userId),
      sb.from("saved_recipes").select("*, recipes(id, data)").eq("user_id", userId),
      sb.from("shopping_list").select("*").eq("user_id", userId),
    ]);
    for (const r of [pantry, book, list]) if (r.error) throw r.error;

    const remotePantry = (pantry.data as PantryRow[]).map(rowToPantry);
    const remoteBook = (book.data as SavedRowWithRecipe[])
      .map(rowToBook)
      .filter((e): e is BookEntry => e !== null);
    const remoteList = (list.data as ListRow[]).map(rowToList);

    const p = mergeByKey(usePantry.getState().items, remotePantry);
    const b = mergeByKey(useBook.getState().entries, remoteBook);
    const l = mergeByKey(useList.getState().items, remoteList);
    apply(() => {
      usePantry.getState().replace(p.merged);
      useBook.getState().replace(b.merged);
      useList.getState().replace(l.merged);
    });
    remember(pushed.pantry, remotePantry);
    remember(pushed.book, remoteBook);
    remember(pushed.list, remoteList);
    await pushPantry(p.toPush);
    await pushBook(b.toPush);
    await pushList(l.toPush);
  }

  const pushChanges = () =>
    queue(async () => {
      await pushPantry(changedSince(usePantry.getState().items, pushed.pantry));
      await pushBook(changedSince(useBook.getState().entries, pushed.book));
      await pushList(changedSince(useList.getState().items, pushed.list));
    });

  const schedulePush = () => {
    if (applying || stopped) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => void pushChanges(), PUSH_DEBOUNCE_MS);
  };
  const schedulePull = () => {
    if (stopped) return;
    clearTimeout(pullTimer);
    pullTimer = setTimeout(() => void queue(pullAndMerge), PULL_DEBOUNCE_MS);
  };

  void queue(pullAndMerge);

  const unsubs = [
    usePantry.subscribe((s, prev) => s.items !== prev.items && schedulePush()),
    useBook.subscribe((s, prev) => s.entries !== prev.entries && schedulePush()),
    useList.subscribe((s, prev) => s.items !== prev.items && schedulePush()),
  ];

  // Another device changed something (RLS limits the feed to this user's rows). Changes made
  // before the channel joins, or while it reconnects, aren't replayed: pull every time it
  // (re)joins, and rejoin after an error.
  let channel: RealtimeChannel | null = null;
  let rejoinTimer: ReturnType<typeof setTimeout> | undefined;
  let rejoinDelay = 1000;
  const join = () => {
    if (stopped) return;
    const ch = sb.channel(`lk-sync-${userId}-${Date.now()}`);
    for (const table of ["pantry_items", "saved_recipes", "shopping_list"]) {
      ch.on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: `user_id=eq.${userId}` },
        schedulePull,
      );
    }
    ch.subscribe((status) => {
      if (stopped || channel !== ch) return;
      // Live-update state, for support and the sync tests: SUBSCRIBED, CHANNEL_ERROR, …
      document.documentElement.dataset.syncChannel = status;
      if (status === "SUBSCRIBED") {
        rejoinDelay = 1000;
        schedulePull();
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        void sb.removeChannel(ch);
        channel = null;
        clearTimeout(rejoinTimer);
        rejoinTimer = setTimeout(join, rejoinDelay);
        rejoinDelay = Math.min(rejoinDelay * 2, 30_000);
      }
    });
    channel = ch;
  };
  void sb.auth.getSession().then(({ data }) => {
    // Realtime checks RLS with the user's token; make sure the socket has it before joining.
    if (data.session) void sb.realtime.setAuth(data.session.access_token);
    join();
  });

  // Safety net for a feed that is quietly stuck: a slow pull while the page is in view.
  const poll = setInterval(() => {
    if (document.visibilityState === "visible") schedulePull();
  }, POLL_MS);

  const onVisible = () => document.visibilityState === "visible" && schedulePull();
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("online", schedulePull);
  const onOffline = () => onStatus("offline");
  window.addEventListener("offline", onOffline);

  return () => {
    stopped = true;
    clearTimeout(pushTimer);
    clearTimeout(pullTimer);
    clearTimeout(rejoinTimer);
    clearInterval(poll);
    unsubs.forEach((u) => u());
    if (channel) void sb.removeChannel(channel);
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("online", schedulePull);
    window.removeEventListener("offline", onOffline);
  };
}
