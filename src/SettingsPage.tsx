import { Bell, Download, HardDrive, SlidersHorizontal, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { createBackup, InvalidBackup, parseBackup, restoreBackup } from "./backup";
import type { JournalBackup } from "./backup";
import { db, RestoreConflict, validReminderTime } from "./db";
import type { JournalSettings, ReminderSettings } from "./db";
import { dateKey } from "./model";
import { IconBadge } from "./ui";

type Feedback = { kind: "error" | "success"; text: string };

function Message({ feedback }: { feedback?: Feedback }) {
  if (!feedback) return null;
  return feedback.kind === "error"
    ? <p className="inline-error" role="alert">{feedback.text}</p>
    : <p className="settings-status" role="status">{feedback.text}</p>;
}

function ReminderCard({ settings, onSave }: {
  settings: JournalSettings;
  onSave: (patch: Partial<ReminderSettings>) => Promise<void>;
}) {
  const [edits, setEdits] = useState<Partial<ReminderSettings>>({});
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>();
  const enabled = edits.reminderEnabled ?? settings.reminderEnabled;
  const time = edits.reminderTime ?? settings.reminderTime;
  const changed = enabled !== settings.reminderEnabled || time !== settings.reminderTime;

  function edit(patch: Partial<ReminderSettings>) {
    setEdits((previous) => ({ ...previous, ...patch }));
    setFeedback(undefined);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !changed) return;
    if (enabled && !validReminderTime(time)) {
      setFeedback({ kind: "error", text: "リマインダーの時刻を入力してください。" });
      return;
    }
    const patch: Partial<ReminderSettings> = {};
    if (enabled !== settings.reminderEnabled) patch.reminderEnabled = enabled;
    if (time !== settings.reminderTime && validReminderTime(time)) patch.reminderTime = time;
    setBusy(true);
    try {
      await onSave(patch);
      setEdits({});
      setFeedback({ kind: "success", text: "リマインダー設定を保存しました。" });
    } catch (error) {
      setFeedback({ kind: "error", text: error instanceof RestoreConflict ? error.message : "設定を保存できませんでした。" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel settings-card" aria-labelledby="reminder-title">
      <header>
        <IconBadge tone="life"><Bell size={18} strokeWidth={1.8} /></IconBadge>
        <h2 id="reminder-title">リマインダー</h2>
      </header>
      <form className="reminder-form" onSubmit={submit}>
        <label className="option-check">
          <input type="checkbox" checked={enabled} disabled={busy} onChange={(event) => edit({ reminderEnabled: event.target.checked })} />
          <span>毎晩のリマインダーを使う</span>
        </label>
        <div className="reminder-controls">
          <label className="reminder-time">
            時刻
            <input type="time" value={time} required={enabled} disabled={busy || !enabled}
              onChange={(event) => edit({ reminderTime: event.target.value })} />
          </label>
          <button className="button primary" type="submit" disabled={busy || !changed}>{busy ? "保存中…" : "設定を保存"}</button>
        </div>
        <Message feedback={feedback} />
      </form>
      <div className="clock-guide">
        <h3>Androidの時計アプリで設定</h3>
        <p>{settings.reminderEnabled
          ? "「時計」→「アラーム」で " + settings.reminderTime + " に設定し、繰り返しの曜日をすべて選びます。時刻を変えたときは、時計アプリ側でも変更します。"
          : "設定済みのアラームを停止するには、時計アプリで対象のアラームをオフにします。"}</p>
        <a href="https://support.google.com/android/answer/2840926?hl=ja" target="_blank" rel="noreferrer">時計アプリの設定手順</a>
      </div>
    </section>
  );
}

interface RestoreSelection {
  filename: string;
  backup: JournalBackup;
  generation: string;
}

function RestoreDialog({ selection, hasDrafts, busy, error, onCancel, onConfirm }: {
  selection: RestoreSelection;
  hasDrafts: boolean;
  busy: boolean;
  error?: Feedback;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    node.showModal();
    return () => node.close();
  }, []);

  return (
    <dialog ref={dialog} className="item-manager" aria-labelledby="restore-title" onCancel={(event) => {
      event.preventDefault();
      if (!busy) onCancel();
    }}>
      <div className="dialog-inner restore-dialog">
        <h2 id="restore-title">バックアップを復元</h2>
        <p className="restore-filename">{selection.filename}</p>
        <p>この端末の記録・チェック項目・リマインダー設定を、バックアップの内容に置き換えます。</p>
        {hasDrafts && <p>保存していない振り返りも取り消されます。</p>}
        <dl className="month-totals restore-counts">
          <div><dt>記録</dt><dd><strong>{selection.backup.days.length}</strong> 日</dd></div>
          <div><dt>チェック項目</dt><dd><strong>{selection.backup.items.length}</strong> 件</dd></div>
        </dl>
        <Message feedback={error} />
        <div className="dialog-actions">
          <button type="button" className="button secondary" autoFocus disabled={busy} onClick={onCancel}>キャンセル</button>
          <button type="button" className="button destructive" disabled={busy} onClick={onConfirm}>{busy ? "復元中…" : "復元する"}</button>
        </div>
      </div>
    </dialog>
  );
}

function BackupCard({ generation, hasDrafts }: { generation: string; hasDrafts: boolean }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [selection, setSelection] = useState<RestoreSelection>();
  const [operation, setOperation] = useState<"export" | "read" | "restore">();
  const [feedback, setFeedback] = useState<Feedback>();

  async function exportFile() {
    setOperation("export");
    setFeedback(undefined);
    try {
      const backup = await createBackup(db);
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "dekita-backup-" + dateKey() + ".json";
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setFeedback({ kind: "success", text: "バックアップを書き出しました。" });
    } catch {
      setFeedback({ kind: "error", text: "バックアップを書き出せませんでした。" });
    } finally {
      setOperation(undefined);
    }
  }

  async function readFile(file: File) {
    setOperation("read");
    setFeedback(undefined);
    try {
      const backup = parseBackup(await file.text());
      setSelection({ filename: file.name, backup, generation });
    } catch (error) {
      setFeedback({
        kind: "error",
        text: error instanceof InvalidBackup ? error.message : "ファイルを読み込めませんでした。",
      });
    } finally {
      setOperation(undefined);
    }
  }

  function cancel() {
    setSelection(undefined);
    setFeedback(undefined);
  }

  async function restore() {
    if (!selection || operation) return;
    setOperation("restore");
    setFeedback(undefined);
    try {
      await restoreBackup(db, selection.backup, selection.generation);
      setSelection(undefined);
      setFeedback({ kind: "success", text: "バックアップから復元しました。" });
    } catch (error) {
      setFeedback({
        kind: "error",
        text: error instanceof RestoreConflict ? error.message : "復元できませんでした。現在の記録を確認してから、もう一度お試しください。",
      });
    } finally {
      setOperation(undefined);
    }
  }

  return (
    <section className="panel settings-card" aria-labelledby="backup-title">
      <header>
        <IconBadge tone="memo"><HardDrive size={18} strokeWidth={1.8} /></IconBadge>
        <h2 id="backup-title">バックアップ</h2>
      </header>
      <p className="card-hint">保存した記録、チェック項目、リマインダー設定をJSONファイルにまとめます。</p>
      <div className="backup-actions">
        <button className="button primary" type="button" disabled={!!operation} onClick={() => void exportFile()}>
          <Download size={17} aria-hidden="true" />{operation === "export" ? "書き出し中…" : "JSONを書き出す"}
        </button>
        <button className="button secondary" type="button" disabled={!!operation} onClick={() => fileInput.current?.click()}>
          <Upload size={17} aria-hidden="true" />{operation === "read" ? "読み込み中…" : "ファイルから復元"}
        </button>
        <input ref={fileInput} type="file" hidden accept=".json,application/json" onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void readFile(file);
        }} />
      </div>
      {!selection && <Message feedback={feedback} />}
      {selection && <RestoreDialog selection={selection} hasDrafts={hasDrafts} busy={operation === "restore"}
        error={feedback} onCancel={cancel} onConfirm={() => void restore()} />}
    </section>
  );
}

export function SettingsPage({ settings, hasDrafts, onManage, onSaveReminder }: {
  settings: JournalSettings;
  hasDrafts: boolean;
  onManage: () => void;
  onSaveReminder: (patch: Partial<ReminderSettings>) => Promise<void>;
}) {
  return (
    <>
      <header className="page-heading"><h1>設定</h1></header>
      <div className="settings-grid">
        <div className="settings-stack">
          <section className="panel settings-card" aria-labelledby="settings-checklist">
            <header>
              <IconBadge tone="mint"><SlidersHorizontal size={18} strokeWidth={1.8} /></IconBadge>
              <h2 id="settings-checklist">チェック項目</h2>
            </header>
            <button className="button secondary" type="button" onClick={onManage}>項目管理</button>
          </section>
          <ReminderCard key={settings.generation} settings={settings} onSave={onSaveReminder} />
        </div>
        <BackupCard generation={settings.generation} hasDrafts={hasDrafts} />
      </div>
    </>
  );
}
