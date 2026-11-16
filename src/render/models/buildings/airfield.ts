/**
 * Sân Đáp, bản 3 (15/11/2026, sim theo từ 16/11/2026): bố cục xương cá cho phản lực bay đứng, chân đế 12 × 20 m.
 * 5 ô đáp chữ V theo dáng cánh tam giác, hai cột hai bên hành lang giữa, mỗi ô nghiêng 30° ra ngoài (soi gương trái / phải),
 * mũi chéo về đầu sân (+z): hạ cánh lượn vào, lơ lửng rồi hạ thẳng; cất cánh bốc thẳng rồi lao ra trước. Tháp điều khiển ở
 * đuôi (−z) nên không bao giờ nằm trên đường bay. Trực thăng không đậu ở đây.
 * Vị trí, hướng, hình ô đáp và ô điều khiển đọc từ sim (`PAD_OFFSETS`, `PAD_SHAPE`, `CONTROL_CELL`, `BUILDINGS.airfield.half`).
 * Đèn ô đáp chỉ sáng khi sân có điện. Bộ phận động: radar.
 */
import * as THREE from "three";
import { BUILDINGS, CONTROL_CELL, PAD_OFFSETS, PAD_SHAPE, parkScale, type Faction } from "../../../sim/content";
import { approach, box, cyl, facets, group, part, sphere, type Palette, type Rig, type RigAction } from "../kit";
import { buildUnit } from "../units";
import { WORK, rig, oct, strut, type P3, type Update } from "./shared";

const [HX, HZ] = BUILDINGS.airfield.half;
const SLAB = 0.18;
const PAD_Y = 0.2;
const { halfSpan: V_HALF_SPAN, halfLen: V_HALF_LEN, notch: V_NOTCH } = PAD_SHAPE;
/** Bề rộng hành lang giữa (m). */
const AISLE = 0.8;
/** Ô đáp `[x, z, yaw]` cho phần vẽ (yaw = bên × góc nghiêng). */
const PADS = PAD_OFFSETS.map(([x, z, side]) => [x, z, side * PAD_SHAPE.yaw] as const);
/** Tấm phẳng hình chữ V (thu theo `k`), dày `h`, mặt dưới ở y = 0. */
function chevron(k: number, h: number, mat: THREE.Material): THREE.Mesh {
  const s = new THREE.Shape();
  // tọa độ Shape là (x, −z) vì sau khi xoay −90° quanh x thì trục y của Shape thành −z
  s.moveTo(0, -V_HALF_LEN * k);
  s.lineTo(V_HALF_SPAN * k, V_HALF_LEN * k);
  s.lineTo(0, (V_HALF_LEN - V_NOTCH) * k);
  s.lineTo(-V_HALF_SPAN * k, V_HALF_LEN * k);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, mat);
  m.receiveShadow = true;
  return m;
}

