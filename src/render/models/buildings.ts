/**
 * Mô hình 10 công trình (BẢN NHẸ). Mỗi công trình có hoạt ảnh "Vận hành" riêng
 * và các tháp có vũ khí thì có thêm "Ngắm" / "Khai hỏa".
 */
import * as THREE from "three";
import { BUILDINGS, type BuildingId, type Faction } from "../../sim/content";
import { approach, box, cyl, FireClock, group, muzzleFlash, palette, sphere, tubeZ, type Palette, type Rig, type RigAction } from "./kit";
import { buildUnit } from "./units";

const WORK: RigAction = { id: "work", label: "Vận hành" };
const AIM: RigAction = { id: "aim", label: "Ngắm" };
const FIRE: RigAction = { id: "fire", label: "Khai hỏa" };
const POWER: RigAction = { id: "power", label: "Vùng phủ điện" };

type Update = (dt: number, t: number, a: ReadonlySet<string>) => void;

function rig(root: THREE.Group, actions: RigAction[], radius: number, updates: Update[], defaultOn: string[] = ["work"]): Rig {
  return {
    root,
    actions,
    defaultOn,
    radius,
    update(dt, t, a) {
      for (const u of updates) u(dt, t, a);
    }
  };
}

/** Nền móng bê tông có viền màu phe. */
function foundation(p: Palette, w: number, d: number, h = 0.25): THREE.Group {
  return group(box(w, h, d, p.concrete, 0, h / 2, 0), box(w + 0.08, 0.08, 0.3, p.team, 0, h, d / 2 - 0.15), box(w + 0.08, 0.08, 0.3, p.team, 0, h, -d / 2 + 0.15));
}

