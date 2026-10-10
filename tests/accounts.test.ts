import { beforeEach, describe, expect, it } from "vitest";
import { FIXTURES } from "@/lib/ai/mock";
import { aisleFor, daysUntil, expiringSoon } from "@/lib/pantry";
import { listAsText } from "@/lib/shoppingText";
import {
  bookToRow,
  listToRow,
  pantryToRow,
  recipeSlug,
  rowToBook,
  rowToList,
  rowToPantry,
} from "@/lib/sync/remote";
import {
  changedSince,
  fingerprint,
  live,
  mergeByKey,
  purgeTombstones,
  TOMBSTONE_MS,
} from "@/lib/sync/rows";
import { bookKey, useBook } from "@/store/useBook";
import { pantryForCooking } from "@/store/useKitchen";
import { useList } from "@/store/useList";
import { usePantry } from "@/store/usePantry";

const row = (key: string, updatedAt: number, extra: object = {}) => ({ key, updatedAt, ...extra });

describe("merging a device with the account", () => {
  it("keeps the newer write per key and pushes only the device's winners", () => {
    const local = [row("a", 10), row("b", 30), row("c", 5)];
    const remote = [row("a", 20), row("b", 25), row("d", 1)];
    const { merged, toPush } = mergeByKey(local, remote);
    expect(merged.map((r) => [r.key, r.updatedAt]).sort()).toEqual([
      ["a", 20],
      ["b", 30],
      ["c", 5],
      ["d", 1],
    ]);
    expect(toPush.map((r) => r.key).sort()).toEqual(["b", "c"]);
  });

  it("a guest's data joins an account that already has data (sign-in merge)", () => {
    const guest = [row("paneer", 100), row("rice", 100)];
    const account = [row("rice", 50), row("ghee", 70)];
    const { merged, toPush } = mergeByKey(guest, account);
    expect(
      live(merged)
        .map((r) => r.key)
        .sort(),
    ).toEqual(["ghee", "paneer", "rice"]);
    expect(toPush.map((r) => r.key).sort()).toEqual(["paneer", "rice"]);
  });

  it("deletions travel as tombstones; a tie keeps the account's copy", () => {
    const deletedHere = [row("a", 50, { deletedAt: 50 })];
    expect(live(mergeByKey(deletedHere, [row("a", 40)]).merged)).toEqual([]);
    // deleted elsewhere later: stays deleted here
    expect(live(mergeByKey([row("a", 40)], [row("a", 60, { deletedAt: 60 })]).merged)).toEqual([]);
    // never synced and deleted: nothing to push
    expect(mergeByKey(deletedHere, []).toPush).toEqual([]);
    expect(mergeByKey([row("a", 5, { v: 1 })], [row("a", 5, { v: 2 })]).merged[0]).toMatchObject({
      v: 2,
    });
  });

  it("finds rows written since the last push, and forgets old tombstones", () => {
    const pushed = new Map([
      ["a", 10],
      ["b", 10],
    ]);
    expect(
      changedSince([row("a", 10), row("b", 11), row("c", 1)], pushed).map((r) => r.key),
    ).toEqual(["b", "c"]);
    const now = 1e12;
    const rows = [
      row("old", 0, { deletedAt: now - TOMBSTONE_MS - 1 }),
      row("new", 0, { deletedAt: now - 1 }),
    ];
    expect(purgeTombstones(rows, now).map((r) => r.key)).toEqual(["new"]);
  });
});

describe("rows in Postgres", () => {
  it("round-trips pantry, list and book rows", () => {
    const p = {
      key: "paneer",
      id: "paneer",
      name: "Paneer",
      category: "dairy" as const,
      expiresOn: "2026-10-09",
      updatedAt: 1_700_000_000_000,
      deletedAt: null,
    };
    expect(rowToPantry(pantryToRow(p, "u1"))).toEqual(p);
    const l = {
      key: "coriander",
      name: "Coriander",
      qty: "1 bunch",
      aisle: "produce" as const,
      checked: true,
      fromRecipe: "Dal",
      updatedAt: 1_700_000_000_000,
      deletedAt: 1_700_000_000_500,
    };
    expect(rowToList(listToRow(l, "u1"))).toEqual(l);
    const recipe = FIXTURES[0];
    const e = {
      key: bookKey(recipe),
      recipe,
      collection: "Weeknight",
      rating: 4,
      notes: "More lemon",
      photoPath: null,
      savedAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_100,
      deletedAt: null,
      remoteRecipeId: "r1",
    };
    const back = rowToBook({ ...bookToRow(e, "u1", "r1"), recipes: { id: "r1", data: recipe } });
    expect(back).toEqual(e);
  });

  it("skips a saved recipe whose stored JSON isn't a valid recipe (still untrusted)", () => {
    const e = bookToRow(
      {
        key: "x",
        recipe: FIXTURES[0],
        collection: "All",
        rating: null,
        notes: "",
        photoPath: null,
        savedAt: 1,
        updatedAt: 1,
      },
      "u1",
      "r1",
    );
    expect(rowToBook({ ...e, recipes: { id: "r1", data: { title: "<script>" } } })).toBeNull();
  });

  it("makes slugs the database accepts", () => {
    const slug = recipeSlug(bookKey(FIXTURES[1]), "9F2c-41aa-bb");
    expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(slug.length).toBeLessThanOrEqual(120);
  });

  it("gives the same recipe the same book key on every device, and different recipes different keys", () => {
    const [a, b] = FIXTURES;
    expect(bookKey(structuredClone(a))).toBe(bookKey(a));
    expect(bookKey(a)).not.toBe(bookKey({ ...a, title: `${a.title}!` }));
    expect(bookKey(a)).not.toBe(bookKey(b));
    expect(fingerprint("abc")).toMatch(/^[0-9a-z]+$/);
  });
});

