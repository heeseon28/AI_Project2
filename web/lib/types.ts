// 화면과 DB 사이에서 쓰는 공통 타입. 바꿀 때는 팀에 공유한다.

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

export type Menu = Nutrients & { id: number; name: string; price: number | null; model_class_id: number | null };

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
