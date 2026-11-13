import { addMonths, addYears, format, parseISO, startOfMonth, startOfYear } from "date-fns";
import { ArrowRight, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Filter, NotebookPen } from "lucide-react";
import { useMemo, useState } from "react";
import {
  allItems, careEffects, categories, dateKey, dateLabel, doneItems, hasItemRecord, heatLevel,
  monthDays, sampleRecords, summarizeMonth, weekdays,
} from "./model";
import type { CalendarFilter, CategoryId, ChecklistItem, DateKey, DayRecord } from "./model";
import { screenLink } from "./navigation";
import { IconBadge } from "./ui";
import { conditionLabels, conditionScore, conditionScores, moodIds, moods, severities, symptomFields } from "./wellbeing";

type View = "month" | "year";
type DisplayMode = "items" | "mood" | "condition";

const calendarModes: { id: DisplayMode; label: string }[] = [
  { id: "items", label: "できたこと" },
  { id: "mood", label: "気分" },
  { id: "condition", label: "体調" },
];

function calendarMark(record: DayRecord | undefined, mode: DisplayMode, filter: CalendarFilter) {
  if (!record) return { level: "blank", label: "未記録" };
  if (mode === "mood") {
    if (!record.mood) return { level: "zero", label: "気分は未入力", text: "–" };
    const mood = moods[record.mood];
    return { level: "mood-" + record.mood, label: mood.label, text: mood.emoji };
  }
  if (mode === "condition") {
    const score = conditionScore(record);
    return score
      ? { level: "condition-" + score, label: "体調 " + score + " " + conditionLabels[score], text: String(score) }
      : { level: "zero", label: "体調は未評価", text: "–" };
  }
  const count = doneItems(record, filter).length;
  return { level: heatLevel(record, filter), label: count + "件で記録済み", text: count + "件" };
}

function HeatLegend({ filter, mode }: { filter: CalendarFilter; mode: DisplayMode }) {
  const activityLegend = [
    { level: "blank", label: "未記録" },
    { level: "zero", label: "0件" },
    { level: "low", label: "1件" },
    { level: "medium", label: "2〜3件" },
    { level: "high", label: "4件以上" },
  ];
  const moodLegend = [
    activityLegend[0],
    { level: "zero", label: "気分未入力" },
    ...moodIds.map((id) => ({ level: "mood-" + id, label: moods[id].emoji + " " + moods[id].label })),
  ];
  const conditionLegend = [
    activityLegend[0],
    { level: "zero", label: "体調未評価" },
    ...conditionScores.map((score) => ({ level: "condition-" + score, label: score + " " + conditionLabels[score] })),
  ];
  const legend = mode === "mood" ? moodLegend : mode === "condition" ? conditionLegend
    : activityLegend.slice(0, filter.kind === "item" ? 3 : activityLegend.length);
  return (
    <ul className="heat-legend" aria-label="色の凡例">
      {legend.map(({ level, label }) => (
        <li key={level}><span className="heat-swatch" data-level={level} aria-hidden="true" />{label}</li>
      ))}
    </ul>
  );
}

interface GridProps {
  month: Date;
  date: DateKey;
  today: DateKey;
  records: Map<DateKey, DayRecord>;
  filter: CalendarFilter;
  mode: DisplayMode;
  onSelect: (day: DateKey) => void;
}

function MonthGrid({ month, date, today, records, filter, mode, onSelect }: GridProps) {
  const dates = monthDays(month);
  return (
    <div className="month-grid" role="group" aria-label={format(month, "yyyy年M月") + "の日付"}>
      {weekdays.map((name, index) => <span className={"weekday weekday-" + index} key={name} aria-hidden="true">{name}</span>)}
      {Array.from({ length: dates[0].getDay() }, (_, i) => <span key={"pad-" + i} aria-hidden="true" />)}
      {dates.map((day) => {
        const key = dateKey(day);
        const future = key > today;
        const mark = calendarMark(records.get(key), mode, filter);
        return (
          <button
            className={"day-cell weekday-" + day.getDay()}
            type="button"
            key={key}
            disabled={future}
            data-level={mark.level}
            aria-current={key === today ? "date" : undefined}
            aria-pressed={key === date}
            aria-label={dateLabel(key) + "、" + (future ? "未来の日付" : mark.label)}
            onClick={() => onSelect(key)}
          >
            <span className="day-number">{day.getDate()}</span>
            {mark.text && <span className={"day-count day-value-" + mode}>{mark.text}</span>}
          </button>
        );
      })}
    </div>
  );
}

