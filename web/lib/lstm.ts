// 브라우저 전용. ml/deficit_lstm/train.py가 만든 ONNX 모델로 남은 요일 섭취량을 예측한다.
// 모델 계약: 입력 "history" float32 [1, 14, 5], 출력 "forecast" float32 [1, 7, 5]
// 영양소 순서는 NUTRIENT_KEYS (kcal, carb, protein, fat, sodium), 값은 norm.json으로 표준화.
import { NUTRIENT_KEYS } from "@/lib/nutrition";
import type { Nutrients } from "@/lib/types";

const ORT_CDN = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.1/dist/";

type Norm = { mean: number[]; std: number[] };
let loaded: Promise<{ run: (x: Float32Array) => Promise<Float32Array>; norm: Norm } | null> | null = null;

function load() {
  loaded ??= (async () => {
    const normRes = await fetch("/models/deficit_norm.json");
    if (!normRes.ok) return null; // 모델이 아직 없으면 기준선을 쓴다
    const norm: Norm = await normRes.json();
    // 번들에 넣으면 wasm(28MB)이 Workers 자산 한도(25MB)를 넘어서 CDN에서 불러온다. 패키지는 타입용.
    // shortcut: 오프라인 시연이 필요하면 ort.wasm.min.mjs와 wasm을 public/에 복사해서 경로를 바꾼다.
    const ort: typeof import("onnxruntime-web") = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ ORT_CDN + "ort.wasm.min.mjs");
    ort.env.wasm.wasmPaths = ORT_CDN;
    const session = await ort.InferenceSession.create("/models/deficit_lstm.onnx");
    return {
      norm,
      run: async (x: Float32Array) => {
        const out = await session.run({ history: new ort.Tensor("float32", x, [1, 14, 5]) });
        return out.forecast.data as Float32Array;
      },
    };
  })().catch((e) => {
    console.warn("LSTM 로드 실패, 기준선 사용", e);
    return null;
  });
  return loaded;
}

/** LSTM 예측. 모델이 없거나 실패하면 null. */
export async function lstmForecast(history: Nutrients[], daysLeft: number): Promise<Nutrients[] | null> {
  const model = await load();
  if (!model || history.length !== 14) return null;
  const { mean, std } = model.norm;
  const x = Float32Array.from(history.flatMap((d) => NUTRIENT_KEYS.map((k, j) => (d[k] - mean[j]) / std[j])));
  const y = await model.run(x);
  return Array.from({ length: daysLeft }, (_, i) =>
    Object.fromEntries(NUTRIENT_KEYS.map((k, j) => [k, Math.max(0, y[i * 5 + j] * std[j] + mean[j])])) as Nutrients,
  );
}
