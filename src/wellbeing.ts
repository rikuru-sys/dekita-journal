export const moods = {
  happy: { label: "楽しい・満足", emoji: "😊" },
  calm: { label: "穏やか・落ち着いている", emoji: "🙂" },
  neutral: { label: "普通・特に変化なし", emoji: "😐" },
  anxious: { label: "不安・落ち着かない", emoji: "😟" },
  low: { label: "落ち込み・つらい", emoji: "😞" },
  irritated: { label: "イライラする", emoji: "😠" },
} as const;

export type Mood = keyof typeof moods;
export const moodIds = Object.keys(moods) as Mood[];

export const symptomFields = [
  { id: "fatigue", label: "疲労感" },
  { id: "sleepiness", label: "眠気" },
  { id: "discomfort", label: "身体的不調" },
  { id: "interference", label: "活動への支障" },
] as const;
export type Symptom = (typeof symptomFields)[number]["id"];

export const severities = {
  none: { label: "なし", points: 0 },
  some: { label: "少し", points: 1 },
  strong: { label: "強い", points: 2 },
} as const;
export type Severity = keyof typeof severities;
export const severityIds = Object.keys(severities) as Severity[];
export type SymptomAnswers = Partial<Record<Symptom, Severity>>;

export const conditionScores = [5, 4, 3, 2, 1] as const;
export type ConditionScore = (typeof conditionScores)[number];
export const conditionLabels: Record<ConditionScore, string> = {
  5: "良好",
  4: "おおむね良好",
  3: "やや不調",
  2: "つらい",
  1: "かなりつらい",
};

export interface WellbeingRecord {
  mood?: Mood;
  symptoms?: SymptomAnswers;
  conditionOverride?: ConditionScore;
}

export function automaticCondition(symptoms: SymptomAnswers | undefined): ConditionScore | undefined {
  let points = 0;
  for (const { id } of symptomFields) {
    const severity = symptoms?.[id];
    if (!severity) return undefined;
    points += severities[severity].points;
  }
  return conditionScores[Math.ceil(points / 2)];
}

export function conditionScore(entry: WellbeingRecord | undefined): ConditionScore | undefined {
  return entry?.conditionOverride ?? automaticCondition(entry?.symptoms);
}