/** Vòng tròn nhấp nháy trên mặt đất (vùng phủ điện, vùng chiếm đóng). */
function groundRing(p: Palette, radius: number, actionId: string): { mesh: THREE.Mesh; update: Update } {
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
function blinker(mat: THREE.MeshStandardMaterial, rate: number, phase = 0): Update {
  const base = mat.emissiveIntensity;
  return (_dt, t, a) => {
    mat.emissiveIntensity = a.has("work") ? base * (0.35 + 0.65 * (Math.sin(t * rate + phase) > 0 ? 1 : 0.2)) : base * 0.3;
  };
}

/** Tháp pháo quét ngắm và bắn theo chu kỳ của vũ khí trong content.ts. */
function turretUpdate(turret: THREE.Object3D, gun: THREE.Object3D | null, flashes: THREE.Mesh[], cooldown: number, aimPitch: number, sweep = 1.2): Update {
  const clock = new FireClock(Math.max(0.12, cooldown));
  let yaw = 0;
  let pitch = 0;
  let i = 0;
  return (dt, t, a) => {
    const aiming = a.has("aim") || a.has("fire");
    yaw = approach(yaw, a.has("aim") ? Math.sin(t * 0.6) * sweep : 0, 3, dt);
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

function buildHQ(p: Palette, faction: Faction): Rig {
  const root = group(foundation(p, 6.6, 6.6));
  root.add(
    box(4.6, 2.2, 4.6, p.hull, 0, 1.35, 0),
    box(4.64, 0.3, 4.64, p.team, 0, 2.3, 0),
    box(2.4, 1.6, 2.4, p.hullDark, -0.6, 3.25, -0.6),
    box(2.44, 0.25, 0.08, p.glass, -0.6, 3.5, 0.62),
    box(0.08, 0.25, 2.44, p.glass, 0.62, 3.5, -0.6),
    box(1.4, 1.0, 0.1, p.metal, 0, 0.75, 2.33),
    box(1.5, 0.12, 0.2, p.warning, 0, 1.32, 2.36)
  );
  const lamp = (p.teamGlow.clone() as THREE.MeshStandardMaterial);
  root.add(cyl(0.05, 0.05, 1.8, p.metal, 4, -1.5, 4.9, -1.5), sphere(0.12, lamp, -1.5, 5.85, -1.5));
  const dish = group(cyl(0.1, 0.1, 0.4, p.metal, 6, 0, 0.2, 0), box(1.6, 0.08, 0.7, p.hullDark, 0, 0.45, 0), box(0.2, 0.25, 0.2, p.teamGlow, 0, 0.6, 0.1));
  dish.position.set(-0.6, 4.05, -0.6);
  root.add(dish);
  // pháo kép tự vệ ở góc trước
  const turret = group(cyl(0.55, 0.65, 0.4, p.hullDark, 10, 0, 0.2, 0), box(0.8, 0.4, 0.9, p.hull, 0, 0.55, 0));
  turret.position.set(1.3, 2.45, 1.3);
  const gun = group();
  gun.position.set(0, 0.55, 0.4);
  const flashes: THREE.Mesh[] = [];
  for (const x of [-0.18, 0.18]) {
    const b = tubeZ(0.07, 0.07, 1.1, p.metal, 8);
    b.position.set(x, 0, 0.55);
    const f = muzzleFlash(0.5, p.flash);
    f.position.set(x, 0, 1.35);
    gun.add(b, f);
    flashes.push(f);
  }
  turret.add(gun);
  root.add(turret);
  const ring = groundRing(p, 6.2, "power");
  root.add(ring.mesh);
  void faction;
  const w = BUILDINGS.hq.weapon!;
  return rig(root, [WORK, AIM, FIRE, POWER], 4.6, [
    (dt, _t, a) => a.has("work") && (dish.rotation.y += dt * 1.4),
    blinker(lamp, 5),
    turretUpdate(turret, gun, flashes, w.cooldown, 0.1),
    ring.update
  ]);
}

function buildOutpost(p: Palette): Rig {
  const root = group(cyl(2.6, 2.8, 0.3, p.concrete, 6, 0, 0.15, 0));
  root.add(cyl(1.9, 2.2, 1.3, p.hull, 6, 0, 0.95, 0), cyl(1.95, 1.95, 0.18, p.team, 6, 0, 1.55, 0));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    const slit = box(0.6, 0.12, 0.1, p.metal, Math.sin(a) * 2.02, 1.1, Math.cos(a) * 2.02);
    slit.rotation.y = a;
    root.add(slit);
  }
  const pole = cyl(0.04, 0.05, 2.6, p.metal, 5, -1.3, 2.9, -1.0);
  const flag = group(box(0.9, 0.5, 0.03, p.team, 0.45, 0, 0));
  flag.position.set(-1.3, 3.95, -1.0);
  root.add(pole, flag);
  const turret = group(cyl(0.6, 0.7, 0.35, p.hullDark, 8, 0, 0.18, 0), box(0.7, 0.35, 0.8, p.hull, 0, 0.5, 0));
  turret.position.y = 1.65;
  const gun = group();
  gun.position.set(0, 0.5, 0.35);
  const b = tubeZ(0.08, 0.08, 1.2, p.metal, 8);
  b.position.z = 0.6;
  const f = muzzleFlash(0.5, p.flash);
  f.position.z = 1.45;
  gun.add(b, f);
  turret.add(gun);
  root.add(turret);
  const ring = groundRing(p, 4.2, "capture");
  root.add(ring.mesh);
  return rig(root, [WORK, AIM, FIRE, { id: "capture", label: "Vùng chiếm đóng" }], 3.4, [
    (_dt, t, a) => (flag.rotation.y = a.has("work") ? Math.sin(t * 3) * 0.35 : 0),
    turretUpdate(turret, gun, [f], BUILDINGS.outpost.weapon!.cooldown, 0.08, 2.5),
    ring.update
  ]);
}

function buildPowerPlant(p: Palette): Rig {
  const root = group(foundation(p, 6, 4.6));
  root.add(box(2.8, 1.8, 3.2, p.hull, 1.3, 1.15, 0), box(2.84, 0.2, 3.24, p.team, 1.3, 2.05, 0));
  // tháp giải nhiệt dạng hyperboloid (LatheGeometry: xoay một đường cong quanh trục Y)
  const profile: THREE.Vector2[] = [];
  for (let i = 0; i <= 10; i++) {
    const y = (i / 10) * 3.6;
    const r = 1.05 - 0.45 * Math.sin((i / 10) * Math.PI * 0.85);
    profile.push(new THREE.Vector2(r, y));
  }
  const tower = new THREE.Mesh(new THREE.LatheGeometry(profile, 18), p.concrete);
  tower.material = p.concrete;
  tower.castShadow = tower.receiveShadow = true;
  tower.position.set(-1.4, 0.25, 0);
  root.add(tower, cyl(0.8, 0.8, 0.12, p.team, 18, -1.4, 3.45, 0));
  const coil = p.teamGlow.clone() as THREE.MeshStandardMaterial;
  for (const z of [-0.9, 0, 0.9]) root.add(cyl(0.22, 0.22, 0.6, coil, 8, 2.2, 2.4, z));
  const fan = group(box(1.2, 0.05, 0.18, p.metal), box(0.18, 0.05, 1.2, p.metal));
  fan.position.set(0.8, 2.2, 0.7);
  root.add(fan, cyl(0.68, 0.68, 0.1, p.hullDark, 16, 0.8, 2.12, 0.7));
  const puffs: THREE.Mesh[] = [];
  for (let i = 0; i < 6; i++) {
    const s = sphere(0.45, p.smoke, -1.4, 3.8, 0, 8);
    s.castShadow = false;
    s.userData.phase = i / 6;
    puffs.push(s);
    root.add(s);
  }
  const ring = groundRing(p, 5.5, "power");
  root.add(ring.mesh);
  return rig(root, [WORK, POWER], 3.8, [
    (dt, t, a) => {
      const on = a.has("work");
      if (on) fan.rotation.y += dt * 9;
      coil.emissiveIntensity = on ? 1.2 + Math.sin(t * 6) * 0.6 : 0.3;
      for (const s of puffs) {
        s.visible = on;
        const k = (t * 0.25 + (s.userData.phase as number)) % 1;
        s.position.set(-1.4 + k * 0.6, 3.8 + k * 2.6, k * 0.3);
        s.scale.setScalar(0.5 + k * 1.3);
        (s.material as THREE.MeshStandardMaterial).opacity = 0.55;
      }
    },
    ring.update
  ]);
}

function buildPowerPylon(p: Palette): Rig {
  const root = group(box(1.8, 0.2, 1.8, p.concrete, 0, 0.1, 0));
  const H = 5;
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const leg = box(0.1, H, 0.1, p.metal, x * 0.42, H / 2, z * 0.42);
    leg.rotation.z = x * 0.12;
    leg.rotation.x = -z * 0.12;
    root.add(leg);
  }
  for (let i = 1; i <= 4; i++) {
    const y = (i / 5) * H;
    const s = 0.8 * (1 - (i / 5) * 0.55);
    root.add(box(s * 2 + 0.1, 0.06, 0.06, p.metal, 0, y, s), box(s * 2 + 0.1, 0.06, 0.06, p.metal, 0, y, -s), box(0.06, 0.06, s * 2 + 0.1, p.metal, s, y, 0), box(0.06, 0.06, s * 2 + 0.1, p.metal, -s, y, 0));
  }
  root.add(box(3.0, 0.14, 0.14, p.metal, 0, H - 0.3, 0), box(2.0, 0.12, 0.12, p.metal, 0, H - 1.1, 0), box(0.5, 0.25, 0.5, p.team, 0, H + 0.05, 0));
  const glow = p.teamGlow.clone() as THREE.MeshStandardMaterial;
  const cables: THREE.Mesh[] = [];
  for (const [x, y] of [[-1.4, H - 0.3], [1.4, H - 0.3], [-0.9, H - 1.1], [0.9, H - 1.1]] as const) {
    root.add(cyl(0.07, 0.07, 0.45, p.white, 6, x, y - 0.3, 0), sphere(0.08, glow, x, y - 0.55, 0, 6));
    // dây cáp võng xuống hai phía (đường cong Catmull-Rom → ống)
    for (const dir of [-1, 1]) {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(x, y - 0.55, 0),
        new THREE.Vector3(x, y - 1.2, dir * 1.6),
        new THREE.Vector3(x, y - 1.35, dir * 3.2)
      ]);
      const c = new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.025, 4), p.rubber);
      cables.push(c);
      root.add(c);
    }
  }
  const ring = groundRing(p, 5.5, "power");
  root.add(ring.mesh);
  return rig(root, [WORK, POWER], 3.8, [(_dt, t, a) => (glow.emissiveIntensity = a.has("work") ? 1 + Math.abs(Math.sin(t * 4)) * 1.6 : 0.3), ring.update]);
}

