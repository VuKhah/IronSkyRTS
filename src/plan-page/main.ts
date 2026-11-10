/**
 * Bản Vẽ Mặt Bằng (plan.html; người dùng 10/11/2026: "vẽ bản vẽ mặt bằng của tất cả quân và mô hình lên giấy 2D, kèm lưới
 * đất mà nó sẽ chiếm"). Mỗi mô hình chụp thẳng từ trên xuống bằng camera trực giao, cùng một tỉ lệ, rồi vẽ đè lưới và các
 * vùng luật bằng canvas 2D. Mọi số đọc từ content.ts / World nên bản vẽ luôn khớp với sim.
 */
import * as THREE from "three";
import { BUILDINGS, FACTION_OF, UNITS, type BuildingId, type UnitId } from "../sim/content";
import { CELL } from "../sim/maps";
import { World } from "../sim/world";
import { buildModel, disposeRig } from "../render/models";

/** Tỉ lệ bản vẽ: điểm ảnh trên một mét (chung cho mọi hình để so được to nhỏ). */
const S = 22;
const FINE = 0.4;
const PAPER = "#f4f1e8";

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

function drawBuilding(id: BuildingId): void {
  const spec = BUILDINGS[id];
  const [hw, hd] = spec.half;
  const [nx, nz] = world.blockCells(id, 0);
  const [bw, bd] = world.blockHalf(id, 0);
  const pad = (spec.clearCells ?? 0) * CELL;
  const exit = world.exitRect(id, 0, 0, 0);
  const t: Tile = { ex: bw + Math.max(pad, 0) + 3, ez: bd + Math.max(pad, exit ? 2 : 0) + 3, gx: nx % 2 ? CELL / 2 : 0, gz: nz % 2 ? CELL / 2 : 0 };
  const { cv, g, px, pz } = paper(t);
  if (pad) cells(g, px, pz, -bw - pad, -bd - pad, bw + pad, bd + pad, "#f2b48a");
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
  if (exit) {
    // mũi tên hướng xe ra
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
    `Nền móng ${fmt(hw * 2)} × ${fmt(hd * 2)} m → chiếm <b>${nx} × ${nz} ô</b> (${fmt(bw * 2)} × ${fmt(bd * 2)} m)`
  ];
  if (exit) parts.push("Có cửa ra 4 × 2 m (xe chạy ra)");
  if (pad) parts.push(`Đệm ${spec.clearCells} ô quanh nhà cho xe vận tải`);
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

for (const id of Object.keys(BUILDINGS) as BuildingId[]) drawBuilding(id);
for (const id of Object.keys(UNITS) as UnitId[]) drawUnit(id);
