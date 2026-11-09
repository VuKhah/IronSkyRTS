/**
 * Siêu Tàu Sân Bay: mô hình xem trước của bản cập nhật Hải quân, CHỈ hiện trong Xưởng Mô Hình (chưa có trong luật chơi).
 * Người dùng chốt 09/11/2026: thật sự lớn, phong cách tương lai góc cạnh, có đài chỉ huy, vài đài pháo phòng thủ, đường băng
 * chạy xiên có máy phóng. Máy bay đậu trên tàu thu nhỏ 3 lần, cất cánh xong trở lại cỡ thật.
 *
 * Mũi tàu là +z. Boong có viền lõm răng cưa: các mảng nhô ra xen với khe chữ V cắt sâu vào hai mạn, mũi tách thành hai ngạnh.
 * Hai đường băng chạy xiên qua tàu, khe chỉ cắt tới sát đường băng. Máy bay là mô hình Falcon thật.
 */
import * as THREE from "three";
import { box, cyl, facets, FireClock, group, muzzleFlash, palette, part, type Palette, type Rig } from "../kit";
import type { Faction } from "../../../sim/content";
import { buildFalcon } from "./falcon";
import { barrel } from "./ground";

const DECK_Y = 8;
/** Máy bay trên boong nhỏ bằng 1/3 cỡ thật. */
const PLANE_SCALE = 1 / 3;
/** Góc xiên của đường băng so với trục tàu (radian, khoảng 14° sang mạn trái). */
const LANE_YAW = -0.244;
const LANE_WIDTH = 4.4;
/** Đường băng: điểm đầu ở đuôi tàu và chiều dài. */
const LANES = [
  { x: 6, z: -50, len: 96 },
  { x: 0, z: -49.5, len: 86 }
];
const CATAPULT_LEN = 38;
/** Một lượt phóng (giây): nổ máy, lao trên máy phóng, bay ra xa, chờ chiếc mới. */
const SPOOL = 1.3;
const RUN = 1.3;
const CLIMB = 2.6;
const LAUNCH_CYCLE = 7;
/** Đường viền boong, đa giác lõm (người dùng 09/11/2026: boong lồi nhàm chán). */
const DECK: readonly (readonly [number, number])[] = [
  [14, -53],
  [16, -34],
  [16.5, -8],
  [9.5, 3],
  [16, 14],
  [16, 38],
  [11, 47],
  [6, 64],
  [-4, 50],
  [-21, 62],
  [-33, 40],
  [-25, 27],
  [-33, 12],
  [-18, -3],
  [-25, -22],
  [-14, -34],
  [-20, -53],
  [-9, -44],
  [-3, -53]
];
/** Vị trí đài pháo phòng thủ quanh mạn. */
const GUN_MOUNTS: readonly (readonly [number, number])[] = [
  [-26.5, 42],
  [-28, 13],
  [-20.5, -21],
  [-14, -44],
  [12.5, -50.5],
  [4.7, 57],
  [12.5, 40.5]
];

