import "fake-indexeddb/auto";
import Dexie from "dexie";
import { expect, it } from "vitest";
import { createBackup, InvalidBackup, parseBackup, restoreBackup } from "./backup";
import { deleteChecklistItem, JournalDatabase, readSettings, RestoreConflict, saveDay, saveReminder } from "./db";
import { prepareDraft, starterItems } from "./model";

const date = "2026-11-11";

it("opens a version 1 database and keeps its existing records and checklist", async () => {
  const name = "journal-upgrade-" + crypto.randomUUID();
  const old = new Dexie(name);
  old.version(1).stores({ days: "date", items: "id, order" });
  const database = new JournalDatabase(name);
  try {
    const record = { date, items: [], memo: "以前の振り返り", revision: 1, savedAt: "2026-11-11T12:00:00.000Z" };
    await old.table("days").put(record);
    await old.table("items").put(starterItems[0]);
    old.close();

    expect(await database.days.get(date)).toEqual(record);
    expect(await database.items.toArray()).toEqual([starterItems[0]]);
    expect(await readSettings(database)).toMatchObject({ reminderEnabled: true, reminderTime: "20:30" });
  } finally {
    old.close();
    await database.delete();
  }
});

it("round-trips records, deleted item history, and reminder settings in a JSON backup", async () => {
  const source = new JournalDatabase("journal-backup-source-" + crypto.randomUUID());
  const target = new JournalDatabase("journal-backup-target-" + crypto.randomUUID());
  try {
    const draft = prepareDraft(date, starterItems, undefined, date);
    const rest = draft.items.find(({ item }) => item.id === "rest")!;
    rest.done = true;
    rest.memo = "少し休んだ";
    rest.effect = "slight";
    const day = await saveDay(source, {
      ...draft, mood: "calm", symptoms: { fatigue: "strong" }, conditionOverride: 2,
    });
    await deleteChecklistItem(source, "rest");
    await saveReminder(source, { reminderEnabled: false, reminderTime: "21:15" }, "");

    const stale = await saveDay(target, { ...draft, memo: "復元前のデータ" });
    const backup = parseBackup(JSON.stringify(await createBackup(source)));
    await restoreBackup(target, backup, "");

    const settings = await readSettings(target);
    expect(settings).toMatchObject({ reminderEnabled: false, reminderTime: "21:15" });
    expect(await target.items.get("rest")).toBeUndefined();
    expect(await target.days.get(date)).toEqual(day);
    await expect(saveDay(target, { ...stale, memo: "古いタブの変更" })).rejects.toBeInstanceOf(RestoreConflict);
    const edited = prepareDraft(date, backup.items, day, date);
    expect(await saveDay(target, { ...edited, memo: "復元後の編集" }, settings.generation))
      .toMatchObject({ memo: "復元後の編集", mood: "calm", conditionOverride: 2 });
  } finally {
    await source.delete();
    await target.delete();
  }
});

it("rejects malformed backups and rolls back a failed restore", async () => {
  const database = new JournalDatabase("journal-backup-failure-" + crypto.randomUUID());
  try {
    const draft = prepareDraft(date, starterItems, undefined, date);
    const saved = await saveDay(database, { ...draft, mood: "neutral" });
    const backup = await createBackup(database);
    expect(() => parseBackup("{{")).toThrow(InvalidBackup);
    expect(() => parseBackup(JSON.stringify({ ...backup, version: 100 }))).toThrow(InvalidBackup);
    expect(() => parseBackup(JSON.stringify({ ...backup, days: [{ ...saved, mood: "unknown" }] }))).toThrow(InvalidBackup);
    expect(() => parseBackup(JSON.stringify({ ...backup, days: [{ ...saved, symptoms: { fatigue: "wrong" } }] }))).toThrow(InvalidBackup);
    expect(() => parseBackup(JSON.stringify({ ...backup, reminder: { reminderEnabled: true, reminderTime: "29:00" } }))).toThrow(InvalidBackup);

    const duplicateItems = [...backup.items, backup.items[0]];
    await expect(restoreBackup(database, { ...backup, items: duplicateItems, days: [] }, "")).rejects.toThrow();
    expect(await database.days.get(date)).toEqual(saved);
    expect(await database.items.orderBy("order").toArray()).toEqual(backup.items);
    expect((await readSettings(database)).generation).toBe("");
  } finally {
    await database.delete();
  }
});
