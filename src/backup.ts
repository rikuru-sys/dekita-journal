import { checkGeneration, readSettings, validReminderTime } from "./db";
import type { JournalDatabase, ReminderSettings } from "./db";
import { careEffects, categories, validDateKey, weekdayIndexes } from "./model";
import type { ChecklistItem, DayRecord, ItemRecord, ItemSnapshot, Schedule } from "./model";
import { conditionScores, moods, severities, symptomFields } from "./wellbeing";

const backupFormat = "dekita-journal";
const backupVersion = 1;

export interface JournalBackup {
  format: typeof backupFormat;
  version: typeof backupVersion;
  exportedAt: string;
  items: ChecklistItem[];
  days: DayRecord[];
  reminder: ReminderSettings;
}

export class InvalidBackup extends Error {}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

function unique(values: unknown[]): boolean {
  return new Set(values).size === values.length;
}

function isSchedule(value: unknown): value is Schedule {
  if (!isObject(value)) return false;
  if (value.type === "daily" || value.type === "unscheduled") return true;
  return value.type === "weekly" &&
    Array.isArray(value.weekdays) && value.weekdays.length > 0 && unique(value.weekdays) &&
    value.weekdays.every((day) => weekdayIndexes.some((weekday) => weekday === day));
}

function isItemSnapshot(value: unknown): value is ItemSnapshot {
  return isObject(value) &&
    typeof value.id === "string" && value.id.length > 0 &&
    typeof value.name === "string" && value.name.trim().length > 0 &&
    categories.some(({ id }) => id === value.category) &&
    isSchedule(value.schedule) && typeof value.notesEnabled === "boolean";
}

function isChecklistItem(value: unknown): value is ChecklistItem {
  return isObject(value) && isItemSnapshot(value) &&
    typeof value.archived === "boolean" &&
    typeof value.order === "number" && Number.isSafeInteger(value.order) && value.order >= 1;
}

function isItemRecord(value: unknown): value is ItemRecord {
  return isObject(value) && isItemSnapshot(value.item) &&
    typeof value.done === "boolean" && typeof value.memo === "string" &&
    (value.effect === null || (typeof value.effect === "string" && Object.hasOwn(careEffects, value.effect)));
}

function isDayRecord(value: unknown): value is DayRecord {
  if (!isObject(value) ||
    typeof value.date !== "string" || !validDateKey(value.date) ||
    !isTimestamp(value.savedAt) || typeof value.memo !== "string" ||
    typeof value.revision !== "number" || !Number.isSafeInteger(value.revision) || value.revision < 1 ||
    !Array.isArray(value.items) || !value.items.every(isItemRecord) ||
    !unique(value.items.map(({ item }) => item.id))) return false;

  if (value.mood !== undefined && (typeof value.mood !== "string" || !Object.hasOwn(moods, value.mood))) return false;
  if (value.conditionOverride !== undefined && !conditionScores.some((score) => score === value.conditionOverride)) return false;
  return value.symptoms === undefined || (isObject(value.symptoms) &&
    Object.entries(value.symptoms).every(([id, severity]) =>
      symptomFields.some((field) => field.id === id) && typeof severity === "string" && Object.hasOwn(severities, severity),
    ));
}

function isReminder(value: unknown): value is ReminderSettings {
  return isObject(value) &&
    typeof value.reminderEnabled === "boolean" &&
    typeof value.reminderTime === "string" && validReminderTime(value.reminderTime);
}

export function parseBackup(text: string): JournalBackup {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new InvalidBackup("JSONファイルの形式を確認してください。");
  }
  if (!isObject(value) || value.format !== backupFormat) {
    throw new InvalidBackup("「できたこと記録」で書き出したバックアップを選んでください。");
  }
  if (value.version !== backupVersion) {
    throw new InvalidBackup("このバージョンのバックアップは読み込めません。");
  }
  const { exportedAt, items, days, reminder } = value;
  if (!isTimestamp(exportedAt) || !isReminder(reminder) ||
    !Array.isArray(items) || !items.every(isChecklistItem) ||
    !unique(items.map(({ id }) => id)) || !unique(items.map(({ order }) => order)) ||
    !Array.isArray(days) || !days.every(isDayRecord) || !unique(days.map(({ date }) => date))) {
    throw new InvalidBackup("バックアップに読み込めないデータがあります。");
  }
  return { format: backupFormat, version: backupVersion, exportedAt, items, days, reminder };
}

export async function createBackup(database: JournalDatabase): Promise<JournalBackup> {
  return database.transaction("r", database.days, database.items, database.settings, async () => {
    const { reminderEnabled, reminderTime } = await readSettings(database);
    return {
      format: backupFormat,
      version: backupVersion,
      exportedAt: new Date().toISOString(),
      items: await database.items.orderBy("order").toArray(),
      days: await database.days.toArray(),
      reminder: { reminderEnabled, reminderTime },
    };
  });
}

export async function restoreBackup(database: JournalDatabase, backup: JournalBackup, generation: string) {
  await database.transaction("rw", database.days, database.items, database.settings, async () => {
    await checkGeneration(database, generation);
    await database.items.clear();
    await database.days.clear();
    await database.items.bulkAdd(backup.items);
    await database.days.bulkAdd(backup.days);
    await database.settings.put({
      id: "journal",
      generation: crypto.randomUUID(),
      reminderEnabled: backup.reminder.reminderEnabled,
      reminderTime: backup.reminder.reminderTime,
    });
  });
}