export function buildAirfield(p: Palette, faction: Faction, showcase: boolean): Rig {
  const root = group(part("Nền sân", box(HX * 2, SLAB, HZ * 2, p.concreteDark, 0, SLAB / 2, 0)));
  const add = (...o: THREE.Object3D[]) => root.add(...o);
  for (const sx of [-1, 1]) add(part("Viền sân (màu phe)", box(0.3, 0.08, HZ * 2, p.team, sx * (HX - 0.15), SLAB, 0)));
  add(part("Viền đầu sân", box(HX * 2, 0.08, 0.3, p.warning, 0, SLAB, HZ - 0.15)));

  // ================================================================ 1. HÀNH LANG GIỮA (hẹp, 0,8 m)
  add(part("Hành lang giữa", box(AISLE, 0.03, HZ * 2 - 0.6, p.concrete, 0, PAD_Y, 0)));
  for (let z = -HZ + 1.2; z < HZ - 0.6; z += 1.4) add(part("Vạch tâm hành lang", box(0.07, 0.02, 0.7, p.warning, 0, PAD_Y + 0.025, z)));

  // ================================================================ 2. 5 Ô ĐÁP CHỮ V
  const lights = new THREE.MeshStandardMaterial({ color: 0x2a3a2a, emissive: 0x7dff9a, emissiveIntensity: 0 });
  PADS.forEach(([x, z, yaw], i) => {
    const side = Math.sign(x);
    const pad = part(`Ô đáp ${i + 1}`, group());
    pad.position.set(x, PAD_Y, z);
    pad.rotation.y = yaw;
    const rim = chevron(1, 0.03, p.white);
    const deck = chevron(0.9, 0.04, p.concrete);
    deck.position.z = -0.08;
    pad.add(part("Viền chữ V", rim), part("Tấm chịu nhiệt", deck));
    pad.add(part("Vạch tâm ô (màu phe)", box(0.14, 0.02, 3.4, p.team, 0, 0.05, 0.1)));
    pad.add(part("Vạch dừng mũi", box(0.9, 0.02, 0.14, p.white, 0, 0.05, 1.7)));
    for (let k = 0; k <= i; k++) pad.add(part("Số ô", box(0.1, 0.02, 0.4, p.white, (k - i / 2) * 0.22, 0.05, -1.2)));
    // đèn ở mũi và hai đầu cánh
    for (const [lx, lz] of [[0, V_HALF_LEN], [V_HALF_SPAN, -V_HALF_LEN], [-V_HALF_SPAN, -V_HALF_LEN]] as const)
      pad.add(part("Đèn ô đáp", sphere(0.1, lights, lx * 0.96, 0.1, lz * 0.96, 6)));
    // tường chắn luồng phụt sau khấc đuôi, nghiêng vào trong để hắt khí lên
    const wall = part("Tường chắn luồng phụt", box(2.2, 0.8, 0.16, p.hullDark, 0, 0.4, -V_HALF_LEN + V_NOTCH - 1.95));
    wall.rotation.x = -0.25;
    pad.add(wall);
    pad.add(part("Trụ nạp dầu", group(box(0.34, 0.6, 0.3, p.hullDark, 0, 0.32, 0), box(0.36, 0.1, 0.32, p.team, 0, 0.5, 0), cyl(0.03, 0.03, 0.5, p.rubber, 4, -side * 0.2, 0.25, 0.1))).translateX(side * 1.5).translateZ(-V_HALF_LEN + 0.2));
    add(pad);
  });

  // ================================================================ 3. Ô ĐIỀU KHIỂN: tháp + nhà điều hành gộp một ô (5,4 × 6,1 m)
  const [CX, CZ] = CONTROL_CELL;
  add(part("Nền ô điều khiển", box(5.4, 0.04, 6.1, p.concrete, CX, PAD_Y, CZ)));
  const FLOOR = PAD_Y + 0.02;
  // nhà điều hành thấp ở cuối ô (đuôi), mái màu phe
  const OX = CX - 0.1;
  const OZ = CZ - 1.9;
  add(part("Nhà điều hành", facets([...oct(2.0, 1.1, 0.3, FLOOR, OZ, OX), ...oct(1.9, 1.0, 0.28, FLOOR + 1.9, OZ, OX)], p.concrete)));
  add(part("Mái nhà điều hành (màu phe)", facets([...oct(2.03, 1.13, 0.3, FLOOR + 1.9, OZ, OX), ...oct(2.03, 1.13, 0.3, FLOOR + 2.06, OZ, OX)], p.team)));
  add(part("Dải cửa sổ", box(3.2, 0.45, 0.04, p.glass, OX, FLOOR + 1.3, OZ + 1.12)));
  add(part("Cửa nhà điều hành", box(0.8, 1.2, 0.04, p.hullDark, OX + 1.3, FLOOR + 0.6, OZ + 1.13)));
  // tháp điều khiển kiểu đài kính xòe ra như Tổng Hành Dinh, đứng ở đầu ô, gần hành lang
  const TX = CX + 1.5;
  const TZ = CZ + 1.3;
  const BODY_TOP = 5.0;
  add(part("Thân tháp điều khiển", facets([...oct(0.95, 0.95, 0.24, FLOOR, TZ, TX), ...oct(0.72, 0.72, 0.2, BODY_TOP, TZ, TX)], p.hull)));
  add(part("Sàn đài", facets([...oct(1.0, 1.0, 0.26, BODY_TOP, TZ, TX), ...oct(1.0, 1.0, 0.26, BODY_TOP + 0.14, TZ, TX)], p.hullDark)));
  const low = oct(0.88, 0.88, 0.22, BODY_TOP + 0.14, TZ, TX);
  const high = oct(1.22, 1.22, 0.3, BODY_TOP + 1.02, TZ, TX);
  add(part("Đài kính điều khiển", facets([...low, ...high], p.glass)));
  low.forEach((a, i) => add(part("Khung kính", strut(a as P3, high[i]!, 0.03, p.metal))));
  add(part("Nóc đài (màu phe)", facets([...oct(1.3, 1.3, 0.32, BODY_TOP + 1.02, TZ, TX), ...oct(1.3, 1.3, 0.32, BODY_TOP + 1.2, TZ, TX)], p.team)));
  add(part("Cột radar", cyl(0.05, 0.07, 0.7, p.metal, 6, TX, BODY_TOP + 1.55, TZ)));
  const radar = part("Radar", group(box(1.1, 0.34, 0.08, p.hullDark, 0, 0, 0.06), box(0.98, 0.24, 0.03, p.teamGlow, 0, 0, 0.11), box(0.2, 0.2, 0.16, p.hullDark)));
  radar.position.set(TX, BODY_TOP + 1.95, TZ);
  add(radar);
  // Xưởng Mô Hình: trưng Falcon ô 1, Valkyrie ô 4 (chéo nhau), thu đúng cỡ đậu trong trận (`parkScale`)
  type Parked = { rig: Rig; k: number; pad: number };
  const parked: Parked[] = [];
  if (showcase)
    for (const [kind, i] of [["falcon", 0], ["valkyrie", 3]] as const) {
      const plane = buildUnit(kind, faction);
      parked.push({ rig: plane, k: parkScale(kind), pad: i });
      add(plane.root);
    }
  /** Đặt máy bay (gốc mô hình) trên mặt phẳng, hướng mũi `h`, độ cao `alt` trên ô, tỉ lệ `s` (so với cỡ đậu). */
  const place = (q: Parked, cx: number, cz: number, h: number, alt: number, s: number): void => {
    const o = q.rig.root;
    o.scale.setScalar(q.k * s);
    o.rotation.y = h;
    o.position.set(cx, PAD_Y + 0.04 + alt, cz);
  };
  for (const q of parked) {
    const [fx, fz, yaw] = PADS[q.pad]!;
    place(q, fx, fz, yaw, 0, 1);
  }

  // ================================================================ 4. CHẾ ĐỘ VẬN HÀNH (xem trước vòng cất → bay vòng → hạ cánh của Falcon ô 1)
  const OPS: RigAction = { id: "ops", label: "Vận hành (cất / hạ cánh)" };
  const OPS_T = { hold: 3, rise: 2, dash: 2.6, away: 1.2, glide: 3.4, hover: 2.4, down: 2.2 };
  const OPS_LEN = Object.values(OPS_T).reduce((x, y) => x + y, 0);
  const ease = (u: number): number => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
  const lerp = (a0: number, a1: number, u: number): number => a0 + (a1 - a0) * u;
  let opsT = 0;
  const flight = (dt: number, t: number, a: ReadonlySet<string>): void => {
    const q = parked[0];
    if (!q) return;
    const [px, pz, yaw] = PADS[q.pad]!;
    const dx = Math.sin(yaw);
    const dz = Math.cos(yaw);
    const side = Math.sign(px);
    if (!a.has("ops")) {
      opsT = 0;
      place(q, px, pz, yaw, 0, 1);
      q.rig.setFlight?.(false, 0);
      q.rig.root.visible = true;
      return;
    }
    opsT = (opsT + dt) % OPS_LEN;
    let u = opsT;
    const phase = (len: number): number => {
      const r = Math.min(1, Math.max(0, u / len));
      u -= len;
      return r;
    };
    const grow = (alt: number): number => lerp(1, 1 / q.k, Math.min(1, alt / 4));
    let airborne = false;
    let roll = 0;
    q.rig.root.visible = true;
    const hold = phase(OPS_T.hold);
    if (u < 0 && hold < 1) {
      place(q, px, pz, yaw, 0, 1);
      return q.rig.setFlight?.(false, 0);
    }
    const rise = phase(OPS_T.rise);
    if (u < 0 && rise < 1) {
      // bốc thẳng, chúi mũi dần
      const alt = ease(rise) * 4.5;
      place(q, px, pz, yaw, alt, grow(alt));
      return q.rig.setFlight?.(true, 0);
    }
    const dash = phase(OPS_T.dash);
    if (u < 0 && dash < 1) {
      // tăng tốc ra phía trước (hướng mũi), vừa bay vừa lên
      const s = ease(dash) * ease(dash) * 36;
      const alt = 4.5 + ease(dash) * 3;
      place(q, px + dx * s, pz + dz * s, yaw, alt, grow(alt));
      return q.rig.setFlight?.(true, 0);
    }
    const away = phase(OPS_T.away);
    if (u < 0 && away < 1) {
      q.rig.root.visible = false;
      return q.rig.setFlight?.(true, 0);
    }
    // quay lại: vào từ phía mũi, cung cong về phía hành lang giữa rồi dừng lơ lửng trên ô
    const glide = phase(OPS_T.glide);
    const start: [number, number] = [px + dx * 26 - side * 9, pz + dz * 26];
    const ctrl: [number, number] = [px + dx * 12 - side * 7, pz + dz * 12];
    const hov = [px, pz];
    if (u < 0 && glide < 1) {
      const e = ease(glide) * 0.6 + glide * 0.4;
      const bx = (1 - e) * (1 - e) * start[0] + 2 * (1 - e) * e * ctrl[0] + e * e * hov[0];
      const bz = (1 - e) * (1 - e) * start[1] + 2 * (1 - e) * e * ctrl[1] + e * e * hov[1];
      const tx = 2 * (1 - e) * (ctrl[0] - start[0]) + 2 * e * (hov[0] - ctrl[0]);
      const tz = 2 * (1 - e) * (ctrl[1] - start[1]) + 2 * e * (hov[1] - ctrl[1]);
      const head = Math.atan2(tx, tz);
      const alt = lerp(7, 4.5, ease(glide));
      place(q, bx, bz, head, alt, grow(alt));
      airborne = true;
      roll = side * 0.35 * (1 - glide);
      return q.rig.setFlight?.(airborne, roll);
    }
    const hover = phase(OPS_T.hover);
    if (u < 0 && hover < 1) {
      // lơ lửng, xoay mũi cho đúng hướng ô
      // mũi đang theo hướng bay vào (tiếp tuyến cuối cung): xoay từ từ theo đường ngắn nhất về hướng ô rồi mới hạ
      const h0 = Math.atan2(hov[0]! - ctrl[0], hov[1]! - ctrl[1]);
      let dh = yaw - h0;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      // xoay nhanh trong 70% đầu, nghiêng cánh vào hướng quay (hình chuông) rồi trả về cân bằng trước khi hạ
      const turn = Math.min(1, hover / 0.7);
      const head = h0 + dh * ease(turn);
      place(q, px, pz, head, 4.5, grow(4.5));
      return q.rig.setFlight?.(true, Math.sign(dh) * 0.45 * Math.sin(Math.PI * turn));
    }
    const down = phase(OPS_T.down);
    const alt = (1 - ease(down)) * 4.5;
    place(q, px, pz, yaw, alt, grow(alt));
    q.rig.setFlight?.(alt > 0.1, 0);
    void t;
  };

  let powered = 0;
  const ups: Update[] = [
    (dt, t, a) => {
      const on = a.has("work");
      powered = approach(powered, on ? 1 : 0, 4, dt);
      lights.emissiveIntensity = powered * (1.5 + Math.sin(t * 3) * 0.7);
      if (on) radar.rotation.y += dt * 2.4;
    },
    (dt, t, a) => {
      for (const q of parked) q.rig.update(dt, t, new Set());
      flight(dt, t, a);
    }
  ];
  return rig(root, parked.length ? [WORK, OPS] : [WORK], 12.5, ups, ["work"]);
}