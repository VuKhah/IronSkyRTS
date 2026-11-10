/** Phần dùng chung của Bản Vẽ Mặt Bằng: giấy, lưới, vùng luật, chụp mô hình từ trên xuống, nhãn, khu ráp / giếng phóng. */
import * as THREE from "three";
import { BUILDINGS, doorDir, FACTION_OF, rotHalf, rotOffset, RULES, type BuildingId, type UnitId } from "../sim/content";
import { CELL } from "../sim/maps";
import type { Building } from "../sim/types";
import type { World } from "../sim/world";
import { buildModel, disposeRig } from "../render/models";

export const PAPER = "#f4f1e8";
/** Tên ngắn cho nhà nhỏ 4 × 4 m (tên đầy đủ dài hơn nhà). */
export const SHORT: Partial<Record<BuildingId, string>> = {
  turret: "Tháp",
  "aa-ciws": "CIWS",
  "aa-sam": "Patriot",
  "aa-emp": "Xung ĐT",
  battery: "Pin",
  radar: "Radar",
  "power-pylon": "Cột Điện",
  outpost: "Tiền Đồn",
  "oil-extractor": "Đào Dầu",
  "ammo-depot": "Kho Đạn",
  "power-plant": "Nhà Máy Điện"
};

export const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setClearColor(0x000000, 0);

export function figure(host: HTMLElement, cv: HTMLCanvasElement, caption: string): void {
  const f = document.createElement("figure");
  f.append(cv);
  const c = document.createElement("figcaption");
  c.innerHTML = caption;
  c.style.width = `${cv.width}px`;
  f.append(c);
  host.append(f);
}

export type Rect = readonly [number, number, number, number];
export type ToPx = (lx: number, lz: number) => [number, number];

/**
 * Khu ráp / giếng phóng của xưởng, theo khung mô hình (cửa ở +z): các ô xe đứng (`slots`, đánh số), dải xe chạy ra (`lane`),
 * đường xe đi từ mỗi ô ra mép nền (`paths`), và giếng cất cánh thẳng đứng (`shafts`). Đọc từ `bay` / `doors` / `stall` / `pads`.
 */
export function bayPlan(id: BuildingId): { slots: readonly Rect[]; lane: Rect | null; paths: [number, number][][]; shafts: readonly Rect[]; text: string } | null {
  const spec = BUILDINGS[id];
  const c = (v: number): number => Math.round(v / CELL);
  if (spec.pads && spec.launch) {
    const sizes = spec.pads.map((r) => `${c(r[2] - r[0])} × ${c(r[3] - r[1])}`).join(", ");
    return { slots: [], lane: null, paths: [], shafts: spec.pads, text: `${spec.pads.length} giếng phóng trên sàn nóc (${sizes} ô), máy bay cất cánh thẳng đứng; không có lối ra mặt đất` };
  }
  const bay = spec.bay;
  if (!bay) return null;
  if (spec.pads) {
    // bệ ráp + hầm kiểm chuẩn: phần khu ráp ngoài các bệ; xe lăn ngang sang hầm rồi chạy thẳng ra cạnh cửa
    const px0 = Math.min(...spec.pads.map((r) => r[0]));
    const lane: Rect = [bay[0], bay[1], px0, bay[3]];
    const lx = (bay[0] + px0) / 2;
    const paths = spec.pads.map((r): [number, number][] => [[(r[0] + r[2]) / 2, (r[1] + r[3]) / 2], [lx, (r[1] + r[3]) / 2], [lx, bay[3]]]);
    const p = spec.pads[0];
    return { slots: spec.pads, lane, paths, shafts: [], text: `${spec.pads.length} bệ ráp ${c(p[2] - p[0])} × ${c(p[3] - p[1])} ô + hầm kiểm chuẩn ${c(lane[2] - lane[0])} × ${c(lane[3] - lane[1])} ô (xe lăn sang hầm rồi chạy ra)` };
  }
  const n = spec.doors ?? 1;
  const w = (bay[2] - bay[0]) / n;
  const st = spec.stall ?? bay[3] - bay[1];
  const slots: Rect[] = [];
  const paths: [number, number][][] = [];
  for (let k = 0; k < n; k++) {
    const x0 = bay[0] + k * w;
    slots.push([x0, bay[1], x0 + w, bay[1] + st]);
    paths.push([[x0 + w / 2, bay[1] + st / 2], [x0 + w / 2, bay[3]]]);
  }
  const lane: Rect = [bay[0], bay[1] + st, bay[2], bay[3]];
  return { slots, lane, paths, shafts: [], text: `${n} sân ráp ${c(w)} × ${c(st)} ô + dải đường ${c(lane[3] - lane[1])} × ${c(lane[2] - lane[0])} ô cho xe chạy ra` };
}

