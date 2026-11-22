// 사용자가 사진 위에 직접 그린 음식 영역을 다루고, CNN 입력용 224×224 이미지로 자른다 (MODEL_SPEC 6.1).
// 좌표는 사진 크기에 대한 비율(0~1)이라 화면 크기가 바뀌어도 같은 영역을 가리킨다.

export type Region = { id: number; x: number; y: number; w: number; h: number };

export const MODEL_INPUT = 224;
export const PAD_RGB = "rgb(124,116,104)"; // ImageNet 평균에 가까운 여백색 (MODEL_SPEC 6.1)
export const MIN_SIZE = 0.04; // 너무 작은 영역은 음식이 안 보여서 막는다

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** 영역을 사진 안으로 넣고 최소 크기를 보장한다. */
export function fitRegion(r: Region): Region {
  const w = clamp(r.w, MIN_SIZE, 1);
  const h = clamp(r.h, MIN_SIZE, 1);
  return { id: r.id, w, h, x: clamp(r.x, 0, 1 - w), y: clamp(r.y, 0, 1 - h) };
}

/** 두 점(드래그 시작·끝)으로 영역을 만든다. 어느 방향으로 끌어도 된다. */
export function regionFromPoints(id: number, ax: number, ay: number, bx: number, by: number): Region {
  return fitRegion({ id, x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(bx - ax), h: Math.abs(by - ay) });
}

export const moveRegion = (r: Region, dx: number, dy: number): Region => fitRegion({ ...r, x: r.x + dx, y: r.y + dy });

/** 오른쪽 아래 모서리를 끌어 크기를 바꾼다. 사진 밖으로는 못 나간다. */
export const resizeRegion = (r: Region, dx: number, dy: number): Region =>
  fitRegion({ ...r, w: Math.min(r.w + dx, 1 - r.x), h: Math.min(r.h + dy, 1 - r.y) });

/** 긴 변을 size에 맞추고 비율을 유지한 그림 크기와 가운데 정렬 위치. 남는 1픽셀은 오른쪽·아래로 간다. */
export function letterbox(srcW: number, srcH: number, size = MODEL_INPUT) {
  const scale = size / Math.max(srcW, srcH);
  const w = Math.max(1, Math.round(srcW * scale));
  const h = Math.max(1, Math.round(srcH * scale));
  return { w, h, x: Math.floor((size - w) / 2), y: Math.floor((size - h) / 2) };
}

/** 브라우저 전용. 영역 하나를 원본 픽셀로 잘라 224×224에 비율 유지로 넣는다. */
export function cropRegion(image: ImageBitmap, r: Region): HTMLCanvasElement {
  // 원본 픽셀 좌표: 왼쪽·위는 내림, 오른쪽·아래는 올림 (Python 학습 코드와 같은 규칙)
  const left = Math.floor(r.x * image.width);
  const top = Math.floor(r.y * image.height);
  const right = Math.min(image.width, Math.ceil((r.x + r.w) * image.width));
  const bottom = Math.min(image.height, Math.ceil((r.y + r.h) * image.height));
  const sw = Math.max(1, right - left);
  const sh = Math.max(1, bottom - top);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = MODEL_INPUT;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = PAD_RGB;
  ctx.fillRect(0, 0, MODEL_INPUT, MODEL_INPUT);
  ctx.imageSmoothingQuality = "high";
  const box = letterbox(sw, sh);
  ctx.drawImage(image, left, top, sw, sh, box.x, box.y, box.w, box.h);
  return canvas;
}
