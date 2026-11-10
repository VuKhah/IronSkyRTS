/**
 * Bản Vẽ Mặt Bằng (plan.html; người dùng 10/11/2026: "vẽ bản vẽ mặt bằng của tất cả quân và mô hình lên giấy 2D, kèm lưới
 * đất mà nó sẽ chiếm"). Mỗi mô hình chụp thẳng từ trên xuống bằng camera trực giao, cùng một tỉ lệ, rồi vẽ đè lưới và các
 * vùng luật bằng canvas 2D. Mọi số đọc từ content.ts / World nên bản vẽ luôn khớp với sim.
 */
import * as THREE from "three";
import { BUILDINGS, doorDir, FACTION_OF, rotHalf, rotOffset, RULES, UNITS, type BuildingId, type UnitId } from "../sim/content";
import { Paving } from "../game/paving";
import { CELL } from "../sim/maps";
import { World } from "../sim/world";
import { buildModel, disposeRig } from "../render/models";

/** Tỉ lệ bản vẽ: điểm ảnh trên một mét (chung cho mọi hình để so được to nhỏ). */
const S = 22;
const FINE = 0.4;
const PAPER = "#f4f1e8";
/** Tên ngắn cho nhà nhỏ 4 × 4 m trên mặt bằng chung (tên đầy đủ dài hơn nhà, đè lên nhau). */
const SHORT: Partial<Record<BuildingId, string>> = {
  turret: "Tháp",
  "aa-ciws": "CIWS",
  "aa-sam": "Patriot",
  "aa-emp": "Xung ĐT",
  battery: "Pin",
  radar: "Radar",
  "power-pylon": "Cột Điện"
};

const fmt = (v: number): string => (Math.round(v * 100) / 100).toLocaleString("vi-VN");

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setClearColor(0x000000, 0);
const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8478, 1.7));
const sun = new THREE.DirectionalLight(0xffffff, 1.4);
sun.position.set(4, 10, 6);
scene.add(sun);
const world = new World(1, { sandbox: true });

interface Tile {
  /** Nửa bề rộng / nửa bề sâu khung hình (m). */
  ex: number;
  ez: number;
  /** Lệch lưới: tâm hình nằm trên đường lưới (0) hay giữa ô (CELL/2), theo từng trục. */
  gx: number;
  gz: number;
}

/** Chụp mô hình từ trên xuống, +x sang phải, +z xuống dưới. */
function snapshot(id: BuildingId | UnitId, t: Tile): HTMLCanvasElement {
  const rig = buildModel(id, FACTION_OF[0], false);
  scene.add(rig.root);
  const cam = new THREE.OrthographicCamera(-t.ex, t.ex, t.ez, -t.ez, 0.1, 200);
  cam.up.set(0, 0, -1);
  cam.position.set(0, 100, 0);
  cam.lookAt(0, 0, 0);
  renderer.setSize(Math.round(t.ex * 2 * S), Math.round(t.ez * 2 * S), false);
  renderer.render(scene, cam);
  const out = document.createElement("canvas");
  out.width = renderer.domElement.width;
  out.height = renderer.domElement.height;
  out.getContext("2d")!.drawImage(renderer.domElement, 0, 0);
  scene.remove(rig.root);
  disposeRig(rig);
  return out;
}

/** Khung giấy có lưới; trả về ngữ cảnh vẽ và hàm đổi mét → điểm ảnh. */
function paper(t: Tile): { cv: HTMLCanvasElement; g: CanvasRenderingContext2D; px: (x: number) => number; pz: (z: number) => number } {
  const cv = document.createElement("canvas");
  cv.width = Math.round(t.ex * 2 * S);
  cv.height = Math.round(t.ez * 2 * S);
  const g = cv.getContext("2d")!;
  g.fillStyle = PAPER;
  g.fillRect(0, 0, cv.width, cv.height);
  return { cv, g, px: (x) => (x + t.ex) * S, pz: (z) => (z + t.ez) * S };
}

