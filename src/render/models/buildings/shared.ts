/** Phần dùng chung của các mô hình công trình: hoạt ảnh chuẩn, khung Rig, móng, vòng phủ, đèn nháy, tháp súng. */
import * as THREE from "three";
import { approach, approachAngle, box, FireClock, group, part, type Palette, type Rig, type RigAction } from "../kit";

export const WORK: RigAction = { id: "work", label: "Vận hành" };
export const AIM: RigAction = { id: "aim", label: "Ngắm" };
export const FIRE: RigAction = { id: "fire", label: "Khai hỏa" };
export const POWER: RigAction = { id: "power", label: "Vùng phủ điện" };

export type Update = (dt: number, t: number, a: ReadonlySet<string>) => void;

/** Góc ngắm do chiến trường đặt (null = để hoạt ảnh tự quét). */
export interface AimRef {
  yaw: number | null;
  /** Nâng nòng (có mục tiêu); rảnh thì tháp chỉ giữ hướng. */
  raise?: boolean;
}

export function rig(root: THREE.Group, actions: RigAction[], radius: number, updates: Update[], defaultOn: string[] = ["work"], aim?: AimRef): Rig {
  const r: Rig = {
    root,
    actions,
    defaultOn,
    radius,
    update(dt, t, a) {
      for (const u of updates) u(dt, t, a);
    }
  };
  if (aim)
    r.setAim = (y, raise = true) => {
      aim.yaw = y;
      aim.raise = raise;
    };
  return r;
}

/** Nền móng bê tông có viền màu phe. */
export function foundation(p: Palette, w: number, d: number, h = 0.25): THREE.Group {
  return part("Nền móng", group(box(w, h, d, p.concrete, 0, h / 2, 0), box(w + 0.08, 0.08, 0.3, p.team, 0, h, d / 2 - 0.15), box(w + 0.08, 0.08, 0.3, p.team, 0, h, -d / 2 + 0.15)));
}

/** Vòng tròn nhấp nháy trên mặt đất (vùng phủ điện, vùng chiếm đóng). */
export function groundRing(p: Palette, radius: number, actionId: string): { mesh: THREE.Mesh; update: Update } {
  const mat = new THREE.MeshBasicMaterial({ color: (p.teamGlow.color as THREE.Color).getHex(), transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false });
  const mesh = new THREE.Mesh(new THREE.RingGeometry(radius - 0.15, radius, 64), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.04;
  mesh.visible = false;
  return {
    mesh,
    update: (_dt, t, a) => {
      mesh.visible = a.has(actionId);
      if (!mesh.visible) return;
      const k = (t * 0.5) % 1;
      mesh.scale.setScalar(0.92 + k * 0.12);
      mat.opacity = 0.65 * (1 - k * 0.7);
    }
  };
}

/** Đèn nhấp nháy. */
export function blinker(mat: THREE.MeshStandardMaterial, rate: number, phase = 0): Update {
  const base = mat.emissiveIntensity;
  return (_dt, t, a) => {
    mat.emissiveIntensity = a.has("work") ? base * (0.35 + 0.65 * (Math.sin(t * rate + phase) > 0 ? 1 : 0.2)) : base * 0.3;
  };
}

/** Tháp pháo quét ngắm và bắn theo chu kỳ của vũ khí trong content.ts. */
export function turretUpdate(turret: THREE.Object3D, gun: THREE.Object3D | null, flashes: THREE.Mesh[], cooldown: number, aimPitch: number, sweep = 1.2, aim?: AimRef): Update {
  const clock = new FireClock(Math.max(0.12, cooldown));
  let yaw = 0;
  let pitch = 0;
  let i = 0;
  return (dt, t, a) => {
    const held = aim !== undefined && aim.yaw !== null;
    const aiming = (held && aim.raise !== false) || a.has("aim") || a.has("fire");
    const target = held ? (aim.yaw as number) : a.has("aim") ? Math.sin(t * 0.6) * sweep : 0;
    yaw = approachAngle(yaw, target, held ? 7 : 3, dt);
    pitch = approach(pitch, aiming ? aimPitch : 0, 3, dt);
    turret.rotation.y = yaw;
    if (gun) gun.rotation.x = -pitch;
    if (clock.tick(dt, a.has("fire"))) i = (i + 1) % Math.max(1, flashes.length);
    flashes.forEach((f, k) => {
      f.visible = clock.since < 0.06 && k === i;
      if (f.visible) f.scale.setScalar(0.8 + Math.random() * 0.5);
    });
  };
}

// ----------------------------------------------------------------------------
