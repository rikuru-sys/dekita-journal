import { CalendarDays, Check, ChevronDown, CircleCheck, Leaf, NotebookPen, SlidersHorizontal } from "lucide-react";
import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { RecordConflict, RestoreConflict } from "./db";
import { careEffects, categories, dateLabel, doneItems, MAX_DAY_MEMO, MAX_ITEM_MEMO, scheduleLabel, weatherOptions } from "./model";
import type { CareEffect, ChecklistItem, DateKey, DayDraft, DayRecord, ItemRecord } from "./model";
import { screenLink } from "./navigation";
import { CategoryIcon, IconBadge, WeatherLabel } from "./ui";
import { WellbeingFields } from "./WellbeingFields";

function ChecklistRow({
  row,
  date,
  deleted,
  disabled,
  onChange,
}: {
  row: ItemRecord;
  date: DateKey;
  deleted: boolean;
  disabled: boolean;
  onChange: (patch: Partial<Pick<ItemRecord, "done" | "memo" | "effect">>) => void;
}) {
  const { item, done, memo, effect } = row;
  return (
    <li className="checklist-entry">
      <label className="check-row">
        <input type="checkbox" checked={done} disabled={disabled} onChange={(event) => onChange({ done: event.target.checked })} />
        <span className="checkmark" aria-hidden="true"><Check size={17} strokeWidth={2.5} /></span>
        <span className="check-title">{item.name}</span>
        <span className="schedule-tag">{deleted ? "削除済み" : scheduleLabel(item.schedule, date)}</span>
      </label>
      {(item.notesEnabled || memo || effect) && (
        <details className="item-notes">
          <summary><NotebookPen size={14} aria-hidden="true" />{item.category === "care" ? "内容・効果" : "メモ"}<ChevronDown size={15} aria-hidden="true" /></summary>
          <div className="item-note-fields">
            <label>
              {item.category === "care" ? "実施した内容" : "項目のメモ"}
              <textarea value={memo} maxLength={MAX_ITEM_MEMO} disabled={disabled} rows={2}
                placeholder={item.category === "care" ? "例：目元を温めた" : "気づいたことなど"}
                onChange={(event) => onChange({ memo: event.target.value })} />
            </label>
            {(item.category === "care" || effect) && (
              <label>
                実施後の変化
                <select value={effect ?? ""} disabled={disabled}
                  onChange={(event) => onChange({ effect: event.target.value as CareEffect || null })}>
                  <option value="">選ばない</option>
                  {Object.entries(careEffects).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
            )}
          </div>
        </details>
      )}
    </li>
  );
}

interface ReflectionProps {
  date: DateKey;
  today: DateKey;
  saved: DayRecord | undefined;
  draft: DayDraft;
  catalog: ChecklistItem[];
  changed: boolean;
  onChange: (draft: DayDraft) => void;
  onDiscard: () => void;
  onSave: (draft: DayDraft) => Promise<void>;
  onManage: () => void;
}

export function ReflectionPage({ date, today, saved, draft, catalog, changed, onChange, onDiscard, onSave, onManage }: ReflectionProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const isToday = date === today;
  const count = doneItems(draft).length;
  const catalogIds = new Set(catalog.map(({ id }) => id));
  const conflict = changed && draft.revision !== (saved?.revision ?? 0);
  const status = changed ? "未保存の変更あり" : saved ? "保存済み" : "未記録";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || conflict) return;
    inFlight.current = true;
    setSaving(true);
    setError("");
    try {
      await onSave(draft);
    } catch (cause) {
      setError(cause instanceof RecordConflict || cause instanceof RestoreConflict
        ? cause.message : "保存できませんでした。もう一度お試しください。");
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  function changeRow(id: string, patch: Partial<Pick<ItemRecord, "done" | "memo" | "effect">>) {
    onChange({ ...draft, items: draft.items.map((row) => row.item.id === id ? { ...row, ...patch } : row) });
  }

  return (
    <>
      <header className="page-heading">
        <div>
          <h1>{isToday ? "今日の振り返り" : "この日の振り返り"}</h1>
          <p><time dateTime={date}>{dateLabel(date, true)}</time></p>
        </div>
        <a className="button secondary date-link" href={screenLink("calendar", date)}>
          <CalendarDays size={17} aria-hidden="true" /><span>日付を選ぶ</span>
        </a>
      </header>

      <section className="reflection-hero" aria-label="チェックした項目の数">
        <div className="hero-copy">
          <h2><Leaf size={18} strokeWidth={1.8} aria-hidden="true" />{isToday ? "今日できたこと" : "この日できたこと"}</h2>
          <p className="hero-count" aria-live="polite"><strong>{count}</strong><span>件</span></p>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="hero-sun" />
          <img src={import.meta.env.BASE_URL + "plant.webp"} alt="" width="360" height="260" />
        </div>
      </section>

      <form className="reflection-grid" onSubmit={submit}>
        <section className="panel weather-card" aria-labelledby="weather-title">
          <header>
            <h2 id="weather-title">天気</h2>
            <span className="optional">任意</span>
          </header>
          <div className="weather-options" role="group" aria-label="天気を選ぶ">
            {weatherOptions.map((weather) => (
              <button key={weather} type="button" className="button secondary" data-weather={weather}
                aria-pressed={draft.weather === weather} disabled={saving}
                onClick={() => onChange({ ...draft, weather: draft.weather === weather ? undefined : weather })}>
                <WeatherLabel weather={weather} />
              </button>
            ))}
          </div>
        </section>
        <div className="reflection-primary">
          <section className="checklist" aria-labelledby="checklist-title">
            <div className="section-heading">
              <div>
                <h2 id="checklist-title">できたことリスト</h2>
                <p>当てはまることにチェックを入れましょう。</p>
              </div>
              <button className="button quiet manage-button" type="button" disabled={saving} onClick={onManage}>
                <SlidersHorizontal size={16} aria-hidden="true" />項目管理
              </button>
            </div>

            {draft.items.length === 0 && <p className="panel empty-list">「項目管理」からチェック項目を追加できます。</p>}
            <div className="category-stack">
              {categories.map((category) => {
                const rows = draft.items.filter(({ item }) => item.category === category.id);
                if (rows.length === 0) return null;
                return (
                  <section className="panel category-card" key={category.id} aria-labelledby={"group-" + category.id}>
                    <header><CategoryIcon category={category.id} /><h3 id={"group-" + category.id}>{category.label}</h3></header>
                    <ul>
                      {rows.map((row) => (
                        <ChecklistRow key={row.item.id} row={row} date={date} deleted={!catalogIds.has(row.item.id)} disabled={saving}
                          onChange={(patch) => changeRow(row.item.id, patch)} />
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          </section>
          <WellbeingFields value={draft} disabled={saving} onChange={(patch) => onChange({ ...draft, ...patch })} />
        </div>

        <div className="reflection-side">
          <section className="panel memo-card" aria-labelledby="memo-title">
            <header>
              <IconBadge tone="memo"><NotebookPen size={18} strokeWidth={1.8} /></IconBadge>
              <h2 id="memo-title"><label htmlFor="day-memo">ひとことメモ</label></h2>
              <span className="optional">任意</span>
            </header>
            <textarea id="day-memo" rows={5} maxLength={MAX_DAY_MEMO} disabled={saving}
              value={draft.memo}
              placeholder="今日のこと、気づいたことなど"
              onChange={(event) => onChange({ ...draft, memo: event.target.value })} />
          </section>

          <div className="save-dock">
            {(error || conflict) && (
              <div className="save-error" role="alert">
                {conflict ? "別の画面でこの日の記録が更新されました。" : error}
                {conflict && <button type="button" className="button secondary" onClick={() => { onDiscard(); setError(""); }}>最新の記録を開く</button>}
              </div>
            )}
            <button className="button primary save-button" disabled={saving || conflict || (Boolean(saved) && !changed)} type="submit">
              <Check size={19} strokeWidth={2.3} aria-hidden="true" />{saving ? "保存中…" : "振り返りを保存"}
            </button>
            <p className={"record-status status-" + (changed ? "changed" : saved ? "saved" : "blank")} role="status">
              {saved && !changed ? <CircleCheck size={15} aria-hidden="true" /> : <span className="status-dot" aria-hidden="true" />}
              {status}
            </p>
          </div>
        </div>
      </form>
    </>
  );
}
