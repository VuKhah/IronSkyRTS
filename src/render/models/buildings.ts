/**
 * Mô hình các công trình (BẢN NHẸ). Mỗi công trình có hoạt ảnh "Vận hành" riêng
 * và các tháp có vũ khí thì có thêm "Ngắm" / "Khai hỏa".
 */
import * as THREE from "three";
import { BUILDINGS, PAD_OFFSETS, type BuildingId, type Faction } from "../../sim/content";
import { approach, approachAngle, box, cyl, FireClock, group, muzzleFlash, palette, part, sphere, tubeZ, type Palette, type Rig, type RigAction } from "./kit";
import { buildUnit } from "./units";

const WORK: RigAction = { id: "work", label: "Vận hành" };
const AIM: RigAction = { id: "aim", label: "Ngắm" };
const FIRE: RigAction = { id: "fire", label: "Khai hỏa" };
const POWER: RigAction = { id: "power", label: "Vùng phủ điện" };

type Update = (dt: number, t: number, a: ReadonlySet<string>) => void;

/** Góc ngắm do chiến trường đặt (null = để hoạt ảnh tự quét). */
interface AimRef {
  yaw: number | null;
  /** Nâng nòng (có mục tiêu); rảnh thì tháp chỉ giữ hướng. */
  raise?: boolean;
}

