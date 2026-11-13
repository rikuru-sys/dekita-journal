import { liveQuery } from "dexie";
import { CalendarDays, Database, NotebookPen, Settings } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CalendarPage } from "./CalendarPage";
import { ItemManager } from "./ItemManager";
import { ReflectionPage } from "./ReflectionPage";
import { SettingsPage } from "./SettingsPage";
import { db, readSettings, saveDay, saveReminder } from "./db";
import type { JournalSettings } from "./db";
import { dateKey, prepareDraft } from "./model";
import type { ChecklistItem, DateKey, DayDraft, DayRecord } from "./model";
import { readScreen, screenLink } from "./navigation";
import { Brand } from "./ui";

interface StorageSnapshot {
  records: DayRecord[];
  items: ChecklistItem[];
  settings: JournalSettings;
}

function useStorage() {
  const [storage, setStorage] = useState<StorageSnapshot>();
  const [storageError, setStorageError] = useState(false);

  useEffect(() => {
    const subscription = liveQuery(() =>
      db.transaction("r", db.days, db.items, db.settings, async () => ({
        records: await db.days.toArray(),
        items: await db.items.orderBy("order").toArray(),
        settings: await readSettings(db),
      })),
    ).subscribe({
      next: setStorage,
      error: () => setStorageError(true),
    });
    return () => subscription.unsubscribe();
  }, []);

  function applySaved(record: DayRecord, generation: string) {
    setStorage((current) => {
      if (!current || current.settings.generation !== generation) return current;
      const previous = current.records.find(({ date }) => date === record.date);
      if (previous && previous.revision > record.revision) return current;
      const records = [...current.records.filter(({ date }) => date !== record.date), record]
        .sort((left, right) => left.date.localeCompare(right.date));
      return { ...current, records };
    });
  }

  function applySettings(settings: JournalSettings) {
    setStorage((current) => current?.settings.generation === settings.generation ? { ...current, settings } : current);
  }

  return { storage, storageError, applySaved, applySettings };
}

function useToday() {
  const [today, setToday] = useState(() => dateKey());
  useEffect(() => {
    const update = () => setToday(dateKey());
    const timer = window.setInterval(update, 30_000);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  return today;
}

export function App() {
  const today = useToday();
  const [hash, setHash] = useState(() => window.location.hash);
  const route = readScreen(hash, today);
  const { storage, storageError, applySaved, applySettings } = useStorage();
  const [pending, setPending] = useState<{ generation: string; days: Record<DateKey, DayDraft> }>({ generation: "", days: {} });
  const [managerAt, setManagerAt] = useState<string>();
  const main = useRef<HTMLElement>(null);
  const previousScreen = useRef(route.screen);
  const generation = storage?.settings.generation ?? "";
  const drafts = pending.generation === generation ? pending.days : {};
  const dirty = Object.keys(drafts).length > 0;

  useEffect(() => {
    const update = () => setHash(window.location.hash);
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);

  useEffect(() => {
    if (previousScreen.current === route.screen) return;
    previousScreen.current = route.screen;
    window.scrollTo(0, 0);
    main.current?.focus({ preventScroll: true });
  }, [route.screen]);

  useEffect(() => {
    if (!dirty) return;
    const confirmLeave = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", confirmLeave);
    return () => window.removeEventListener("beforeunload", confirmLeave);
  }, [dirty]);

  const saved = storage?.records.find((day) => day.date === route.date);
  const changed = drafts[route.date];

  function clearDraft(date: DateKey, expected = drafts[date]) {
    setPending((current) => {
      if (current.generation !== generation || current.days[date] !== expected) return current;
      const days = { ...current.days };
      delete days[date];
      return { generation, days };
    });
  }

  function changeDraft(draft: DayDraft) {
    setPending((current) => ({
      generation,
      days: { ...(current.generation === generation ? current.days : {}), [draft.date]: draft },
    }));
  }

  async function save(draft: DayDraft) {
    const draftAtSave = drafts[draft.date];
    const record = await saveDay(db, draft, generation);
    applySaved(record, generation);
    clearDraft(draft.date, draftAtSave);
  }

  return (
    <div className="shell">
      <a href="#main-content" className="skip-link" onClick={(event) => {
        event.preventDefault();
        main.current?.focus();
      }}>本文へ移動</a>
      <aside className="sidebar">
        <a className="brand-link" href={screenLink("today")} aria-label="できたこと記録 ホーム">
          <Brand />
        </a>
        <nav className="nav" aria-label="メインナビゲーション">
          <a href={screenLink("today")} aria-current={route.screen === "today" ? "page" : undefined}>
            <NotebookPen size={20} strokeWidth={1.8} aria-hidden="true" />
            <span>振り返り</span>
          </a>
          <a href={screenLink("calendar", route.date)} aria-current={route.screen === "calendar" ? "page" : undefined}>
            <CalendarDays size={20} strokeWidth={1.8} aria-hidden="true" />
            <span>カレンダー</span>
          </a>
          <a href={screenLink("settings")} aria-current={route.screen === "settings" ? "page" : undefined}>
            <Settings size={20} strokeWidth={1.8} aria-hidden="true" />
            <span>設定</span>
          </a>
        </nav>
        <div className="storage-note">
          <Database size={16} strokeWidth={1.7} aria-hidden="true" />
          <span>記録はこの端末に保存</span>
        </div>
      </aside>

      <main className="main" ref={main} id="main-content" tabIndex={-1}>
        {storageError ? (
          <section className="panel storage-error" role="alert">
            <h1>記録を開けませんでした</h1>
            <p>ブラウザーでサイトデータを保存できる状態にして、もう一度開いてください。</p>
            <button className="button primary" type="button" onClick={() => window.location.reload()}>再読み込み</button>
          </section>
        ) : !storage ? (
          <p className="loading" role="status">記録を読み込み中…</p>
        ) : route.screen === "today" ? (
          <ReflectionPage
            key={generation + "/" + route.date}
            date={route.date}
            today={today}
            saved={saved}
            draft={prepareDraft(route.date, storage.items, saved, today, changed)}
            catalog={storage.items}
            changed={Boolean(changed)}
            onChange={changeDraft}
            onDiscard={() => clearDraft(route.date)}
            onSave={save}
            onManage={() => setManagerAt(generation)}
          />
        ) : route.screen === "calendar" ? (
          <CalendarPage
            date={route.date}
            today={today}
            records={storage.records}
            items={storage.items}
          />
        ) : (
          <SettingsPage
            settings={storage.settings}
            hasDrafts={dirty}
            onManage={() => setManagerAt(generation)}
            onSaveReminder={async (patch) => applySettings(await saveReminder(db, patch, generation))}
          />
        )}
      </main>

      {managerAt === generation && storage && (
        <ItemManager items={storage.items} generation={generation} onClose={() => setManagerAt(undefined)} />
      )}
    </div>
  );
}
