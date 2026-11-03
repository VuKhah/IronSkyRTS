/**
 * Mô hình 6 binh chủng (BẢN NHẸ): khối hình đơn giản nhưng có khớp động thật
 * (tháp pháo xoay, nòng giật, bánh lăn, cánh nghiêng, càng thu, cửa khoang bom).
 * Sau này thay bằng bản chi tiết: chỉ cần giữ nguyên giao diện Rig.
 *
 * Quy ước: mặt trước là +Z, mặt đất là y = 0, 1 đơn vị ≈ 1 mét (đã thu nhỏ để dễ nhìn).
 */
import * as THREE from "three";
import { UNITS, type Faction, type UnitId } from "../../sim/content";
import {
  approach, box, cyl, FireClock, group, muzzleFlash, palette, sphere, tubeZ, wheel,
  type Palette, type Rig, type RigAction
} from "./kit";

const V = new THREE.Vector3();
const FORWARD = new THREE.Vector3(0, 0, 1);

/** Đạn bay thuần hình ảnh (tên lửa, bom) trong hệ tọa độ của mô hình. */
class Shots {
  private list: { o: THREE.Object3D; v: THREE.Vector3; life: number; g: number; onEnd?: () => void }[] = [];
  constructor(private parent: THREE.Object3D) {}
  spawn(o: THREE.Object3D, from: THREE.Object3D, vel: THREE.Vector3, life: number, gravity = 0, onEnd?: () => void): void {
    this.parent.updateMatrixWorld(true);
    from.getWorldPosition(V);
    this.parent.worldToLocal(V);
    o.position.copy(V);
    this.parent.add(o);
    this.list.push({ o, v: vel.clone(), life, g: gravity, onEnd });
  }
  update(dt: number): void {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const s = this.list[i]!;
      s.v.y -= s.g * dt;
      s.o.position.addScaledVector(s.v, dt);
      if (s.v.lengthSq() > 1e-6) s.o.quaternion.setFromUnitVectors(FORWARD, V.copy(s.v).normalize());
      s.life -= dt;
      if (s.life <= 0 || s.o.position.y < 0) {
        s.onEnd?.();
        this.parent.remove(s.o);
        s.o.traverse((c) => c instanceof THREE.Mesh && c.geometry.dispose());
        this.list.splice(i, 1);
      }
    }
  }
}

function missileMesh(p: Palette, len = 0.55, r = 0.05): THREE.Group {
  const g = group(tubeZ(r, r, len, p.white, 6));
  const tip = new THREE.Mesh(new THREE.ConeGeometry(r, r * 3, 6), p.teamDark);
  tip.rotation.x = Math.PI / 2;
  tip.position.z = len / 2 + r * 1.5;
  const trail = new THREE.Mesh(new THREE.ConeGeometry(r * 1.2, len * 0.9, 6), p.flash);
  trail.rotation.x = -Math.PI / 2;
  trail.position.z = -len / 2 - len * 0.45;
  g.add(tip, trail);
  return g;
}

