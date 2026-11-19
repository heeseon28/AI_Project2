import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

// 서버 전용. API 키가 브라우저로 나가면 안 된다. (scripts/eval-recognition.ts도 이 파일을 쓴다)

const UNKNOWN = "unknown";

const ResultSchema = z.object({
  items: z.array(
    z.object({
      slot: z.number().int().min(1).max(12),
      menu_name: z.string(),
      confidence: z.number().min(0).max(1),
    }),
  ),
});
export type TrayResult = z.infer<typeof ResultSchema>;

/**
 * 식판 사진에서 칸별 메뉴를 고른다. 후보(오늘 식단표) 밖의 이름은 enum으로 막는다.
 * 반환되는 menu_name은 candidates 중 하나 또는 "unknown".
 */
export async function recognizeTray(
  image: { data: string; mimeType: string }, // data = base64
  candidates: string[],
  env: { apiKey: string; model: string },
): Promise<TrayResult> {
  const ai = new GoogleGenAI({ apiKey: env.apiKey });
  const res = await ai.models.generateContent({
    model: env.model,
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: image },
          {
            text:
              "한국 대학 학생식당 식판 사진이다. 음식이 담긴 칸마다 메뉴를 하나씩 골라라. " +
              "칸 번호는 왼쪽 위부터 오른쪽, 아래 순서로 1부터 매긴다. " +
              "반드시 아래 후보 중에서만 고르고, 확실하지 않으면 unknown으로 답한다. 밥과 국도 칸으로 센다.\n" +
              `후보: ${candidates.join(", ")}`,
          },
        ],
      },
    ],
    config: {
      temperature: 0,
      responseMimeType: "application/json",
      responseJsonSchema: {
        type: "object",
        properties: {
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                slot: { type: "integer" },
                menu_name: { type: "string", enum: [...candidates, UNKNOWN] },
                confidence: { type: "number" },
              },
              required: ["slot", "menu_name", "confidence"],
            },
          },
        },
        required: ["items"],
      },
    },
  });

  // 스키마를 줬어도 모델 출력은 신뢰 경계 밖이라 다시 검증한다
  const parsed = ResultSchema.parse(JSON.parse(res.text ?? "{}"));
  const allowed = new Set(candidates);
  return {
    items: parsed.items.map((i) => (allowed.has(i.menu_name) ? i : { ...i, menu_name: UNKNOWN })),
  };
}
