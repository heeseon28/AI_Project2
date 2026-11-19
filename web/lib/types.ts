// 화면(A)과 API(B, D) 사이의 계약. 바꿀 때는 팀에 공유한다.

export type Meal = "breakfast" | "lunch" | "dinner";
export type GoalMode = "maintain" | "muscle" | "fat_loss" | "exam";

export const MEAL_LABEL: Record<Meal, string> = {
  breakfast: "아침",
  lunch: "점심",
  dinner: "저녁",
};

export type Nutrients = {
  kcal: number;
  carb: number;
  protein: number;
  fat: number;
  sodium: number;
};

export type Menu = Nutrients & { id: number; name: string; price: number | null };

export type WeeklyMenuRow = {
  date: string; // YYYY-MM-DD
  meal: Meal;
  corner: string;
  menu: Menu;
};

export type Profile = {
  id: string;
  nickname: string | null;
  role: "student" | "admin";
  sex: "male" | "female" | null;
  weight_kg: number | null;
  body_fat_pct: number | null;
  activity_level: number;
  goal_mode: GoalMode;
};

// POST /api/recognize 응답
export type RecognizedItem = {
  slot: number; // 식판 칸 번호 (왼쪽 위부터 1)
  menu: Menu | null; // null = 인식 실패 → 사용자가 직접 고른다
  confidence: number; // 0~1
};
export type RecognizeResponse = { items: RecognizedItem[] };
