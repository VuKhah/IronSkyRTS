/**
 * Cột Điện, bản 2 (09/11/2026), chân đế 4 × 4 m, theo phong cách của Tổng Hành Dinh.
 * Cột cao thế dạng khung thép cao 8,6 m: 4 chân thu dần lên đỉnh, thanh giằng chéo, 2 xà ngang có sứ cách điện sáng;
 * dây cáp võng xuống 2 hộp đấu nối ở chân cột. Nhìn từ trên: nắp đỉnh màu phe và 2 xà ngang.
 * Không có bộ phận chuyển động, chỉ có đèn sứ nhấp nháy.
 */
import * as THREE from "three";
import { box, cyl, group, part, sphere, type Palette, type Rig } from "../kit";
import { WORK, POWER, rig, foundation, groundRing, strut, BASE_Y, type P3 } from "./shared";

const TOP = 8.2;
const FOOT = 1.35;
const HEAD = 0.26;

export function buildPowerPylon(p: Palette): Rig {
  const root = group(foundation(p, 4, 4));
  const add = (...o: THREE.Object3D[]) => root.add(...o);
  /** Nửa bề rộng khung thép ở độ cao y. */
  const widthAt = (y: number) => FOOT + ((HEAD - FOOT) * (y - BASE_Y)) / (TOP - BASE_Y);

  // ================================================================ 1. KHUNG THÉP
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      add(part("Chân cột", strut([sx * FOOT, BASE_Y, sz * FOOT], [sx * HEAD, TOP, sz * HEAD], 0.07, p.metal)));
      add(part("Đế chân cột", box(0.5, 0.3, 0.5, p.concreteDark, sx * FOOT, BASE_Y + 0.15, sz * FOOT)));
    }
  const LEVELS = [BASE_Y, 1.8, 3.2, 4.5, 5.7, 6.8, TOP];
  for (let i = 0; i < LEVELS.length - 1; i++) {
    const y0 = LEVELS[i]!;
    const y1 = LEVELS[i + 1]!;
    const a = widthAt(y0);
    const b = widthAt(y1);
    // mỗi mặt một cặp thanh chéo, đan chữ X theo từng tầng
    for (const s of [-1, 1]) {
      const faceX = (u: number, w: number, y: number): P3 => [u * w, y, s * w];
      const faceZ = (u: number, w: number, y: number): P3 => [s * w, y, u * w];
      add(part("Thanh giằng", strut(faceX(-1, a, y0), faceX(1, b, y1), 0.03, p.hullDark)));
      add(part("Thanh giằng", strut(faceX(1, a, y0), faceX(-1, b, y1), 0.03, p.hullDark)));
      add(part("Thanh giằng", strut(faceZ(-1, a, y0), faceZ(1, b, y1), 0.03, p.hullDark)));
      add(part("Thanh giằng", strut(faceZ(1, a, y0), faceZ(-1, b, y1), 0.03, p.hullDark)));
    }
    if (i > 0)
      for (const s of [-1, 1]) {
        add(part("Thanh ngang", strut([-a, y0, s * a], [a, y0, s * a], 0.04, p.metal)));
        add(part("Thanh ngang", strut([s * a, y0, -a], [s * a, y0, a], 0.04, p.metal)));
      }
  }

  // ================================================================ 2. XÀ NGANG, SỨ CÁCH ĐIỆN, DÂY CÁP
  const ARMS: readonly [number, number][] = [[1.9, 7.5], [1.45, 6.2]];
  const glow = p.teamGlow.clone() as THREE.MeshStandardMaterial;
  for (const [hw, y] of ARMS) {
    add(part("Xà ngang", box(hw * 2 + 0.2, 0.16, 0.16, p.metal, 0, y, 0)));
    for (const sx of [-1, 1]) {
      const x = sx * hw;
      add(part("Sứ cách điện", cyl(0.08, 0.11, 0.55, p.white, 8, x, y - 0.36, 0)));
      add(part("Đèn sứ", sphere(0.1, glow, x, y - 0.68, 0, 8)));
      // dây võng xuống hộp đấu nối ở hai phía trước sau
      for (const dir of [-1, 1]) {
        const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(x, y - 0.72, 0), new THREE.Vector3(x * 0.92, y * 0.55, dir * 1.2), new THREE.Vector3(x * 0.72, BASE_Y + 0.72, dir * 1.72)]);
        add(part("Dây cáp", new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.03, 4), p.rubber)));
      }
    }
  }
  for (const dir of [-1, 1]) add(part("Hộp đấu nối", group(box(3.0, 0.7, 0.34, p.hullDark, 0, BASE_Y + 0.35, dir * 1.72), box(3.04, 0.06, 0.38, p.warning, 0, BASE_Y + 0.72, dir * 1.72))));
  add(part("Nắp đỉnh (màu phe)", box(0.86, 0.3, 0.86, p.team, 0, TOP + 0.15, 0)));

  const ring = groundRing(p, 5.5, "power");
  add(ring.mesh);
  return rig(root, [WORK, POWER], 6.4, [(_dt, t, a) => (glow.emissiveIntensity = a.has("work") ? 1 + Math.abs(Math.sin(t * 4)) * 1.6 : 0.3), ring.update]);
}