function YearGrid({ month, today, records, filter, mode, onSelect }: Omit<GridProps, "date">) {
  const year = startOfYear(month);
  return (
    <div className="year-grid">
      {Array.from({ length: 12 }, (_, i) => {
        const monthStart = addMonths(year, i);
        const firstDay = dateKey(monthStart);
        const days = monthDays(monthStart);
        const marks = days.map((day) => {
          const key = dateKey(day);
          return { key, ...calendarMark(records.get(key), mode, filter) };
        });
        const count = marks.filter(({ level }) => mode === "items" ? level !== "blank" : level !== "blank" && level !== "zero").length;
        const countLabel = mode === "mood" ? "気分を入力" : mode === "condition" ? "体調を評価" : "記録";
        return (
          <button className="year-month" type="button" key={firstDay} disabled={firstDay > today}
            aria-label={format(monthStart, "M月") + "、" + countLabel + count + "日"}
            onClick={() => onSelect(firstDay)}>
            <span className="year-month-header"><span>{i + 1}<span>月</span></span><ChevronRight size={16} aria-hidden="true" /></span>
            <span className="mini-grid" aria-hidden="true">
              {Array.from({ length: monthStart.getDay() }, (_, index) => <span key={"pad-" + index} />)}
              {marks.map(({ key, level }) => <span className="mini-day" key={key} data-level={level} />)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function DayWellbeing({ record }: { record: DayRecord }) {
  const mood = record.mood;
  const score = conditionScore(record);
  const symptoms = symptomFields.flatMap(({ id, label }) => {
    const severity = record.symptoms?.[id];
    return severity ? [{ id, label, severity }] : [];
  });
  if (!mood && !score && symptoms.length === 0) return null;

  return (
    <div className="day-wellbeing">
      <dl>
        {mood && (
          <div>
            <dt>気分</dt>
            <dd><span className="wellbeing-mark" data-level={"mood-" + mood}>{moods[mood].emoji} {moods[mood].label}</span></dd>
          </div>
        )}
        {(score || symptoms.length > 0) && (
          <div>
            <dt>体調</dt>
            <dd>{score ? <span className="wellbeing-mark" data-level={"condition-" + score}>{score} {conditionLabels[score]}</span> : "未評価"}</dd>
          </div>
        )}
      </dl>
      {symptoms.length > 0 && (
        <dl className="day-symptoms" aria-label="記録した症状">
          {symptoms.map(({ id, label, severity }) => <div key={id}><dt>{label}</dt><dd>{severities[severity].label}</dd></div>)}
        </dl>
      )}
    </div>
  );
}

function DayDetails({
  date, record, filter, showingSamples, onCloseSamples,
}: {
  date: DateKey;
  record?: DayRecord;
  filter: CalendarFilter;
  showingSamples: boolean;
  onCloseSamples: () => void;
}) {
  const achievements = doneItems(record, filter);
  return (
    <section className="panel day-details" aria-labelledby="day-details-title">
      <header>
        <IconBadge tone="mint"><CalendarDays size={18} strokeWidth={1.8} /></IconBadge>
        <h2 id="day-details-title"><time dateTime={date}>{dateLabel(date)}</time></h2>
      </header>
      {record ? (
        <div className="day-details-content">
          <p className="day-total"><span>できたこと</span><span><strong>{achievements.length}</strong> 件</span></p>
          {achievements.length > 0 && (
            <ul className="day-items">
              {achievements.map(({ item, memo, effect }) => (
                <li key={item.id}>
                  <Check size={16} strokeWidth={2.1} aria-hidden="true" />
                  <div>
                    <span>{item.name}</span>
                    {memo && <p>{memo}</p>}
                    {effect && <p>{careEffects[effect]}</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <DayWellbeing record={record} />
          {record.memo && (
            <div className="day-memo">
              <h3><NotebookPen size={15} aria-hidden="true" />ひとことメモ</h3>
              <p>{record.memo}</p>
            </div>
          )}
        </div>
      ) : (
        <p className="day-empty">この日はまだ記録がありません。</p>
      )}
      {showingSamples ? (
        <button className="button secondary day-action" type="button" onClick={onCloseSamples}>自分の記録を表示</button>
      ) : (
        <a className="button primary day-action" href={screenLink("today", date)}>
          {record ? "この日の記録を編集" : "この日を記録する"}<ArrowRight size={17} aria-hidden="true" />
        </a>
      )}
    </section>
  );
}

function Distribution({ title, open, rows }: {
  title: string;
  open: boolean;
  rows: { level: string; label: string; count: number }[];
}) {
  return (
    <details className="month-items" open={open}>
      <summary>{title}<ChevronDown size={16} aria-hidden="true" /></summary>
      <dl>
        {rows.map(({ level, label, count }) => (
          <div key={level}>
            <dt className="distribution-label"><span className="heat-swatch" data-level={level} aria-hidden="true" />{label}</dt>
            <dd>{count}日</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

function MonthSummary({ records, date, filter, mode }: { records: DayRecord[]; date: DateKey; filter: CalendarFilter; mode: DisplayMode }) {
  const { days, total, itemCounts, moodCounts, conditionCounts, moodMissing, conditionMissing } = summarizeMonth(records, date, filter);
  return (
    <section className="panel month-summary" aria-labelledby="month-summary-title">
      <h2 id="month-summary-title">月間集計</h2>
      <dl className="month-totals">
        <div><dt>できたこと</dt><dd><strong>{total}</strong> 件</dd></div>
        <div><dt>記録した日</dt><dd><strong>{days}</strong> 日</dd></div>
      </dl>
      {itemCounts.length > 0 && (
        <details className="month-items">
          <summary>項目別の実施日数<ChevronDown size={16} aria-hidden="true" /></summary>
          <dl>
            {itemCounts.map(({ id, name, days: itemDays }) => (
              <div key={id}><dt>{name}</dt><dd>{itemDays}日</dd></div>
            ))}
          </dl>
        </details>
      )}
      <Distribution title="気分の分布" open={mode === "mood"} rows={[
        ...moodIds.map((id) => ({ level: "mood-" + id, label: moods[id].label, count: moodCounts.get(id) ?? 0 })),
        { level: "zero", label: "未入力", count: moodMissing },
      ]} />
      <Distribution title="体調の分布" open={mode === "condition"} rows={[
        ...conditionScores.map((score) => ({ level: "condition-" + score, label: score + " " + conditionLabels[score], count: conditionCounts.get(score) ?? 0 })),
        { level: "zero", label: "未評価", count: conditionMissing },
      ]} />
    </section>
  );
}

function decodeFilter(value: string): CalendarFilter {
  if (value.startsWith("category:")) return { kind: "category", id: value.slice(9) as CategoryId };
  if (value.startsWith("item:")) return { kind: "item", id: value.slice(5) };
  return allItems;
}

export function CalendarPage({ date, today, records, items }: {
  date: DateKey;
  today: DateKey;
  records: DayRecord[];
  items: ChecklistItem[];
}) {
  const [view, setView] = useState<View>("month");
  const [mode, setMode] = useState<DisplayMode>("items");
  const [filterValue, setFilterValue] = useState("all");
  const [showingSamples, setShowingSamples] = useState(false);
  const samples = useMemo(() => showingSamples ? sampleRecords(today) : [], [showingSamples, today]);
  const shownRecords = useMemo(() => showingSamples ? samples : records.filter((record) => record.date <= today), [showingSamples, samples, records, today]);
  const recordsByDate = useMemo(() => new Map(shownRecords.map((record) => [record.date, record])), [shownRecords]);
  const itemNames = useMemo(() => {
    const names = new Map<string, string>();
    if (!showingSamples) {
      for (const item of items) names.set(item.id, item.name + (item.archived ? "（アーカイブ済み）" : ""));
    }
    for (const { items: dayItems } of shownRecords) {
      for (const row of dayItems) {
        const { id, name } = row.item;
        if (showingSamples) names.set(id, name);
        else if (!names.has(id) && hasItemRecord(row)) names.set(id, name + "（削除済み）");
      }
    }
    return names;
  }, [shownRecords, items, showingSamples]);

  const selectedFilter = decodeFilter(filterValue);
  const filter = mode !== "items" || (selectedFilter.kind === "item" && !itemNames.has(selectedFilter.id)) ? allItems : selectedFilter;
  const month = parseISO(date);
  const periodStart = view === "month" ? startOfMonth(month) : startOfYear(month);
  const step = view === "month" ? addMonths : addYears;
  const previous = dateKey(step(periodStart, -1));
  const next = dateKey(step(periodStart, 1));
  const atCurrentPeriod = view === "month" ? date.slice(0, 7) === today.slice(0, 7) : date.slice(0, 4) === today.slice(0, 4);

  function selectDate(day: DateKey) {
    window.location.hash = screenLink("calendar", day);
  }

  function setSamples(nextValue: boolean) {
    setFilterValue("all");
    setShowingSamples(nextValue);
  }

  return (
    <>
      <header className="page-heading">
        <div>
          <h1>カレンダー</h1>
          <p>日付を選んで、その日の記録を振り返れます。</p>
        </div>
        <div className="segmented" role="group" aria-label="表示期間">
          <button type="button" aria-pressed={view === "month"} onClick={() => setView("month")}>月間</button>
          <button type="button" aria-pressed={view === "year"} onClick={() => setView("year")}>年間</button>
        </div>
      </header>

      <div className="calendar-tools">
        <div className="segmented calendar-modes" role="group" aria-label="表示する記録">
          {calendarModes.map(({ id, label }) => (
            <button key={id} type="button" aria-pressed={mode === id} onClick={() => setMode(id)}>{label}</button>
          ))}
        </div>
        {mode === "items" && (
          <label className="filter-control">
            <Filter size={17} strokeWidth={1.8} aria-hidden="true" />
            <span className="sr-only">カレンダーの表示対象</span>
            <select value={filter.kind === "all" ? "all" : filterValue} onChange={(event) => setFilterValue(event.target.value)}>
              <option value="all">すべての項目</option>
              <optgroup label="カテゴリ別">
                {categories.map(({ id, label }) => <option key={id} value={"category:" + id}>{label}</option>)}
              </optgroup>
              <optgroup label="項目別">
                {[...itemNames].map(([id, name]) => <option key={id} value={"item:" + id}>{name}</option>)}
              </optgroup>
            </select>
          </label>
        )}
        <button className="button quiet sample-toggle" type="button" aria-pressed={showingSamples}
          onClick={() => setSamples(!showingSamples)}>{showingSamples ? "見本を閉じる" : "見本を表示"}</button>
      </div>
      {showingSamples && <p className="sample-notice" role="status">見本の記録を表示中</p>}

      <div className={view === "month" ? "calendar-layout" : "calendar-layout year-layout"}>
        <section className="panel calendar-panel" aria-labelledby="period-title">
          <header className="calendar-header">
            <div className="period-control">
              <button className="icon-button" type="button" aria-label={view === "month" ? "前の月" : "前の年"}
                onClick={() => selectDate(previous)}><ChevronLeft size={21} aria-hidden="true" /></button>
              <h2 id="period-title" aria-live="polite">{format(month, view === "month" ? "yyyy年M月" : "yyyy年")}</h2>
              <button className="icon-button" type="button" aria-label={view === "month" ? "次の月" : "次の年"}
                disabled={atCurrentPeriod} onClick={() => selectDate(next)}><ChevronRight size={21} aria-hidden="true" /></button>
            </div>
            <button className="button secondary current-date-button" type="button" onClick={() => selectDate(today)}>今日</button>
          </header>
          {view === "month" ? (
            <MonthGrid month={month} date={date} today={today} records={recordsByDate} filter={filter} mode={mode} onSelect={selectDate} />
          ) : (
            <YearGrid month={month} today={today} records={recordsByDate} filter={filter} mode={mode}
              onSelect={(day) => { selectDate(day); setView("month"); }} />
          )}
          <HeatLegend filter={filter} mode={mode} />
        </section>
        {view === "month" && (
          <div className="calendar-side">
            <DayDetails date={date} record={recordsByDate.get(date)} filter={filter} showingSamples={showingSamples}
              onCloseSamples={() => setSamples(false)} />
            <MonthSummary records={shownRecords} date={date} filter={filter} mode={mode} />
          </div>
        )}
      </div>
    </>
  );
}
