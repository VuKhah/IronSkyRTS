import { describe, expect, it } from "vitest";
import { getMap } from "../sim/maps";
import { RtsCamera } from "./camera";

function rig(id: string): RtsCamera {
  const c = new RtsCamera(getMap(id));
  c.setAspect(1280, 800);
  return c;
}

describe("camera: chiến trường 3D và bàn tác chiến", () => {
  it("gần là chiến trường, xa nhất là bàn tác chiến, nhìn hơi nghiêng", () => {
    const c = rig("big-test");
    c.dist = 64;
    c.apply();
    expect(c.strategic).toBe(0);
    c.zoomBy(1000);
    c.apply();
    expect(c.strategic).toBe(1);
    // nhìn nghiêng: cạnh xa ngắn hơn cạnh gần trên màn hình
    const m = getMap("big-test");
    const far = c.project(m.halfW, 0, -m.halfH, 1280, 800).x - c.project(-m.halfW, 0, -m.halfH, 1280, 800).x;
    const near = c.project(m.halfW, 0, m.halfH, 1280, 800).x - c.project(-m.halfW, 0, m.halfH, 1280, 800).x;
    expect(far).toBeLessThan(near * 0.97);
  });

  it("kéo xa nhất thấy trọn bản đồ, kể cả bản đồ 960 m", () => {
    for (const id of ["two-crossings", "big-test"]) {
      const c = rig(id);
      const m = getMap(id);
      c.focus(0, 0);
      c.zoomBy(1000);
      c.apply();
      for (const [x, z] of [
        [-m.halfW, -m.halfH],
        [m.halfW, -m.halfH],
        [m.halfW, m.halfH],
        [-m.halfW, m.halfH]
      ]) {
        const p = c.project(x, 0, z, 1280, 800);
        expect(p.visible, `${id} góc ${x},${z}`).toBe(true);
        expect(p.x).toBeGreaterThanOrEqual(-1);
        expect(p.x).toBeLessThanOrEqual(1281);
        expect(p.y).toBeGreaterThanOrEqual(-1);
        expect(p.y).toBeLessThanOrEqual(801);
      }
    }
  });

  it("kéo xa nhất vẫn kéo được phần dưới bản đồ lên khỏi bảng lệnh", () => {
    const c = rig("big-test");
    const m = getMap("big-test");
    c.zoomBy(1000);
    c.apply();
    c.focus(0, m.halfH);
    c.apply();
    // cạnh Nam của bản đồ lên quá nửa màn hình
    expect(c.project(0, 0, m.halfH, 1280, 800).y).toBeLessThan(400 + 800 * 0.15);
  });

  it("trên bàn tác chiến, cạnh dưới nằm ngang dù camera đang xoay, và điểm chạm nằm trên mặt giấy", () => {
    const c = rig("big-test");
    c.yaw = 1.2;
    c.pitch = 0.7;
    c.zoomBy(1000);
    c.apply();
    const a = c.project(-300, 0, 200, 1280, 800);
    const b = c.project(300, 0, 200, 1280, 800);
    expect(Math.abs(a.y - b.y)).toBeLessThan(1);
    expect(b.x).toBeGreaterThan(a.x);
    const g = c.ground(640, 400, 1280, 800)!;
    expect(g.y).toBe(0);
    const back = c.project(g.x, 0, g.z, 1280, 800);
    expect(Math.abs(back.x - 640)).toBeLessThan(0.5);
    expect(Math.abs(back.y - 400)).toBeLessThan(0.5);
  });

  it("chuyển dần, không nhảy cóc giữa hai chế độ", () => {
    const c = rig("big-test");
    let last = 0;
    for (c.dist = 100; c.dist < 400; c.dist += 2) {
      c.apply();
      expect(c.strategic - last).toBeLessThan(0.1);
      expect(c.strategic).toBeGreaterThanOrEqual(last);
      last = c.strategic;
    }
    expect(last).toBe(1);
  });
});
