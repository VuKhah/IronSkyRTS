/** Khung máy bay: cánh, càng thu, lửa động cơ, cất cánh / nghiêng cánh. Mọi máy bay dùng aircraftRig. */
import * as THREE from "three";
import { approach, box, group, part, partIfUnnamed, wheel, type Palette, type Rig, type RigAction } from "../kit";

export function wingShape(points: [number, number][], thickness: number, mat: THREE.Material, mirror: boolean): THREE.Mesh {
  const s = new THREE.Shape();
  points.forEach(([x, z], i) => (i ? s.lineTo(x, -z) : s.moveTo(x, -z)));
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: thickness, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, -thickness / 2, 0);
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  if (mirror) m.scale.x = -1;
  return part("Cánh", m);
}

export interface AirParts {
  frame: THREE.Group;
  gear: THREE.Group;
  engines: THREE.Mesh[];
  /** Độ cao thân máy bay khi đậu (bánh chạm đất). */
  parkY: number;
  flyY: number;
  fire(dt: number, on: boolean, flying: boolean): void;
}

export const AIR_ACTIONS: RigAction[] = [
  { id: "fly", label: "Cất cánh & bay" },
  { id: "fire", label: "Khai hỏa" }
];

export function aircraftRig(parts: AirParts, radius: number): Rig {
  partIfUnnamed("Thân máy bay", parts.frame);
  partIfUnnamed("Càng đáp", parts.gear);
  for (const e of parts.engines) partIfUnnamed("Lửa động cơ", e);
  const root = group(parts.frame);
  let alt = parts.parkY;
  let gearT = 1;
  let roll = 0;
  let pitch = 0;
  let yaw = 0;
  let throttle = 0.3;
  // Chiến trường: sim quyết định độ cao (root.position.y), rig chỉ lo càng, lửa động cơ, độ nghiêng.
  let ext: { airborne: boolean; roll: number } | null = null;
  parts.frame.position.y = alt;
  return {
    root,
    actions: AIR_ACTIONS,
    defaultOn: [],
    radius,
    setFlight(airborne, r) {
      ext = { airborne, roll: r };
    },
    update(dt, t, a) {
      if (ext) {
        gearT = approach(gearT, ext.airborne ? 0 : 1, 5, dt);
        roll = approach(roll, ext.roll, 6, dt);
        throttle = approach(throttle, ext.airborne ? 1 : 0.25, 3, dt);
        parts.frame.position.y = parts.parkY;
        parts.frame.rotation.set(0, 0, -roll, "YXZ");
        parts.gear.scale.y = Math.max(0.02, gearT);
        parts.gear.visible = gearT > 0.04;
        for (const e of parts.engines) e.scale.set(1, 0.4 + throttle * (0.9 + Math.sin(t * 40) * 0.12), 1);
        parts.fire(dt, a.has("fire"), ext.airborne);
        return;
      }
      const flying = a.has("fly");
      alt = approach(alt, flying ? parts.flyY : parts.parkY, flying ? 1.2 : 1.6, dt);
      const airborne = alt > parts.parkY + 0.25;
      gearT = approach(gearT, flying && airborne ? 0 : 1, 5, dt);
      roll = approach(roll, flying ? Math.sin(t * 0.7) * 0.5 : 0, 2, dt);
      pitch = approach(pitch, flying ? Math.sin(t * 0.45) * 0.07 - 0.03 : 0, 2, dt);
      yaw = approach(yaw, flying ? Math.sin(t * 0.35) * 0.35 : 0, 1.5, dt);
      throttle = approach(throttle, flying ? 1 : 0.3, 3, dt);
      parts.frame.position.y = alt + (flying ? Math.sin(t * 1.1) * 0.08 : 0);
      parts.frame.rotation.set(-pitch, yaw, -roll, "YXZ");
      parts.gear.scale.y = Math.max(0.02, gearT);
      parts.gear.visible = gearT > 0.04;
      for (const e of parts.engines) e.scale.set(1, 0.4 + throttle * (0.9 + Math.sin(t * 40) * 0.12), 1);
      parts.fire(dt, a.has("fire"), airborne);
    }
  };
}

export function gearLeg(p: Palette, x: number, z: number, h: number, r: number): THREE.Group {
  const g = group(box(0.06, h, 0.06, p.metal, 0, -h / 2, 0), wheel(r, 0.1, p.rubber, p.metal));
  (g.children[1] as THREE.Object3D).position.y = -h;
  g.position.set(x, 0, z);
  return g;
}

export function engineGlow(p: Palette, r: number, len: number): THREE.Mesh {
  // Nón có đáy ở gốc, đỉnh ở +Y; xoay -90° quanh X thì đỉnh chĩa về -Z (phía đuôi).
  // Nhờ vậy scale.y của mesh chính là độ dài luồng lửa: tăng ga thì lửa phụt dài ra.
  const geo = new THREE.ConeGeometry(r, len, 8);
  geo.translate(0, len / 2, 0);
  const m = new THREE.Mesh(geo, p.engine);
  m.rotation.x = -Math.PI / 2;
  return m;
}