function buildOilExtractor(p: Palette): Rig {
  const root = group(foundation(p, 6, 4));
  // cần bơm dầu (pumpjack): khung chữ A, đòn gánh gật lên xuống, đầu ngựa, tay quay
  for (const x of [-0.35, 0.35]) {
    const legF = box(0.12, 2.4, 0.12, p.hullDark, x, 1.35, 0.35);
    legF.rotation.x = -0.25;
    const legB = box(0.12, 2.4, 0.12, p.hullDark, x, 1.35, -0.35);
    legB.rotation.x = 0.25;
    root.add(legF, legB);
  }
  const beam = group(box(0.3, 0.3, 4.0, p.team, 0, 0, 0.2), box(0.5, 1.0, 0.4, p.hull, 0, -0.25, 2.25));
  beam.position.set(0, 2.55, 0);
  const crank = group(box(0.15, 1.3, 0.3, p.hullDark, 0, -0.45, 0), box(0.4, 0.5, 0.5, p.metal, 0, -0.95, 0));
  crank.position.set(0.45, 1.2, -1.75);
  const rod = box(0.06, 1.3, 0.06, p.metal, 0, 0, 0);
  root.add(beam, crank, rod, box(1.0, 0.8, 1.0, p.hullDark, 0.45, 0.65, -1.75));
  const wellhead = cyl(0.18, 0.25, 0.7, p.metal, 8, 0, 0.6, 2.45);
  root.add(wellhead);
  // bồn chứa
  root.add(cyl(0.9, 0.9, 2.0, p.hull, 16, -1.9, 1.25, 0.4), cyl(0.92, 0.92, 0.25, p.team, 16, -1.9, 1.7, 0.4), cyl(0.9, 0.7, 0.2, p.hullDark, 16, -1.9, 2.35, 0.4));
  const pipe = tubeZ(0.08, 0.08, 2.2, p.metal, 6);
  pipe.position.set(-1.0, 0.45, 1.5);
  pipe.rotation.y = Math.PI / 2.6;
  root.add(pipe);
  let ang = 0;
  return rig(root, [WORK], 3.6, [
    (dt, _t, a) => {
      if (a.has("work")) ang += dt * 2.2;
      const tilt = Math.sin(ang) * 0.28;
      beam.rotation.x = tilt;
      crank.rotation.x = ang;
      // Thanh truyền nối chốt tay quay với đuôi đòn gánh.
      // Xoay quanh trục X góc θ: điểm (y=0, z) đi tới y' = -z·sinθ. Đuôi đòn gánh ở z = -1.8 so với trục.
      const tailY = 2.55 + 1.8 * Math.sin(tilt) - 0.15;
      // Chốt tay quay ở y = -0.95 trong khung tay quay: y' = -0.95·cos(ang)
      const crankY = 1.2 - 0.95 * Math.cos(ang);
      rod.position.set(0.3, (tailY + crankY) / 2, -1.75);
      rod.scale.y = Math.max(0.2, (tailY - crankY) / 1.3);
    }
  ]);
}

