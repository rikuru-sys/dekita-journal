import { parseISO } from "date-fns";
import { describe, expect, it } from "vitest";
import {
  allItems, doneItems, heatLevel, monthDays, prepareDraft, sampleRecords, scheduleLabel,
  starterItems, summarizeMonth, validDateKey,
} from "./model";
import type { DayRecord } from "./model";
import { readScreen, screenLink } from "./navigation";
import { automaticCondition, conditionScore } from "./wellbeing";
import type { SymptomAnswers } from "./wellbeing";

const today = "2026-11-11";

function savedDay(date: string, selectedIds: string[]): DayRecord {
  const draft = prepareDraft(date, starterItems, undefined, today);
  return {
    ...draft,
    items: draft.items.map((row) => ({ ...row, done: selectedIds.includes(row.item.id) })),
    revision: 1,
    savedAt: date + "T12:00:00.000Z",
  };
}

describe("calendar dates", () => {
  it("uses local calendar keys and accepts valid past routes", () => {
    expect(monthDays(parseISO("2024-02-01"))).toHaveLength(29);
    expect(validDateKey("2024-02-29")).toBe(true);
    expect(validDateKey("2026-02-29")).toBe(false);
    expect(readScreen(screenLink("calendar", "2026-11-04"), today))
      .toEqual({ screen: "calendar", date: "2026-11-04" });
    expect(readScreen(screenLink("today", "2026-11-12"), today).date).toBe(today);
  });

  it("distinguishes zero saved activities from a missing record", () => {
    expect(heatLevel(undefined)).toBe("blank");
    expect(heatLevel(savedDay(today, []))).toBe("zero");
    expect(heatLevel(savedDay(today, ["meal"]))).toBe("low");
    expect(heatLevel(savedDay(today, ["meal"]), { kind: "category", id: "care" })).toBe("zero");
  });

  it("summarizes only the selected month and applies an item filter", () => {
    const days = [savedDay("2026-10-31", ["meal"]), savedDay("2026-11-01", ["meal", "rest"]), savedDay(today, [])];
    expect(summarizeMonth(days, today, allItems)).toMatchObject({ total: 2, days: 2 });
    expect(summarizeMonth(days, today, { kind: "item", id: "rest" }))
      .toMatchObject({ total: 1, days: 2, itemCounts: [{ id: "rest", days: 1 }] });
  });

  it("keeps example data separate and excludes today and future dates", () => {
    const samples = sampleRecords(today);
    expect(samples.length).toBeGreaterThan(0);
    expect(samples.every((record) => record.date < today)).toBe(true);
    expect(samples.some((record) => heatLevel(record) === "zero")).toBe(true);
  });
});

describe("気分と体調の集計", () => {
  const mild: SymptomAnswers = { fatigue: "some", sleepiness: "none", discomfort: "none", interference: "none" };

  it("evaluates all four symptoms and lets the saved choice override the estimate", () => {
    expect(automaticCondition({ fatigue: "some" })).toBeUndefined();
    expect(automaticCondition(mild)).toBe(4);
    expect(automaticCondition({ ...mild, fatigue: "none" })).toBe(5);
    expect(automaticCondition({ fatigue: "strong", sleepiness: "strong", discomfort: "strong", interference: "strong" })).toBe(1);
    expect(conditionScore({ symptoms: mild, conditionOverride: 2 })).toBe(2);
  });

  it("preserves wellbeing values in edits and counts entries without a mood or score", () => {
    const recorded: DayRecord = { ...savedDay("2026-11-10", []), mood: "calm", symptoms: mild, conditionOverride: 2 };
    const partial: DayRecord = { ...savedDay("2026-11-09", ["meal"]), mood: "calm", symptoms: { fatigue: "strong" } };
    const old = savedDay("2026-11-08", ["rest"]);
    const outside: DayRecord = { ...recorded, date: "2026-10-31" };
    expect(prepareDraft(recorded.date, starterItems, recorded, today))
      .toMatchObject({ mood: "calm", symptoms: mild, conditionOverride: 2 });

    const totals = summarizeMonth([recorded, partial, old, outside], today, allItems);
    expect(totals.moodCounts.get("calm")).toBe(2);
    expect(totals.moodMissing).toBe(1);
    expect(totals.conditionCounts.get(2)).toBe(1);
    expect(totals.conditionCounts.get(4)).toBe(0);
    expect(totals.conditionMissing).toBe(2);
  });
});

describe("daily activities", () => {
  it("lets an activity be recorded on a day outside its schedule", () => {
    const day = savedDay("2026-11-10", ["plan"]);
    const [activity] = doneItems(day);
    expect(scheduleLabel(activity.item.schedule, day.date)).toBe("予定外");
    expect(scheduleLabel(activity.item.schedule, today)).toBe("月・水・金");
    expect(doneItems(day)).toHaveLength(1);
  });

  it("preserves a past item's name and recorded activity after catalog changes", () => {
    const day = savedDay("2026-11-10", ["meal", "rest"]);
    const catalog = starterItems.map((item) => ({
      ...item,
      name: item.id === "meal" ? "朝食をとった" : item.name,
      archived: item.id === "rest",
    }));
    const pastDraft = prepareDraft(day.date, catalog, day, today);
    expect(doneItems(pastDraft).map(({ item }) => item.name)).toEqual(["食事をとった", "休む時間をとった"]);
    expect(prepareDraft(today, catalog, undefined, today).items.some(({ item }) => item.id === "rest")).toBe(false);
  });

  it("removes a deleted item that was checked only in the unsaved draft", () => {
    const saved = savedDay(today, ["meal"]);
    const draft = {
      ...saved,
      items: saved.items.map((row) => row.item.id === "rest" ? { ...row, done: true } : row),
    };
    const catalog = starterItems.filter(({ id }) => id !== "rest");
    expect(prepareDraft(today, catalog, saved, today, draft).items.some(({ item }) => item.id === "rest")).toBe(false);
    expect(doneItems(prepareDraft(today, catalog, saved, today, draft)).map(({ item }) => item.id)).toEqual(["meal"]);
  });
});