/** Vết nổ nhỏ chỗ đạn chạm đất. */
function blast(parent: THREE.Object3D, at: THREE.Vector3, p: Palette, size: number): void {
  const m = new THREE.Mesh(new THREE.SphereGeometry(size, 10, 8), p.flash.clone());
  m.position.copy(at).setY(Math.max(0.05, at.y));
  parent.add(m);
  const start = performance.now();
  const mat = m.material as THREE.MeshBasicMaterial;
  const step = () => {
    const k = (performance.now() - start) / 350;
    if (k >= 1) {
      parent.remove(m);
      m.geometry.dispose();
      mat.dispose();
      return;
    }
    m.scale.setScalar(0.4 + k * 1.4);
    mat.opacity = 0.9 * (1 - k);
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ---------------------------------------------------------------- xe mặt đất

interface VehicleParts {
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
  recoil: number;
  /** Tên lửa thay cho đạn pháo (SkyGuard). */
  missiles?: boolean;
}

const GROUND_ACTIONS: RigAction[] = [
  { id: "move", label: "Di chuyển" },
  { id: "aim", label: "Ngắm" },
  { id: "fire", label: "Khai hỏa" }
];

function vehicleRig(id: UnitId, p: Palette, parts: VehicleParts, radius: number, extra: RigAction[] = [], extraUpdate?: (dt: number, t: number, a: ReadonlySet<string>) => void): Rig {
  const root = group(parts.body);
  const spec = UNITS[id];
  const clock = new FireClock(Math.max(0.35, spec.weapon.cooldown));
  const shots = new Shots(root);
  let yaw = 0;
  let pitch = 0;
  let muzzleIndex = 0;
  const speed = spec.speed * 0.25;
  return {
    root,
    actions: [...GROUND_ACTIONS, ...extra],
    defaultOn: [],
    radius,
    update(dt, t, a) {
      const moving = a.has("move");
      for (const w of parts.wheels) if (moving) w.g.rotation.x += (speed / w.r) * dt;
      parts.body.position.y = moving ? Math.sin(t * 14) * 0.025 : approach(parts.body.position.y, 0, 10, dt);
      parts.body.rotation.x = moving ? Math.sin(t * 7) * 0.008 : 0;

      const aiming = a.has("aim") || a.has("fire");
      yaw = approach(yaw, a.has("aim") ? Math.sin(t * 0.7) * 1.1 : 0, 3, dt);
      pitch = approach(pitch, aiming ? parts.aimPitch + Math.sin(t * 1.3) * 0.06 : 0, 3, dt);
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

function barrel(len: number, r: number, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Group {
  const g = group(tubeZ(r, r * 1.1, len, mat, 8));
  (g.children[0] as THREE.Mesh).position.z = len / 2;
  g.position.set(x, y, z);
  g.userData.z0 = z;
  return g;
}

/** Bộ xích: thanh xích cao su + bánh tì quay được + tấm che màu phe. */
function tracks(p: Palette, halfWidth: number, length: number, wheelR: number, count: number): { g: THREE.Group; wheels: { g: THREE.Object3D; r: number }[] } {
  const g = group();
  const wheels: { g: THREE.Object3D; r: number }[] = [];
  for (const side of [-1, 1]) {
    g.add(box(0.5, wheelR * 2.3, length, p.rubber, side * halfWidth, wheelR * 1.15, 0));
    g.add(box(0.62, 0.12, length * 1.02, p.teamDark, side * halfWidth, wheelR * 2.35, 0));
    for (let i = 0; i < count; i++) {
      const w = wheel(wheelR, 0.56, p.hullDark, p.metal);
      w.position.set(side * halfWidth, wheelR + 0.02, -length / 2 + wheelR + (i * (length - wheelR * 2)) / (count - 1));
      g.add(w);
      wheels.push({ g: w, r: wheelR });
    }
  }
  return { g, wheels };
}

function buildCommander(p: Palette): Rig {
  const body = group();
  const wheels: { g: THREE.Object3D; r: number }[] = [];
  for (const side of [-1, 1])
    for (const z of [1.35, 0, -1.35]) {
      const w = wheel(0.46, 0.36, p.rubber, p.metal);
      w.position.set(side * 1.08, 0.46, z);
      body.add(w);
      wheels.push({ g: w, r: 0.46 });
    }
  body.add(
    box(2.0, 0.85, 4.1, p.hull, 0, 1.0, 0),
    box(1.9, 0.5, 0.9, p.hullDark, 0, 0.95, 2.3),
    box(1.7, 0.65, 2.2, p.hull, 0, 1.75, -0.45),
    box(1.72, 0.12, 2.22, p.team, 0, 2.12, -0.45),
    box(2.04, 0.18, 3.4, p.team, 0, 1.15, -0.1),
    box(1.3, 0.28, 0.08, p.glass, 0, 1.85, 0.66)
  );
  // cột radar chỉ huy
  const mast = cyl(0.06, 0.08, 1.3, p.metal, 6, 0.55, 2.75, -1.25);
  const dish = group(box(0.9, 0.06, 0.5, p.hullDark), cyl(0.08, 0.08, 0.25, p.teamGlow, 6, 0, 0.12, 0));
  dish.position.set(0.55, 3.45, -1.25);
  body.add(mast, dish, cyl(0.02, 0.02, 1.6, p.metal, 4, -0.7, 2.9, -1.4), sphere(0.06, p.teamGlow, -0.7, 3.7, -1.4));
  // tháp pháo kép
  const turret = group(cyl(0.5, 0.58, 0.32, p.hullDark, 10), box(0.75, 0.3, 0.8, p.hull, 0, 0.22, 0.05));
  turret.position.set(0, 2.32, 0.75);
  const gun = group();
  gun.position.set(0, 0.25, 0.35);
  const barrels = [barrel(1.1, 0.07, p.metal, -0.15, 0, 0), barrel(1.1, 0.07, p.metal, 0.15, 0, 0)];
  const flashes = barrels.map((b) => {
    const f = muzzleFlash(0.5, p.flash);
    f.position.z = 1.35;
    b.add(f);
    return f;
  });
  gun.add(...barrels);
  turret.add(gun);
  body.add(turret);

  // vòng hào quang chỉ huy 13.5m (thu nhỏ để vừa khung)
  const aura = new THREE.Mesh(
    new THREE.RingGeometry(3.6, 3.85, 48),
    new THREE.MeshBasicMaterial({ color: (p.team.color as THREE.Color).getHex(), transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false })
  );
  aura.rotation.x = -Math.PI / 2;
  aura.position.y = 0.03;
  aura.visible = false;

  const rig = vehicleRig("commander", p, { body, wheels, turret, gun, barrels, muzzles: barrels, flashes, spinners: [dish], aimPitch: 0.12, recoil: 0.18 }, 3.4,
    [{ id: "aura", label: "Hào quang" }],
    (_dt, t, a) => {
      aura.visible = a.has("aura");
      if (aura.visible) {
        const k = (t * 0.6) % 1;
        aura.scale.setScalar(0.85 + k * 0.25);
        (aura.material as THREE.MeshBasicMaterial).opacity = 0.6 * (1 - k);
      }
    });
  rig.root.add(aura);
  rig.defaultOn = ["aura"];
  return rig;
}

function buildLynx(p: Palette): Rig {
  const body = group();
  const wheels: { g: THREE.Object3D; r: number }[] = [];
  for (const side of [-1, 1])
    for (const z of [1.05, -1.05]) {
      const w = wheel(0.42, 0.34, p.rubber, p.metal);
      w.position.set(side * 0.95, 0.42, z);
      body.add(w);
      wheels.push({ g: w, r: 0.42 });
    }
  const nose = box(1.6, 0.4, 0.9, p.hull, 0, 0.78, 1.55);
  nose.rotation.x = 0.35;
  body.add(
    box(1.7, 0.6, 2.8, p.hull, 0, 0.8, -0.1),
    nose,
    box(1.74, 0.1, 1.6, p.team, 0, 1.12, -0.5),
    box(0.25, 0.12, 0.05, p.glass, -0.55, 0.85, 1.95),
    box(0.25, 0.12, 0.05, p.glass, 0.55, 0.85, 1.95)
  );
  const turret = group(box(0.85, 0.34, 1.0, p.hullDark, 0, 0.17, 0), box(0.5, 0.1, 0.5, p.team, 0, 0.38, -0.15));
  turret.position.set(0, 1.12, -0.2);
  const gun = group();
  gun.position.set(0, 0.2, 0.45);
  const b = barrel(1.05, 0.045, p.metal);
  const f = muzzleFlash(0.35, p.flash);
  f.position.z = 1.2;
  b.add(f);
  gun.add(b);
  turret.add(gun, cyl(0.015, 0.015, 1.0, p.metal, 4, -0.32, 0.65, -0.4));
  body.add(turret);
  return vehicleRig("lynx", p, { body, wheels, turret, gun, barrels: [b], muzzles: [b], flashes: [f], spinners: [], aimPitch: 0.08, recoil: 0.08 }, 2.6);
}

function buildTitan(p: Palette): Rig {
  const body = group();
  const tr = tracks(p, 1.05, 4.4, 0.32, 5);
  body.add(tr.g);
  const glacis = box(1.7, 0.45, 0.9, p.hull, 0, 0.95, 2.05);
  glacis.rotation.x = 0.45;
  body.add(box(1.7, 0.55, 3.9, p.hull, 0, 1.0, -0.1), glacis, box(1.4, 0.3, 0.6, p.hullDark, 0, 1.3, -1.8));
  const turret = group(box(1.55, 0.55, 1.9, p.hull, 0, 0.27, 0), box(1.57, 0.12, 1.2, p.team, 0, 0.5, -0.25), box(0.4, 0.2, 0.4, p.hullDark, 0.45, 0.63, -0.4));
  const front = box(1.2, 0.42, 0.5, p.hullDark, 0, 0.22, 1.05);
  front.rotation.x = -0.3;
  turret.add(front);
  turret.position.set(0, 1.28, -0.25);
  const gun = group();
  gun.position.set(0, 0.28, 1.1);
  const b = barrel(2.5, 0.1, p.metal);
  b.add(cyl(0.15, 0.15, 0.3, p.hullDark, 8, 0, 0, 2.45).rotateX(Math.PI / 2));
  const f = muzzleFlash(0.9, p.flash);
  f.position.z = 2.95;
  b.add(f);
  gun.add(b);
  turret.add(gun);
  body.add(turret);
  return vehicleRig("titan", p, { body, wheels: tr.wheels, turret, gun, barrels: [b], muzzles: [b], flashes: [f], spinners: [], aimPitch: 0.06, recoil: 0.32 }, 3.6);
}

function buildSkyguard(p: Palette): Rig {
  const body = group();
  const tr = tracks(p, 0.95, 3.8, 0.28, 4);
  body.add(tr.g, box(1.5, 0.55, 3.5, p.hull, 0, 0.9, 0), box(1.52, 0.1, 2.0, p.team, 0, 1.2, -0.5));
  const turret = group(cyl(0.55, 0.65, 0.4, p.hullDark, 10, 0, 0.2, 0));
  turret.position.set(0, 1.18, -0.2);
  const gun = group();
  gun.position.set(0, 0.6, 0);
  const muzzles: THREE.Object3D[] = [];
  const barrels: THREE.Object3D[] = [];
  for (const side of [-1, 1]) {
    const pod = group(box(0.5, 0.5, 1.2, p.hull), box(0.52, 0.08, 1.22, p.team, 0, 0.27, 0));
    pod.position.set(side * 0.62, 0, 0.1);
    for (const [dx, dy] of [[-0.12, -0.12], [0.12, -0.12], [-0.12, 0.12], [0.12, 0.12]] as const) {
      const hole = cyl(0.08, 0.08, 0.05, p.metal, 8, dx, dy, 0.6);
      hole.rotation.x = Math.PI / 2;
      pod.add(hole);
      const m = group();
      m.position.set(dx, dy, 0.65);
      pod.add(m);
      muzzles.push(m);
    }
    pod.userData.z0 = 0.1;
    barrels.push(pod);
    gun.add(pod);
  }
  // radar dò tìm phía sau tháp
  const radar = group(box(0.9, 0.5, 0.06, p.hullDark), box(0.7, 0.35, 0.07, p.teamGlow, 0, 0, 0.01));
  radar.position.set(0, 0.95, -0.45);
  turret.add(gun, cyl(0.05, 0.05, 0.5, p.metal, 6, 0, 0.65, -0.45), radar);
  body.add(turret);
  return vehicleRig("skyguard", p, { body, wheels: tr.wheels, turret, gun, barrels, muzzles, flashes: [], spinners: [radar], aimPitch: 0.6, recoil: 0.05, missiles: true }, 3.2);
}

// ---------------------------------------------------------------- máy bay

function wingShape(points: [number, number][], thickness: number, mat: THREE.Material, mirror: boolean): THREE.Mesh {
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
  return m;
}

interface AirParts {
  frame: THREE.Group;
  gear: THREE.Group;
  engines: THREE.Mesh[];
  /** Độ cao thân máy bay khi đậu (bánh chạm đất). */
  parkY: number;
  flyY: number;
  fire(dt: number, on: boolean, flying: boolean): void;
}

const AIR_ACTIONS: RigAction[] = [
  { id: "fly", label: "Cất cánh & bay" },
  { id: "fire", label: "Khai hỏa" }
];

function aircraftRig(parts: AirParts, radius: number): Rig {
  const root = group(parts.frame);
  let alt = parts.parkY;
  let gearT = 1;
  let roll = 0;
  let pitch = 0;
  let yaw = 0;
  let throttle = 0.3;
  parts.frame.position.y = alt;
  return {
    root,
    actions: AIR_ACTIONS,
    defaultOn: [],
    radius,
    update(dt, t, a) {
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

function gearLeg(p: Palette, x: number, z: number, h: number, r: number): THREE.Group {
  const g = group(box(0.06, h, 0.06, p.metal, 0, -h / 2, 0), wheel(r, 0.1, p.rubber, p.metal));
  (g.children[1] as THREE.Object3D).position.y = -h;
  g.position.set(x, 0, z);
  return g;
}

function engineGlow(p: Palette, r: number, len: number): THREE.Mesh {
  // Nón có đáy ở gốc, đỉnh ở +Y; xoay -90° quanh X thì đỉnh chĩa về -Z (phía đuôi).
  // Nhờ vậy scale.y của mesh chính là độ dài luồng lửa: tăng ga thì lửa phụt dài ra.
  const geo = new THREE.ConeGeometry(r, len, 8);
  geo.translate(0, len / 2, 0);
  const m = new THREE.Mesh(geo, p.engine);
  m.rotation.x = -Math.PI / 2;
  return m;
}

function buildFalcon(p: Palette): Rig {
  const frame = group();
  frame.add(
    tubeZ(0.26, 0.32, 3.0, p.hull, 10),
    box(0.34, 0.3, 1.1, p.hullDark, -0.3, -0.05, 0.1),
    box(0.34, 0.3, 1.1, p.hullDark, 0.3, -0.05, 0.1)
  );
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.26, 1.1, 10), p.hull);
  nose.rotation.x = Math.PI / 2;
  nose.position.z = 2.05;
  nose.castShadow = true;
  const canopy = sphere(0.22, p.glass, 0, 0.22, 0.95);
  canopy.scale.set(1, 0.8, 2.4);
  frame.add(nose, canopy);
  for (const mirror of [false, true]) {
    const sx = mirror ? -1 : 1;
    frame.add(wingShape([[0.25, 0.7], [2.0, -0.8], [2.0, -1.15], [0.25, -1.2]], 0.07, p.hull, mirror));
    frame.add(wingShape([[1.55, -0.45], [2.02, -0.82], [2.02, -1.16], [1.55, -1.18]], 0.08, p.team, mirror));
    const canard = wingShape([[0.25, 1.25], [0.75, 0.95], [0.75, 0.82], [0.25, 0.85]], 0.05, p.hullDark, mirror);
    frame.add(canard);
    const fin = wingShape([[0, -0.6], [0.0, -1.5], [0.75, -1.55], [0.75, -1.3]], 0.06, p.team, false);
    fin.rotation.z = Math.PI / 2 - sx * 0.3;
    fin.position.set(sx * 0.28, 0.12, 0);
    frame.add(fin);
  }
  frame.add(cyl(0.24, 0.2, 0.3, p.metal, 10, 0, 0, -1.62).rotateX(Math.PI / 2));
  const glow = engineGlow(p, 0.18, 1.0);
  glow.position.z = -1.75;
  frame.add(glow);

  const pylons: { m: THREE.Group; cd: number }[] = [];
  for (const x of [-1.35, -0.85, 0.85, 1.35]) {
    const m = missileMesh(p, 0.6, 0.05);
    (m.children[2] as THREE.Object3D).visible = false;
    m.position.set(x, -0.12, -0.25);
    frame.add(m);
    pylons.push({ m, cd: 0 });
  }
  const gear = group(gearLeg(p, 0, 1.2, 0.5, 0.1), gearLeg(p, -0.45, -0.35, 0.5, 0.12), gearLeg(p, 0.45, -0.35, 0.5, 0.12));
  frame.add(gear);

  // Đạn bay trong hệ tọa độ của root (không bị nghiêng theo thân máy bay); root chỉ có sau khi tạo rig.
  let shots: Shots | undefined;
  const clock = new FireClock(0.55);
  let next = 0;
  const rig = aircraftRig(
    {
      frame,
      gear,
      engines: [glow],
      parkY: 0.62,
      flyY: 2.6,
      fire(dt, on) {
        if (clock.tick(dt, on)) {
          const slot = pylons[next]!;
          next = (next + 1) % pylons.length;
          if (slot.cd <= 0) {
            slot.m.visible = false;
            slot.cd = 1.6;
            frame.getWorldDirection(V);
            shots?.spawn(missileMesh(p, 0.6, 0.05), slot.m, V.clone().multiplyScalar(22).add(new THREE.Vector3(0, -1.5, 0)), 0.9);
          }
        }
        for (const s of pylons) if (s.cd > 0 && (s.cd -= dt) <= 0) s.m.visible = true;
        shots?.update(dt);
      }
    },
    3.0
  );
  shots = new Shots(rig.root);
  return rig;
}

function buildValkyrie(p: Palette): Rig {
  const frame = group();
  frame.add(tubeZ(0.42, 0.5, 4.4, p.hull, 12), box(0.7, 0.35, 2.2, p.hullDark, 0, -0.32, 0.2));
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.2, 12), p.hull);
  nose.rotation.x = Math.PI / 2;
  nose.position.z = 2.8;
  nose.castShadow = true;
  const canopy = sphere(0.3, p.glass, 0, 0.3, 2.0);
  canopy.scale.set(1.1, 0.7, 1.8);
  frame.add(nose, canopy);
  const engines: THREE.Mesh[] = [];
  for (const mirror of [false, true]) {
    const sx = mirror ? -1 : 1;
    frame.add(wingShape([[0.35, 0.9], [3.1, 0.05], [3.1, -0.45], [0.35, -0.6]], 0.1, p.hull, mirror));
    frame.add(wingShape([[2.6, 0.2], [3.12, 0.04], [3.12, -0.46], [2.6, -0.5]], 0.11, p.team, mirror));
    frame.add(wingShape([[0.3, -1.6], [1.3, -2.0], [1.3, -2.25], [0.3, -2.3]], 0.07, p.hullDark, mirror));
    for (const x of [1.15, 2.05]) {
      const pod = tubeZ(0.18, 0.2, 1.1, p.hullDark, 10);
      pod.position.set(sx * x, -0.22, 0.35);
      frame.add(pod);
      const g = engineGlow(p, 0.14, 0.8);
      g.position.set(sx * x, -0.22, -0.2);
      frame.add(g);
      engines.push(g);
    }
  }
  const fin = wingShape([[0, -1.1], [0, -2.35], [1.2, -2.4], [1.2, -2.0]], 0.08, p.team, false);
  fin.rotation.z = Math.PI / 2;
  fin.position.y = 0.3;
  frame.add(fin);

  // khoang bom: 2 cửa mở sang hai bên
  const doors: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const hinge = group(box(0.34, 0.04, 1.6, p.hullDark, side * 0.17, 0, 0));
    hinge.position.set(side * 0.0, -0.5, 0.25);
    doors.push(hinge);
    frame.add(hinge);
  }
  const bay = group();
  bay.position.set(0, -0.45, 0.25);
  frame.add(bay);
  const gear = group(gearLeg(p, 0, 1.9, 0.7, 0.14), gearLeg(p, -0.9, -0.2, 0.7, 0.16), gearLeg(p, 0.9, -0.2, 0.7, 0.16));
  frame.add(gear);

  let rigRoot: THREE.Object3D = frame;
  const bombs: { o: THREE.Mesh; v: THREE.Vector3 }[] = [];
  const clock = new FireClock(0.5);
  let doorT = 0;
  const rig = aircraftRig(
    {
      frame,
      gear,
      engines,
      parkY: 0.86,
      flyY: 3.2,
      fire(dt, on) {
        doorT = approach(doorT, on ? 1 : 0, 6, dt);
        doors.forEach((d, i) => (d.rotation.z = (i ? -1 : 1) * doorT * 1.3));
        if (clock.tick(dt, on && doorT > 0.6)) {
          const b = sphere(0.12, p.metal);
          b.scale.set(1, 1, 2.2);
          rigRoot.updateMatrixWorld(true);
          bay.getWorldPosition(V);
          rigRoot.worldToLocal(V);
          b.position.copy(V);
          rigRoot.add(b);
          frame.getWorldDirection(V);
          bombs.push({ o: b, v: V.clone().multiplyScalar(2.5) });
        }
        for (let i = bombs.length - 1; i >= 0; i--) {
          const s = bombs[i]!;
          s.v.y -= 9.8 * dt;
          s.o.position.addScaledVector(s.v, dt);
          s.o.lookAt(V.copy(s.o.position).add(s.v));
          if (s.o.position.y <= 0.1) {
            blast(rigRoot, s.o.position, p, 0.6);
            rigRoot.remove(s.o);
            s.o.geometry.dispose();
            bombs.splice(i, 1);
          }
        }
      }
    },
    3.8
  );
  rigRoot = rig.root;
  return rig;
}

const BUILDERS: Record<UnitId, (p: Palette) => Rig> = {
  commander: buildCommander,
  lynx: buildLynx,
  titan: buildTitan,
  skyguard: buildSkyguard,
  falcon: buildFalcon,
  valkyrie: buildValkyrie
};

export function buildUnit(id: UnitId, faction: Faction): Rig {
  return BUILDERS[id](palette(faction));
}
