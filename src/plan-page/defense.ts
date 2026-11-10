/**
 * Bản vẽ 2: căn cứ phòng thủ mẫu (người dùng 10/11/2026): đạo quân khoảng 80 (`RULES.unitCap`), căn cứ ở góc bản đồ nên chỉ
 * thủ GÓC QUẠT 90° (địch tới giữa hướng +x và −z). Tường chặn cả hai phe, không có cổng: chỗ chừa trống là đường.
 *
 * Nguyên tắc bố trí (mỗi nguyên tắc đều được bản vẽ tự kiểm bằng sim, kết quả ghi ở chú thích):
 *  1. Ít cửa ngõ: chỉ 2 khe đường, mỗi khe thẳng hướng một xưởng (xe ra trận đi thẳng).
 *  2. Mỗi cửa ngõ là một túi hỏa lực: sau khe có TƯỜNG CHẮN lùi vào trong, địch lọt khe phải rẽ ngang mới vào được; cả sân
 *     giữa hai lớp tường nằm trong tầm 3 tháp (2 tháp hai bên khe + 1 tháp sau tường chắn).
 *  3. Tháp phủ kín cả bức tường: khoảng cách tháp tính từ tầm bắn; bản vẽ đo tỉ lệ ô tường nằm trong tầm ít nhất một tháp.
 *  4. Phòng thủ theo chiều sâu: Tổng Hành Dinh, điện, Sân Đáp ở sâu trong góc; xưởng vòng giữa; tường và tháp ngoài cùng.
 *  5. Phòng không che chỗ quý: Patriot phủ Sân Đáp và cụm xưởng, CIWS sau hai cửa ngõ.
 *  6. Điện rải hai cụm: một mũi đột phá không cắt hết điện.
 *  7. Bãi tập kết ngay sau mỗi cửa ngõ để xuất kích nhanh.
 *  8. Sim tự kiểm: đường địch từ ngoài vào Tổng Hành Dinh phải qua cửa ngõ (đo số mét đi dưới hỏa lực), đường xe từ cửa mỗi
 *     xưởng ra ngoài phải thông. Hai mép bản đồ giả định được chặn thật trên lưới để địch không đi vòng sau đầu tường.
 * Mọi nhà đặt bằng `canPlace` (vùng xây, viền, ô cấm xây, cửa ra); chỗ dự kiến phạm luật thì dò dần ra xung quanh. Số tạm.
 */
import { BUILDINGS, RULES, UNITS, type BuildingId, type UnitId } from "../sim/content";
import { CELL } from "../sim/maps";
import type { Building } from "../sim/types";
import { World } from "../sim/world";
import { figure, renderSite, scaleBar, type Extra } from "./common";

/** Đạo quân mẫu (số tạm): đủ khoảng 80 quân. */
const ARMY: [UnitId, number][] = [
  ["commander", 1],
  ["hauler", 6],
  ["lynx", 24],
  ["titan", 14],
  ["skyguard", 8],
  ["rocket", 8],
  ["artillery", 4],
  ["falcon", 10],
  ["valkyrie", 4]
];
/** Cung tường ngoài (m, tính từ góc bản đồ) và hai cửa ngõ (góc, độ; 0 = +x, 90 = −z). */
const WALL_R = 136;
const GATES = [27, 63];
const GAP_CELLS = 3;
/** Tường chắn sau mỗi cửa ngõ: bán kính và nửa bề rộng (m). */
const BAFFLE_R = WALL_R - 20;
const BAFFLE_HALF = 11;
/** Tháp sát tường: cách tường bấy nhiêu mét. */
const TOWER_IN = 10;

/**
 * Đường nội bộ chừa trống (không nhà, không quân đứng): trục hướng tâm từ mỗi cửa ngõ vào tới lõi. (Đã thử thêm đường vành
 * đai quanh lõi: cắt bên trong thành mảnh nhỏ, không còn chỗ cho Sân Đáp; liên thông thật thì sim tự kiểm bằng tìm đường.)
 */
const ROAD_HALF = 4;
const ROAD_FROM = 64;

