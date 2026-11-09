/** Phần dùng chung của các mô hình công trình: hoạt ảnh chuẩn, khung Rig, móng, vòng phủ, đèn nháy, tháp súng. */
import * as THREE from "three";
import { approach, approachAngle, box, cyl, FireClock, group, part, type Palette, type Rig, type RigAction } from "../kit";

export type P3 = [number, number, number];

export type Update = (dt: number, t: number, a: ReadonlySet<string>) => void;

/** Mặt nền móng: chiều cao `foundation` mặc định, mọi công trình đứng trên mặt này. */
export const BASE_Y = 0.25;

/** Mặt cắt chữ nhật vát 4 góc (nhìn từ trên) ở độ cao y; hai mặt cắt đưa vào `facets` thành khối vát. */
export const oct = (hx: number, hz: number, c: number, y: number, cz = 0, cx = 0): P3[] => {
  const pts: P3[] = [];
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) pts.push([cx + sx * (hx - c), y, cz + sz * hz], [cx + sx * hx, y, cz + sz * (hz - c)]);
  return pts;
};

/** Thanh nối hai điểm (ống dẫn, thanh giằng, ăng-ten). */
export const strut = (a: P3, b: P3, r: number, mat: THREE.Material): THREE.Mesh => {
  const m = cyl(r, r, 1, mat, 6);
  const A = new THREE.Vector3(...a);
  const B = new THREE.Vector3(...b);
  m.position.copy(A).add(B).multiplyScalar(0.5);
  m.scale.y = A.distanceTo(B);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.sub(A).normalize());
  return m;
};

/** Khung phóng to đều mô hình dựng theo kích thước thiết kế; đáy vẫn đặt đúng mặt nền móng. */
export function scaledLayout(root: THREE.Object3D, s: number): THREE.Group {
  const g = group();
  g.scale.setScalar(s);
  g.position.y = BASE_Y * (1 - s);
  root.add(g);
  return g;
}

/**
 * Tín hiệu "xưởng đang đúc", giống nhau ở mọi xưởng để nhìn một lần là nhớ; nghỉ thì tắt hẳn:
 * thanh tiến độ trên nóc (đầy dần theo lô đang đúc), lò sáng trong lòng xưởng, đèn cửa chớp.
 * Mất điện: thanh vẫn giữ tiến độ nhưng lò và đèn tắt. Trục thanh là +x cục bộ, muốn dọc z thì xoay `bar`.
 */
export function productionSignals(p: Palette, len: number): {
  bar: THREE.Group;
  glow: THREE.MeshStandardMaterial;
  beacon: THREE.MeshStandardMaterial;
  update: Update;
  setLevel: (k: number) => void;
} {
  const amber = (): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color: 0x3a2a18, emissive: 0xff9a2e, emissiveIntensity: 0, roughness: 0.6 });
  const glow = amber();
  const beacon = amber();
  const fillMat = new THREE.MeshStandardMaterial({ color: 0x4a3010, emissive: 0xffb03a, emissiveIntensity: 2.6 });
  const geo = new THREE.BoxGeometry(1, 0.08, 0.36);
  geo.translate(0.5, 0, 0);
  const fill = part("Thanh tiến độ", new THREE.Mesh(geo, fillMat));
  fill.position.set(-len / 2, 0.1, 0);
  fill.visible = false;
  const bar = part("Khung thanh tiến độ", group(box(len + 0.24, 0.1, 0.56, p.hullDark), fill));
  let external = false;
  let heat = 0;
  const show = (k: number): void => {
    fill.visible = k > 0.005;
    fill.scale.x = Math.max(0.001, Math.min(1, k)) * len;
  };
  return {
    bar,
    glow,
    beacon,
    setLevel(k) {
      external = true;
      show(k);
    },
    update(dt, t, a) {
      const on = a.has("work");
      heat = approach(heat, on ? 1 : 0, 6, dt);
      glow.emissiveIntensity = heat * (2.4 + Math.sin(t * 11) * 0.5 + Math.sin(t * 29) * 0.3);
      beacon.emissiveIntensity = on && Math.sin(t * 9) > 0 ? 4 : 0;
      // Xưởng Mô Hình không có sim: cho thanh chạy minh họa
      if (!external) show(on ? (t * 0.2) % 1 : 0);
    }
  };
}

export const WORK: RigAction = { id: "work", label: "Vận hành" };
export const AIM: RigAction = { id: "aim", label: "Ngắm" };
export const FIRE: RigAction = { id: "fire", label: "Khai hỏa" };
export const POWER: RigAction = { id: "power", label: "Vùng phủ điện" };

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