function buildAirfield(p: Palette, faction: Faction): Rig {
  const root = group(box(10, 0.18, 8, p.concreteDark, 0, 0.09, 0));
  const lights: THREE.MeshStandardMaterial[] = [];
  const padPos: [number, number][] = [[-2.4, -1.8], [2.4, -1.8], [-2.4, 1.8], [2.4, 1.8]];
  padPos.forEach(([x, z], i) => {
    root.add(box(4.2, 0.04, 3.2, p.concrete, x, 0.2, z));
    root.add(box(0.15, 0.03, 1.4, p.white, x - 0.4, 0.23, z), box(0.15, 0.03, 1.4, p.white, x + 0.4, 0.23, z), box(0.8, 0.03, 0.15, p.white, x, 0.23, z));
    const m = p.teamGlow.clone() as THREE.MeshStandardMaterial;
    lights.push(m);
    for (const [dx, dz] of [[-2, -1.5], [2, -1.5], [-2, 1.5], [2, 1.5]] as const) root.add(sphere(0.08, m, x + dx, 0.26, z + dz, 6));
    void i;
  });
  root.add(box(10.05, 0.06, 0.25, p.warning, 0, 0.2, 0));
  // đài kiểm soát không lưu
  const tower = group(cyl(0.45, 0.55, 3.2, p.hull, 8, 0, 1.6, 0), cyl(0.85, 0.7, 0.7, p.glass, 8, 0, 3.5, 0), cyl(0.9, 0.9, 0.12, p.team, 8, 0, 3.9, 0));
  const beacon = group(box(0.5, 0.15, 0.15, p.teamGlow), cyl(0.05, 0.05, 0.3, p.metal, 4, 0, -0.15, 0));
  beacon.position.y = 4.15;
  tower.add(beacon);
  tower.position.set(5.6, 0, 3.2);
  root.add(tower, cyl(0.6, 0.6, 1.4, p.hull, 12, 5.6, 0.7, -3), cyl(0.62, 0.62, 0.2, p.team, 12, 5.6, 1.0, -3));
  // một chiếc Falcon đang đậu trên bãi số 1
  const falcon = buildUnit("falcon", faction);
  falcon.root.scale.setScalar(0.8);
  falcon.root.position.set(-2.4, 0.2, -1.8);
  root.add(falcon.root);
  return rig(root, [WORK], 6.2, [
    (dt, t, a) => {
      const on = a.has("work");
      if (on) beacon.rotation.y += dt * 3;
      lights.forEach((m, i) => (m.emissiveIntensity = on ? (Math.floor(t * 2.5) % 4 === i ? 2.4 : 0.6) : 0.3));
    }
  ]);
}