/** Nhà: [loại, bán kính (m), góc (độ), nấc xoay] tính từ góc bản đồ; đặt theo thứ tự. */
const CORE: [BuildingId, number, number, number][] = [
  // Cột Điện vòng 1 (trong vùng xây của Tổng Hành Dinh), để xây được ra xa
  ["power-pylon", 62, 10, 0],
  ["power-pylon", 60, 45, 0],
  ["power-pylon", 62, 80, 0],
  // vòng ngoài: ba xưởng mặt đất, mỗi xưởng một nêm giữa các trục đường, cửa quay ra trục / ra trận
  ["factory", 88, 13, 2],
  ["factory", 88, 77, 1],
  ["special-factory", 86, 45, 2],
  // lõi liền khối (sâu nhất): Sân Đáp, Nhà Máy Máy Bay
  ["airfield", 36, 7, 0],
  ["airfield", 36, 83, 0],
  ["airfield", 52, 32, 0],
  ["aircraft-factory", 52, 62, 0],
  // Cột Điện vòng 2: vùng xây với tới tường
  ["power-pylon", 104, 8, 0],
  ["power-pylon", 102, 45, 0],
  ["power-pylon", 104, 82, 0],
  // điện rải hai cụm, Pin và Radar trong lõi
  ["power-plant", 10, 16, 0],
  ["power-plant", 10, 74, 0],
  ["power-plant", 20, 4, 0],
  ["power-plant", 20, 86, 0],
  ["power-plant", 66, 45, 0],
  ["battery", 6, 45, 0],
  ["battery", 18, 28, 0],
  ["radar", 18, 62, 0],
  // phòng không: Patriot phủ lõi (Sân Đáp, Tổng Hành Dinh) từ hai bên
  ["aa-sam", 34, 30, 0],
  ["aa-sam", 34, 60, 0]
];

