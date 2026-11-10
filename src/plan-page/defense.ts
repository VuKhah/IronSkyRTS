/**
 * Căn cứ phòng thủ mẫu (người dùng 10/11/2026): đạo quân khoảng 80 (giới hạn quân `RULES.unitCap`), chỉ thủ GÓC QUẠT 90°.
 *
 * Căn cứ đặt ở một góc bản đồ (giả định trên bãi trống của bản đồ thử 960 m): hai cạnh sau là mép bản đồ, địch tới từ góc quạt
 * giữa hướng +x (phải) và −z (lên trên bản vẽ). Bố trí theo vòng tính từ góc: lõi (Tổng Hành Dinh, điện) → xưởng và Sân Đáp
 * (cửa xưởng quay ra phía trận) → bãi tập kết → tháp → tường cong kín từ mép này sang mép kia, chừa vài khe làm đường (tường
 * chặn cả hai phe, không có cổng; chỗ không xây tường là đường). Mọi nhà đặt bằng luật thật của sim (`canPlace`: vùng xây, viền,
 * ô cấm xây, cửa ra); vị trí dự kiến phạm luật thì dò dần ra xung quanh. Đạo quân đặt lên bản vẽ để kiểm chỗ đứng.
 * Mọi con số ở đây là số tạm để thử bố cục.
 */
import { BUILDINGS, RULES, UNITS, type BuildingId, type UnitId } from "../sim/content";
import { CELL } from "../sim/maps";
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
/** Bán kính cung tường tính từ góc bản đồ (m) và các khe làm đường (góc, độ; 0 = +x, 90 = −z). */
const WALL_R = 120;
const GAPS = [18, 45, 72];
/** Bề rộng khe (ô). */
const GAP_CELLS = 3;

/** Nhà cần có: [loại, bán kính (m), góc (độ)] tính từ góc bản đồ; đặt theo thứ tự (to trước). */
const PLAN: [BuildingId, number, number][] = [
  // Sân Đáp: một cột dọc mép bản đồ bên trái (phía sau, an toàn nhất), Nhà Máy Máy Bay ngay cạnh
  ["airfield", 32, 82],
  ["airfield", 56, 84],
  ["airfield", 80, 85],
  ["aircraft-factory", 50, 62],
  // xưởng mặt đất: vòng giữa, cửa quay ra phía trận
  ["factory", 64, 14],
  ["factory", 66, 36],
  ["special-factory", 34, 12],
  // điện + lõi quanh Tổng Hành Dinh
  ["power-plant", 76, 52],
  ["power-plant", 10, 62],
  ["power-plant", 44, 34],
  ["power-plant", 80, 64],
  ["battery", 8, 40],
  ["battery", 6, 85],
  ["radar", 40, 48],
  // Cột Điện nối dài vùng xây ra tới tường
  ["power-pylon", 92, 12],
  ["power-pylon", 92, 45],
  ["power-pylon", 92, 78]
];