function rig(root: THREE.Group, actions: RigAction[], radius: number, updates: Update[], defaultOn: string[] = ["work"], aim?: AimRef): Rig {
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
function foundation(p: Palette, w: number, d: number, h = 0.25): THREE.Group {
  return part("Nền móng", group(box(w, h, d, p.concrete, 0, h / 2, 0), box(w + 0.08, 0.08, 0.3, p.team, 0, h, d / 2 - 0.15), box(w + 0.08, 0.08, 0.3, p.team, 0, h, -d / 2 + 0.15)));
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
function turretUpdate(turret: THREE.Object3D, gun: THREE.Object3D | null, flashes: THREE.Mesh[], cooldown: number, aimPitch: number, sweep = 1.2, aim?: AimRef): Update {
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

function buildHQ(p: Palette): Rig {
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
  const w = BUILDINGS.hq.weapon!;
  const aim: AimRef = { yaw: null };
  return rig(
    root,
    [WORK, AIM, FIRE, POWER],
    4.6,
    [(dt, _t, a) => a.has("work") && (dish.rotation.y += dt * 1.4), blinker(lamp, 5), turretUpdate(turret, gun, flashes, w.cooldown, 0.1, 1.2, aim), ring.update],
    ["work"],
    aim
  );
}

/** Xưởng Xe Tăng: nhà xưởng mái răng cưa, cửa cuốn mở khi đang đúc xe, ống khói và cầu trục. */
function buildFactory(p: Palette): Rig {
  const root = group(foundation(p, 7, 6.2));
  root.add(box(5.4, 2.6, 4.4, p.hull, -0.2, 1.55, -0.5), box(5.44, 0.18, 4.44, p.team, -0.2, 2.15, -0.5));
  // mái răng cưa: 3 tấm nghiêng có dải kính lấy sáng
  for (let i = 0; i < 3; i++) {
    const x = -1.95 + i * 1.75;
    const roof = box(1.75, 0.12, 4.4, p.hullDark, x, 3.2, -0.5);
    roof.rotation.z = 0.42;
    const glass = box(0.08, 0.7, 4.3, p.glass, x + 0.82, 3.2, -0.5);
    root.add(roof, glass);
  }
  // khung cửa và cửa cuốn
  root.add(box(3.2, 0.3, 0.3, p.warning, -0.2, 2.65, 1.75), box(0.3, 2.4, 0.3, p.hullDark, -1.75, 1.45, 1.75), box(0.3, 2.4, 0.3, p.hullDark, 1.35, 1.45, 1.75));
  const door = box(2.9, 2.2, 0.12, p.teamDark, -0.2, 1.35, 1.8);
  root.add(door);
  // dốc ra xe có sọc cảnh báo
  const ramp = box(3, 0.1, 1.2, p.concreteDark, -0.2, 0.3, 2.5);
  ramp.rotation.x = 0.08;
  root.add(ramp);
  for (let i = 0; i < 4; i++) root.add(box(0.28, 0.03, 1.1, p.warning, -1.25 + i * 0.7, 0.37, 2.5));
  // ống khói + khói
  root.add(cyl(0.32, 0.38, 2.6, p.hullDark, 10, 2.55, 2.85, -2.0), cyl(0.36, 0.36, 0.18, p.team, 10, 2.55, 4.05, -2.0));
  const puffs: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const s = sphere(0.35, p.smoke, 2.55, 4.3, -2.0, 7);
    s.castShadow = false;
    s.userData.phase = i / 4;
    puffs.push(s);
    root.add(s);
  }
  // cầu trục trên nóc
  const crane = group(box(0.14, 0.14, 4.6, p.warning, 0, 0, 0), box(0.4, 0.3, 0.4, p.hullDark, 0, -0.2, 0));
  crane.position.set(-0.2, 3.75, -0.5);
  root.add(box(0.15, 0.9, 0.15, p.metal, -2.6, 3.3, -2.6), box(0.15, 0.9, 0.15, p.metal, 2.2, 3.3, -2.6), box(4.9, 0.14, 0.14, p.metal, -0.2, 3.75, -2.6));
  root.add(crane);
  const lamp = p.teamGlow.clone() as THREE.MeshStandardMaterial;
  root.add(sphere(0.12, lamp, -1.9, 2.95, 1.85, 6), sphere(0.12, lamp, 1.5, 2.95, 1.85, 6));
  let doorT = 0;
  return rig(root, [WORK], 4.4, [
    (dt, t, a) => {
      const on = a.has("work");
      doorT = approach(doorT, on ? 1 : 0, 2.5, dt);
      door.position.y = 1.35 + doorT * 1.9;
      door.scale.y = 1 - doorT * 0.85;
      crane.position.x = -0.2 + (on ? Math.sin(t * 0.8) * 2 : 0);
      for (const s of puffs) {
        s.visible = on;
        const k = (t * 0.35 + (s.userData.phase as number)) % 1;
        s.position.set(2.55 + k * 0.5, 4.3 + k * 2.2, -2.0 + k * 0.2);
        s.scale.setScalar(0.5 + k * 1.4);
      }
    },
    blinker(lamp, 4)
  ]);
}

/**
 * Xưởng Xe Chuyên Dụng: nhà xưởng dài và cao hơn Xưởng Xe Tăng (đủ chỗ cho xe phóng tên lửa và pháo nòng dài), cửa cao
 * phía trước (+z), cầu trục cổng chạy dọc nóc, và giàn ống phóng thử trên nóc ngóc lên khi xưởng đang đúc.
 */
function buildSpecialFactory(p: Palette): Rig {
  const [HX, HZ] = BUILDINGS["special-factory"].half;
  const root = group(foundation(p, HX * 2, HZ * 2));
  const W = HX * 2 - 1.4;
  const D = HZ * 2 - 1.8;
  const H = 3.4;
  const zc = -0.4; // thân xưởng lùi về sau, chừa sân trước cửa
  root.add(part("Thân xưởng", box(W, H, D, p.hull, 0, 0.25 + H / 2, zc)));
  root.add(part("Dải màu phe", box(W + 0.04, 0.22, D + 0.04, p.team, 0, 0.25 + H - 0.5, zc)));
  root.add(part("Mái", box(W + 0.3, 0.16, D + 0.3, p.hullDark, 0, 0.25 + H + 0.08, zc)));
  // cửa cao giữa mặt trước, khung vàng đen
  const front = zc + D / 2;
  const DW = 3.4;
  const DH = 2.9;
  root.add(
    part(
      "Khung cửa",
      group(
        box(DW + 0.5, 0.3, 0.3, p.warning, 0, 0.25 + DH + 0.15, front + 0.05),
        box(0.3, DH, 0.3, p.hullDark, -DW / 2 - 0.1, 0.25 + DH / 2, front + 0.05),
        box(0.3, DH, 0.3, p.hullDark, DW / 2 + 0.1, 0.25 + DH / 2, front + 0.05)
      )
    )
  );
  const door = part("Cửa cuốn", box(DW, DH - 0.1, 0.12, p.teamDark, 0, 0.25 + DH / 2, front + 0.1));
  root.add(door);
  // sân trước có sọc cảnh báo
  const yardZ = (front + HZ) / 2;
  root.add(part("Dốc ra xe", box(DW, 0.08, HZ - front, p.concreteDark, 0, 0.29, yardZ)));
  for (let i = 0; i < 5; i++) root.add(part("Sọc cảnh báo", box(0.28, 0.03, (HZ - front) * 0.8, p.warning, -1.4 + i * 0.7, 0.34, yardZ)));
  // gian phụ thấp bên hông (phòng kỹ thuật)
  root.add(part("Gian kỹ thuật", box(1.2, 1.9, 2.4, p.hullDark, -W / 2 - 0.2, 0.25 + 0.95, zc - 0.8)));
  root.add(part("Cửa sổ", box(0.05, 0.4, 1.6, p.glass, -W / 2 - 0.82, 1.7, zc - 0.8)));
  // cầu trục cổng: 2 dầm ngang trên cột ở 4 góc nóc, xe con chạy dọc
  const top = 0.25 + H + 0.16;
  for (const x of [-W / 2 + 0.3, W / 2 - 0.3])
    for (const z of [zc - D / 2 + 0.3, zc + D / 2 - 0.3]) root.add(part("Cột cầu trục", box(0.16, 1.1, 0.16, p.metal, x, top + 0.55, z)));
  for (const z of [zc - D / 2 + 0.3, zc + D / 2 - 0.3]) root.add(part("Dầm cầu trục", box(W - 0.4, 0.18, 0.18, p.warning, 0, top + 1.1, z)));
  const trolley = part(
    "Xe con cầu trục",
    group(box(0.4, 0.18, D - 0.4, p.metal, 0, 0, 0), box(0.5, 0.35, 0.5, p.hullDark, 0, -0.2, 0), cyl(0.03, 0.03, 0.6, p.rubber, 4, 0, -0.65, 0))
  );
  trolley.position.set(0, top + 1.25, zc);
  root.add(trolley);
  // giàn ống phóng thử trên nóc (phía sau): bản lề ở mép sau, ngóc lên khi đang đúc
  const rack = part("Giàn phóng thử", group());
  rack.add(box(1.6, 0.7, 1.9, p.hullDark, 0, 0.35, 0.95), part("Nắp giàn (màu phe)", box(1.64, 0.1, 1.94, p.team, 0, 0.72, 0.95)));
  for (let r = 0; r < 2; r++)
    for (let c = 0; c < 3; c++) {
      const tube = part("Ống phóng", cyl(0.17, 0.17, 0.05, p.metal, 8, -0.5 + c * 0.5, 0.18 + r * 0.34, 1.91));
      tube.rotation.x = Math.PI / 2;
      rack.add(tube);
    }
  rack.position.set(W / 2 - 1.3, top, zc - D / 2 + 0.4);
  root.add(rack, part("Bệ giàn phóng", box(1.8, 0.2, 0.5, p.metal, W / 2 - 1.3, top + 0.1, zc - D / 2 + 0.4)));
  const lamp = p.teamGlow.clone() as THREE.MeshStandardMaterial;
  root.add(
    part("Đèn cửa", group(sphere(0.12, lamp, -DW / 2 - 0.1, 0.25 + DH + 0.45, front + 0.12, 6), sphere(0.12, lamp, DW / 2 + 0.1, 0.25 + DH + 0.45, front + 0.12, 6)))
  );
  let doorT = 0;
  let rackT = 0;
  return rig(root, [WORK], Math.max(HX, HZ) + 0.6, [
    (dt, t, a) => {
      const on = a.has("work");
      doorT = approach(doorT, on ? 1 : 0, 2.5, dt);
      door.position.y = 0.25 + DH / 2 + doorT * 1.2;
      door.scale.y = 1 - doorT * 0.8;
      rackT = approach(rackT, on ? 1 : 0, 1.5, dt);
      rack.rotation.x = -rackT * 0.7; // miệng ống phóng (phía +z) ngóc lên
      trolley.position.x = on ? Math.sin(t * 0.6) * (W / 2 - 0.8) : approach(trolley.position.x, 0, 2, dt);
    },
    blinker(lamp, 3)
  ]);
}

/**
 * Nhà Máy Máy Bay: nhà chứa mái vòm (nửa trụ nằm dọc z), cửa lớn hai cánh phía trước (+z) trượt sang hai bên khi đang đúc,
 * sân đỗ trước cửa có vạch dẫn (máy bay mới lăn ra đây rồi cất cánh thẳng ra trước, khớp sim), xưởng động cơ bên hông,
 * cột ống gió và đèn hiệu trên đỉnh vòm.
 */
function buildAircraftFactory(p: Palette): Rig {
  const [HX, HZ] = BUILDINGS["aircraft-factory"].half;
  const root = group(foundation(p, HX * 2, HZ * 2));
  const R = 3.0;
  const L = 5.4;
  const cx = -0.6;
  const DOOR_SLIDE = 1.25; // mỗi cánh trượt sang bên chừng này (m): đủ cho Falcon sải cánh 5,1 m lăn ra
  const zc = -HZ + 0.5 + L / 2; // vòm sát mép sau, sân đỗ phía trước
  // nửa trụ: trục Y của CylinderGeometry xoay thành trục Z; góc PI/2..3PI/2 là nửa phía trên sau khi xoay.
  // Nhóm vật liệu của trụ: [thân, nắp trên, nắp dưới]; nắp trên quay ra trước (+z) = lòng nhà chứa tối, lộ ra khi mở cửa.
  const vault = new THREE.Mesh(new THREE.CylinderGeometry(R, R, L, 20, 1, false, Math.PI / 2, Math.PI), [p.hull, p.rubber, p.hull]);
  vault.castShadow = vault.receiveShadow = true;
  vault.rotation.x = Math.PI / 2;
  vault.position.set(cx, 0.25, zc);
  root.add(part("Mái vòm nhà chứa", vault));
  for (const k of [-0.5, 0, 0.5]) {
    const rib = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.05, R + 0.05, 0.16, 20, 1, true, Math.PI / 2, Math.PI), k === 0 ? p.team : p.hullDark);
    rib.castShadow = true;
    rib.rotation.x = Math.PI / 2;
    rib.position.set(cx, 0.25, zc + k * (L - 0.4));
    root.add(part(k === 0 ? "Vành mái (màu phe)" : "Vành mái", rib));
  }
  // cửa hai cánh trượt: mỗi cánh gồm 4 dải cao thấp dần ra ngoài để ôm theo vòm
  const front = zc + L / 2 + 0.05;
  const leaves: { g: THREE.Group; dir: number }[] = [];
  for (const dir of [-1, 1]) {
    const g = part(dir < 0 ? "Cánh cửa trái" : "Cánh cửa phải", group());
    [2.9, 2.65, 2.2, 1.4].forEach((h, i) => g.add(box(0.72, h, 0.12, p.teamDark, dir * (0.36 + i * 0.72), h / 2, 0)));
    g.add(part("Sọc chân cửa", box(2.88, 0.1, 0.14, p.warning, dir * 1.44, 0.15, 0.02)));
    g.position.set(cx, 0.25, front + 0.08);
    leaves.push({ g, dir });
    root.add(g);
  }
  // ray trượt của cửa: chạy ngang trước mặt tiền, chìa ra hai bên đủ chỗ cho cánh cửa mở
  root.add(part("Ray cửa", box(2 * (2.88 + DOOR_SLIDE) - 0.4, 0.06, 0.18, p.metal, cx, 0.28, front + 0.08)));
  // sân đỗ trước cửa: vạch dẫn vàng theo hướng cất cánh
  const apronZ0 = front + 0.1;
  const apronMid = (apronZ0 + HZ) / 2;
  const apronLen = HZ - apronZ0;
  root.add(part("Sân đỗ", box(5.4, 0.04, apronLen, p.concrete, cx, 0.27, apronMid)));
  root.add(part("Vạch dẫn", box(0.14, 0.03, apronLen - 0.2, p.warning, cx, 0.3, apronMid)));
  for (const x of [cx - 2.5, cx + 2.5]) root.add(part("Vạch mép sân", box(0.1, 0.03, apronLen - 0.2, p.white, x, 0.3, apronMid)));
  // xưởng động cơ bên hông phải
  const sx = HX - 1.2;
  root.add(part("Xưởng động cơ", box(1.8, 2.2, 3.6, p.hullDark, sx, 0.25 + 1.1, zc - 0.4)));
  root.add(part("Dải màu phe", box(1.84, 0.18, 3.64, p.team, sx, 0.25 + 1.9, zc - 0.4)));
  root.add(part("Cửa sổ", box(0.05, 0.5, 2.4, p.glass, sx - 0.92, 1.6, zc - 0.4)));
  root.add(part("Ống thông gió", cyl(0.2, 0.24, 1.0, p.metal, 8, sx + 0.3, 0.25 + 2.7, zc - 1.6)));
  // cột ống gió ở góc trước bên phải
  const sock = part("Ống gió", group());
  const sockTube = cyl(0.12, 0.05, 0.9, p.warning, 8, 0, 0, 0.45);
  sockTube.rotation.x = Math.PI / 2;
  sock.add(sockTube);
  sock.position.set(HX - 0.6, 0.25 + 2.6, HZ - 0.8);
  root.add(part("Cột ống gió", cyl(0.04, 0.04, 2.6, p.metal, 4, HX - 0.6, 0.25 + 1.3, HZ - 0.8)), sock);
  // đèn hiệu xoay trên đỉnh vòm
  const beacon = part("Đèn hiệu", group(box(0.5, 0.15, 0.15, p.teamGlow), cyl(0.05, 0.05, 0.3, p.metal, 4, 0, -0.15, 0)));
  beacon.position.set(cx, 0.25 + R + 0.25, zc);
  root.add(beacon);
  let doorT = 0;
  return rig(root, [WORK], Math.max(HX, HZ) + 0.6, [
    (dt, t, a) => {
      const on = a.has("work");
      doorT = approach(doorT, on ? 1 : 0, 2, dt);
      for (const l of leaves) l.g.position.x = cx + l.dir * doorT * DOOR_SLIDE;
      if (on) beacon.rotation.y += dt * 3;
      sock.rotation.y = Math.sin(t * 0.7) * 0.4;
    }
  ]);
}

