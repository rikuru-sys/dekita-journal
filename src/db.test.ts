import "fake-indexeddb/auto";
import { expect, it } from "vitest";
import { deleteChecklistItem, JournalDatabase, moveChecklistItem, RecordConflict, saveDay } from "./db";
import { doneItems, heatLevel, prepareDraft } from "./model";

it("reopens an IndexedDB record with zero activities and prevents a stale overwrite", async () => {
  const database = new JournalDatabase("journal-test-" + crypto.randomUUID());
  const reopened = new JournalDatabase(database.name);
  try {
    const date = "2026-11-11";
    const catalog = await database.items.toArray();
    expect(catalog.length).toBeGreaterThan(0);
    const original = prepareDraft(date, catalog, undefined, date);
    await saveDay(database, original);
    database.close();

    const first = await reopened.days.get(date);
    expect(first?.revision).toBe(1);
    expect(heatLevel(first)).toBe("zero");
    expect(await reopened.days.get("2026-11-10")).toBeUndefined();

    await saveDay(reopened, { ...original, revision: 1, memo: "記録を更新" });
    await expect(saveDay(reopened, { ...original, memo: "古い内容" })).rejects.toBeInstanceOf(RecordConflict);
    expect((await reopened.days.get(date))?.memo).toBe("記録を更新");
  } finally {
    database.close();
    await reopened.delete();
  }
});

it("persists the new order within a category while skipping archived items", async () => {
  const database = new JournalDatabase("journal-order-test-" + crypto.randomUUID());
  const reopened = new JournalDatabase(database.name);
  try {
    const ready = await database.items.get("ready");
    await database.items.update("ready", { archived: true });
    await database.items.add({ ...ready!, id: "tea", order: 7 });
    expect(await moveChecklistItem(database, "tea", "up")).toBe(1);
    expect(await moveChecklistItem(database, "tea", "up")).toBeUndefined();
    expect(await moveChecklistItem(database, "ready", "down")).toBeUndefined();
    database.close();

    const ordered = await reopened.items.orderBy("order").toArray();
    expect(ordered.map(({ id }) => id)).toEqual(["tea", "ready", "plan", "outside", "move", "rest", "meal"]);
    const day = prepareDraft("2026-11-11", ordered, undefined, "2026-11-11");
    expect(day.items.filter(({ item }) => item.category === "life").map(({ item }) => item.id)).toEqual(["tea", "meal"]);
  } finally {
    database.close();
    await reopened.delete();
  }
});

it("deletes the checklist definition while retaining and editing its saved history", async () => {
  const database = new JournalDatabase("journal-delete-test-" + crypto.randomUUID());
  try {
    const today = "2026-11-11";
    const past = "2026-11-10";
    const catalog = await database.items.orderBy("order").toArray();
    const draft = prepareDraft(past, catalog, undefined, today);
    const rest = draft.items.find(({ item }) => item.id === "rest")!;
    rest.done = true;
    rest.memo = "目を休めた";
    rest.effect = "slight";
    const saved = await saveDay(database, draft);

    await deleteChecklistItem(database, "rest");
    expect(await database.items.get("rest")).toBeUndefined();
    expect(await database.days.get(past)).toEqual(saved);

    const updatedCatalog = await database.items.orderBy("order").toArray();
    const pastDraft = prepareDraft(past, updatedCatalog, saved, today);
    const edited = await saveDay(database, { ...pastDraft, memo: "この日のメモ" });
    expect(doneItems(edited)).toEqual([rest]);
    expect(prepareDraft(today, updatedCatalog, undefined, today).items.some(({ item }) => item.id === "rest")).toBe(false);
  } finally {
    await database.delete();
  }
});
