// 브라우저 전용. 식판 사진을 tray_layout.json의 칸 영역대로 잘라 낸다.
// Task 3에서 이 칸 이미지들을 CNN 입력 [N,3,224,224]로 바꿔 추론한다 (MODEL_SPEC 6.1).

export type Slot = { name: string; x: number; y: number; w: number; h: number };
export type TrayLayout = { slots: Slot[] };

export const MODEL_INPUT = 224;

/** 칸마다 224×224 캔버스 하나. 비율 유지 없이 꽉 채운다 (학습 전처리와 같게). */
export function cropSlots(image: ImageBitmap, layout: TrayLayout): HTMLCanvasElement[] {
  return layout.slots.map((s) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = MODEL_INPUT;
    canvas
      .getContext("2d")!
      .drawImage(image, s.x * image.width, s.y * image.height, s.w * image.width, s.h * image.height, 0, 0, MODEL_INPUT, MODEL_INPUT);
    return canvas;
  });
}
