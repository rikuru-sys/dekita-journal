import {
  eachDayOfInterval,
  endOfMonth,
  format,
  isValid,
  parseISO,
  startOfMonth,
  subMonths,
} from "date-fns";
import { ja } from "date-fns/locale/ja";
import { conditionScore, conditionScores, moodIds } from "./wellbeing";
import type { ConditionScore, Mood, SymptomAnswers, WellbeingRecord } from "./wellbeing";

export type DateKey = string;
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const weekdays = ["日", "月", "火", "水", "木", "金", "土"] as const;
export const weekdayIndexes: Weekday[] = [0, 1, 2, 3, 4, 5, 6];

export const categories = [
  { id: "life", label: "暮らし" },
  { id: "activity", label: "活動" },
  { id: "care", label: "セルフケア" },
  { id: "hobby", label: "趣味" },
  { id: "family", label: "家庭" },
] as const;
export type CategoryId = (typeof categories)[number]["id"];

export type Schedule =
  | { type: "daily" }
  | { type: "weekly"; weekdays: Weekday[] }
  | { type: "unscheduled" };

export interface ItemSnapshot {
  id: string;
  name: string;
  category: CategoryId;
  schedule: Schedule;
  notesEnabled: boolean;
}

export interface ChecklistItem extends ItemSnapshot {
  order: number;
  archived: boolean;
}

export const careEffects = {
  helpful: "かなり楽になった",
  slight: "少し楽になった",
  noChange: "変化は感じなかった",
  unsure: "わからない",
} as const;
export type CareEffect = keyof typeof careEffects;

export const weatherLabels = { sunny: "晴れ", cloudy: "曇り", rainy: "雨" } as const;
export type Weather = keyof typeof weatherLabels;
export const weatherOptions = Object.keys(weatherLabels) as Weather[];

export interface ItemRecord {
  item: ItemSnapshot;
  done: boolean;
  memo: string;
  effect: CareEffect | null;
}

export interface DayDraft extends WellbeingRecord {
  date: DateKey;
  revision: number;
  items: ItemRecord[];
  memo: string;
  weather?: Weather;
}

export interface DayRecord extends DayDraft {
  savedAt: string;
}

export type CalendarFilter =
  | { kind: "all" }
  | { kind: "category"; id: CategoryId }
  | { kind: "item"; id: string };

export const allItems: CalendarFilter = { kind: "all" };
export const MAX_DAY_MEMO = 1000;
export const MAX_ITEM_MEMO = 300;
export const MAX_ITEM_NAME = 60;

export function dateKey(date: Date = new Date()): DateKey {
  return format(date, "yyyy-MM-dd");
}

export function validDateKey(value: string): value is DateKey {
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)) return false;
  const date = parseISO(value);
  return isValid(date) && dateKey(date) === value;
}

export function dateLabel(key: DateKey, withYear = false): string {
  const pattern = withYear ? "yyyy年M月d日（EEE）" : "M月d日（EEE）";
  return format(parseISO(key), pattern, { locale: ja });
}

export function monthDays(month: Date): Date[] {
  return eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) });
}

export function scheduleLabel(schedule: Schedule, date?: DateKey): string {
  if (schedule.type === "daily") return "毎日";
  if (schedule.type === "unscheduled") return "予定なし";
  if (date && !schedule.weekdays.includes(parseISO(date).getDay() as Weekday)) return "予定外";
  return schedule.weekdays.map((day) => weekdays[day]).join("・");
}

function snapshot(item: ChecklistItem): ItemSnapshot {
  return {
    id: item.id,
    name: item.name,
    category: item.category,
    schedule: item.schedule,
    notesEnabled: item.notesEnabled,
  };
}

export function hasItemRecord(row: ItemRecord): boolean {
  return Boolean(row.done || row.memo || row.effect);
}

export function prepareDraft(
  date: DateKey,
  catalog: ChecklistItem[],
  saved: DayRecord | undefined,
  today: DateKey,
  draft?: DayDraft,
): DayDraft {
  const base = draft ?? saved;
  const previous = base?.items ?? [];
  const previousById = new Map(previous.map((row) => [row.item.id, row]));
  const catalogById = new Map(catalog.map((item) => [item.id, item]));
  const active = catalog.filter((item) => !item.archived);
  const recordedIds = new Set(saved?.items.filter(hasItemRecord).map((row) => row.item.id));

  const items = active.map((definition) => {
    const row = previousById.get(definition.id);
    const item = row && date < today ? row.item : snapshot(definition);
    return { item, done: row?.done ?? false, memo: row?.memo ?? "", effect: row?.effect ?? null };
  });
  // Keep saved activity editable after the checklist definition is deleted.
  for (const row of previous) {
    const definition = catalogById.get(row.item.id);
    if (definition?.archived && hasItemRecord(row)) items.push(row);
    if (!definition && recordedIds.has(row.item.id)) items.push(row);
  }

  return {
    date,
    items,
    memo: base?.memo ?? "",
    revision: base?.revision ?? 0,
    weather: base?.weather,
    mood: base?.mood,
    symptoms: base?.symptoms,
    conditionOverride: base?.conditionOverride,
  };
}