export function drawDefense(host: HTMLElement): void {
  const w = new World(1, { sandbox: true, map: "big-test" });
  // góc bản đồ giả định (trên đường lưới sim), địch ở phía +x / −z
  const CX = -100;
  const CZ = 100;
  const at = (r: number, deg: number): [number, number] => {
    const a = (deg * Math.PI) / 180;
    return [CX + r * Math.cos(a), CZ - r * Math.sin(a)];
  };
  // không nhà nào được vượt mép bản đồ giả định (x < CX hoặc z > CZ)
  const insideEdges = (kind: BuildingId, x: number, z: number, rot: number): boolean => {
    const [hw, hd] = w.blockHalf(kind, rot);
    const m = w.marginOf(kind);
    return x - hw - m >= CX - 1e-6 && z + hd + m <= CZ + 1e-6;
  };
  const spawn = (kind: BuildingId, x: number, z: number, rot: number): void => {
    w.step([{ side: 0, order: { t: "sbSpawn", kind, side: 0, x, z, rot } } as never]);
  };
  const problems: string[] = [];
  /** Đặt nhà ở chỗ hợp lệ gần (x, z) nhất (dò xoắn ốc theo ô); `zoneFree` = bỏ qua vùng xây (chỉ Tổng Hành Dinh). */
  const placeNear = (kind: BuildingId, x: number, z: number, rot: number, zoneFree = false): boolean => {
    for (let r = 0; r <= 20; r++)
      for (let i = -r; i <= r; i++)
        for (const [ox, oz] of [[i, -r], [i, r], [-r, i], [r, i]] as const) {
          const [sx, sz] = w.snapBuilding(kind, x + ox * CELL, z + oz * CELL, rot);
          if (!insideEdges(kind, sx, sz, rot)) continue;
          const err = zoneFree ? w.sandboxPlaceError(kind, sx, sz, rot) : w.canPlace(0, kind, sx, sz, rot);
          if (err !== null) continue;
          spawn(kind, sx, sz, rot);
          return true;
        }
    problems.push(`${BUILDINGS[kind].name}: không tìm được chỗ hợp lệ`);
    return false;
  };

  // 1) Tổng Hành Dinh trong lõi, cửa quay ra giữa góc quạt
  const [hx, hz] = at(26, 45);
  placeNear("hq", hx, hz, 1, true);
  // 2) các nhà theo kế hoạch: xưởng quay cửa ra phía trận (góc < 45° → +x, còn lại → −z)
  for (const [kind, r, deg] of PLAN) {
    const [x, z] = at(r, deg);
    const rot = deg < 45 ? 1 : 2;
    placeNear(kind, x, z, rot);
  }
  // 3) tháp phòng thủ hai bên mỗi khe, phòng không rải dọc cung, Patriot sau tuyến
  for (const gd of GAPS) {
    const dg = ((GAP_CELLS * CELL) / 2 + 5) / WALL_R * (180 / Math.PI);
    for (const s of [-1, 1]) {
      const [x, z] = at(WALL_R - 9, gd + s * dg);
      placeNear("turret", x, z, 0);
    }
  }
  for (const deg of [31, 58]) {
    const [x, z] = at(WALL_R - 11, deg);
    placeNear("aa-ciws", x, z, 0);
  }
  for (const deg of [8, 82]) {
    const [x, z] = at(WALL_R - 16, deg);
    placeNear("aa-sam", x, z, 0);
  }
  // 4) tường: cung kín bán kính WALL_R từ mép dưới (0°) tới mép trái (90°), ô liền nhau theo 4 hướng (xe không lách khe chéo)
  // ô lọt ra ngoài mép (do làm tròn vào lưới) thì kéo vào sát mép: hai đầu tường phải chạm mép bản đồ, không chừa khe
  const cellOf = (x: number, z: number): [number, number] => {
    const [sx, sz] = w.snapBuilding("wall", x, z, 0);
    return [Math.max(sx, CX + CELL / 2), Math.min(sz, CZ - CELL / 2)];
  };
  const ring: [number, number][] = [];
  const key = (c: [number, number]): string => `${c[0]},${c[1]}`;
  const seen = new Set<string>();
  const push = (c: [number, number]): void => {
    if (seen.has(key(c))) return;
    const last = ring[ring.length - 1];
    if (last && last[0] !== c[0] && last[1] !== c[1]) {
      // nối chéo → thêm một ô góc cho liền 4 hướng (chọn ô gần cung hơn)
      const a: [number, number] = [c[0], last[1]];
      const b: [number, number] = [last[0], c[1]];
      const d = (p: [number, number]): number => Math.abs(Math.hypot(p[0] - CX, p[1] - CZ) - WALL_R);
      const mid = d(a) <= d(b) ? a : b;
      if (!seen.has(key(mid))) {
        seen.add(key(mid));
        ring.push(mid);
      }
    }
    seen.add(key(c));
    ring.push(c);
  };
  for (let i = 0; i <= 2000; i++) push(cellOf(...at(WALL_R, (i / 2000) * 90)));
  const gapDist = (GAP_CELLS * CELL) / 2;
  let walls = 0;
  let wallSkip = 0;
  const wallWhy = new Set<string>();
  for (const [x, z] of ring) {
    const deg = (Math.atan2(CZ - z, x - CX) * 180) / Math.PI;
    if (GAPS.some((gd) => Math.abs(((deg - gd) * Math.PI) / 180) * WALL_R < gapDist)) continue;
    const why = !insideEdges("wall", x, z, 0) ? "vượt mép bản đồ" : w.canPlace(0, "wall", x, z, 0);
    if (why !== null) {
      wallSkip++;
      wallWhy.add(why);
      continue;
    }
    spawn("wall", x, z, 0);
    walls++;
  }
  if (wallSkip) problems.push(`${wallSkip} ô tường không đặt được (${[...wallWhy].join(", ")})`);

  const blds = w.buildings.filter((b) => b.side === 0 && b.x > CX - 2 && b.z < CZ + 2 && b.x < CX + WALL_R + 10 && b.z > CZ - WALL_R - 10);

  // 5) đạo quân: máy bay lên bãi đậu các Sân Đáp, quân mặt đất xếp lên bãi tập kết (giữa vòng xưởng và tuyến tháp)
  const extras: Extra[] = [];
  const pads: [number, number][] = [];
  for (const b of blds) if (b.kind === "airfield") for (let i = 0; i < RULES.air.pads; i++) pads.push(w.padPos(b, i));
  const air = ARMY.filter(([id]) => UNITS[id].domain === "air").flatMap(([id, n]) => Array<UnitId>(n).fill(id));
  air.forEach((id, i) => {
    if (pads[i]) extras.push({ id, x: pads[i][0], z: pads[i][1], yaw: Math.PI });
  });
  const ground = ARMY.filter(([id]) => UNITS[id].domain === "ground").flatMap(([id, n]) => Array<UnitId>(n).fill(id));
  // ô đứng của bãi tập kết: trên các cung bán kính 82..98 m, cách nhau 5 m, ô nào trống (không nhà, không viền nhà) thì đứng được
  const free = (x: number, z: number, r: number): boolean => {
    for (const b of blds) {
      const [bw, bd] = w.blockHalf(b.kind, b.rot);
      const m = w.marginOf(b.kind) + r;
      if (Math.abs(x - b.x) < bw + m && Math.abs(z - b.z) < bd + m) return false;
    }
    return true;
  };
  const yard: [number, number, number][] = [];
  for (let r = 84; r <= 104; r += 5)
    for (let s = 2.5; s < (r * Math.PI) / 2 - 2.5; s += 5) {
      const deg = (s / r) * (180 / Math.PI);
      const [x, z] = at(r, deg);
      yard.push([x, z, deg]);
    }
  let gi = 0;
  for (const [x, z, deg] of yard) {
    if (gi >= ground.length) break;
    const id = ground[gi];
    if (!free(x, z, UNITS[id].radius)) continue;
    // mũi quay ra phía trận (hướng ra xa góc bản đồ)
    const a = (deg * Math.PI) / 180;
    extras.push({ id, x, z, yaw: Math.atan2(Math.cos(a), -Math.sin(a)) });
    gi++;
  }
  const yardShort = ground.length - gi;
  if (yardShort) problems.push(`Bãi tập kết thiếu chỗ cho ${yardShort} quân mặt đất`);
  if (air.length > pads.length) problems.push(`Thiếu ${air.length - pads.length} bãi đậu máy bay`);

  // 6) vẽ
  const LS = 7;
  const X0 = CX - 8;
  const Z0 = CZ - WALL_R - 14;
  const X1 = CX + WALL_R + 14;
  const Z1 = CZ + 8;
  const { cv, g, px, pz } = renderSite(w, blds, X0, Z0, X1, Z1, LS, extras);
  // mép bản đồ giả định: gạch chéo phía sau
  g.fillStyle = "#3b3a36";
  g.fillRect(0, 0, px(CX), cv.height);
  g.fillRect(0, pz(CZ), cv.width, cv.height - pz(CZ));
  g.fillStyle = "#f4f1e8";
  g.font = "700 12px 'Be Vietnam Pro', sans-serif";
  g.save();
  g.translate(px(CX) - 14, pz(CZ - 60));
  g.rotate(-Math.PI / 2);
  g.fillText("MÉP BẢN ĐỒ", 0, 0);
  g.restore();
  g.fillText("MÉP BẢN ĐỒ", px(CX + 50), pz(CZ) + 14);
  // góc quạt địch tới: hai cạnh + mũi tên ở giữa
  g.strokeStyle = "#c0392b";
  g.lineWidth = 2;
  g.setLineDash([8, 6]);
  g.beginPath();
  g.arc(px(CX), pz(CZ), WALL_R * LS, -Math.PI / 2, 0);
  g.stroke();
  g.setLineDash([]);
  for (const gd of GAPS) {
    const [x0, z0] = at(WALL_R - 2, gd);
    const [x1, z1] = at(WALL_R + 11, gd);
    g.strokeStyle = "#7a5c00";
    g.fillStyle = "#7a5c00";
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(px(x0), pz(z0));
    g.lineTo(px(x1), pz(z1));
    g.stroke();
    g.font = "700 12px 'Be Vietnam Pro', sans-serif";
    const t = "Đường";
    const tw = g.measureText(t).width;
    g.fillStyle = "#fffdf6e6";
    g.fillRect(px(x1) - tw / 2 - 3, pz(z1) - 9, tw + 6, 16);
    g.fillStyle = "#7a5c00";
    g.fillText(t, px(x1) - tw / 2, pz(z1) + 4);
  }
  // tầm bắn tháp (mờ)
  g.strokeStyle = "#c0392b55";
  g.lineWidth = 1;
  for (const b of blds) {
    const wpn = BUILDINGS[b.kind].weapon;
    if (!wpn || b.kind === "hq") continue;
    g.beginPath();
    g.arc(px(b.x), pz(b.z), wpn.range * LS, 0, Math.PI * 2);
    g.stroke();
  }
  // nhãn bãi tập kết + hướng địch
  const lab = (t: string, x: number, z: number, color = "#2b2b2b"): void => {
    g.font = "700 13px 'Be Vietnam Pro', sans-serif";
    const tw = g.measureText(t).width;
    g.fillStyle = "#fffdf6e6";
    g.fillRect(px(x) - tw / 2 - 4, pz(z) - 10, tw + 8, 18);
    g.fillStyle = color;
    g.fillText(t, px(x) - tw / 2, pz(z) + 4);
  };
  lab("Bãi tập kết", ...at(82, 45));
  lab("Địch tới từ góc quạt 90° này", ...at(WALL_R + 8, 33), "#c0392b");
  scaleBar(g, cv.height - 22, LS, 20);

  // tổng kết
  const count = (k: BuildingId): number => blds.filter((b) => b.kind === k).length;
  const power = blds.reduce((s, b) => s + BUILDINGS[b.kind].power, 0);
  const made = blds.reduce((s, b) => s + (BUILDINGS[b.kind].power > 0 ? BUILDINGS[b.kind].power : 0), 0);
  const iron = blds.reduce((s, b) => s + (BUILDINGS[b.kind].cost?.iron ?? 0), 0);
  const army = ARMY.reduce((s, [, n]) => s + n, 0);
  const names = (Object.keys(BUILDINGS) as BuildingId[]).filter((k) => count(k) > 0 && k !== "wall").map((k) => `${BUILDINGS[k].name} ×${count(k)}`);
  figure(
    host,
    cv,
    `<b>Đạo quân ${army} / ${RULES.unitCap}:</b> ${ARMY.map(([id, n]) => `${UNITS[id].short} ${n}`).join(" · ")} (số tạm).<br>` +
      `<b>Công trình:</b> ${names.join(" · ")} · <b>Tường ${walls} ô</b>, ${GAPS.length} khe đường rộng ${GAP_CELLS} ô.<br>` +
      `<b>Điện:</b> phát ${made} MW, dư ${power} MW · <b>Bãi đậu:</b> ${pads.length} cho ${air.length} máy bay · <b>Giá xây:</b> ${iron.toLocaleString("vi-VN")} Sắt (không tính Tổng Hành Dinh).<br>` +
      (problems.length ? `<b>Còn vướng:</b> ${problems.join("; ")}.` : "Mọi nhà, tường và quân đều có chỗ, đặt hợp lệ theo luật hiện tại của sim.")
  );
}