function grid(g: CanvasRenderingContext2D, t: Tile, px: (x: number) => number, pz: (z: number) => number): void {
  const lines = (step: number, off: number, style: string, w: number): void => {
    g.strokeStyle = style;
    g.lineWidth = w;
    g.beginPath();
    for (let x = off - Math.ceil((t.ex + off) / step) * step; x <= t.ex; x += step) {
      g.moveTo(px(x) + 0.5, 0);
      g.lineTo(px(x) + 0.5, pz(t.ez));
    }
    g.stroke();
  };
  const linesZ = (step: number, off: number, style: string, w: number): void => {
    g.strokeStyle = style;
    g.lineWidth = w;
    g.beginPath();
    for (let z = off - Math.ceil((t.ez + off) / step) * step; z <= t.ez; z += step) {
      g.moveTo(0, pz(z) + 0.5);
      g.lineTo(px(t.ex), pz(z) + 0.5);
    }
    g.stroke();
  };
  lines(FINE, t.gx, "#e4ddcb", 1);
  linesZ(FINE, t.gz, "#e4ddcb", 1);
  lines(CELL, t.gx, "#b9b09a", 1);
  linesZ(CELL, t.gz, "#b9b09a", 1);
}

function cells(g: CanvasRenderingContext2D, px: (x: number) => number, pz: (z: number) => number, x0: number, z0: number, x1: number, z1: number, fill: string): void {
  g.fillStyle = fill;
  g.fillRect(px(x0), pz(z0), (x1 - x0) * S, (z1 - z0) * S);
}

function scaleBar(g: CanvasRenderingContext2D, h: number): void {
  g.fillStyle = "#2b2b2b";
  g.fillRect(8, h - 12, 2 * S, 3);
  g.font = "11px 'Be Vietnam Pro', sans-serif";
  g.fillText("2 m", 8, h - 16);
}

function figure(host: HTMLElement, cv: HTMLCanvasElement, caption: string): void {
  const f = document.createElement("figure");
  f.append(cv);
  const c = document.createElement("figcaption");
  c.innerHTML = caption;
  c.style.width = `${cv.width}px`;
  f.append(c);
  host.append(f);
}

type Rect = readonly [number, number, number, number];
type ToPx = (lx: number, lz: number) => [number, number];

/**
 * Khu ráp / giếng phóng của xưởng, theo khung mô hình (cửa ở +z): các ô xe đứng (`slots`, đánh số), dải xe chạy ra (`lane`),
 * đường xe đi từ mỗi ô ra mép nền (`paths`), và giếng cất cánh thẳng đứng (`shafts`). Đọc từ `bay` / `doors` / `stall` / `pads`.
 */
