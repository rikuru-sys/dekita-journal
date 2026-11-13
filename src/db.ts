import Dexie from "dexie";
import type { EntityTable } from "dexie";
import { starterItems } from "./model";
import type { ChecklistItem, DayDraft, DayRecord } from "./model";

export interface ReminderSettings {
  reminderEnabled: boolean;
  reminderTime: string;
}

export interface JournalSettings extends ReminderSettings {
  id: "journal";
  generation: string;
}

const defaultSettings: JournalSettings = {
  id: "journal",
  generation: "",
  reminderEnabled: true,
  reminderTime: "20:30",
};

export function validReminderTime(value: string): boolean {
  return /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(value);
}

export class JournalDatabase extends Dexie {
  declare days: EntityTable<DayRecord, "date">;
  declare items: EntityTable<ChecklistItem, "id">;
  declare settings: EntityTable<JournalSettings, "id">;

  constructor(name = "dekita-journal") {
    super(name);
    this.version(1).stores({ days: "date", items: "id, order" });
    this.version(2).stores({ settings: "id" });
    this.on("populate", (transaction) => transaction.table("items").bulkAdd(starterItems));
  }
}

export const db = new JournalDatabase();

export async function readSettings(database: JournalDatabase): Promise<JournalSettings> {
  return (await database.settings.get("journal")) ?? { ...defaultSettings };
}

export class RestoreConflict extends Error {
  constructor() {
    super("別の画面でデータが復元されました。最新のデータを開き直してください。");
  }
}

export async function checkGeneration(database: JournalDatabase, generation: string): Promise<JournalSettings> {
  const settings = await readSettings(database);
  if (settings.generation !== generation) throw new RestoreConflict();
  return settings;
}

export async function saveReminder(database: JournalDatabase, patch: Partial<ReminderSettings>, generation: string) {
  return database.transaction("rw", database.settings, async () => {
    const current = await checkGeneration(database, generation);
    const next = { ...current, ...patch };
    if (!validReminderTime(next.reminderTime)) throw new Error("時刻を入力してください。");
    await database.settings.put(next);
    return next;
  });
}

export class RecordConflict extends Error {
  constructor() {
    super("この日の記録が別の画面で更新されました。最新の記録を開き直してください。");
  }
}

export async function saveDay(database: JournalDatabase, draft: DayDraft, generation = ""): Promise<DayRecord> {
  return database.transaction("rw", database.days, database.settings, async () => {
    await checkGeneration(database, generation);
    const current = await database.days.get(draft.date);
    if ((current?.revision ?? 0) !== draft.revision) throw new RecordConflict();

    const saved: DayRecord = {
      ...draft,
      revision: draft.revision + 1,
      savedAt: new Date().toISOString(),
    };
    await database.days.put(saved);
    return saved;
  });
}

export type EditableItem = Pick<ChecklistItem, "name" | "category" | "schedule" | "notesEnabled">;

export async function saveItem(details: EditableItem, existingId: string | undefined, generation: string) {
  await db.transaction("rw", db.items, db.settings, async () => {
    await checkGeneration(db, generation);
    if (existingId) {
      const updated = await db.items.update(existingId, details);
      if (updated === 0) throw new Error("This checklist item was removed.");
      return;
    }
    const last = await db.items.orderBy("order").last();
    await db.items.add({
      ...details,
      id: crypto.randomUUID(),
      order: (last?.order ?? 0) + 1,
      archived: false,
    });
  });
}

export async function setChecklistArchived(database: JournalDatabase, id: string, archived: boolean, generation: string) {
  await database.transaction("rw", database.items, database.settings, async () => {
    await checkGeneration(database, generation);
    if (await database.items.update(id, { archived }) === 0) throw new Error("This checklist item was removed.");
  });
}

export async function deleteChecklistItem(database: JournalDatabase, id: string, generation = "") {
  await database.transaction("rw", database.items, database.settings, async () => {
    await checkGeneration(database, generation);
    await database.items.delete(id);
  });
}

export async function moveChecklistItem(database: JournalDatabase, id: string, direction: "up" | "down", generation = "") {
  return database.transaction("rw", database.items, database.settings, async () => {
    await checkGeneration(database, generation);
    const item = await database.items.get(id);
    if (!item || item.archived) return;

    const siblings = await database.items.orderBy("order")
      .filter((candidate) => !candidate.archived && candidate.category === item.category)
      .toArray();
    const currentIndex = siblings.findIndex((candidate) => candidate.id === id);
    const nextIndex = currentIndex + (direction === "up" ? -1 : 1);
    const adjacent = siblings[nextIndex];
    if (!adjacent) return;

    await database.items.bulkUpdate([
      { key: item.id, changes: { order: adjacent.order } },
      { key: adjacent.id, changes: { order: item.order } },
    ]);
    return nextIndex + 1;
  });
}
