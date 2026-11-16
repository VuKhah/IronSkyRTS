/**
 * Nhận diện cử chỉ, dùng chung cho chuột và cảm ứng (Pointer Events).
 *
 * Cảm ứng:  chạm = chọn / ra lệnh · chạm đúp = chọn cả loại · một ngón kéo = cuộn bản đồ
 *           giữ ~0.3 s rồi kéo = quét khung chọn · hai ngón = thu phóng + xoay + cuộn
 * Chuột:    trái = chọn (kéo = quét khung) · phải = ra lệnh (kéo = xoay camera) · giữa kéo = cuộn · lăn = thu phóng
 */

export interface TapInfo {
  mouse: boolean;
  double: boolean;
  shift: boolean;
  ctrl: boolean;
}

export interface GestureHandlers {
  tap(x: number, y: number, info: TapInfo): void;
  command(x: number, y: number, shift: boolean): void;
  boxStart(x: number, y: number): void;
  boxMove(x: number, y: number): void;
  boxEnd(x: number, y: number, shift: boolean): void;
  boxCancel(): void;
  panStart(x: number, y: number): void;
  panMove(x: number, y: number): void;
  panEnd(): void;
  /** Hai ngón: tâm (cx, cy), tỉ lệ khoảng cách so với lần trước, góc xoay so với lần trước. */
  pinch(cx: number, cy: number, scale: number, rot: number): void;
  rotateDrag(dx: number, dy: number): void;
  wheel(x: number, y: number, delta: number): void;
  hover(x: number, y: number): void;
  longPressFeedback(x: number, y: number): void;
}

type Mode = "none" | "mouseLeft" | "mouseBox" | "mouseRight" | "mouseRotate" | "mousePan" | "touchPending" | "touchPan" | "touchBox" | "pinch" | "dead";

const LONG_PRESS_MS = 280;
const TOUCH_SLOP = 10;
const MOUSE_SLOP = 6;