/** Điểm (x, z) có nằm trong đường viền boong không. */
function onDeck(x: number, z: number): boolean {
  let inside = false;
  for (let i = 0, j = DECK.length - 1; i < DECK.length; j = i++) {
    const [xi, zi] = DECK[i];
    const [xj, zj] = DECK[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Dải nằm trên một đường (x1, z1) → (x2, z2). */
function strip(x1: number, z1: number, x2: number, z2: number, y: number, w: number, h: number, mat: THREE.Material): THREE.Mesh {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const m = box(w, h, Math.sqrt(dx * dx + dz * dz), mat, (x1 + x2) / 2, y, (z1 + z2) / 2);
  m.rotation.y = Math.atan2(dx, dz);
  return m;
}

/** Tấm phẳng theo đúng đường viền lõm của boong, từ độ cao `y0` tới `y1`. Khối `facets` chỉ dựng được hình lồi nên ở đây dùng hình đùn. */
function deckSlab(y0: number, y1: number, mat: THREE.Material): THREE.Mesh {
  const shape = new THREE.Shape();
  DECK.forEach(([x, z], i) => (i ? shape.lineTo(x, -z) : shape.moveTo(x, -z)));
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: y1 - y0, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, y0, 0);
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function buildHull(p: Palette, root: THREE.Group): void {
  // thân tàu: đáy hẹp vuốt nhọn, mũi rẽ sóng, mạn vát ngược
  root.add(
    part("Thân tàu", facets([[6.5, 0, -50], [9.5, 0, -20], [9.5, 0, 14], [4, 0, 42], [0, 0, 62], [12, 7.2, -50], [14.5, 7.2, -18], [14.5, 7.2, 14], [8.5, 7.2, 42], [0, 7.2, 58]], p.metal, true)),
    part("Mũi rẽ sóng", facets([[0, 0, 72], [0, 5.4, 64], [1.9, 3.4, 54], [1.9, 0, 54], [-1.9, 3.4, 54], [-1.9, 0, 54]], p.hullDark)),
    part("Khung boong", deckSlab(7.1, DECK_Y, p.hull)),
    part("Mặt boong", deckSlab(DECK_Y, DECK_Y + 0.05, p.hullDark))
  );

  // trụ vát đỡ từng mảng boong nhô ra khỏi thân tàu
  for (const [z, w, inner, outer] of [[-47, 4, -6, -18], [-22, 6, -13, -24], [12, 8, -13, -32], [40, 7, -8, -32], [56, 4, -1, -20]] as const)
    root.add(part("Trụ đỡ boong", facets([[inner, 4.2, z - w], [inner, 4.2, z + w], [inner, 7.2, z - w * 1.2], [inner, 7.2, z + w * 1.2], [outer, 7.2, z - w * 0.5], [outer, 7.2, z + w * 0.5]], p.hullDark)));

  // các mảng giáp vát hình bình hành dọc hai mạn, xen kẽ màu phe và màu tối
  for (const side of [-1, 1])
    for (let i = 0; i < 7; i++) {
      const z0 = -44 + i * 12;
      const color = i % 2 ? p.hullDark : p.team;
      const hullX = (z: number): number => (z > 14 ? 14.5 - ((z - 14) / 28) * 6 : 14.5) * 0.93 + 0.2;
      const x0 = hullX(z0);
      const x1 = hullX(z0 + 10);
      root.add(
        part(
          i % 2 ? "Giáp mạn tối" : "Giáp mạn (màu phe)",
          facets([[side * x0, 3.1, z0 + 1.4], [side * x1, 3.1, z0 + 11.4], [side * (x0 + 0.5), 6.5, z0 - 1.6], [side * (x1 + 0.5), 6.5, z0 + 8.4], [side * (x0 - 0.5), 3.1, z0 + 1.4], [side * (x1 - 0.5), 3.1, z0 + 11.4], [side * x0, 6.5, z0 - 1.6], [side * x1, 6.5, z0 + 8.4]], color)
        )
      );
    }

  // viền boong phát sáng theo đúng đường gấp khúc
  for (let i = 0; i < DECK.length; i++) {
    const [x1, z1] = DECK[i];
    const [x2, z2] = DECK[(i + 1) % DECK.length];
    root.add(part("Viền boong phát sáng", strip(x1, z1, x2, z2, DECK_Y - 0.3, 0.1, 0.18, p.teamGlow)));
  }

  // mảng boong gấp khúc ở mũi tàu và các vạch chữ V chỉ hướng cất cánh
  root.add(part("Mảng boong mũi", facets([[9, DECK_Y + 0.06, 42], [5, DECK_Y + 0.06, 58], [1, DECK_Y + 0.06, 53], [3, DECK_Y + 0.06, 38], [9, DECK_Y + 0.1, 42], [5, DECK_Y + 0.1, 58], [1, DECK_Y + 0.1, 53], [3, DECK_Y + 0.1, 38]], p.concreteDark)));

  // bốn khe động cơ phát sáng ở đuôi
  for (const x of [-9.5, -3.2, 3.2, 9.5]) {
    root.add(part("Vỏ động cơ đuôi", facets([[x - 2.4, 1.2, -50], [x + 2.4, 1.2, -50], [x - 2.4, 5.6, -50], [x + 2.4, 5.6, -50], [x - 1.8, 1.8, -53.4], [x + 1.8, 1.8, -53.4], [x - 1.8, 5, -53.4], [x + 1.8, 5, -53.4]], p.hullDark)));
    root.add(part("Khe động cơ", box(3.2, 0.5, 0.08, p.teamGlow, x, 3.4, -53.45)));
  }

  // thang nâng máy bay bên mạn phải
  root.add(part("Thang nâng máy bay", facets([[15.2, DECK_Y - 0.5, -26], [15.2, DECK_Y - 0.5, -12], [21, DECK_Y - 0.5, -24], [21, DECK_Y - 0.5, -14], [15.2, DECK_Y - 0.25, -26], [15.2, DECK_Y - 0.25, -12], [21, DECK_Y - 0.25, -24], [21, DECK_Y - 0.25, -14]], p.hullDark)));
}

/** Đường băng dựng trong khung riêng đã xoay xiên: +z của khung là hướng cất cánh. */
function buildLane(p: Palette, lane: (typeof LANES)[number]): { root: THREE.Group; start: number; end: number } {
  const g = group();
  g.position.set(lane.x, DECK_Y + 0.08, lane.z);
  g.rotation.y = LANE_YAW;
  const end = lane.len - 1;
  const start = end - CATAPULT_LEN;
  g.add(part("Đường băng xiên", box(LANE_WIDTH, 0.05, lane.len, p.metal, 0, 0, lane.len / 2)));
  for (const s of [-1, 1]) g.add(part("Đèn viền đường băng", box(0.1, 0.06, lane.len, p.warning, (s * LANE_WIDTH) / 2, 0.03, lane.len / 2)));
  for (let z = 3; z < start - 4; z += 6) g.add(part("Vạch giữa đường băng", box(0.22, 0.04, 3, p.white, 0, 0.04, z)));
  g.add(part("Ray máy phóng đàn hồi", box(0.3, 0.06, CATAPULT_LEN, p.teamGlow, 0, 0.04, (start + end) / 2)));
  // vạch chữ V ở cuối đường băng: chỉ hướng cất cánh
  for (let i = 0; i < 3; i++)
    for (const s of [-1, 1]) {
      const v = part("Vạch chữ V", box(1.5, 0.04, 0.26, p.white, s * 0.62, 0.05, end - 3 - i * 2.2));
      v.rotation.y = s * 0.7;
      g.add(v);
    }
  return { root: g, start, end };
}

function buildIsland(p: Palette): { root: THREE.Group; radar: THREE.Group } {
  const g = group();
  g.add(
    // ba tầng vát kiểu tàu tàng hình, tầng trên loe ra
    part("Thân đài chỉ huy", facets([[2.8, 0, -11], [2.8, 0, 9], [0, 0, 13], [1.9, 4.6, -8], [1.9, 4.6, 6], [0, 4.6, 9.4], [-2.8, 0, -11], [-2.8, 0, 9], [-1.9, 4.6, -8], [-1.9, 4.6, 6]], p.hull)),
    part("Tầng chỉ huy", facets([[1.8, 4.6, -6], [1.8, 4.6, 6], [0, 4.6, 8.8], [3.1, 7.2, -5], [3.1, 7.2, 6.6], [0, 7.2, 11], [-1.8, 4.6, -6], [-1.8, 4.6, 6], [-3.1, 7.2, -5], [-3.1, 7.2, 6.6]], p.hullDark)),
    part("Nóc đài (màu phe)", facets([[3, 7.25, -4.6], [3, 7.25, 6.4], [0, 7.25, 10.6], [1.3, 9.4, -2.6], [1.3, 9.4, 2.6], [0, 9.4, 4.6], [-3, 7.25, -4.6], [-3, 7.25, 6.4], [-1.3, 9.4, -2.6], [-1.3, 9.4, 2.6]], p.team)),
    part("Cột cảm biến vát", facets([[1, 9.4, -2], [1, 9.4, 1.6], [-1, 9.4, -2], [-1, 9.4, 1.6], [0.16, 15.6, -0.5], [0.16, 15.6, 0], [-0.16, 15.6, -0.5], [-0.16, 15.6, 0]], p.metal)),
    part("Cảm biến vát", facets([[1.5, 10, 2.2], [-1.5, 10, 2.2], [0, 10, 5], [0, 12, 3.2], [1, 10, 1.4], [-1, 10, 1.4]], p.white))
  );
  // kính: dải vát chạy quanh tầng chỉ huy
  for (const side of [-1, 1]) {
    const pane = part("Kính đài chỉ huy", box(0.06, 1.0, 10.6, p.glass, side * 2.72, 6.5, 0.4));
    pane.rotation.z = side * 0.42;
    const nose = strip(side * 2.9, 6.3, 0, 10.3, 6.5, 0.06, 1.0, p.glass);
    g.add(pane, part("Kính đài chỉ huy", nose));
    g.add(part("Viền phát sáng đài chỉ huy", strip(side * 3.1, 6.6, 0, 11, 7.24, 0.1, 0.1, p.teamGlow)), part("Viền phát sáng đài chỉ huy", box(0.1, 0.1, 11.6, p.teamGlow, side * 3.1, 7.24, 0.8)));
  }
  const radar = group(facets([[2.8, 0.4, 0.16], [2.8, -0.4, 0.16], [2.8, 0.4, -0.16], [2.8, -0.4, -0.16], [0, 0.55, 0.3], [0, -0.55, 0.3], [0, 0.55, -0.3], [0, -0.55, -0.3]], p.hullDark, true), box(5, 0.2, 0.05, p.teamGlow, 0, 0, 0.3));
  radar.position.set(0, 13.4, 0);
  part("Radar quay", radar);
  g.add(radar);
  g.position.set(10.6, DECK_Y, 24);
  return { root: part("Đài chỉ huy", g), radar };
}

interface GunTurret {
  yaw: THREE.Group;
  gun: THREE.Group;
  barrels: THREE.Object3D[];
  flashes: THREE.Mesh[];
  clock: FireClock;
  phase: number;
}

function buildGun(p: Palette, x: number, z: number, phase: number): { root: THREE.Group; t: GunTurret } {
  const root = group(part("Bệ đài pháo", cyl(1.25, 1.6, 0.7, p.hullDark, 6, 0, 0.35, 0)));
  root.position.set(x, DECK_Y, z);
  // tháp hình nêm: mũi nhọn, mặt vát
  const yaw = group(part("Tháp đài pháo", facets([[1.05, 0, -1.1], [0.75, 0, 0.8], [0, 0, 1.7], [0.62, 1.05, -1.0], [0.34, 1.05, 0.5], [0, 0.9, 0.95]], p.hull, true)));
  yaw.position.y = 0.7;
  const gun = group();
  gun.position.set(0, 0.6, 0.3);
  const barrels = [barrel(2.8, 0.1, p.metal, -0.26, 0, 0), barrel(2.8, 0.1, p.metal, 0.26, 0, 0)];
  const flashes = barrels.map((b) => {
    const f = muzzleFlash(0.9, p.flash);
    f.position.z = 3.1;
    f.visible = false;
    b.add(f);
    return f;
  });
  gun.add(...barrels);
  yaw.add(gun, part("Đèn đài pháo", box(0.9, 0.06, 0.06, p.teamGlow, 0, 1.0, -0.1)));
  root.add(yaw);
  part("Đài pháo phòng thủ", root);
  return { root, t: { yaw, gun, barrels, flashes, clock: new FireClock(0.5), phase } };
}

export function buildCarrier(faction: Faction): Rig {
  const p = palette(faction);
  const root = group();

  const sea = new THREE.Mesh(new THREE.CircleGeometry(240, 64), new THREE.MeshStandardMaterial({ color: 0x1d4a6b, roughness: 0.35, metalness: 0.15, transparent: true, opacity: 0.96, depthWrite: false }));
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = 0.04;
  root.add(part("Mặt biển", sea));

  buildHull(p, root);
  const island = buildIsland(p);
  root.add(island.root);

  const guns = GUN_MOUNTS.map(([x, z], i) => {
    const b = buildGun(p, x, z, i * 1.1);
    root.add(b.root);
    return b.t;
  });

  // máy bay đậu thành hàng xiên ở góc sau mạn phải, song song đường băng
  const none = new Set<string>();
  const laneXAt = (z: number): number => LANES[0].x + (z - LANES[0].z) * Math.tan(LANE_YAW);
  let parked = 0;
  for (let z = -45; z <= -3 && parked < 18; z += 5.2)
    for (let x = laneXAt(z) + 4.4; x < 15 && parked < 18; x += 3) {
      if (![[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]].every(([ox, oz]) => onDeck(x + ox, z + oz))) continue;
      const plane = buildFalcon(p);
      plane.root.scale.setScalar(PLANE_SCALE);
      plane.root.position.set(x, DECK_Y + 0.06, z);
      plane.root.rotation.y = LANE_YAW;
      plane.setFlight?.(false, 0);
      plane.update(0.016, 0, none);
      root.add(part("Máy bay đậu (thu nhỏ)", plane.root));
      parked++;
    }

  // mỗi đường băng một máy bay trên máy phóng, tấm chắn khí nóng dựng lên khi nổ máy
  const lanes = LANES.map((def, i) => {
    const built = buildLane(p, def);
    root.add(built.root);
    const plane = buildFalcon(p);
    plane.root.scale.setScalar(PLANE_SCALE);
    built.root.add(part("Máy bay trên máy phóng", plane.root));
    const deflector = group(facets([[1.9, 0, 0.06], [-1.9, 0, 0.06], [1.9, 0, -0.06], [-1.9, 0, -0.06], [1.4, 1.5, 0.06], [-1.4, 1.5, 0.06], [1.4, 1.5, -0.06], [-1.4, 1.5, -0.06]], p.hullDark), box(2.6, 0.08, 0.14, p.warning, 0, 1.4, 0));
    deflector.position.set(0, 0.02, built.start - 2.2);
    built.root.add(part("Tấm chắn khí nóng", deflector));
    const shuttle = box(0.7, 0.14, 0.9, p.warning, 0, 0.1, built.start);
    built.root.add(part("Con trượt máy phóng", shuttle));
    return { plane, deflector, shuttle, start: built.start, end: built.end, offset: i * (LAUNCH_CYCLE / 2) };
  });

  const flying = new Set(["__"]);
  const place = (l: (typeof lanes)[number], tau: number, active: boolean, dt: number, t: number): void => {
    let z = l.start;
    let y = 0.02;
    let s = PLANE_SCALE;
    let shuttleZ = l.start;
    let raise = 0;
    let airborne = false;
    let visible = true;
    if (active) {
      if (tau < SPOOL) raise = Math.min(1, tau / 0.5);
      else if (tau < SPOOL + RUN) {
        const k = (tau - SPOOL) / RUN;
        z = l.start + (l.end - l.start) * k * k;
        shuttleZ = z;
        raise = 1;
      } else if (tau < SPOOL + RUN + CLIMB) {
        // rời boong: bay lên, trở lại cỡ thật
        const k = (tau - SPOOL - RUN) / CLIMB;
        z = l.end + k * 150;
        y = 0.02 + k * k * 22;
        s = PLANE_SCALE + (1 - PLANE_SCALE) * Math.min(1, k * 1.8);
        shuttleZ = l.end - (l.end - l.start) * Math.min(1, k * 2);
        airborne = true;
      } else visible = false;
    }
    l.plane.root.visible = visible;
    l.plane.root.position.set(0, y, z);
    l.plane.root.scale.setScalar(s);
    l.shuttle.position.z = shuttleZ;
    l.deflector.rotation.x = -(1 - raise) * (Math.PI / 2);
    l.plane.setFlight?.(airborne, 0);
    l.plane.update(dt, t, flying);
  };
  lanes.forEach((l) => place(l, 0, false, 0.016, 0));

  return {
    root,
    actions: [
      { id: "launch", label: "Phóng máy bay" },
      { id: "radar", label: "Radar quay" },
      { id: "aim", label: "Đài pháo ngắm" },
      { id: "fire", label: "Khai hỏa" }
    ],
    defaultOn: ["radar", "launch"],
    radius: 64,
    update(dt, t, a) {
      if (a.has("radar")) island.radar.rotation.y += dt * 1.4;
      for (const l of lanes) place(l, (t + l.offset) % LAUNCH_CYCLE, a.has("launch"), dt, t);
      const aiming = a.has("aim") || a.has("fire");
      for (const g of guns) {
        g.yaw.rotation.y = aiming ? Math.sin(t * 0.6 + g.phase) * 1.3 : 0;
        g.gun.rotation.x = aiming ? -0.35 - Math.sin(t * 0.9 + g.phase) * 0.15 : 0;
        g.clock.tick(dt, a.has("fire"));
        const since = g.clock.since;
        const kick = since < 0.2 ? Math.sin((since / 0.2) * Math.PI) * 0.3 : 0;
        for (const b of g.barrels) b.position.z = (b.userData.z0 as number) - kick;
        for (const f of g.flashes) f.visible = since < 0.06;
      }
    }
  };
}
