// 메뉴 인식 정확도 측정 (PRD 성공 지표: top-1 80%).
// 실행: node --env-file=.dev.vars scripts/eval-recognition.ts
//
// eval/images/   사진 (푸디스트 인스타 + 팀원이 직접 찍은 사진). git에 올리지 않는다.
// eval/labels.csv
//   file,menus
//   2026-11-17_lunch.jpg,잡곡밥|된장국|제육볶음|콩나물무침|배추김치
//
// 후보 목록은 labels.csv에 나온 메뉴 전체를 쓴다. 실서비스(그날 메뉴 5~8개)보다 후보가 많아 더 어려운 조건이다.
import { readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { recognizeTray } from "../lib/gemini.ts";

const dir = join(import.meta.dirname, "..", "eval");
const rows = readFileSync(join(dir, "labels.csv"), "utf8")
  .trim()
  .split("\n")
  .slice(1)
  .map((line) => {
    const [file, menus] = line.split(",");
    return { file: file.trim(), truth: menus.split("|").map((m) => m.trim()) };
  });
const candidates = [...new Set(rows.flatMap((r) => r.truth))];
const env = { apiKey: process.env.GEMINI_API_KEY!, model: process.env.GEMINI_MODEL ?? "gemini-flash-latest" };
if (!env.apiKey) throw new Error(".dev.vars에 GEMINI_API_KEY가 없어요");

let hit = 0, predicted = 0, expected = 0, exact = 0;
for (const r of rows) {
  const mimeType = extname(r.file).toLowerCase() === ".png" ? "image/png" : "image/jpeg";
  const data = readFileSync(join(dir, "images", r.file)).toString("base64");
  const res = await recognizeTray({ data, mimeType }, candidates, env);
  const pred = res.items.map((i) => i.menu_name).filter((n) => n !== "unknown");

  const remaining = [...r.truth];
  let ok = 0;
  for (const p of pred) {
    const idx = remaining.indexOf(p);
    if (idx >= 0) {
      remaining.splice(idx, 1);
      ok++;
    }
  }
  hit += ok;
  predicted += pred.length;
  expected += r.truth.length;
  if (ok === r.truth.length && pred.length === r.truth.length) exact++;
  else console.log(`✗ ${r.file}\n  정답: ${r.truth.join(", ")}\n  예측: ${pred.join(", ")}`);

  await new Promise((ok) => setTimeout(ok, 4000)); // 무료 티어 분당 한도
}

console.log(`\n사진 ${rows.length}장, 후보 ${candidates.length}개 (${env.model})`);
console.log(`칸 정확도(recall)  ${((hit / expected) * 100).toFixed(1)}%`);
console.log(`정밀도(precision)  ${((hit / Math.max(1, predicted)) * 100).toFixed(1)}%`);
console.log(`식판 전체 일치     ${((exact / rows.length) * 100).toFixed(1)}%`);
