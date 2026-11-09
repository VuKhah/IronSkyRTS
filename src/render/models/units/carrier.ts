/**
 * Siêu Tàu Sân Bay: mô hình xem trước của bản cập nhật Hải quân, CHỈ hiện trong Xưởng Mô Hình (chưa có trong luật chơi).
 * Dựng theo ảnh mẫu người dùng gửi 09/11/2026 (`Docs/models/carrier/mau-tham-khao.png`): thân cao màu tối mũi loe, boong dài
 * phẳng phình ở mạn trái, đài chỉ huy nhỏ nằm sau mạn phải, đường băng xiên và đường phóng ở mũi, máy bay xếp hàng dọc hai mép.
 * Máy bay trên boong đang giữ cỡ thật (người dùng thử 09/11/2026), đổi `PLANE_SCALE` nếu muốn thu nhỏ. Mũi tàu là +z.
 */
import * as THREE from "three";
import { box, cyl, facets, FireClock, group, muzzleFlash, palette, part, sphere, type Palette, type Rig } from "../kit";
import type { Faction } from "../../../sim/content";
import { bakeStatic } from "../bake";
import { addCarrierDetails, addIslandDetails, carrierPaint } from "./carrier-details";
import { buildFalcon } from "./falcon";
import { buildValkyrie } from "./valkyrie";
import { barrel } from "./ground";

const DECK_Y = 7;
/** Tỉ lệ máy bay trên boong so với cỡ thật; cất cánh xong luôn về cỡ thật. */
const PLANE_SCALE = 1;
/** Dáng tàu: các tọa độ bên dưới được nhân với hai hệ số này (thu ngang cho thon, kéo dọc cho dài). */
const WX = 0.75;
const LZ = 1.15;
const slim = <T extends readonly [number, number]>([x, z]: T): readonly [number, number] => [x * WX, z * LZ];
const slim3 = (pts: [number, number, number][]): [number, number, number][] => pts.map(([x, y, z]) => [x * WX, y, z * LZ]);
const LANE_WIDTH = 6;
/** Hai đường băng: đường phóng thẳng ở mũi tàu và đường xiên chạy về mạn trái. `yaw`: góc so với trục tàu (radian). */
const LANES = [
  { x: 0.5, z: 4 * LZ, yaw: 0, len: 44 * LZ },
  { x: 3, z: -40 * LZ, yaw: -0.13, len: 70 * LZ }
];
const CATAPULT_LEN = 34;
/** Một lượt phóng (giây): nổ máy, lao trên máy phóng, bay ra xa, chờ chiếc mới. */
const SPOOL = 1.3;
const RUN = 1.3;
const CLIMB = 2.6;
const LAUNCH_CYCLE = 7;
/** Xếp máy bay dọc mép boong: cách mép, khoảng cách giữa hai chiếc, số chiếc tối đa. */
const PARK_INSET = 2.7;
const PARK_GAP = 6.3;
const PARK_MAX = 24;
/** Vùng đài chỉ huy trên boong: x0, x1, z0, z1. */
const ISLAND_AREA = [4.6, 8.4, -31, -14] as const;

/** Đường viền boong như ảnh mẫu: mũi hẹp, mạn phải thẳng, mạn trái phình ra giữa tàu cho đường băng xiên. */
const DECK: readonly (readonly [number, number])[] = ([
  [10, -44],
  [12, -36],
  [12.5, -8],
  [12, 18],
  [8, 38],
  [5.5, 48],
  [-6, 48],
  [-8, 38],
  [-12, 30],
  [-21, 22],
  [-21.5, 0],
  [-15, -18],
  [-13, -36],
  [-10, -44]
] as const).map(slim);
/** Đài pháo phòng thủ đặt trên sàn nhô ra ngoài mạn, thấp hơn mặt boong. */
const GUN_MOUNTS: readonly (readonly [number, number])[] = ([
  [8.5, 44],
  [-8.5, 45],
  [14.2, 8],
  [-23.5, 12],
  [14.5, -32],
  [-15.5, -32]
] as const).map(slim);
/** Thang nâng máy bay ở mép boong: x, z. */
const ELEVATORS: readonly (readonly [number, number])[] = ([
  [15.2, 10],
  [15.2, -2],
  [15.2, -36],
  [-24, 8]
] as const).map(slim);