/** Tháp Phòng Thủ: bệ bê tông, tháp bọc giáp xoay 360° với pháo kép tự động. */
function buildTurret(p: Palette): Rig {
  const root = group(cyl(1.55, 1.7, 0.4, p.concrete, 8, 0, 0.2, 0), cyl(1.0, 1.2, 1.1, p.hullDark, 8, 0, 0.95, 0), cyl(1.05, 1.05, 0.14, p.team, 8, 0, 1.45, 0));
  const turret = group(box(1.3, 0.65, 1.5, p.hull, 0, 0.35, -0.1), box(1.32, 0.12, 1.52, p.team, 0, 0.7, -0.1), box(0.4, 0.3, 0.4, p.hullDark, 0.45, 0.85, -0.45));
  const front = box(1.1, 0.5, 0.4, p.hullDark, 0, 0.32, 0.72);
  front.rotation.x = -0.35;
  turret.add(front, cyl(0.03, 0.03, 0.7, p.metal, 4, -0.45, 1.0, -0.5), sphere(0.06, p.teamGlow, -0.45, 1.36, -0.5, 6));
  turret.position.y = 1.5;
  const gun = group();
  gun.position.set(0, 0.42, 0.75);
  const flashes: THREE.Mesh[] = [];
  for (const x of [-0.22, 0.22]) {
    const b = tubeZ(0.065, 0.075, 1.25, p.metal, 8);
    b.position.set(x, 0, 0.6);
    const f = muzzleFlash(0.45, p.flash);
    f.position.set(x, 0, 1.45);
    gun.add(b, f);
    flashes.push(f);
  }
  turret.add(gun);
  root.add(turret);
  const w = BUILDINGS.turret.weapon!;
  const aim: AimRef = { yaw: null };
  return rig(root, [AIM, FIRE], 2.2, [turretUpdate(turret, gun, flashes, w.cooldown, 0.12, 1.4, aim)], [], aim);
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
  const aim: AimRef = { yaw: null };
  return rig(
    root,
    [WORK, AIM, FIRE, { id: "capture", label: "Vùng chiếm đóng" }],
    3.4,
    [(_dt, t, a) => (flag.rotation.y = a.has("work") ? Math.sin(t * 3) * 0.35 : 0), turretUpdate(turret, gun, [f], BUILDINGS.outpost.weapon!.cooldown, 0.08, 2.5, aim), ring.update],
    ["work"],
    aim
  );
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

function buildAirfield(p: Palette, faction: Faction, showcase: boolean): Rig {
  // Bố cục (khớp PAD_OFFSETS trong sim): đường băng dọc trục z ở giữa, 2 dãy × 3 ô đáp hai bên; máy bay đậu quay mũi
  // về +z (hướng cất cánh). Đài kiểm soát + bồn dầu ở cuối đường băng phía sau, không chắn đường cất cánh.
  // Sân Đáp chỉ là nơi cất / hạ cánh, nạp dầu, sửa chữa; máy bay đúc ở Nhà Máy Máy Bay (buildAircraftFactory).
  const [HX, HZ] = BUILDINGS.airfield.half;
  const root = group(part("Nền sân", box(HX * 2, 0.18, HZ * 2, p.concreteDark, 0, 0.09, 0)));
  const RUNWAY_W = 3.0;
  const RUNWAY_Z0 = -HZ + 2.3; // đầu đường băng phía sau (sau đó là sân đài kiểm soát)
  const runwayLen = HZ - RUNWAY_Z0;
  const runwayMid = (HZ + RUNWAY_Z0) / 2;
  // Đường băng: mặt bê tông sáng + 2 vạch trắng dọc + vạch ngưỡng đầu đường băng phía trước
  root.add(part("Đường băng", box(RUNWAY_W, 0.04, runwayLen, p.concrete, 0, 0.2, runwayMid)));
  for (const x of [-0.55, 0.55]) root.add(part("Vạch đường băng", box(0.16, 0.03, runwayLen - 0.6, p.white, x, 0.23, runwayMid)));
  for (let k = -2; k <= 2; k++) if (k !== 0) root.add(part("Vạch ngưỡng", box(0.18, 0.03, 0.9, p.white, k * 0.3 + Math.sign(k) * 0.45, 0.23, HZ - 0.7)));
  // Đèn đường băng hai bên mép: 4 vật liệu luân phiên tạo dải đèn chạy đuổi về phía cất cánh
  const lights: THREE.MeshStandardMaterial[] = [];
  for (let i = 0; i < 4; i++) lights.push(p.teamGlow.clone() as THREE.MeshStandardMaterial);
  const LIGHTS = 9;
  for (let k = 0; k < LIGHTS; k++) {
    const z = RUNWAY_Z0 + 0.4 + (k * (runwayLen - 0.8)) / (LIGHTS - 1);
    for (const x of [-RUNWAY_W / 2 - 0.12, RUNWAY_W / 2 + 0.12]) root.add(part("Đèn đường băng", sphere(0.09, lights[k % 4]!, x, 0.26, z, 6)));
  }

  // 6 ô đáp (5,6 × 5,2 m, vừa Falcon sải cánh 5,1 m): mặt bê tông, viền trắng 4 góc, vòng tròn màu phe ở tâm,
  // số hiệu ô; vạch dẫn màu vàng từ ô ra đường băng
  PAD_OFFSETS.forEach(([x, z], i) => {
    const pad = part(`Ô đáp ${i + 1}`, group(box(5.6, 0.04, 5.2, p.concrete, 0, 0, 0)));
    pad.position.set(x, 0.2, z);
    for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      pad.add(box(0.9, 0.03, 0.12, p.white, cx * 2.3, 0.03, cz * 2.45), box(0.12, 0.03, 0.9, p.white, cx * 2.69, 0.03, cz * 2.1));
    }
    pad.add(part("Vòng tâm ô (màu phe)", cyl(0.75, 0.75, 0.025, p.team, 16, 0, 0.03, 0)), cyl(0.6, 0.6, 0.03, p.concrete, 16, 0, 0.035, 0));
    // số hiệu ô: i+1 vạch ngắn ở mép ngoài
    for (let k = 0; k <= i; k++) pad.add(box(0.1, 0.03, 0.42, p.white, -Math.sign(x) * (2.0 - k * 0.2), 0.03, -1.9));
    // trụ nạp dầu ở góc ngoài phía sau ô (sim nạp dầu cho máy bay ngay tại ô đậu)
    pad.add(part("Trụ nạp dầu", group(box(0.34, 0.6, 0.3, p.hullDark, 0, 0.32, 0), box(0.36, 0.1, 0.32, p.team, 0, 0.5, 0), cyl(0.03, 0.03, 0.5, p.rubber, 4, -Math.sign(x) * 0.2, 0.25, 0.1))).translateX(Math.sign(x) * 2.45).translateZ(-2.25));
    root.add(pad);
    const inner = x > 0 ? RUNWAY_W / 2 : -RUNWAY_W / 2;
    const edge = x > 0 ? x - 2.8 : x + 2.8;
    root.add(part("Vạch dẫn", box(Math.abs(edge - inner), 0.03, 0.12, p.warning, (edge + inner) / 2, 0.23, z + 1.2)));
  });

  // Đài kiểm soát không lưu ở ô trống cuối đường băng phía sau (giữa 2 ô đáp dãy sau)
  const tower = group(cyl(0.45, 0.55, 3.2, p.hull, 8, 0, 1.6, 0), cyl(0.85, 0.7, 0.7, p.glass, 8, 0, 3.5, 0), cyl(0.9, 0.9, 0.12, p.team, 8, 0, 3.9, 0));
  const beacon = group(box(0.5, 0.15, 0.15, p.teamGlow), cyl(0.05, 0.05, 0.3, p.metal, 4, 0, -0.15, 0));
  beacon.position.y = 4.15;
  tower.add(beacon);
  tower.position.set(0, 0, (RUNWAY_Z0 - HZ) / 2);
  tower.scale.setScalar(0.9);
  root.add(part("Đài kiểm soát", tower));
  root.add(part("Vạch cảnh báo sân sau", box(RUNWAY_W, 0.03, 0.2, p.warning, 0, 0.2, RUNWAY_Z0 - 0.15)));

  // Xưởng Mô Hình: trưng một chiếc Falcon đậu ở ô số 3 (trong trận thì máy bay thật đậu ở các ô)
  if (showcase) {
    const falcon = buildUnit("falcon", faction);
    const [fx, fz] = PAD_OFFSETS[2]!;
    falcon.root.position.set(fx, 0.2, fz);
    root.add(falcon.root);
  }
  return rig(root, [WORK], 10.5, [
    (dt, t, a) => {
      const on = a.has("work");
      if (on) beacon.rotation.y += dt * 3;
      lights.forEach((m, i) => (m.emissiveIntensity = on ? (Math.floor(t * 6) % 4 === i ? 2.4 : 0.5) : 0.3));
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

/** Trạm Tích Điện: dãy khối pin, cột chỉ báo sáng theo % pin, tia điện chạy khi nạp / xả. */
function buildBattery(p: Palette): Rig {
  const root = group(foundation(p, 3.4, 3));
  const glow = p.teamGlow.clone() as THREE.MeshStandardMaterial;
  for (const x of [-0.95, 0, 0.95])
    for (const z of [-0.55, 0.55]) {
      root.add(box(0.8, 1.3, 0.85, p.hullDark, x, 0.95, z), box(0.82, 0.12, 0.87, p.team, x, 1.66, z), cyl(0.08, 0.08, 0.2, p.metal, 6, x - 0.2, 1.8, z), cyl(0.08, 0.08, 0.2, p.metal, 6, x + 0.2, 1.8, z));
    }
  // cột chỉ báo mức pin
  root.add(box(0.3, 1.6, 0.3, p.metal, 1.55, 1.05, 1.15));
  const level = box(0.22, 1.5, 0.22, glow, 1.55, 1.05, 1.17);
  level.geometry.translate(0, 0.75, 0);
  level.position.y = 0.3;
  root.add(level);
  const sparks = group();
  for (const x of [-0.95, 0, 0.95]) sparks.add(box(0.05, 0.05, 1.3, glow, x, 1.9, 0));
  root.add(sparks);
  let lv = 0;
  let target = 0;
  const r = rig(root, [WORK], 2.4, [
    (_dt, t, a) => {
      lv += (target - lv) * 0.1;
      level.scale.y = Math.max(0.03, lv);
      sparks.visible = a.has("work") && Math.sin(t * 18) > -0.2;
      glow.emissiveIntensity = 0.6 + lv * 1.6;
    }
  ]);
  r.setLevel = (k) => (target = Math.max(0, Math.min(1, k)));
  r.setLevel(0.7);
  return r;
}

/** Trạm Radar: tháp lưới, chảo radar quay khi có điện, đèn báo. */
function buildRadar(p: Palette): Rig {
  const root = group(cyl(1.6, 1.8, 0.3, p.concrete, 8, 0, 0.15, 0), box(1.6, 1.0, 1.6, p.hullDark, 0, 0.8, 0), box(1.64, 0.12, 1.64, p.team, 0, 1.3, 0));
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const leg = box(0.1, 2.6, 0.1, p.metal, x * 0.5, 2.6, z * 0.5);
    leg.rotation.z = x * 0.12;
    leg.rotation.x = -z * 0.12;
    root.add(leg);
  }
  root.add(box(1.2, 0.1, 1.2, p.metal, 0, 3.9, 0));
  const head = group(cyl(0.12, 0.12, 0.6, p.metal, 6, 0, 0.3, 0));
  const dish = new THREE.Mesh(new THREE.SphereGeometry(1.3, 14, 8, 0, Math.PI * 2, 0, Math.PI / 3.2), p.white);
  dish.rotation.x = -Math.PI / 2 - 0.35;
  dish.position.set(0, 1.0, 0.2);
  dish.castShadow = true;
  const feed = cyl(0.04, 0.04, 1.1, p.metal, 4, 0, 1.1, 0.75);
  feed.rotation.x = 1.2;
  head.add(dish, feed, sphere(0.1, p.teamGlow, 0, 1.25, 1.2, 6));
  head.position.y = 3.95;
  root.add(head);
  const lamp = p.teamGlow.clone() as THREE.MeshStandardMaterial;
  root.add(sphere(0.1, lamp, 0.7, 1.45, 0.7, 6));
  let spin = 0;
  return rig(root, [WORK], 3, [
    (dt, _t, a) => {
      spin = approach(spin, a.has("work") ? 1.4 : 0, 2, dt);
      head.rotation.y += spin * dt;
    },
    blinker(lamp, 3)
  ]);
}

const BUILDERS: Record<BuildingId, (p: Palette, f: Faction, showcase: boolean) => Rig> = {
  radar: (p) => buildRadar(p),
  battery: (p) => buildBattery(p),
  hq: (p) => buildHQ(p),
  factory: (p) => buildFactory(p),
  "special-factory": (p) => buildSpecialFactory(p),
  "aircraft-factory": (p) => buildAircraftFactory(p),
  turret: (p) => buildTurret(p),
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

/** showcase = true: bản trưng bày trên Xưởng Mô Hình (có thêm đồ trang trí, ví dụ máy bay đậu sẵn). */
export function buildBuilding(id: BuildingId, faction: Faction, showcase = true): Rig {
  return BUILDERS[id](palette(faction), faction, showcase);
}