export function doneItems(day: DayDraft | undefined, filter: CalendarFilter = allItems): ItemRecord[] {
  return (day?.items ?? []).filter(({ item, done }) => {
    if (!done) return false;
    if (filter.kind === "category") return item.category === filter.id;
    if (filter.kind === "item") return item.id === filter.id;
    return true;
  });
}

export function heatLevel(day: DayRecord | undefined, filter: CalendarFilter = allItems): string {
  if (!day) return "blank";
  const count = doneItems(day, filter).length;
  if (count >= 4) return "high";
  if (count >= 2) return "medium";
  if (count === 1) return "low";
  return "zero";
}

export function summarizeMonth(records: DayRecord[], key: DateKey, filter: CalendarFilter) {
  const month = key.slice(0, 7);
  const days = records.filter((record) => record.date.slice(0, 7) === month);
  const itemCounts = new Map<string, { id: string; name: string; days: number }>();
  const moodCounts = new Map<Mood, number>(moodIds.map((mood) => [mood, 0]));
  const conditionCounts = new Map<ConditionScore, number>(conditionScores.map((score) => [score, 0]));
  let moodMissing = 0;
  let conditionMissing = 0;
  let total = 0;
  for (const day of days) {
    if (day.mood) moodCounts.set(day.mood, (moodCounts.get(day.mood) ?? 0) + 1);
    else moodMissing += 1;
    const score = conditionScore(day);
    if (score) conditionCounts.set(score, (conditionCounts.get(score) ?? 0) + 1);
    else conditionMissing += 1;
    for (const { item } of doneItems(day, filter)) {
      const count = (itemCounts.get(item.id)?.days ?? 0) + 1;
      itemCounts.set(item.id, { id: item.id, name: item.name, days: count });
      total += 1;
    }
  }
  return {
    days: days.length,
    total,
    itemCounts: [...itemCounts.values()].sort((a, b) => b.days - a.days),
    moodCounts,
    conditionCounts,
    moodMissing,
    conditionMissing,
  };
}

export const starterItems: ChecklistItem[] = [
  { id: "meal", name: "食事をとった", category: "life", schedule: { type: "daily" }, notesEnabled: false, order: 1, archived: false },
  { id: "ready", name: "身支度をした", category: "life", schedule: { type: "daily" }, notesEnabled: false, order: 2, archived: false },
  { id: "plan", name: "予定していた活動に取り組んだ", category: "activity", schedule: { type: "weekly", weekdays: [1, 3, 5] }, notesEnabled: false, order: 3, archived: false },
  { id: "outside", name: "外に出た", category: "activity", schedule: { type: "unscheduled" }, notesEnabled: false, order: 4, archived: false },
  { id: "move", name: "体を動かした", category: "care", schedule: { type: "weekly", weekdays: [2, 4] }, notesEnabled: false, order: 5, archived: false },
  { id: "rest", name: "休む時間をとった", category: "care", schedule: { type: "unscheduled" }, notesEnabled: true, order: 6, archived: false },
];

export function sampleRecords(today: DateKey): DayRecord[] {
  const current = parseISO(today);
  const months = [subMonths(current, 1), current];
  const pattern = [3, 0, 1, null, 4, 2, null, 5, 1, 3, null, 2];
  const profiles: SymptomAnswers[] = [
    { fatigue: "none", sleepiness: "none", discomfort: "none", interference: "none" },
    { fatigue: "some", sleepiness: "none", discomfort: "none", interference: "none" },
    { fatigue: "some", sleepiness: "some", discomfort: "none", interference: "some" },
    { fatigue: "strong", sleepiness: "some", discomfort: "some", interference: "some" },
    { fatigue: "strong", sleepiness: "strong", discomfort: "strong", interference: "some" },
  ];
  return months.flatMap((month) =>
    monthDays(month).flatMap((day, index) => {
      const key = dateKey(day);
      const count = pattern[index % pattern.length];
      if (key >= today || count === null) return [];
      const draft = prepareDraft(key, starterItems, undefined, today);
      return [{
        ...draft,
        items: draft.items.map((row, i) => ({ ...row, done: i < count })),
        memo: index % 4 === 0 ? "少し外の空気を吸って、気分転換できた。" : "",
        weather: weatherOptions[index % weatherOptions.length],
        mood: index % 8 === 1 ? undefined : moodIds[index % moodIds.length],
        symptoms: index % 8 === 2 ? undefined : profiles[index % profiles.length],
        revision: 1,
        savedAt: day.toISOString(),
      }];
    }),
  );
}