/** Vẽ khu ráp / giếng phóng lên bản vẽ; `to` đổi tọa độ khung mô hình ra điểm ảnh, `k` = px / m. */
export function drawBayMarks(g: CanvasRenderingContext2D, id: BuildingId, to: ToPx, k: number): void {
  const plan = bayPlan(id);
  if (!plan) return;
  const box = (r: Rect): [number, number, number, number] => {
    const [ax, az] = to(r[0], r[1]);
    const [bx, bz] = to(r[2], r[3]);
    return [Math.min(ax, bx), Math.min(az, bz), Math.abs(bx - ax), Math.abs(bz - az)];
  };
  const tag = (text: string, x: number, z: number): void => {
    g.font = `700 ${Math.max(10, Math.round(k * 0.55))}px 'Be Vietnam Pro', sans-serif`;
    const tw = g.measureText(text).width;
    g.fillStyle = "#fffdf6e6";
    g.fillRect(x - tw / 2 - 3, z - 8, tw + 6, 16);
    g.fillStyle = "#7a3d00";
    g.fillText(text, x - tw / 2, z + 4);
  };
  if (plan.lane) {
    const [x, z, w, h] = box(plan.lane);
    g.fillStyle = "#f4d35e66";
    g.fillRect(x, z, w, h);
  }
  g.lineWidth = 2;
  g.strokeStyle = "#d35400";
  g.setLineDash([6, 3]);
  for (const r of plan.slots) {
    const [x, z, w, h] = box(r);
    g.strokeRect(x + 1, z + 1, w - 2, h - 2);
  }
  g.setLineDash([]);
  // đường xe đi: từ ô ráp ra mép nền, đầu mũi tên ở cuối
  g.strokeStyle = "#7a5c00";
  g.fillStyle = "#7a5c00";
  g.lineWidth = 3;
  for (const path of plan.paths) {
    const pts = path.map(([x, z]) => to(x, z));
    g.beginPath();
    pts.forEach(([x, z], i) => (i ? g.lineTo(x, z) : g.moveTo(x, z)));
    g.stroke();
    const [ex, ez] = pts[pts.length - 1];
    const [fx, fz] = pts[pts.length - 2];
    const l = Math.hypot(ex - fx, ez - fz) || 1;
    const ux = (ex - fx) / l;
    const uz = (ez - fz) / l;
    g.beginPath();
    g.moveTo(ex, ez);
    g.lineTo(ex - ux * 10 - uz * 7, ez - uz * 10 + ux * 7);
    g.lineTo(ex - ux * 10 + uz * 7, ez - uz * 10 - ux * 7);
    g.closePath();
    g.fill();
  }
  plan.slots.forEach((r, i) => {
    const [x, z] = to((r[0] + r[2]) / 2, (r[1] + r[3]) / 2);
    tag(`${BUILDINGS[id].pads ? "Bệ" : "Sân"} ${i + 1}`, x, z);
  });
  if (plan.lane && BUILDINGS[id].pads) {
    const [x, z] = to((plan.lane[0] + plan.lane[2]) / 2, (plan.lane[1] + plan.lane[3]) / 2);
    tag("Hầm", x, z);
  }
  // giếng phóng: viền tím + ký hiệu cất cánh thẳng đứng (vòng tròn có chấm giữa = mũi tên chỉ lên trời)
  plan.shafts.forEach((r, i) => {
    const [x, z, w, h] = box(r);
    g.strokeStyle = "#8e44ad";
    g.lineWidth = 2;
    g.setLineDash([6, 3]);
    g.strokeRect(x + 1, z + 1, w - 2, h - 2);
    g.setLineDash([]);
    const cx = x + w / 2;
    const cz = z + h / 2;
    const rr = Math.min(w, h) * 0.22;
    g.beginPath();
    g.arc(cx, cz, rr, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = "#8e44ad";
    g.beginPath();
    g.arc(cx, cz, rr * 0.28, 0, Math.PI * 2);
    g.fill();
    tag(k > 16 ? `Giếng ${i + 1} · cất cánh đứng` : `Giếng ${i + 1}`, cx, z + h - 12);
  });
}

/** Mô hình quân đặt thêm lên bản vẽ (so chỗ đứng), quay mũi theo `yaw`. */
export interface Extra {
  id: UnitId;
  x: number;
  z: number;
  yaw: number;
}

/**
 * Vẽ một khu đất: giấy, vùng ô cấm xây / viền / khối ô, lưới 2 m (và 0,4 m nếu đủ to), mọi mô hình chụp trực giao một lần
 * (tường tự nối với ô tường bên cạnh), rồi viền khối ô, thân nhà, khu ráp / giếng phóng, mũi tên cửa ra, tên nhà.
 */
export function renderSite(
  w: World,
  blds: readonly Building[],
  X0: number,
  Z0: number,
  X1: number,
  Z1: number,
  LS: number,
  extras: readonly Extra[] = []
): { cv: HTMLCanvasElement; g: CanvasRenderingContext2D; px: (x: number) => number; pz: (z: number) => number } {
  const cv = document.createElement("canvas");
  cv.width = Math.round((X1 - X0) * LS);
  cv.height = Math.round((Z1 - Z0) * LS);
  const g = cv.getContext("2d")!;
  const px = (x: number): number => (x - X0) * LS;
  const pz = (z: number): number => (z - Z0) * LS;
  g.fillStyle = PAPER;
  g.fillRect(0, 0, cv.width, cv.height);
  const rect = (x0: number, z0: number, x1: number, z1: number, fill: string): void => {
    g.fillStyle = fill;
    g.fillRect(px(x0), pz(z0), (x1 - x0) * LS, (z1 - z0) * LS);
  };
  const pad = RULES.buildPadCells * CELL;
  for (const b of blds) {
    if (BUILDINGS[b.kind].tile) continue; // tường không có ô cấm xây
    const m = w.marginOf(b.kind);
    const [bw, bd] = w.blockHalf(b.kind, b.rot);
    rect(b.x - bw - m - pad, b.z - bd - m - pad, b.x + bw + m + pad, b.z + bd + m + pad, "#f6d0cb");
  }
  for (const b of blds) {
    const m = w.marginOf(b.kind);
    const [bw, bd] = w.blockHalf(b.kind, b.rot);
    rect(b.x - bw - m, b.z - bd - m, b.x + bw + m, b.z + bd + m, "#cfe5bf");
  }
  for (const b of blds) {
    const [bw, bd] = w.blockHalf(b.kind, b.rot);
    rect(b.x - bw, b.z - bd, b.x + bw, b.z + bd, "#9cc3e6");
    const e = bayPlan(b.kind) ? null : w.exitRect(b.kind, b.x, b.z, b.rot);
    if (e) rect(e[0] - e[2], e[1] - e[3], e[0] + e[2], e[1] + e[3], "#f4d35e");
  }
  const lines = (step: number, style: string): void => {
    g.strokeStyle = style;
    g.lineWidth = 1;
    g.beginPath();
    for (let x = Math.ceil((X0 + w.map.halfW) / step) * step - w.map.halfW; x <= X1; x += step) {
      g.moveTo(Math.round(px(x)) + 0.5, 0);
      g.lineTo(Math.round(px(x)) + 0.5, cv.height);
    }
    for (let z = Math.ceil((Z0 + w.map.halfH) / step) * step - w.map.halfH; z <= Z1; z += step) {
      g.moveTo(0, Math.round(pz(z)) + 0.5);
      g.lineTo(cv.width, Math.round(pz(z)) + 0.5);
    }
    g.stroke();
  };
  if (LS >= 12) lines(0.4, "#e8e2d2");
  lines(CELL, "#d3cab4");

  // mô hình: nhà (tường nối hình theo ô tường cùng phe bên cạnh) + quân đặt thêm
  const sc = new THREE.Scene();
  sc.add(new THREE.HemisphereLight(0xffffff, 0x8a8478, 1.7));
  const lt = new THREE.DirectionalLight(0xffffff, 1.4);
  lt.position.set(4, 10, 6);
  sc.add(lt);
  const tiles = new Set(blds.filter((b) => BUILDINGS[b.kind].tile).map((b) => `${b.side}:${b.kind}:${b.x},${b.z}`));
  const rigs: ReturnType<typeof buildModel>[] = [];
  for (const b of blds) {
    const rig = buildModel(b.kind, FACTION_OF[b.side], false);
    if (BUILDINGS[b.kind].tile && rig.setLinks) {
      let mask = 0;
      const has = (dx: number, dz: number): boolean => tiles.has(`${b.side}:${b.kind}:${b.x + dx},${b.z + dz}`);
      if (has(CELL, 0)) mask |= 1;
      if (has(-CELL, 0)) mask |= 2;
      if (has(0, CELL)) mask |= 4;
      if (has(0, -CELL)) mask |= 8;
      rig.setLinks(mask);
    }
    rig.root.position.set(b.x, w.map.groundY(b.x, b.z) + 0.06, b.z);
    rig.root.rotation.y = (b.rot * Math.PI) / 2;
    sc.add(rig.root);
    rigs.push(rig);
  }
  for (const u of extras) {
    const rig = buildModel(u.id, FACTION_OF[0], false);
    rig.root.position.set(u.x, w.map.groundY(u.x, u.z) + 0.06, u.z);
    rig.root.rotation.y = u.yaw;
    sc.add(rig.root);
    rigs.push(rig);
  }
  const cx = (X0 + X1) / 2;
  const cz = (Z0 + Z1) / 2;
  const cam = new THREE.OrthographicCamera(X0 - cx, X1 - cx, cz - Z0, cz - Z1, 0.1, 400);
  cam.up.set(0, 0, -1);
  cam.position.set(cx, 200, cz);
  cam.lookAt(cx, 0, cz);
  renderer.setSize(cv.width, cv.height, false);
  renderer.render(sc, cam);
  g.drawImage(renderer.domElement, 0, 0);
  for (const r of rigs) disposeRig(r);

  for (const b of blds) {
    if (BUILDINGS[b.kind].tile) continue; // tường: không viền, không nhãn (đỡ rối)
    const [bw, bd] = w.blockHalf(b.kind, b.rot);
    const [hw, hd] = rotHalf(b.kind, b.rot);
    g.strokeStyle = "#2f6fb8";
    g.lineWidth = 2;
    g.strokeRect(px(b.x - bw), pz(b.z - bd), bw * 2 * LS, bd * 2 * LS);
    g.strokeStyle = "#c0392b";
    g.setLineDash([5, 4]);
    g.strokeRect(px(b.x - hw), pz(b.z - hd), hw * 2 * LS, hd * 2 * LS);
    g.setLineDash([]);
    drawBayMarks(g, b.kind, (lx, lz) => {
      const [ox2, oz2] = rotOffset(lx, lz, b.rot);
      return [px(b.x + ox2), pz(b.z + oz2)];
    }, LS);
    const e = bayPlan(b.kind) ? null : w.exitRect(b.kind, b.x, b.z, b.rot);
    if (e) {
      const [dx, dz] = doorDir(b.rot);
      const bx = px(e[0] + dx * e[2]);
      const bz = pz(e[1] + dz * e[3]);
      g.strokeStyle = "#7a5c00";
      g.fillStyle = "#7a5c00";
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(px(e[0] - dx * e[2]), pz(e[1] - dz * e[3]));
      g.lineTo(bx, bz);
      g.stroke();
      g.beginPath();
      g.arc(bx, bz, 4, 0, Math.PI * 2);
      g.fill();
    }
    g.font = "600 12px 'Be Vietnam Pro', sans-serif";
    const label = SHORT[b.kind as BuildingId] ?? BUILDINGS[b.kind].name;
    const tw = g.measureText(label).width;
    const m = w.marginOf(b.kind);
    g.fillStyle = "#fffdf6e6";
    g.fillRect(px(b.x) - tw / 2 - 3, pz(b.z + bd + m) - 15, tw + 6, 14);
    g.fillStyle = "#2b2b2b";
    g.fillText(label, px(b.x) - tw / 2, pz(b.z + bd + m) - 4);
  }
  return { cv, g, px, pz };
}

/** Thước tỉ lệ ở góc dưới trái. */
export function scaleBar(g: CanvasRenderingContext2D, h: number, LS: number, m = 10): void {
  g.fillStyle = "#2b2b2b";
  g.fillRect(10, h - 14, m * LS, 3);
  g.font = "11px 'Be Vietnam Pro', sans-serif";
  g.fillText(`${m} m (${m / CELL} ô)`, 10, h - 18);
}
