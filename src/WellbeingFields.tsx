import { HeartPulse, Smile } from "lucide-react";
import { IconBadge } from "./ui";
import {
  automaticCondition, conditionLabels, conditionScores, moodIds, moods, severities, severityIds, symptomFields,
} from "./wellbeing";
import type { ConditionScore, Severity, Symptom, WellbeingRecord } from "./wellbeing";

export function WellbeingFields({ value, disabled, onChange }: {
  value: WellbeingRecord;
  disabled: boolean;
  onChange: (change: Partial<WellbeingRecord>) => void;
}) {
  const automatic = automaticCondition(value.symptoms);

  function toggleSymptom(id: Symptom, severity: Severity) {
    const symptoms = { ...value.symptoms };
    if (symptoms[id] === severity) delete symptoms[id];
    else symptoms[id] = severity;
    onChange({ symptoms: Object.keys(symptoms).length > 0 ? symptoms : undefined });
  }

  return (
    <>
      <section className="panel wellbeing-card" aria-labelledby="mood-title">
        <header>
          <IconBadge tone="memo"><Smile size={19} strokeWidth={1.8} /></IconBadge>
          <h2 id="mood-title">気分</h2>
          <span className="optional">任意</span>
        </header>
        <div className="mood-options" role="group" aria-label="気分を選ぶ">
          {moodIds.map((id) => (
            <button type="button" className="mood-option" key={id} data-level={"mood-" + id}
              disabled={disabled} aria-pressed={value.mood === id}
              onClick={() => onChange({ mood: value.mood === id ? undefined : id })}>
              <span className="mood-emoji" aria-hidden="true">{moods[id].emoji}</span>
              <span>{moods[id].label}</span>
            </button>
          ))}
        </div>
      </section>
      <section className="panel wellbeing-card" aria-labelledby="condition-title">
        <header>
          <IconBadge tone="care"><HeartPulse size={19} strokeWidth={1.8} /></IconBadge>
          <h2 id="condition-title">体調</h2>
          <span className="optional">任意</span>
        </header>
        <p className="card-hint">その日の大部分の時間でどう感じたかを選びます。</p>
        <div className="symptom-fields">
          {symptomFields.map(({ id, label }) => (
            <div className="symptom-row" key={id} role="group" aria-labelledby={"symptom-" + id}>
              <span id={"symptom-" + id} className="symptom-label">{label}</span>
              <div className="severity-options">
                {severityIds.map((severity) => (
                  <button key={severity} type="button" disabled={disabled} data-severity={severity}
                    aria-pressed={value.symptoms?.[id] === severity} onClick={() => toggleSymptom(id, severity)}>
                    {severities[severity].label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="condition-review">
          <div className="condition-reference" aria-live="polite">
            <span>自動評価（参考）</span>
            {automatic ? (
              <strong className="wellbeing-mark" data-level={"condition-" + automatic}>
                {automatic} {conditionLabels[automatic]}
              </strong>
            ) : <small>4項目を選ぶと表示</small>}
          </div>
          <label className="condition-select">
            記録する評価
            <select value={value.conditionOverride ?? ""} disabled={disabled} onChange={(event) => {
              const selected = event.target.value;
              onChange({ conditionOverride: selected ? Number(selected) as ConditionScore : undefined });
            }}>
              <option value="">{automatic ? "自動評価を使う" : "自動評価（未評価）"}</option>
              {conditionScores.map((score) => <option key={score} value={score}>{score} {conditionLabels[score]}</option>)}
            </select>
          </label>
        </div>
      </section>
    </>
  );
}