export function drawDefense(host: HTMLElement): void {
  const w = new World(1, { sandbox: true, map: "big-test" });
  const CX = -120;
  const CZ = 120;
  const at = (r: number, deg: number): [number, number] => {
    const a = (deg * Math.PI) / 180;
    return [CX + r * Math.cos(a), CZ - r * Math.sin(a)];
  };
  const polar = (x: number, z: number): [number, number] => [Math.hypot(x - CX, CZ - z), (Math.atan2(CZ - z, x - CX) * 180) / Math.PI];
  // mép bản đồ giả định: chặn thật trên lưới một dải dày phía sau (để kiểm đường địch không đi vòng sau đầu tường)
  const EDGE = 24;
  const SPAN = WALL_R + 70;
  w.grid.block(w.grid.cellsInRect(CX - EDGE / 2, CZ - SPAN / 2, EDGE / 2, SPAN / 2 + EDGE), 1);
  w.grid.block(w.grid.cellsInRect(CX + SPAN / 2, CZ + EDGE / 2, SPAN / 2 + EDGE, EDGE / 2), 1);
  const insideEdges = (kind: BuildingId, x: number, z: number, rot: number): boolean => {
    const [hw, hd] = w.blockHalf(kind, rot);
    const m = w.marginOf(kind);
    return x - hw - m >= CX - 1e-6 && z + hd + m <= CZ + 1e-6;
  };
  const spawn = (kind: BuildingId, x: number, z: number, rot: number): void => {
    w.step([{ side: 0, order: { t: "sbSpawn", kind, side: 0, x, z, rot } } as never]);
  };
  const problems: string[] = [];
  /** Điểm (x, z) có nằm trên đường nội bộ không (trục cửa ngõ hoặc vành đai), cộng lề `pad` m. */
  const onRoad = (x: number, z: number, pad = 0): boolean => {
    const [r, deg] = polar(x, z);
    if (r < ROAD_FROM - pad) return false;
    return GATES.some((gd) => Math.abs(Math.sin(((deg - gd) * Math.PI) / 180)) * r < ROAD_HALF + pad && Math.abs(deg - gd) < 60);
  };
  /** Nền móng (thân + viền) của nhà có lấn lên đường nội bộ không: dò từng điểm cách 1 m. */
  const blocksRoad = (kind: BuildingId, x: number, z: number, rot: number): boolean => {
    const [hw, hd] = w.blockHalf(kind, rot);
    const m = w.marginOf(kind);
    for (let dx = -hw - m; dx <= hw + m + 1e-6; dx += 1)
      for (let dz = -hd - m; dz <= hd + m + 1e-6; dz += 1) if (onRoad(x + dx, z + dz)) return true;
    return false;
  };
  /** Góc xa nhất của nền móng tính từ góc bản đồ (m). */
  const outerReach = (kind: BuildingId, x: number, z: number, rot: number): number => {
    const [hw, hd] = w.blockHalf(kind, rot);
    const m = w.marginOf(kind);
    return Math.hypot(x + hw + m - CX, CZ - (z - hd - m));
  };
  /** Dải sát tường chỉ dành cho tường, tháp, phòng không, Cột Điện; nhà khác phải lùi vào trong. */
  const reachLimit = (kind: BuildingId): number => (BUILDINGS[kind].fort || kind === "aa-ciws" || kind === "aa-sam" || kind === "power-pylon" ? WALL_R - 3 : WALL_R - 26);
  const placeNear = (kind: BuildingId, x: number, z: number, rot: number, zoneFree = false): Building | null => {
    for (let r = 0; r <= 8; r++)
      for (let i = -r; i <= r; i++)
        for (const [ox, oz] of [[i, -r], [i, r], [-r, i], [r, i]] as const) {
          const [sx, sz] = w.snapBuilding(kind, x + ox * CELL, z + oz * CELL, rot);
          if (!insideEdges(kind, sx, sz, rot)) continue;
          if (kind !== "wall" && blocksRoad(kind, sx, sz, rot)) continue;
          if (kind !== "wall" && outerReach(kind, sx, sz, rot) > reachLimit(kind)) continue;
          const err = zoneFree ? w.sandboxPlaceError(kind, sx, sz, rot) : w.canPlace(0, kind, sx, sz, rot);
          if (err !== null) continue;
          const n = w.buildings.length;
          spawn(kind, sx, sz, rot);
          return w.buildings.length > n ? w.buildings[w.buildings.length - 1] : null;
        }
    // không còn chỗ quanh vị trí dự kiến: dò toàn khu trong tường, lấy chỗ hợp lệ gần vị trí dự kiến nhất
    const cands: [number, number, number][] = [];
    for (let cx = CX + 2; cx < CX + WALL_R; cx += CELL)
      for (let cz = CZ - 2; cz > CZ - WALL_R; cz -= CELL) {
        const [sx, sz] = w.snapBuilding(kind, cx, cz, rot);
        if (!insideEdges(kind, sx, sz, rot) || outerReach(kind, sx, sz, rot) > reachLimit(kind)) continue;
        cands.push([sx, sz, (sx - x) ** 2 + (sz - z) ** 2]);
      }
    cands.sort((a, b) => a[2] - b[2]);
    const tally = new Map<string, number>();
    for (const [sx, sz] of cands) {
      if (kind !== "wall" && blocksRoad(kind, sx, sz, rot)) {
        tally.set("đường", (tally.get("đường") ?? 0) + 1);
        continue;
      }
      const why = zoneFree ? w.sandboxPlaceError(kind, sx, sz, rot) : w.canPlace(0, kind, sx, sz, rot);
      if (why !== null) {
        tally.set(why, (tally.get(why) ?? 0) + 1);
        continue;
      }
      const n = w.buildings.length;
      spawn(kind, sx, sz, rot);
      return w.buildings.length > n ? w.buildings[w.buildings.length - 1] : null;
    }
    problems.push(`${BUILDINGS[kind].name}: không tìm được chỗ hợp lệ [${cands.length} chỗ; ${[...tally].map(([k, v]) => `${k}: ${v}`).join(", ")}]`);
    return null;
  };
  /** Rải tường dọc cung bán kính r từ góc a0 tới a1 (độ), ô liền 4 hướng, bỏ các khúc trong `skip` (góc, nửa bề rộng m). */
  const wallArc = (r: number, a0: number, a1: number, skip: [number, number][] = []): { placed: number; why: Set<string> } => {
    const cells: [number, number][] = [];
    const seen = new Set<string>();
    const k = (c: [number, number]): string => `${c[0]},${c[1]}`;
    const cellOf = (x: number, z: number): [number, number] => {
      const [sx, sz] = w.snapBuilding("wall", x, z, 0);
      return [Math.max(sx, CX + CELL / 2), Math.min(sz, CZ - CELL / 2)];
    };
    const steps = Math.ceil(Math.abs(a1 - a0) * r * 0.2);
    for (let i = 0; i <= steps; i++) {
      const c = cellOf(...at(r, a0 + ((a1 - a0) * i) / steps));
      if (seen.has(k(c))) continue;
      const last = cells[cells.length - 1];
      if (last && last[0] !== c[0] && last[1] !== c[1]) {
        const a: [number, number] = [c[0], last[1]];
        const b: [number, number] = [last[0], c[1]];
        const d = (p: [number, number]): number => Math.abs(polar(p[0], p[1])[0] - r);
        const mid = d(a) <= d(b) ? a : b;
        if (!seen.has(k(mid))) {
          seen.add(k(mid));
          cells.push(mid);
        }
      }
      seen.add(k(c));
      cells.push(c);
    }
    let placed = 0;
    const why = new Set<string>();
    for (const [x, z] of cells) {
      const deg = polar(x, z)[1];
      if (skip.some(([g, half]) => Math.abs(((deg - g) * Math.PI) / 180) * r < half)) continue;
      const e = w.canPlace(0, "wall", x, z, 0);
      if (e !== null) {
        why.add(e);
        continue;
      }
      spawn("wall", x, z, 0);
      placed++;
    }
    return { placed, why };
  };

  // 1) lõi: Tổng Hành Dinh sâu trong góc, cửa quay ra giữa góc quạt
  const [hx, hz] = at(24, 45);
  const hq = placeNear("hq", hx, hz, 1, true);
  for (const [kind, r, deg, rot] of CORE) placeNear(kind, ...at(r, deg), rot);
  // 2) tháp: túi hỏa lực ở mỗi cửa ngõ (2 bên khe + 1 sau tường chắn), rồi tháp phủ phần tường còn lại
  const towerAt = (deg: number, r = WALL_R - TOWER_IN): void => {
    placeNear("turret", ...at(r, deg), 0);
  };
  const flank = (((GAP_CELLS * CELL) / 2 + 7) / (WALL_R - TOWER_IN)) * (180 / Math.PI);
  for (const g of GATES) {
    towerAt(g - flank);
    towerAt(g + flank);
    towerAt(g, BAFFLE_R - 8);
  }
  for (const deg of [7, 45, 83]) towerAt(deg);
  // 3) phòng không: CIWS sau hai cửa ngõ, Patriot phủ Sân Đáp và cụm xưởng
  for (const g of GATES) placeNear("aa-ciws", ...at(BAFFLE_R - 10, g + (g < 45 ? 14 : -14)), 0);
  // 4) tường ngoài (chừa 2 khe) và tường chắn sau mỗi khe
  const outer = wallArc(WALL_R, 0, 90, GATES.map((g): [number, number] => [g, (GAP_CELLS * CELL) / 2]));
  let walls = outer.placed;
  const wallWhy = new Set(outer.why);
  for (const g of GATES) {
    const half = (BAFFLE_HALF / BAFFLE_R) * (180 / Math.PI);
    const b = wallArc(BAFFLE_R, g - half, g + half);
    walls += b.placed;
    for (const e of b.why) wallWhy.add(e);
  }
  if (wallWhy.size) problems.push(`có ô tường không đặt được (${[...wallWhy].join(", ")})`);

  const blds = w.buildings.filter((b) => b.side === 0 && b.x > CX - 2 && b.z < CZ + 2 && b.x < CX + WALL_R + 10 && b.z > CZ - WALL_R - 10);
  const towers = blds.filter((b) => (BUILDINGS[b.kind].weapon?.dmgGround ?? 0) > 0);
  const inRange = (x: number, z: number): number =>
    towers.reduce((n, t) => n + ((x - t.x) ** 2 + (z - t.z) ** 2 <= BUILDINGS[t.kind].weapon!.range ** 2 ? 1 : 0), 0);

  // 5) tự kiểm: tháp phủ tường
  const wallB = blds.filter((b) => b.kind === "wall");
  const covered = wallB.filter((b) => inRange(b.x, b.z) > 0).length;
  // đường địch từ ngoài vào Tổng Hành Dinh (vài hướng tới), mét đi dưới hỏa lực
  const routes: { pts: [number, number][]; fire1: number; fire2: number; gate: number | null }[] = [];
  for (const deg of [8, 45, 82]) {
    const [sx, sz] = at(WALL_R + 45, deg);
    const p = hq ? w.grid.findPath(sx, sz, hq.x, hq.z) : null;
    if (!p) {
      routes.push({ pts: [], fire1: 0, fire2: 0, gate: null });
      continue;
    }
    const pts: [number, number][] = [[sx, sz]];
    for (let i = 0; i < p.length; i += 2) pts.push([p[i], p[i + 1]]);
    let fire1 = 0;
    let fire2 = 0;
    let gate: number | null = null;
    for (let i = 1; i < pts.length; i++) {
      const [ax, az] = pts[i - 1];
      const [bx, bz] = pts[i];
      const len = Math.hypot(bx - ax, bz - az);
      for (let s = 0; s < len; s += 1) {
        const x = ax + ((bx - ax) * s) / len;
        const z = az + ((bz - az) * s) / len;
        const n = inRange(x, z);
        if (n >= 1) fire1++;
        if (n >= 2) fire2++;
      }
      const [ra] = polar(ax, az);
      const [rb, db] = polar(bx, bz);
      if (gate === null && ra > WALL_R && rb <= WALL_R) gate = GATES.reduce((best, g) => (Math.abs(g - db) < Math.abs(best - db) ? g : best), GATES[0]);
    }
    routes.push({ pts, fire1, fire2, gate });
  }
  // đường xe từ cửa mỗi xưởng mặt đất ra ngoài
  const exits: { name: string; ok: boolean; pts: [number, number][] }[] = [];
  for (const b of blds) {
    const e = BUILDINGS[b.kind].bay ? w.exitRect(b.kind, b.x, b.z, b.rot) : null;
    if (!e) continue;
    const target = at(WALL_R + 30, polar(b.x, b.z)[1]);
    const p = w.grid.findPath(e[0], e[1], target[0], target[1]);
    const pts: [number, number][] = [[e[0], e[1]]];
    if (p) for (let i = 0; i < p.length; i += 2) pts.push([p[i], p[i + 1]]);
    const last = pts[pts.length - 1];
    exits.push({ name: BUILDINGS[b.kind].name, ok: !!p && polar(last[0], last[1])[0] > WALL_R, pts });
  }
  for (const x of exits) if (!x.ok) problems.push(`xe từ ${x.name} không ra được ngoài tường`);
  for (const r of routes) if (r.gate === null) problems.push("có đường địch vào mà không qua cửa ngõ (tường hở)");

  // 6) đạo quân: máy bay lên bãi đậu, quân mặt đất xếp vào hai bãi tập kết sau hai cửa ngõ
  const extras: Extra[] = [];
  const pads: [number, number][] = [];
  for (const b of blds) if (b.kind === "airfield") for (let i = 0; i < RULES.air.pads; i++) pads.push(w.padPos(b, i));
  const air = ARMY.filter(([id]) => UNITS[id].domain === "air").flatMap(([id, n]) => Array<UnitId>(n).fill(id));
  air.forEach((id, i) => {
    if (pads[i]) extras.push({ id, x: pads[i][0], z: pads[i][1], yaw: Math.PI });
  });
  const ground = ARMY.filter(([id]) => UNITS[id].domain === "ground").flatMap(([id, n]) => Array<UnitId>(n).fill(id));
  const free = (x: number, z: number, rad: number): boolean => {
    if (w.grid.blockedAt(x, z) || onRoad(x, z, rad)) return false;
    for (const b of blds) {
      const [bw, bd] = w.blockHalf(b.kind, b.rot);
      const m = w.marginOf(b.kind) + rad;
      if (Math.abs(x - b.x) < bw + m && Math.abs(z - b.z) < bd + m) return false;
    }
    for (const u of extras) if ((u.x - x) ** 2 + (u.z - z) ** 2 < (rad + UNITS[u.id].radius + 0.6) ** 2) return false;
    return true;
  };
  // ô đứng: gần cửa ngõ trước (bãi tập kết), xa dần ra
  const spots: [number, number, number, number][] = [];
  for (let r = 54; r <= BAFFLE_R - 4; r += 4.6)
    for (let s = 2.5; s < (r * Math.PI) / 2 - 2.5; s += 4.6) {
      const deg = (s / r) * (180 / Math.PI);
      const near = Math.min(...GATES.map((g) => Math.abs(g - deg))) * (Math.PI / 180) * r + (BAFFLE_R - r) * 0.8;
      spots.push([...at(r, deg), deg, near]);
    }
  spots.sort((a, b) => a[3] - b[3]);
  let gi = 0;
  for (const [x, z, deg] of spots) {
    if (gi >= ground.length) break;
    const id = ground[gi];
    if (!free(x, z, UNITS[id].radius)) continue;
    const a = (deg * Math.PI) / 180;
    extras.push({ id, x, z, yaw: Math.atan2(Math.cos(a), -Math.sin(a)) });
    gi++;
  }
  if (gi < ground.length) problems.push(`bãi tập kết thiếu chỗ cho ${ground.length - gi} quân mặt đất`);
  if (air.length > pads.length) problems.push(`thiếu ${air.length - pads.length} bãi đậu máy bay`);

  // 7) vẽ
  const LS = 6;
  const OUT = 46;
  const X0 = CX - 10;
  const Z0 = CZ - WALL_R - OUT;
  const X1 = CX + WALL_R + OUT;
  const Z1 = CZ + 10;
  const { cv, g, px, pz } = renderSite(w, blds, X0, Z0, X1, Z1, LS, extras);
  // mép bản đồ
  g.fillStyle = "#3b3a36";
  g.fillRect(0, 0, px(CX), cv.height);
  g.fillRect(0, pz(CZ), cv.width, cv.height - pz(CZ));
  g.fillStyle = "#f4f1e8";
  g.font = "700 12px 'Be Vietnam Pro', sans-serif";
  g.save();
  g.translate(px(CX) - 18, pz(CZ - 80));
  g.rotate(-Math.PI / 2);
  g.fillText("MÉP BẢN ĐỒ", 0, 0);
  g.restore();
  g.fillText("MÉP BẢN ĐỒ", px(CX + 70), pz(CZ) + 18);
  // đường nội bộ (trục từ cửa ngõ vào lõi): dải màu đất nhạt
  g.fillStyle = "#c9a96e40";
  for (const gd of GATES) {
    const a = (gd * Math.PI) / 180;
    const [ux, uz] = [Math.cos(a), -Math.sin(a)];
    const [nx, nz] = [-uz, ux];
    const p0 = at(ROAD_FROM, gd);
    const p1 = at(WALL_R + 2, gd);
    g.beginPath();
    g.moveTo(px(p0[0] + nx * ROAD_HALF), pz(p0[1] + nz * ROAD_HALF));
    g.lineTo(px(p1[0] + nx * ROAD_HALF), pz(p1[1] + nz * ROAD_HALF));
    g.lineTo(px(p1[0] - nx * ROAD_HALF), pz(p1[1] - nz * ROAD_HALF));
    g.lineTo(px(p0[0] - nx * ROAD_HALF), pz(p0[1] - nz * ROAD_HALF));
    g.closePath();
    g.fill();
  }
  // tầm bắn tháp: tô mờ vùng hỏa lực
  g.fillStyle = "#c0392b14";
  for (const t of towers) {
    if (t.kind === "hq") continue;
    g.beginPath();
    g.arc(px(t.x), pz(t.z), BUILDINGS[t.kind].weapon!.range * LS, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = "#c0392b66";
  g.lineWidth = 1;
  for (const t of towers) {
    if (t.kind === "hq") continue;
    g.beginPath();
    g.arc(px(t.x), pz(t.z), BUILDINGS[t.kind].weapon!.range * LS, 0, Math.PI * 2);
    g.stroke();
  }
  // tầm Patriot (phòng không) nét đứt tím
  g.strokeStyle = "#8e44ad88";
  g.setLineDash([6, 5]);
  for (const b of blds)
    if (b.kind === "aa-sam") {
      g.beginPath();
      g.arc(px(b.x), pz(b.z), BUILDINGS[b.kind].weapon!.range * LS, 0, Math.PI * 2);
      g.stroke();
    }
  g.setLineDash([]);
  // đường địch (đỏ) và đường xe ra trận (xanh lá)
  const poly = (pts: [number, number][], color: string, width: number, dash: number[] = []): void => {
    if (pts.length < 2) return;
    g.strokeStyle = color;
    g.lineWidth = width;
    g.setLineDash(dash);
    g.beginPath();
    pts.forEach(([x, z], i) => (i ? g.lineTo(px(x), pz(z)) : g.moveTo(px(x), pz(z))));
    g.stroke();
    g.setLineDash([]);
  };
  for (const r of routes) poly(r.pts, "#c0392b", 2.5, [7, 4]);
  for (const x of exits) poly(x.pts, "#1e8449", 2.5);
  const lab = (t: string, x: number, z: number, color = "#2b2b2b"): void => {
    g.font = "700 12px 'Be Vietnam Pro', sans-serif";
    const tw = g.measureText(t).width;
    g.fillStyle = "#fffdf6e6";
    g.fillRect(px(x) - tw / 2 - 4, pz(z) - 10, tw + 8, 17);
    g.fillStyle = color;
    g.fillText(t, px(x) - tw / 2, pz(z) + 3);
  };
  GATES.forEach((gd, i) => lab(`Cửa ngõ ${i + 1}`, ...at(WALL_R + 7, gd), "#7a5c00"));
  GATES.forEach((gd) => lab("Túi hỏa lực", ...at(BAFFLE_R + 10, gd + (gd < 45 ? 9 : -9)), "#c0392b"));
  lab("Bãi tập kết", ...at(80, 45));
  lab("Địch tới", ...at(WALL_R + 36, 45), "#c0392b");
  scaleBar(g, cv.height - 26, LS, 20);

  // tổng kết
  const count = (k: BuildingId): number => blds.filter((b) => b.kind === k).length;
  const power = blds.reduce((s, b) => s + BUILDINGS[b.kind].power, 0);
  const made = blds.reduce((s, b) => s + Math.max(0, BUILDINGS[b.kind].power), 0);
  const iron = blds.reduce((s, b) => s + (BUILDINGS[b.kind].cost?.iron ?? 0), 0);
  const army = ARMY.reduce((s, [, n]) => s + n, 0);
  const names = (Object.keys(BUILDINGS) as BuildingId[]).filter((k) => count(k) > 0 && k !== "wall").map((k) => `${BUILDINGS[k].name} ×${count(k)}`);
  const routeTxt = routes
    .map((r, i) => (r.gate === null ? `hướng ${i + 1}: không vào được` : `hướng ${["phải", "giữa", "trên"][i]} vào qua cửa ngõ ${GATES.indexOf(r.gate) + 1}, đi ${r.fire1} m dưới hỏa lực (${r.fire2} m trong tầm ≥ 2 tháp)`))
    .join(" · ");
  figure(
    host,
    cv,
    `<b>Đạo quân ${army} / ${RULES.unitCap}:</b> ${ARMY.map(([id, n]) => `${UNITS[id].short} ${n}`).join(" · ")} (số tạm).<br>` +
      `<b>Công trình:</b> ${names.join(" · ")} · <b>Tường ${walls} ô</b> (tường ngoài + 2 tường chắn), ${GATES.length} cửa ngõ rộng ${GAP_CELLS} ô.<br>` +
      `<b>Điện:</b> phát ${made} MW, dư ${power} MW · <b>Bãi đậu:</b> ${pads.length} cho ${air.length} máy bay · <b>Giá xây:</b> ${iron.toLocaleString("vi-VN")} Sắt (không tính Tổng Hành Dinh).<br>` +
      `<b>Sim tự kiểm:</b> tháp phủ ${covered}/${wallB.length} ô tường (${Math.round((covered / Math.max(1, wallB.length)) * 100)}%) · đường địch (nét đứt đỏ): ${routeTxt} · ` +
      `đường xe ra trận (xanh lá): ${exits.filter((x) => x.ok).length}/${exits.length} xưởng ra được ngoài tường.<br>` +
      (problems.length ? `<b>Còn vướng:</b> ${problems.join("; ")}.` : "Mọi nhà, tường và quân đều có chỗ, đặt hợp lệ theo luật hiện tại của sim.")
  );
}