function onDeck(x: number, z: number): boolean {
  let inside = false;
  for (let i = 0, j = DECK.length - 1; i < DECK.length; j = i++) {
    const [xi, zi] = DECK[i];
    const [xj, zj] = DECK[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Tấm phẳng theo đúng đường viền boong (đa giác có chỗ lõm, nên dùng hình đùn thay vì `facets`). */
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

/** Dải nằm trên một đường (x1, z1) → (x2, z2). */
function strip(x1: number, z1: number, x2: number, z2: number, y: number, w: number, h: number, mat: THREE.Material): THREE.Mesh {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const m = box(w, h, Math.sqrt(dx * dx + dz * dz), mat, (x1 + x2) / 2, y, (z1 + z2) / 2);
  m.rotation.y = Math.atan2(dx, dz);
  return m;
}

/** Chỗ đậu thành hàng dọc mép boong, mũi chếch vào trong và về phía mũi tàu như ảnh mẫu. Chừa đường băng, đài chỉ huy. */
function parkingSpots(): { x: number; z: number; yaw: number }[] {
  const blocked = (x: number, z: number): boolean => {
    for (const l of LANES) {
      const sin = Math.sin(l.yaw);
      const cos = Math.cos(l.yaw);
      const along = (x - l.x) * sin + (z - l.z) * cos;
      const across = (x - l.x) * cos - (z - l.z) * sin;
      if (Math.abs(across) < LANE_WIDTH / 2 + 2.2 && along > -3 && along < l.len + 8) return true;
    }
    const [x0, x1, z0, z1] = ISLAND_AREA;
    return x > x0 - 3 && x < x1 + 3 && z > z0 - 3 && z < z1 + 3;
  };
  const out: { x: number; z: number; yaw: number }[] = [];
  for (let i = 0; i < DECK.length; i++) {
    const [x1, z1] = DECK[i];
    const [x2, z2] = DECK[(i + 1) % DECK.length];
    const len = Math.sqrt((x2 - x1) ** 2 + (z2 - z1) ** 2);
    const ux = (x2 - x1) / len;
    const uz = (z2 - z1) / len;
    let nx = -uz;
    let nz = ux;
    if (!onDeck((x1 + x2) / 2 + nx, (z1 + z2) / 2 + nz)) {
      nx = -nx;
      nz = -nz;
    }
    // chỉ xếp dọc hai mạn, không xếp ở mép ngang đầu và cuối tàu
    if (Math.abs(nx) < 0.6) continue;
    const count = Math.floor((len - 3) / PARK_GAP) + 1;
    if (count < 1) continue;
    const start = (len - (count - 1) * PARK_GAP) / 2;
    for (let k = 0; k < count && out.length < PARK_MAX; k++) {
      const x = x1 + ux * (start + k * PARK_GAP) + nx * PARK_INSET;
      const z = z1 + uz * (start + k * PARK_GAP) + nz * PARK_INSET;
      if (blocked(x, z)) continue;
      const shape: [number, number][] = [[-2.7, -1], [2.7, -1], [0, -2.2], [0, 2.8]];
      if (!shape.every(([along, inward]) => onDeck(x + ux * along + nx * inward, z + uz * along + nz * inward))) continue;
      if (out.some((o) => (o.x - x) ** 2 + (o.z - z) ** 2 < 5.4 * 5.4)) continue;
      out.push({ x, z, yaw: Math.atan2(nx * 0.72, nz * 0.72 + 0.7) });
    }
  }
  return out;
}

function buildHull(p: Palette, root: THREE.Group): void {
  // thân cao, mũi loe rộng dần lên boong, sống mũi nghiêng ra trước
  root.add(
    part("Thân tàu", facets(slim3([[7, 0, -41], [10, 0, -22], [10, 0, 10], [4.5, 0, 33], [0, 0, 41], [10.5, DECK_Y - 0.4, -44], [12.2, DECK_Y - 0.4, -20], [12.2, DECK_Y - 0.4, 14], [7.8, DECK_Y - 0.4, 38], [5.3, DECK_Y - 0.4, 48], [0, DECK_Y - 0.4, 48.6]]), carrierPaint().hull, true)),
    part("Khung boong", deckSlab(DECK_Y - 0.5, DECK_Y, p.hull)),
    part("Mặt boong", deckSlab(DECK_Y, DECK_Y + 0.04, p.hullDark))
  );
  // trụ vát đỡ phần boong phình ra mạn trái
  for (const [z, w] of [[-8, 8], [10, 9], [24, 5]] as const)
    root.add(part("Trụ đỡ boong", facets(slim3([[-11.5, 3.2, z - w], [-11.5, 3.2, z + w], [-11.5, DECK_Y - 0.5, z - w * 1.2], [-11.5, DECK_Y - 0.5, z + w * 1.2], [-20.6, DECK_Y - 0.5, z - w * 0.8], [-20.6, DECK_Y - 0.5, z + w * 0.8]]), p.metal)));
  // vạch nước màu phe chạy quanh thân
  for (const side of [-1, 1]) {
    root.add(part("Vạch màu phe", strip(side * 10.3 * WX, -22 * LZ, side * 10.3 * WX, 10 * LZ, 1.3, 0.1, 0.5, p.team)));
    root.add(part("Vạch màu phe", strip(side * 10.3 * WX, 10 * LZ, side * 5.2 * WX, 33 * LZ, 1.3, 0.1, 0.5, p.team)));
  }
  // lối đi có lan can men theo mép boong
  for (let i = 0; i < DECK.length; i++) {
    const [x1, z1] = DECK[i];
    const [x2, z2] = DECK[(i + 1) % DECK.length];
    root.add(part("Lối đi mép boong", strip(x1, z1, x2, z2, DECK_Y - 0.28, 0.42, 0.1, p.metal)));
    root.add(part("Vạch mép boong", strip(x1, z1, x2, z2, DECK_Y + 0.05, 0.14, 0.02, p.white)));
  }
  for (const [x, z] of ELEVATORS) root.add(part("Thang nâng máy bay", box(5.4, 0.3, 8, p.hullDark, x, DECK_Y - 0.12, z)));
  // cột đèn cao ở mạn trái như ảnh mẫu
  root.add(part("Cột đèn boong", group(cyl(0.07, 0.1, 5.5, p.metal, 6, -19.4 * WX, DECK_Y + 2.75, 15 * LZ), box(0.4, 0.3, 0.4, p.white, -19.4 * WX, DECK_Y + 5.6, 15 * LZ))));
}

/** Đường băng dựng trong khung riêng: +z của khung là hướng cất cánh. Vạch sơn như ảnh mẫu. */
function buildLane(p: Palette, lane: (typeof LANES)[number]): { root: THREE.Group; start: number; end: number } {
  const g = group();
  g.position.set(lane.x, DECK_Y + 0.06, lane.z);
  g.rotation.y = lane.yaw;
  const end = lane.len - 1;
  const start = end - CATAPULT_LEN;
  g.add(part("Mặt đường băng", box(LANE_WIDTH, 0.03, lane.len, p.concreteDark, 0, 0, lane.len / 2)));
  for (const s of [-1, 1]) g.add(part("Vạch mép đường băng", box(0.14, 0.03, lane.len, p.white, (s * LANE_WIDTH) / 2, 0.02, lane.len / 2)));
  for (let z = 2; z < start - 3; z += 4.5) g.add(part("Vạch giữa đường băng", box(0.16, 0.03, 2.4, p.warning, 0, 0.03, z)));
  g.add(part("Ray máy phóng đàn hồi", box(0.28, 0.04, CATAPULT_LEN, p.teamGlow, 0, 0.03, (start + end) / 2)));
  for (const s of [-1, 1]) g.add(part("Vạch an toàn (màu phe)", box(0.1, 0.03, lane.len * 0.9, p.team, s * (LANE_WIDTH / 2 + 0.55), 0.02, lane.len * 0.5)));
  return { root: g, start, end };
}

function buildIsland(p: Palette): { root: THREE.Group; radar: THREE.Group } {
  const g = group();
  g.add(
    part("Thân đài chỉ huy", facets([[1.9, 0, -5.5], [1.9, 0, 5.5], [1.6, 5, -4.6], [1.6, 5, 4.4]], p.hull, true)),
    part("Tầng chỉ huy", facets([[1.7, 5, -3.6], [1.7, 5, 3.8], [1.9, 6.6, -3.2], [1.9, 6.6, 4.2]], p.hullDark, true)),
    part("Vạch đài (màu phe)", box(3.3, 0.5, 9.2, p.team, 0, 2.4, 0)),
    part("Nóc đài", box(3.1, 0.25, 6.9, p.hull, 0, 6.75, 0.4)),
    part("Cột chính", cyl(0.22, 0.42, 7, p.metal, 6, 0, 10.2, 0)),
    part("Xà ngang radar", box(4.2, 0.16, 0.5, p.metal, 0, 11.2, 0)),
    part("Xà ngang radar", box(3, 0.16, 0.5, p.metal, 0, 12.9, 0)),
    part("Vòm radar", sphere(0.72, p.white, 1.45, 9.4, 0.8, 10)),
    part("Vòm radar", sphere(0.72, p.white, -1.45, 9.4, 0.8, 10)),
    part("Vòm radar", sphere(0.42, p.white, 1.7, 11.6, 0, 8)),
    part("Vòm radar", sphere(0.42, p.white, -1.7, 11.6, 0, 8)),
    part("Ăng-ten đỉnh", cyl(0.03, 0.07, 2, p.metal, 4, 0, 14.6, 0))
  );
  for (const side of [-1, 1]) g.add(part("Kính đài chỉ huy", box(0.05, 0.7, 7.2, p.glass, side * 1.84, 5.9, 0.3)));
  g.add(part("Kính đài chỉ huy", box(3.5, 0.7, 0.05, p.glass, 0, 5.9, 4.12)));
  addIslandDetails(g, p);
  const radar = group(box(2.6, 0.5, 0.16, p.hullDark), box(2.4, 0.14, 0.05, p.teamGlow, 0, 0, 0.1));
  radar.position.set(0, 13.6, 0);
  part("Radar quay", radar);
  g.add(radar);
  const [x0, x1, z0, z1] = ISLAND_AREA;
  g.position.set((x0 + x1) / 2, DECK_Y, (z0 + z1) / 2);
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
  // sàn nhô ra ngoài mạn, thấp hơn mặt boong
  const root = group(part("Sàn đài pháo", box(3.4, 0.3, 3.8, p.hull, 0, -0.15, 0)), part("Bệ đài pháo", cyl(0.8, 1.0, 0.5, p.hullDark, 8, 0, 0.25, 0)));
  root.position.set(x, DECK_Y - 1.1, z);
  const yaw = group(part("Tháp đài pháo", facets([[0.62, 0, -0.75], [0.62, 0, 0.55], [0, 0, 1.05], [0.4, 0.72, -0.65], [0.3, 0.72, 0.35]], p.white, true)));
  yaw.position.y = 0.5;
  const gun = group();
  gun.position.set(0, 0.4, 0.2);
  const barrels = [barrel(1.9, 0.07, p.metal, -0.16, 0, 0), barrel(1.9, 0.07, p.metal, 0.16, 0, 0)];
  const flashes = barrels.map((b) => {
    const f = muzzleFlash(0.6, p.flash);
    f.position.z = 2.1;
    f.visible = false;
    b.add(f);
    return f;
  });
  gun.add(...barrels);
  yaw.add(gun);
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

  // máy bay đậu dọc mép boong: dựng một chiếc đã gộp khối rồi nhân bản, hàng chục chiếc vẫn nhẹ
  const none = new Set<string>();
  const template = buildFalcon(p);
  bakeStatic(template);
  template.setFlight?.(false, 0);
  template.update(0.016, 0, none);
  // phần boong phình ở mạn trái là chỗ duy nhất đủ rộng cho Valkyrie (sải cánh 7,3 m): dành riêng cho chúng
  const spots = parkingSpots().filter((s) => !(s.x < -11 && s.z > 0 && s.z < 28));
  const bombers = [3.5, 11.9, 20.3].map((z) => ({ x: -12.6, z, yaw: Math.PI / 2, half: 4 }));
  const bomber = buildValkyrie(p);
  bakeStatic(bomber);
  bomber.setFlight?.(false, 0);
  bomber.update(0.016, 0, none);
  for (const spot of bombers) {
    const parked = bomber.root.clone(true);
    parked.scale.setScalar(PLANE_SCALE);
    parked.position.set(spot.x, DECK_Y + 0.05, spot.z);
    parked.rotation.y = spot.yaw;
    root.add(part("Valkyrie đậu", parked));
  }
  for (const spot of spots) {
    const parked = template.root.clone(true);
    parked.scale.setScalar(PLANE_SCALE);
    parked.position.set(spot.x, DECK_Y + 0.05, spot.z);
    parked.rotation.y = spot.yaw;
    root.add(part("Máy bay đậu (thu nhỏ)", parked));
  }

  addCarrierDetails(root, p, { deck: DECK, deckY: DECK_Y, wx: WX, lz: LZ, lanes: LANES, laneWidth: LANE_WIDTH, island: ISLAND_AREA, parked: [...spots, ...bombers], elevators: ELEVATORS, guns: GUN_MOUNTS, onDeck });

  // mỗi đường băng một máy bay trên máy phóng, tấm chắn khí nóng dựng lên khi nổ máy
  const lanes = LANES.map((def, i) => {
    const built = buildLane(p, def);
    root.add(built.root);
    const plane = buildFalcon(p);
    plane.root.scale.setScalar(PLANE_SCALE);
    built.root.add(part("Máy bay trên máy phóng", plane.root));
    const deflector = group(box(5.2, 1.4, 0.1, p.hullDark, 0, 0.7, 0), box(4.8, 0.08, 0.12, p.warning, 0, 1.3, 0));
    deflector.position.set(0, 0.02, built.start - 3.6);
    built.root.add(part("Tấm chắn khí nóng", deflector));
    const shuttle = box(0.7, 0.12, 0.9, p.warning, 0, 0.08, built.start);
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
        z = l.end + k * 130;
        y = 0.02 + k * k * 20;
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
    radius: 56,
    update(dt, t, a) {
      if (a.has("radar")) island.radar.rotation.y += dt * 1.4;
      for (const l of lanes) place(l, (t + l.offset) % LAUNCH_CYCLE, a.has("launch"), dt, t);
      const aiming = a.has("aim") || a.has("fire");
      for (const g of guns) {
        g.yaw.rotation.y = aiming ? Math.sin(t * 0.6 + g.phase) * 1.3 : 0;
        g.gun.rotation.x = aiming ? -0.35 - Math.sin(t * 0.9 + g.phase) * 0.15 : 0;
        g.clock.tick(dt, a.has("fire"));
        const since = g.clock.since;
        const kick = since < 0.2 ? Math.sin((since / 0.2) * Math.PI) * 0.2 : 0;
        for (const b of g.barrels) b.position.z = (b.userData.z0 as number) - kick;
        for (const f of g.flashes) f.visible = since < 0.06;
      }
    }
  };
}