function buildAmmoDepot(p: Palette): Rig {
  const root = group(foundation(p, 5.4, 4.4));
  root.add(box(4, 1.6, 3.2, p.hull, 0, 1.05, -0.4));
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(1.65, 1.65, 4.04, 14, 1, false, 0, Math.PI), p.team);
  roof.rotation.z = Math.PI / 2;
  roof.rotation.y = Math.PI / 2;
  roof.position.set(0, 1.85, -0.4);
  roof.scale.set(1, 1, 0.45);
  roof.castShadow = true;
  root.add(roof, box(1.4, 1.2, 0.08, p.metal, 0, 0.85, 1.22), box(1.5, 0.1, 0.1, p.warning, 0, 1.5, 1.24));
  for (const [x, z] of [[-2.2, 1.5], [-1.7, 1.6], [-2.0, 1.1]] as const) root.add(box(0.45, 0.45, 0.45, p.wood, x, 0.48, z));
  // đường ray: 2 thanh thép + tà vẹt gỗ, chạy ra khỏi kho
  const len = 7;
  const rail = group();
  for (const x of [-0.35, 0.35]) rail.add(box(0.07, 0.1, len, p.metal, x, 0.32, 0));
  for (let i = 0; i < 14; i++) rail.add(box(1.0, 0.06, 0.18, p.wood, 0, 0.26, -len / 2 + 0.25 + i * 0.5));
  rail.position.set(0, 0, 1.2 + len / 2 - 0.4);
  root.add(rail);
  const cart = group(box(0.85, 0.3, 1.0, p.hullDark, 0, 0.55, 0), box(0.6, 0.35, 0.6, p.wood, 0, 0.88, 0), box(0.62, 0.06, 0.62, p.team, 0, 1.07, 0));
  for (const x of [-0.35, 0.35]) for (const z of [-0.35, 0.35]) {
    const w = cyl(0.12, 0.12, 0.06, p.metal, 8, x, 0.42, z);
    w.rotation.z = Math.PI / 2;
    cart.add(w);
  }
  root.add(cart);
  const crate = cart.children[1]!;
  let s = 0;
  return rig(root, [WORK], 4.8, [
    (dt, _t, a) => {
      if (a.has("work")) s += dt * 0.25;
      const k = 0.5 - 0.5 * Math.cos(s * Math.PI * 2);
      cart.position.z = 1.5 + k * (len - 1.6);
      // đi ra thì chở đạn, quay về thì thùng rỗng
      crate.visible = Math.sin(s * Math.PI * 2) >= 0;
    }
  ]);
}