function bayPlan(id: BuildingId): { slots: readonly Rect[]; lane: Rect | null; paths: [number, number][][]; shafts: readonly Rect[]; text: string } | null {
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
function drawBayMarks(g: CanvasRenderingContext2D, id: BuildingId, to: ToPx, k: number): void {
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

function drawBuilding(id: BuildingId): void {
  const spec = BUILDINGS[id];
  const [hw, hd] = spec.half;
  const [nx, nz] = world.blockCells(id, 0);
  const [bw, bd] = world.blockHalf(id, 0);
  const m = world.marginOf(id);
  const pad = RULES.buildPadCells * CELL;
  const exit = world.exitRect(id, 0, 0, 0);
  const t: Tile = { ex: bw + m + pad + 1, ez: bd + m + pad + 1, gx: nx % 2 ? CELL / 2 : 0, gz: nz % 2 ? CELL / 2 : 0 };
  const { cv, g, px, pz } = paper(t);
  cells(g, px, pz, -bw - m - pad, -bd - m - pad, bw + m + pad, bd + m + pad, "#f6d0cb");
  cells(g, px, pz, -bw - m, -bd - m, bw + m, bd + m, "#cfe5bf");
  cells(g, px, pz, -bw, -bd, bw, bd, "#9cc3e6");
  if (exit) cells(g, px, pz, exit[0] - exit[2], exit[1] - exit[3], exit[0] + exit[2], exit[1] + exit[3], "#f4d35e");
  grid(g, t, px, pz);
  g.drawImage(snapshot(id, t), 0, 0);
  // khối ô (xanh đậm) và nền móng thật (đỏ nét đứt)
  g.strokeStyle = "#2f6fb8";
  g.lineWidth = 2;
  g.strokeRect(px(-bw), pz(-bd), bw * 2 * S, bd * 2 * S);
  g.strokeStyle = "#c0392b";
  g.setLineDash([6, 4]);
  g.strokeRect(px(-hw), pz(-hd), hw * 2 * S, hd * 2 * S);
  g.setLineDash([]);
  drawBayMarks(g, id, (x, z) => [px(x), pz(z)], S);
  if (exit && !bayPlan(id)) {
    // mũi tên hướng xe ra (Tổng Hành Dinh: ô cửa ra ngoài thân)
    const x = px(exit[0]);
    const z0 = pz(exit[1] - exit[3]) + 4;
    const z1 = pz(exit[1] + exit[3]) - 3;
    g.strokeStyle = "#7a5c00";
    g.fillStyle = "#7a5c00";
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(x, z0);
    g.lineTo(x, z1 - 8);
    g.stroke();
    g.beginPath();
    g.moveTo(x - 8, z1 - 9);
    g.lineTo(x + 8, z1 - 9);
    g.lineTo(x, z1);
    g.closePath();
    g.fill();
  }
  scaleBar(g, cv.height);
  const parts = [
    `<b>${spec.name}</b> <code>${id}</code>`,
    `Thân ${fmt(hw * 2)} × ${fmt(hd * 2)} m → <b>${nx} × ${nz} ô</b> · viền ${Math.round(m / CELL)} ô → nền móng <b>${nx + 2 * Math.round(m / CELL)} × ${nz + 2 * Math.round(m / CELL)} ô</b> · + ${RULES.buildPadCells} ô cấm xây`
  ];
  const bp = bayPlan(id);
  if (bp) parts.push(bp.text);
  else if (exit) parts.push("Có cửa ra 4 × 2 m (xe chạy ra)");
  if (spec.fort) parts.push("Công sự");
  figure(document.getElementById("buildings")!, cv, parts.join("<br>"));
}

function drawUnit(id: UnitId): void {
  const spec = UNITS[id];
  const r = spec.radius;
  // khung theo kích thước mô hình thật
  const rig = buildModel(id, FACTION_OF[0], false);
  // chỉ đo bộ phận đang hiện (bộ phận ẩn theo trạng thái như hiệu ứng, đạn dưới cánh làm hộp bao phình ra)
  rig.root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  rig.root.traverseVisible((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.computeBoundingBox();
      box.union(o.geometry.boundingBox!.clone().applyMatrix4(o.matrixWorld));
    }
  });
  disposeRig(rig);
  const ext = Math.max(Math.abs(box.min.x), Math.abs(box.max.x), Math.abs(box.min.z), Math.abs(box.max.z), r);
  const half = Math.ceil((ext + 1.5) / CELL) * CELL + CELL / 2; // tâm xe đứng giữa một ô
  const t: Tile = { ex: half, ez: half, gx: CELL / 2, gz: CELL / 2 };
  const { cv, g, px, pz } = paper(t);
  const ground = spec.domain === "ground";
  // ô lưới bị vòng va chạm đè lên khi xe đứng giữa ô
  let touched = 0;
  if (ground)
    for (let x = -half + CELL / 2; x < half; x += CELL)
      for (let z = -half + CELL / 2; z < half; z += CELL) {
        const cx = x - CELL / 2;
        const cz = z - CELL / 2;
        const nx = Math.max(cx, Math.min(0, cx + CELL));
        const nz = Math.max(cz, Math.min(0, cz + CELL));
        if (nx * nx + nz * nz < r * r - 1e-9) {
          touched++;
          cells(g, px, pz, cx, cz, cx + CELL, cz + CELL, "#f3c9c4");
        }
      }
  grid(g, t, px, pz);
  g.drawImage(snapshot(id, t), 0, 0);
  g.strokeStyle = "#c0392b";
  g.lineWidth = 2;
  g.setLineDash(ground ? [] : [5, 4]);
  g.beginPath();
  g.arc(px(0), pz(0), r * S, 0, Math.PI * 2);
  g.stroke();
  g.setLineDash([]);
  scaleBar(g, cv.height);
  const w = box.max.x - box.min.x;
  const l = box.max.z - box.min.z;
  const parts = [
    `<b>${spec.name}</b> <code>${id}</code> · lô ${spec.batch}`,
    `Thân ${fmt(w)} × ${fmt(l)} m · vòng va chạm r = ${fmt(r)} m (Ø ${fmt(r * 2)} m)`,
    ground ? `Đứng giữa ô thì đè lên <b>${touched} ô</b>; quân không chặn ô lưới, chỉ đẩy nhau theo vòng tròn` : "Máy bay: không chiếm ô đất (vòng nét đứt chỉ để so cỡ)"
  ];
  figure(document.getElementById("units")!, cv, parts.join("<br>"));
}

/**
 * Mặt bằng chung: một căn cứ mẫu phe Lam đặt bằng luật thật của sim (World Phòng Thử Nghiệm), đường do `Paving` sinh ra,
 * cả cảnh chụp trực giao một lần rồi vẽ đè lưới và vùng luật. Tọa độ (dx, dz) tính từ tâm Tổng Hành Dinh; phe Lam ở nửa +z
 * nên phía trận (giữa bản đồ) là −z, nằm ở trên bản vẽ.
 */
function drawLayout(): void {
  const LS = 13; // px / m cho bản vẽ chung
  // bãi đất trống rộng trên bản đồ thử 960 m (Tổng Hành Dinh thật của các bản đồ chính nằm sát góc, căn cứ mẫu tràn ra ngoài)
  const w = new World(1, { sandbox: true, map: "big-test" });
  w.step([{ side: 0, order: { t: "sbSpawn", kind: "hq", side: 0, x: -60, z: 60 } } as never]);
  const hq = w.buildings.find((b) => b.kind === "hq" && b.x === -60 && b.z === 60)!;
  // [loại, dx, dz, nấc xoay?]: chưa có nấc thì dùng mặc định (cửa về phía trận)
  const plan: [BuildingId, number, number, number?][] = [
    ["factory", -12, -16],
    ["special-factory", 12, -16],
    ["aircraft-factory", 26, -16],
    ["airfield", 0, 18],
    ["power-plant", -14, 0],
    ["power-plant", -20, 0],
    ["battery", -14, 8],
    ["battery", -18, 8],
    ["radar", 14, 2],
    ["oil-extractor", 20, 4],
    ["ammo-depot", 14, 12],
    ["power-pylon", -26, 12],
    ["turret", -10, -30],
    ["aa-ciws", -6, -30],
    ["aa-sam", 6, -30],
    ["aa-emp", 10, -30],
    ["outpost", 20, -30]
  ];
  const errors: string[] = [];
  for (const [kind, dx, dz, rot] of plan) {
    const x = hq.x + dx;
    const z = hq.z + dz;
    // tìm chỗ hợp lệ gần chỗ dự kiến nhất (xoắn ốc theo ô lưới): bố trí mẫu tự giãn theo luật khoảng cách hiện tại
    let spot: [number, number] | null = null;
    let err = w.sandboxPlaceError(kind, x, z, rot);
    for (let r = 0; r <= 12 && !spot; r++)
      for (let i = -r; i <= r && !spot; i++)
        for (const [ox, oz] of [[i, -r], [i, r], [-r, i], [r, i]] as const) {
          if (spot) break;
          const e = w.sandboxPlaceError(kind, x + ox * CELL, z + oz * CELL, rot);
          if (e === null) spot = [x + ox * CELL, z + oz * CELL];
          else if (r === 0) err = e;
        }
    if (!spot) errors.push(`${BUILDINGS[kind].name} (${dx}, ${dz}): ${err}`);
    else w.step([{ side: 0, order: { t: "sbSpawn", kind, side: 0, x: spot[0], z: spot[1], rot } } as never]);
  }
  // chỉ lấy nhà của căn cứ mẫu (bỏ Tổng Hành Dinh có sẵn của bản đồ ở xa)
  const blds = w.buildings.filter((b) => b.side === 0 && Math.abs(b.x - hq.x) < 80 && Math.abs(b.z - hq.z) < 80);
  // vùng vẽ (m, tính từ tâm Tổng Hành Dinh)
  const X0 = -32;
  const X1 = 54;
  const Z0 = -38;
  const Z1 = 46;
  const UNIT_Z = 37; // hàng binh chủng so cỡ
  const cv = document.createElement("canvas");
  cv.width = (X1 - X0) * LS;
  cv.height = (Z1 - Z0) * LS;
  const g = cv.getContext("2d")!;
  const px = (x: number): number => (x - hq.x - X0) * LS;
  const pz = (z: number): number => (z - hq.z - Z0) * LS;
  g.fillStyle = PAPER;
  g.fillRect(0, 0, cv.width, cv.height);
  const rect = (x0: number, z0: number, x1: number, z1: number, fill: string): void => {
    g.fillStyle = fill;
    g.fillRect(px(x0), pz(z0), (x1 - x0) * LS, (z1 - z0) * LS);
  };
  for (const b of blds) {
    const m = w.marginOf(b.kind);
    const pad = RULES.buildPadCells * CELL;
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
    const e = w.exitRect(b.kind, b.x, b.z, b.rot);
    if (e) rect(e[0] - e[2], e[1] - e[3], e[0] + e[2], e[1] + e[3], "#f4d35e");
  }
  // lưới đất 2 m chung (đúng lưới của sim: đường kẻ ở −halfW + k·2)
  g.strokeStyle = "#cfc6b0";
  g.lineWidth = 1;
  g.beginPath();
  for (let x = Math.ceil((hq.x + X0 + w.map.halfW) / CELL) * CELL - w.map.halfW; x <= hq.x + X1; x += CELL) {
    g.moveTo(Math.round(px(x)) + 0.5, 0);
    g.lineTo(Math.round(px(x)) + 0.5, cv.height);
  }
  for (let z = Math.ceil((hq.z + Z0 + w.map.halfH) / CELL) * CELL - w.map.halfH; z <= hq.z + Z1; z += CELL) {
    g.moveTo(0, Math.round(pz(z)) + 0.5);
    g.lineTo(cv.width, Math.round(pz(z)) + 0.5);
  }
  g.stroke();

  // cảnh 3D: đường nhựa của game + mọi mô hình ở đúng chỗ, chụp trực giao từ trên xuống
  const sc = new THREE.Scene();
  sc.add(new THREE.HemisphereLight(0xffffff, 0x8a8478, 1.7));
  const lt = new THREE.DirectionalLight(0xffffff, 1.4);
  lt.position.set(4, 10, 6);
  sc.add(lt);
  new Paving(sc, w.map).sync(w, blds);
  const rigs: ReturnType<typeof buildModel>[] = [];
  const put = (id: BuildingId | UnitId, x: number, z: number, yaw: number): void => {
    const rig = buildModel(id, FACTION_OF[0], false);
    rig.root.position.set(x, w.map.groundY(x, z) + 0.06, z);
    rig.root.rotation.y = yaw;
    sc.add(rig.root);
    rigs.push(rig);
  };
  for (const b of blds) put(b.kind, b.x, b.z, (b.rot * Math.PI) / 2);
  // binh chủng xếp một hàng ngang ở đáy bản vẽ để so cỡ (mũi quay về phía trận, −z), tránh đường nhựa đi về phía trận;
  // Xe Vận Tải đỗ ở ô dỡ hàng bên trái Tổng Hành Dinh
  const names: [string, number, number][] = [];
  let ux = X0 + 3;
  for (const id of Object.keys(UNITS) as UnitId[]) {
    const wid = Math.max(UNITS[id].radius * 2, id === "valkyrie" ? 7.4 : 0, id === "falcon" ? 5.2 : 0);
    put(id, hq.x + ux + wid / 2, hq.z + UNIT_Z, Math.PI);
    names.push([UNITS[id].short, hq.x + ux + wid / 2, hq.z + UNIT_Z + 6.5]);
    ux += wid + 3;
  }
  put("hauler", hq.x - 6.6, hq.z, Math.PI / 2);
  const cam = new THREE.OrthographicCamera(X0, X1, -Z0, -Z1, 0.1, 400);
  cam.up.set(0, 0, -1);
  cam.position.set(hq.x, 200, hq.z);
  cam.lookAt(hq.x, 0, hq.z);
  renderer.setSize(cv.width, cv.height, false);
  renderer.render(sc, cam);
  g.drawImage(renderer.domElement, 0, 0);
  for (const r of rigs) disposeRig(r);

  // viền khối ô, nền móng thật, mũi tên cửa ra, tên nhà
  g.font = "600 11px 'Be Vietnam Pro', sans-serif";
  for (const b of blds) {
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
      const [ox, oz] = rotOffset(lx, lz, b.rot);
      return [px(b.x + ox), pz(b.z + oz)];
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
    const label = SHORT[b.kind] ?? BUILDINGS[b.kind].name;
    const tw = g.measureText(label).width;
    g.fillStyle = "#fffdf6dd";
    g.fillRect(px(b.x) - tw / 2 - 3, pz(b.z + bd) - 15, tw + 6, 14);
    g.fillStyle = "#2b2b2b";
    g.fillText(label, px(b.x) - tw / 2, pz(b.z + bd) - 4);
  }
  g.font = "11px 'Be Vietnam Pro', sans-serif";
  g.fillStyle = "#2b2b2b";
  for (const [n, x, z] of names) g.fillText(n, px(x) - g.measureText(n).width / 2, pz(z) + 4);
  g.fillRect(10, cv.height - 14, 10 * LS, 3);
  g.fillText("10 m (5 ô)", 10, cv.height - 18);
  figure(
    document.getElementById("layout")!,
    cv,
    errors.length ? `<b>Phạm luật đặt nhà:</b><br>${errors.join("<br>")}` : "Mọi công trình đặt hợp lệ theo luật hiện tại của sim."
  );
}

drawLayout();
for (const id of Object.keys(BUILDINGS) as BuildingId[]) drawBuilding(id);
for (const id of Object.keys(UNITS) as UnitId[]) drawUnit(id);