export function attachGestures(el: HTMLElement, h: GestureHandlers): () => void {
  const pts = new Map<number, { x: number; y: number; sx: number; sy: number }>();
  let mode: Mode = "none";
  let timer = 0;
  let lastTap = { t: 0, x: 0, y: 0 };
  let pinchPrev = { d: 0, a: 0, cx: 0, cy: 0 };
  let last = { x: 0, y: 0 };

  const local = (e: PointerEvent): { x: number; y: number } => {
    const r = el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const isDouble = (x: number, y: number): boolean => {
    const now = performance.now();
    const d = now - lastTap.t < 320 && Math.hypot(x - lastTap.x, y - lastTap.y) < 28;
    lastTap = d ? { t: 0, x: 0, y: 0 } : { t: now, x, y };
    return d;
  };
  const pinchState = (): { d: number; a: number; cx: number; cy: number } => {
    const [a, b] = [...pts.values()];
    return { d: Math.hypot(b.x - a.x, b.y - a.y), a: Math.atan2(b.y - a.y, b.x - a.x), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
  };
  const clearTimer = (): void => {
    if (timer) window.clearTimeout(timer);
    timer = 0;
  };

  const down = (e: PointerEvent): void => {
    const p = local(e);
    el.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: p.x, y: p.y, sx: p.x, sy: p.y });
    if (e.pointerType === "mouse") {
      if (e.button === 0) mode = "mouseLeft";
      else if (e.button === 2) mode = "mouseRight";
      else if (e.button === 1) {
        mode = "mousePan";
        h.panStart(p.x, p.y);
      }
      last = p;
      return;
    }
    if (pts.size === 1) {
      mode = "touchPending";
      clearTimer();
      timer = window.setTimeout(() => {
        if (mode === "touchPending") {
          mode = "touchBox";
          const s = [...pts.values()][0];
          h.longPressFeedback(s.sx, s.sy);
          h.boxStart(s.sx, s.sy);
        }
      }, LONG_PRESS_MS);
    } else if (pts.size === 2) {
      clearTimer();
      if (mode === "touchBox") h.boxCancel();
      if (mode === "touchPan") h.panEnd();
      mode = "pinch";
      pinchPrev = pinchState();
    } else mode = "dead";
  };

  const move = (e: PointerEvent): void => {
    const p = local(e);
    const s = pts.get(e.pointerId);
    if (!s) {
      if (e.pointerType === "mouse") h.hover(p.x, p.y);
      return;
    }
    s.x = p.x;
    s.y = p.y;
    const moved = Math.hypot(p.x - s.sx, p.y - s.sy);
    switch (mode) {
      case "mouseLeft":
        if (moved > MOUSE_SLOP) {
          mode = "mouseBox";
          h.boxStart(s.sx, s.sy);
          h.boxMove(p.x, p.y);
        }
        break;
      case "mouseBox":
        h.boxMove(p.x, p.y);
        break;
      case "mouseRight":
        if (moved > MOUSE_SLOP) mode = "mouseRotate";
        break;
      case "mouseRotate":
        h.rotateDrag(p.x - last.x, p.y - last.y);
        break;
      case "mousePan":
        h.panMove(p.x, p.y);
        break;
      case "touchPending":
        if (moved > TOUCH_SLOP) {
          clearTimer();
          mode = "touchPan";
          h.panStart(s.sx, s.sy);
          h.panMove(p.x, p.y);
        }
        break;
      case "touchPan":
        h.panMove(p.x, p.y);
        break;
      case "touchBox":
        h.boxMove(p.x, p.y);
        break;
      case "pinch": {
        if (pts.size !== 2) break;
        const now = pinchState();
        if (pinchPrev.d > 0 && now.d > 0) h.pinch(now.cx, now.cy, now.d / pinchPrev.d, now.a - pinchPrev.a);
        pinchPrev = now;
        break;
      }
      default:
        break;
    }
    if (e.pointerType === "mouse") h.hover(p.x, p.y);
    last = p;
  };

  const up = (e: PointerEvent): void => {
    const p = local(e);
    const s = pts.get(e.pointerId);
    pts.delete(e.pointerId);
    if (!s) return;
    const info = (mouse: boolean): TapInfo => ({ mouse, double: isDouble(p.x, p.y), shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey });
    switch (mode) {
      case "mouseLeft":
        h.tap(p.x, p.y, info(true));
        break;
      case "mouseBox":
        h.boxEnd(p.x, p.y, e.shiftKey);
        break;
      case "mouseRight":
        h.command(p.x, p.y, e.shiftKey);
        break;
      case "mousePan":
        h.panEnd();
        break;
      case "touchPending":
        clearTimer();
        h.tap(p.x, p.y, info(false));
        break;
      case "touchPan":
        h.panEnd();
        break;
      case "touchBox":
        h.boxEnd(p.x, p.y, false);
        break;
      default:
        break;
    }
    if (pts.size === 0) mode = "none";
    else if (mode === "pinch") mode = "dead";
  };

  const cancel = (e: PointerEvent): void => {
    pts.delete(e.pointerId);
    clearTimer();
    if (mode === "touchBox" || mode === "mouseBox") h.boxCancel();
    if (mode === "touchPan" || mode === "mousePan") h.panEnd();
    if (pts.size === 0) mode = "none";
  };

  const wheel = (e: WheelEvent): void => {
    e.preventDefault();
    const r = el.getBoundingClientRect();
    h.wheel(e.clientX - r.left, e.clientY - r.top, e.deltaY);
  };
  const ctx = (e: Event): void => e.preventDefault();

  el.addEventListener("pointerdown", down);
  el.addEventListener("pointermove", move);
  el.addEventListener("pointerup", up);
  el.addEventListener("pointercancel", cancel);
  el.addEventListener("wheel", wheel, { passive: false });
  el.addEventListener("contextmenu", ctx);
  return () => {
    el.removeEventListener("pointerdown", down);
    el.removeEventListener("pointermove", move);
    el.removeEventListener("pointerup", up);
    el.removeEventListener("pointercancel", cancel);
    el.removeEventListener("wheel", wheel);
    el.removeEventListener("contextmenu", ctx);
  };
}