function buildCIWS(p: Palette): Rig {
  const root = group(cyl(1.3, 1.5, 0.35, p.concrete, 10, 0, 0.17, 0), cyl(0.7, 0.85, 0.9, p.hullDark, 10, 0, 0.8, 0));
  const turret = group(box(1.1, 0.8, 1.2, p.hull, 0, 0.45, -0.1), box(1.12, 0.12, 1.22, p.team, 0, 0.88, -0.1));
  const dome = sphere(0.5, p.white, 0, 1.1, -0.1, 12);
  dome.scale.set(1, 1.2, 1);
  turret.add(dome, box(0.35, 0.5, 0.5, p.hullDark, 0.7, 0.45, -0.2));
  turret.position.y = 1.25;
  const gun = group();
  gun.position.set(0, 0.4, 0.5);
  const spin = group();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const b = tubeZ(0.035, 0.035, 1.3, p.metal, 5);
    b.position.set(Math.cos(a) * 0.11, Math.sin(a) * 0.11, 0.65);
    spin.add(b);
  }
  spin.add(cyl(0.16, 0.16, 0.12, p.hullDark, 8, 0, 0, 0.8).rotateX(Math.PI / 2), cyl(0.16, 0.16, 0.12, p.hullDark, 8, 0, 0, 0.2).rotateX(Math.PI / 2));
  const f = muzzleFlash(0.45, p.flash);
  f.position.z = 1.5;
  gun.add(spin, f);
  turret.add(gun);
  root.add(turret);
  const w = BUILDINGS["aa-ciws"].weapon!;
  let spinRate = 0;
  return rig(root, [AIM, FIRE], 2.2, [
    turretUpdate(turret, gun, [f], w.cooldown, 0.7),
    (dt, _t, a) => {
      spinRate = approach(spinRate, a.has("fire") ? 30 : 0, 3, dt);
      spin.rotation.z += spinRate * dt;
    }
  ], []);
}

function buildSAM(p: Palette): Rig {
  const root = group(foundation(p, 3.6, 3.6));
  root.add(cyl(0.6, 0.7, 0.5, p.hullDark, 10, 0, 0.5, 0));
  const turret = group(box(1.6, 0.25, 1.6, p.hull, 0, 0.12, 0));
  turret.position.y = 0.75;
  const gun = group(box(1.45, 0.1, 2.3, p.hullDark, 0, 0.0, 1.1));
  gun.position.set(0, 0.42, -0.6);
  // bản lề phía sau + ty thủy lực phía trước đỡ cụm ống phóng
  turret.add(box(1.0, 0.3, 0.35, p.metal, 0, 0.35, -0.6));
  const piston = cyl(0.07, 0.07, 1, p.metal, 6);
  turret.add(piston);
  const tubes: THREE.Group[] = [];
  for (const [x, y] of [[-0.35, 0.3], [0.35, 0.3], [-0.35, 0.85], [0.35, 0.85]] as const) {
    const c = group(box(0.6, 0.5, 2.2, p.hull, 0, 0, 1.1), box(0.62, 0.52, 0.08, p.team, 0, 0, 2.2));
    c.position.set(x, y, 0);
    const m = group();
    m.position.z = 2.3;
    c.add(m);
    tubes.push(m);
    gun.add(c);
  }
  turret.add(gun);
  root.add(turret);
  // radar điều khiển hỏa lực trên cột riêng
  const radar = group(box(1.0, 0.7, 0.08, p.hullDark), box(0.8, 0.55, 0.09, p.teamGlow, 0, 0, 0.01));
  radar.position.set(-1.3, 2.3, -1.2);
  root.add(cyl(0.05, 0.06, 1.8, p.metal, 6, -1.3, 1.2, -1.2), radar);
  const shots: { o: THREE.Object3D; v: THREE.Vector3; life: number }[] = [];
  const clock = new FireClock(BUILDINGS["aa-sam"].weapon!.cooldown);
  const V = new THREE.Vector3();
  let next = 0;
  const pA = new THREE.Vector3();
  const pB = new THREE.Vector3();
  return rig(root, [WORK, AIM, FIRE], 3.4, [
    (dt, _t, a) => a.has("work") && (radar.rotation.y += dt * 1.6),
    turretUpdate(turret, gun, [], 1, 0.62, 0.9),
    () => {
      // ty thủy lực: từ chân trên mặt tháp tới điểm dưới bụng cụm ống (z = 1.3 trong khung nòng)
      pA.set(0, 0.25, 0.75);
      const th = gun.rotation.x;
      pB.set(0, gun.position.y - 1.3 * Math.sin(th), gun.position.z + 1.3 * Math.cos(th));
      piston.position.copy(pA).add(pB).multiplyScalar(0.5);
      piston.scale.y = Math.max(0.05, pA.distanceTo(pB));
      piston.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), pB.sub(pA).normalize());
    },
    (dt, _t, a) => {
      if (clock.tick(dt, a.has("fire"))) {
        const from = tubes[next]!;
        next = (next + 1) % tubes.length;
        const m = group(tubeZ(0.1, 0.1, 1.0, p.white, 8), muzzleFlash(0.6, p.flash));
        (m.children[1] as THREE.Mesh).visible = true;
        (m.children[1] as THREE.Mesh).rotation.x = -Math.PI / 2;
        (m.children[1] as THREE.Mesh).position.z = -0.8;
        root.updateMatrixWorld(true);
        from.getWorldPosition(V);
        root.worldToLocal(V);
        m.position.copy(V);
        from.getWorldDirection(V);
        m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), V);
        root.add(m);
        shots.push({ o: m, v: V.clone().multiplyScalar(14), life: 1.2 });
      }
      for (let i = shots.length - 1; i >= 0; i--) {
        const s = shots[i]!;
        s.o.position.addScaledVector(s.v, dt);
        if ((s.life -= dt) <= 0) {
          root.remove(s.o);
          s.o.traverse((c) => c instanceof THREE.Mesh && c.geometry.dispose());
          shots.splice(i, 1);
        }
      }
    }
  ]);
}