describe("Use-It-Up and the pantry in generation", () => {
  it("counts calendar days", () => {
    expect(daysUntil("2026-10-08", "2026-10-07")).toBe(1);
    expect(daysUntil("2026-10-07", "2026-10-07")).toBe(0);
    expect(daysUntil("2026-11-01", "2026-10-31")).toBe(1);
    expect(daysUntil("2026-10-05", "2026-10-07")).toBe(-2);
  });

  it("lists items expiring within two days, soonest first", () => {
    const items = [
      { key: "a", expiresOn: "2026-10-09" },
      { key: "b", expiresOn: "2026-10-08" },
      { key: "c", expiresOn: "2026-10-20" },
      { key: "d", expiresOn: null },
    ];
    expect(expiringSoon(items, "2026-10-07").map((i) => i.key)).toEqual(["b", "a"]);
  });

  it("sends staples as pantry and expiring pantry items as ingredients to use up", () => {
    const pantry = [
      { key: "rice", name: "Rice", expiresOn: null },
      { key: "paneer", name: "Paneer", expiresOn: "2026-10-08" },
      { key: "spinach", name: "Spinach", expiresOn: "2026-10-08" },
    ];
    const counter = [{ key: "spinach", name: "Spinach" }];
    expect(pantryForCooking(counter, pantry, "2026-10-07")).toEqual({
      extraIngredients: [{ name: "Paneer", expiring: true }],
      pantry: ["Rice"],
    });
  });
});

describe("shopping list", () => {
  it("files items under aisles", () => {
    expect(aisleFor("Coriander leaves")).toBe("produce");
    expect(aisleFor("paneer")).toBe("dairy");
    expect(aisleFor("toor dal")).toBe("grains");
    expect(aisleFor("something odd")).toBe("other");
  });

  it("shares the unticked items as text, aisle by aisle", () => {
    const text = listAsText(
      [
        { name: "Curd", aisle: "dairy", checked: false },
        { name: "Onion", qty: "2", aisle: "produce", checked: false },
        { name: "Salt", aisle: "spices", checked: true },
      ],
      "Shopping list",
      (a) => a.toUpperCase(),
    );
    expect(text).toBe("Shopping list\n\nPRODUCE\n• Onion (2)\n\nDAIRY\n• Curd");
  });
});

describe("stores", () => {
  beforeEach(() => {
    usePantry.setState({ items: [], useInCooking: false });
    useBook.setState({ entries: [] });
    useList.setState({ items: [] });
  });

  it("pantry: removing leaves a tombstone; adding again revives it", () => {
    const p = usePantry.getState();
    p.add([{ id: "paneer", name: "Paneer" }]);
    p.remove("paneer");
    expect(live(usePantry.getState().items)).toEqual([]);
    expect(usePantry.getState().items[0].deletedAt).toBeTruthy();
    p.add([{ id: "paneer", name: "Paneer" }]);
    expect(live(usePantry.getState().items)).toHaveLength(1);
  });

  it("book: save, update and unsave", () => {
    const b = useBook.getState();
    b.save(FIXTURES[0]);
    const key = bookKey(FIXTURES[0]);
    b.update(key, { rating: 5, notes: "Perfect" });
    expect(useBook.getState().entries[0]).toMatchObject({ rating: 5, notes: "Perfect" });
    b.unsave(key);
    expect(live(useBook.getState().entries)).toEqual([]);
  });

  it("list: an item removed and added again comes back", () => {
    const l = useList.getState();
    l.add({ name: "Curd" });
    l.remove("Curd");
    expect(useList.getState().has("Curd")).toBe(false);
    l.add({ name: "Curd" });
    expect(useList.getState().has("Curd")).toBe(true);
    expect(useList.getState().items[0].aisle).toBe("dairy");
  });

  it("list: Phase 1 lists (v1) migrate with aisles and write times", async () => {
    localStorage.setItem(
      "lk-list",
      JSON.stringify({
        state: { items: [{ key: "curd", name: "Curd", checked: false }] },
        version: 1,
      }),
    );
    await useList.persist.rehydrate();
    expect(useList.getState().items[0]).toMatchObject({
      key: "curd",
      aisle: "dairy",
      deletedAt: null,
    });
    expect(useList.getState().items[0].updatedAt).toBeGreaterThan(0);
  });
});
