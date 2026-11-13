import { Archive, ArrowDown, ArrowDownUp, ArrowLeft, ArrowUp, Check, ChevronDown, Pencil, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { db, deleteChecklistItem, moveChecklistItem, saveItem, setChecklistArchived } from "./db";
import type { EditableItem } from "./db";
import { categories, MAX_ITEM_NAME, scheduleLabel, weekdayIndexes, weekdays } from "./model";
import type { CategoryId, ChecklistItem, Schedule, Weekday } from "./model";
import { CategoryIcon } from "./ui";

interface ItemForm extends EditableItem {
  id?: string;
}

const newItem: ItemForm = { name: "", category: "life", schedule: { type: "daily" }, notesEnabled: false };

export function ItemManager({ items, generation, onClose }: { items: ChecklistItem[]; generation: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState<ItemForm>();
  const [reordering, setReordering] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ChecklistItem>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const active = items.filter((item) => !item.archived);
  const archived = items.filter((item) => item.archived);
  const groups = categories.map((category) => ({
    ...category,
    items: active.filter((item) => item.category === category.id),
  })).filter((category) => category.items.length > 0);
  const editingItem = items.find((item) => item.id === form?.id);

  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    node.showModal();
    return () => node.close();
  }, []);

  function edit(next: ItemForm | undefined) {
    setError("");
    setForm(next);
  }

  async function run(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setAnnouncement("");
    try {
      await action();
    } catch {
      setError("項目管理の変更を保存できませんでした。もう一度お試しください。");
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    const { id, name, category, schedule, notesEnabled } = form;
    if (!name.trim()) {
      setError("項目名を入力してください。");
      return;
    }
    if (schedule.type === "weekly" && schedule.weekdays.length === 0) {
      setError("曜日を1つ以上選んでください。");
      return;
    }
    void run(async () => {
      await saveItem({ name: name.trim(), category, schedule, notesEnabled }, id, generation);
      edit(undefined);
    });
  }

  function changeSchedule(type: Schedule["type"]) {
    if (!form) return;
    setForm({ ...form, schedule: type === "weekly" ? { type, weekdays: [] } : { type } });
  }

  function toggleWeekday(day: Weekday) {
    if (!form || form.schedule.type !== "weekly") return;
    const selected = form.schedule.weekdays;
    const next = selected.includes(day) ? selected.filter((value) => value !== day) : [...selected, day].sort((a, b) => a - b);
    setForm({ ...form, schedule: { type: "weekly", weekdays: next } });
  }

  function archiveItem(id: string, shouldArchive: boolean) {
    void run(async () => {
      await setChecklistArchived(db, id, shouldArchive, generation);
      edit(undefined);
    });
  }

  function requestDelete(item?: ChecklistItem) {
    setError("");
    setPendingDelete(item);
  }

  function confirmDelete(item: ChecklistItem) {
    void run(async () => {
      await deleteChecklistItem(db, item.id, generation);
      requestDelete();
      edit(undefined);
      setAnnouncement("「" + item.name + "」を削除しました。");
    });
  }

  function moveItem(item: ChecklistItem, direction: "up" | "down") {
    void run(async () => {
      const position = await moveChecklistItem(db, item.id, direction, generation);
      if (position) setAnnouncement("「" + item.name + "」を" + position + "番目に移動しました。");
    });
  }

  const title = pendingDelete ? "項目を削除"
    : form ? form.id ? "項目を編集" : "項目を追加"
    : reordering ? "項目の並び替え" : "項目管理";

  return (
    <dialog className="item-manager" ref={dialog} aria-labelledby="manager-title" onCancel={(event) => {
      event.preventDefault();
      if (busy) return;
      if (pendingDelete) requestDelete();
      else onClose();
    }}>
      <div className="dialog-inner">
        <header className="dialog-header">
          <div>
            <h2 id="manager-title">{title}</h2>
          </div>
          <button type="button" className="icon-button" aria-label="項目管理を閉じる" onClick={onClose} disabled={busy}>
            <X size={23} aria-hidden="true" />
          </button>
        </header>
        {pendingDelete ? (
          <div className="item-delete-confirmation">
            <p>「{pendingDelete.name}」をチェック項目から削除します。保存済みの記録はカレンダーで見返せます。</p>
            {error && <p className="inline-error" role="alert">{error}</p>}
            <div className="dialog-actions">
              <button type="button" className="button secondary" autoFocus onClick={() => requestDelete()} disabled={busy}>キャンセル</button>
              <button type="button" className="button destructive" onClick={() => confirmDelete(pendingDelete)} disabled={busy}>削除する</button>
            </div>
          </div>
        ) : form ? (
          <form className="item-form" onSubmit={submit}>
            <label>
              項目名
              <input value={form.name} required maxLength={MAX_ITEM_NAME} disabled={busy}
                placeholder="例：温かい飲み物を飲んだ" onChange={(event) => setForm({ ...form, name: event.target.value })} />
            </label>
            <div className="item-form-row">
              <label>
                カテゴリ
                <select value={form.category} disabled={busy} onChange={(event) => setForm({ ...form, category: event.target.value as CategoryId })}>
                  {categories.map(({ id, label }) => <option value={id} key={id}>{label}</option>)}
                </select>
              </label>
              <label>
                予定
                <select value={form.schedule.type} disabled={busy} onChange={(event) => changeSchedule(event.target.value as Schedule["type"])}>
                  <option value="daily">毎日</option>
                  <option value="weekly">指定曜日</option>
                  <option value="unscheduled">予定なし</option>
                </select>
              </label>
            </div>
            {form.schedule.type === "weekly" && (
              <div className="weekday-picker" role="group" aria-label="予定する曜日">
                {weekdayIndexes.map((day) => (
                  <button key={day} type="button" disabled={busy}
                    aria-pressed={form.schedule.type === "weekly" && form.schedule.weekdays.includes(day)}
                    onClick={() => toggleWeekday(day)}>{weekdays[day]}</button>
                ))}
              </div>
            )}
            <label className="option-check">
              <input type="checkbox" checked={form.notesEnabled} disabled={busy}
                onChange={(event) => setForm({ ...form, notesEnabled: event.target.checked })} />
              <span>{form.category === "care" ? "メモと効果の欄をつける" : "メモ欄をつける"}</span>
            </label>
            {error && <p className="inline-error" role="alert">{error}</p>}
            <div className="dialog-actions">
              <button type="button" className="button quiet" onClick={() => edit(undefined)} disabled={busy}>
                <ArrowLeft size={17} aria-hidden="true" />項目一覧
              </button>
              <button type="submit" className="button primary" disabled={busy}>{form.id ? "変更を保存" : "追加する"}</button>
            </div>
            {editingItem && (
              <div className="item-maintenance-actions">
                <button type="button" className="button quiet" onClick={() => archiveItem(editingItem.id, true)} disabled={busy}>
                  <Archive size={16} aria-hidden="true" />アーカイブする
                </button>
                <button type="button" className="button quiet danger-action" onClick={() => requestDelete(editingItem)} disabled={busy}>
                  <Trash2 size={16} aria-hidden="true" />項目を削除
                </button>
              </div>
            )}
          </form>
        ) : (
          <div className="manager-list">
            {(active.length > 0 || reordering) && (
              <div className="manager-toolbar">
                {reordering && <p>カテゴリ内で上下に移動できます。</p>}
                <button type="button" className="button secondary" disabled={busy} onClick={() => setReordering(!reordering)}>
                  {reordering ? <Check size={16} aria-hidden="true" /> : <ArrowDownUp size={16} aria-hidden="true" />}
                  {reordering ? "完了" : "並び替え"}
                </button>
              </div>
            )}
            {active.length === 0 && <p className="muted">チェック項目がありません。</p>}
            {groups.map((group) => (
              <section className="manager-category" aria-labelledby={"manage-" + group.id} key={group.id}>
                <h3 id={"manage-" + group.id}><CategoryIcon category={group.id} />{group.label}</h3>
                <ul>
                  {group.items.map((item, index) => (
                    <li key={item.id}>
                      <span className="managed-item-label"><strong>{item.name}</strong><span>{scheduleLabel(item.schedule)}</span></span>
                      {reordering ? (
                        <div className="item-move-controls">
                          <button type="button" className="icon-button" aria-label={item.name + "を上へ移動"}
                            onClick={() => moveItem(item, "up")} disabled={busy || index === 0}>
                            <ArrowUp size={18} aria-hidden="true" />
                          </button>
                          <button type="button" className="icon-button" aria-label={item.name + "を下へ移動"}
                            onClick={() => moveItem(item, "down")} disabled={busy || index === group.items.length - 1}>
                            <ArrowDown size={18} aria-hidden="true" />
                          </button>
                        </div>
                      ) : (
                        <button type="button" className="icon-button" aria-label={item.name + "を編集"}
                          onClick={() => edit(item)} disabled={busy}><Pencil size={17} aria-hidden="true" /></button>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            {!reordering && (
              <button type="button" className="button primary add-item" onClick={() => edit(newItem)} disabled={busy}>
                <Plus size={18} aria-hidden="true" />項目を追加
              </button>
            )}
            {!reordering && archived.length > 0 && (
              <details className="archived-list">
                <summary>アーカイブ済み（{archived.length}）<ChevronDown size={16} aria-hidden="true" /></summary>
                <ul>
                  {archived.map((item) => (
                    <li key={item.id}>
                      <span className="managed-item-label"><strong>{item.name}</strong></span>
                      <button className="button quiet" type="button" onClick={() => archiveItem(item.id, false)} disabled={busy}
                        aria-label={item.name + "を復元"}><RotateCcw size={15} aria-hidden="true" />復元</button>
                      <button className="icon-button danger-action" type="button" onClick={() => requestDelete(item)} disabled={busy}
                        aria-label={item.name + "を削除"}><Trash2 size={17} aria-hidden="true" /></button>
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {error && <p className="inline-error" role="alert">{error}</p>}
          </div>
        )}
        <p className="sr-only" role="status">{announcement}</p>
      </div>
    </dialog>
  );
}
