/** Khung xe mặt đất: tháp pháo xoay, nòng giật, bánh lăn, xích. Mọi xe dùng vehicleRig. */
import * as THREE from "three";
import { UNITS, type UnitId } from "../../../sim/content";
import { approach, approachAngle, box, FireClock, group, part, partIfUnnamed, tubeZ, wheel, type Palette, type Rig, type RigAction } from "../kit";
import { V, Shots, missileMesh } from "./common";

export interface VehicleParts {
  body: THREE.Group;
  wheels: { g: THREE.Object3D; r: number }[];
  turret: THREE.Group;
  gun: THREE.Group;
  /** Nòng giật lùi theo trục -Z khi bắn. */
  barrels: THREE.Object3D[];
  muzzles: THREE.Object3D[];
  flashes: THREE.Mesh[];
  spinners: THREE.Object3D[];
  /** Góc nâng nòng khi ngắm (rad, dương = ngóc lên). */
  aimPitch: number;
  /**
   * Góc ngóc nòng khi mục tiêu là máy bay (rad). Có trường này thì xe có hai tư thế: nằm ngang bắn đất, ngóc cao bắn máy bay.
   * Chiến trường bật hoạt ảnh "aimAir" khi mục tiêu đang bay; Xưởng Mô Hình có nút "Ngắm máy bay".
   */
  airPitch?: number;
  recoil: number;
  /** Tên lửa thay cho đạn pháo (SkyGuard). */
  missiles?: boolean;
  /** Nhịp bắn khi bật "Khai hỏa" ở Xưởng Mô Hình (giây); mặc định theo thời gian nạp của vũ khí. */
  fireEvery?: number;
}

export const GROUND_ACTIONS: RigAction[] = [
  { id: "move", label: "Di chuyển" },
  { id: "aim", label: "Ngắm" },
  { id: "fire", label: "Khai hỏa" }
];

export function vehicleRig(
  id: UnitId,
  p: Palette,
  parts: VehicleParts,
  radius: number,
  extra: RigAction[] = [],
  extraUpdate?: (dt: number, t: number, a: ReadonlySet<string>) => void,
  baseActions: RigAction[] = GROUND_ACTIONS
): Rig {
  // tên bộ phận chung cho Xưởng Mô Hình (bộ phận đã có tên riêng thì giữ tên riêng)
  partIfUnnamed("Thân xe", parts.body);
  partIfUnnamed("Tháp pháo", parts.turret);
  partIfUnnamed("Cụm nòng", parts.gun);
  for (const b of parts.barrels) partIfUnnamed(parts.missiles ? "Ống phóng tên lửa" : "Nòng pháo", b);
  for (const w of parts.wheels) partIfUnnamed("Bánh xe", w.g);
  const root = group(parts.body);
  const spec = UNITS[id];
  const clock = new FireClock(parts.fireEvery ?? Math.max(0.35, spec.weapon?.cooldown ?? 1));
  const shots = new Shots(root);
  let yaw = 0;
  let pitch = 0;
  let muzzleIndex = 0;
  // bánh xe quay đúng theo tốc độ chạy thật của xe
  const speed = spec.speed;
  let aimOverride: number | null = null;
  let aimRaise = true;
  return {
    root,
    actions: [...baseActions, ...extra],
    defaultOn: [],
    radius,
    setAim(y, raise = true) {
      aimOverride = y;
      aimRaise = raise;
    },
    update(dt, t, a) {
      const moving = a.has("move");
      for (const w of parts.wheels) if (moving) w.g.rotation.x += (speed / w.r) * dt;
      parts.body.position.y = moving ? Math.sin(t * 14) * 0.025 : approach(parts.body.position.y, 0, 10, dt);
      parts.body.rotation.x = moving ? Math.sin(t * 7) * 0.008 : 0;

      // Chiến trường đặt góc ngắm thật (setAim); Xưởng Mô Hình thì cho tháp pháo quét qua lại.
      const air = parts.airPitch !== undefined && a.has("aimAir");
      const aiming = (aimOverride !== null && aimRaise) || a.has("aim") || a.has("fire") || air;
      const yawTarget = aimOverride !== null ? aimOverride : a.has("aim") ? Math.sin(t * 0.7) * 1.1 : 0;
      yaw = approachAngle(yaw, yawTarget, aimOverride !== null ? 7 : 3, dt);
      pitch = approach(pitch, aiming ? (air ? parts.airPitch! : parts.aimPitch) + (aimOverride === null ? Math.sin(t * 1.3) * 0.06 : 0) : 0, air ? 2.2 : 3, dt);
      parts.turret.rotation.y = yaw;
      parts.gun.rotation.x = -pitch;

      for (const s of parts.spinners) s.rotation.y += dt * 2.2;

      if (clock.tick(dt, a.has("fire"))) {
        muzzleIndex = (muzzleIndex + 1) % parts.muzzles.length;
        const muzzle = parts.muzzles[muzzleIndex]!;
        if (parts.missiles) {
          muzzle.getWorldDirection(V);
          shots.spawn(missileMesh(p), muzzle, V.clone().multiplyScalar(16), 1.1);
        }
      }
      const since = clock.since;
      const kick = since < 0.25 ? Math.sin((since / 0.25) * Math.PI) * parts.recoil : 0;
      parts.barrels.forEach((b, i) => (b.position.z = (b.userData.z0 as number) - (parts.missiles || i % parts.muzzles.length === muzzleIndex ? kick : 0)));
      parts.flashes.forEach((f, i) => {
        f.visible = since < 0.07 && i === muzzleIndex;
        if (f.visible) f.scale.setScalar(0.8 + Math.random() * 0.5);
      });
      shots.update(dt);
      extraUpdate?.(dt, t, a);
    }
  };
}

export function barrel(len: number, r: number, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Group {
  const g = group(tubeZ(r, r * 1.1, len, mat, 8));
  (g.children[0] as THREE.Mesh).position.z = len / 2;
  g.position.set(x, y, z);
  g.userData.z0 = z;
  return g;
}

/** Bộ xích: thanh xích cao su + bánh tì quay được + tấm che màu phe. */
export function tracks(p: Palette, halfWidth: number, length: number, wheelR: number, count: number): { g: THREE.Group; wheels: { g: THREE.Object3D; r: number }[] } {
  const g = group();
  const wheels: { g: THREE.Object3D; r: number }[] = [];
  for (const side of [-1, 1]) {
    g.add(box(0.5, wheelR * 2.3, length, p.rubber, side * halfWidth, wheelR * 1.15, 0));
    g.add(box(0.62, 0.12, length * 1.02, p.teamDark, side * halfWidth, wheelR * 2.35, 0));
    for (let i = 0; i < count; i++) {
      const w = part("Bánh tì xích", wheel(wheelR, 0.56, p.hullDark, p.metal));
      w.position.set(side * halfWidth, wheelR + 0.02, -length / 2 + wheelR + (i * (length - wheelR * 2)) / (count - 1));
      g.add(w);
      wheels.push({ g: w, r: wheelR });
    }
  }
  return { g: part("Dải xích", g), wheels };
}