function buildEMP(p: Palette): Rig {
  const root = group(cyl(1.7, 1.9, 0.3, p.concrete, 8, 0, 0.15, 0), cyl(1.1, 1.3, 0.8, p.hullDark, 8, 0, 0.7, 0));
  root.add(cyl(0.3, 0.45, 4.2, p.hull, 10, 0, 3.1, 0), box(0.5, 0.5, 0.5, p.team, 0, 1.3, 0.38));
  const glow = p.teamGlow.clone() as THREE.MeshStandardMaterial;
  const top = sphere(0.55, glow, 0, 5.5, 0, 14);
  root.add(top);
  const rings: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.9 - i * 0.15, 0.07, 6, 24), glow);
    r.rotation.x = Math.PI / 2;
    r.userData.base = 2.2 + i * 1.0;
    rings.push(r);
    root.add(r);
  }
  const pulseMat = new THREE.MeshBasicMaterial({ color: (glow.color as THREE.Color).getHex(), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const pulse = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), pulseMat);
  pulse.position.y = 5.5;
  root.add(pulse);
  const clock = new FireClock(BUILDINGS["aa-emp"].weapon!.cooldown);
  return rig(root, [WORK, FIRE], 3.6, [
    (dt, t, a) => {
      const on = a.has("work") || a.has("fire");
      rings.forEach((r, i) => {
        r.position.y = (r.userData.base as number) + (on ? Math.sin(t * 2 + i * 1.2) * 0.25 : 0);
        if (on) r.rotation.z += dt * (1 + i * 0.6);
      });
      glow.emissiveIntensity = on ? 1.3 + Math.sin(t * 5) * 0.5 : 0.3;
      clock.tick(dt, a.has("fire"));
      const k = clock.since / 0.6;
      pulse.visible = k < 1;
      if (pulse.visible) {
        pulse.scale.setScalar(0.6 + k * 3.2);
        pulseMat.opacity = 0.45 * (1 - k);
      }
    }
  ]);
}

const BUILDERS: Record<BuildingId, (p: Palette, f: Faction) => Rig> = {
  hq: buildHQ,
  outpost: (p) => buildOutpost(p),
  "power-plant": (p) => buildPowerPlant(p),
  "power-pylon": (p) => buildPowerPylon(p),
  "oil-extractor": (p) => buildOilExtractor(p),
  airfield: buildAirfield,
  "ammo-depot": (p) => buildAmmoDepot(p),
  "aa-ciws": (p) => buildCIWS(p),
  "aa-sam": (p) => buildSAM(p),
  "aa-emp": (p) => buildEMP(p)
};

export function buildBuilding(id: BuildingId, faction: Faction): Rig {
  return BUILDERS[id](palette(faction), faction);
}
