/**
 * Bàn tác chiến điện tử: thứ người chơi thấy khi kéo camera ra xa. Bản đồ vẽ một lần từ dữ liệu bản đồ bằng canvas 2D
 * (đường đồng mức, sông, rừng, cầu, lưới ô A1, B2…) theo phong cách màn hình phát sáng, đặt trên mặt bàn tối, có vệt quét
 * chạy qua. Chỉ là phần vẽ, không ảnh hưởng luật chơi.
 *
 * Có cảnh riêng để lúc đã nhìn trọn bàn tác chiến thì không phải vẽ cảnh 3D nữa, và nhờ `depthTest: false` nó phủ mờ dần
 * lên cảnh 3D mà không bị địa hình nhô lên che mất.
 */
import * as THREE from "three";
import { colName, mapRuler, type GameMap, type Vec2 } from "../../sim/maps";
import { CELL } from "../../sim/maps/game-map";
import type { TerrainKind } from "../../sim/maps/terrain";

const TEX = 2048;
/** Lề ngoài bản đồ, tính theo tỉ lệ cạnh dài (chỗ ghi chữ cái, số lưới). */
const PAD = 0.055;
/** Thời gian vệt quét đi hết bản đồ (giây). */
const SWEEP_SECONDS = 9;

const CYAN = "120, 210, 255";
type RGB = readonly [number, number, number];
/** Nền theo tầng: tầng càng cao càng sáng, ba bậc tách rõ nhau. */
const TIER_RGB: readonly RGB[] = [
  [13, 25, 34],
  [34, 52, 60],
  [62, 86, 94]
];
/** Vách đá, mép vách: tối hẳn như khe chắn, không đi được. */
const CLIFF_RGB: RGB = [5, 9, 13];
const RAMP_RGB: RGB = [96, 82, 46];
/** Màu mảng theo loại mặt đất, trộn lên nền tầng với độ phủ `a`. */
const TERRAIN_TINT: Partial<Record<TerrainKind, { rgb: RGB; a: number }>> = {
  forest: { rgb: [40, 170, 110], a: 0.42 },
  road: { rgb: [240, 190, 90], a: 0.4 },
  sand: { rgb: [220, 190, 110], a: 0.3 },
  mud: { rgb: [150, 100, 55], a: 0.55 },
  snow: { rgb: [220, 240, 255], a: 0.3 },
  shallow: { rgb: [60, 160, 210], a: 0.85 },
  deep: { rgb: [22, 92, 175], a: 1 }
};

function mix(base: RGB, kind: TerrainKind): RGB {
  const t = TERRAIN_TINT[kind];
  if (!t) return base;
  return [base[0] + (t.rgb[0] - base[0]) * t.a, base[1] + (t.rgb[1] - base[1]) * t.a, base[2] + (t.rgb[2] - base[2]) * t.a];
}

function drawDisplay(map: GameMap): HTMLCanvasElement {
  const pad = Math.max(map.w, map.h) * PAD;
  const W = map.w + pad * 2;
  const H = map.h + pad * 2;
  const s = TEX / Math.max(W, H);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(W * s);
  canvas.height = Math.round(H * s);
  const g = canvas.getContext("2d")!;
  const X = (x: number): number => (x + W / 2) * s;
  const Y = (z: number): number => (z + H / 2) * s;
  const trace = (poly: readonly Vec2[]): void => {
    g.beginPath();
    poly.forEach(([x, z], i) => (i ? g.lineTo(X(x), Y(z)) : g.moveTo(X(x), Y(z))));
    g.closePath();
  };
  const glow = (color: string, blur: number): void => {
    g.shadowColor = color;
    g.shadowBlur = blur;
  };
  const noGlow = (): void => {
    g.shadowBlur = 0;
  };

  g.fillStyle = "#06101c";
  g.fillRect(0, 0, canvas.width, canvas.height);

  const bounds: readonly Vec2[] =
    map.def.bounds ?? [
      [-map.halfW, -map.halfH],
      [map.halfW, -map.halfH],
      [map.halfW, map.halfH],
      [-map.halfW, map.halfH]
    ];

  g.save();
  trace(bounds);
  g.fillStyle = "#0a1a2b";
  g.fill();
  g.clip();

  // các mảng địa hình: đọc từng ô 2 m từ bản đồ (tầng, loại mặt đất, dốc), nên bản đồ dựng từ bản vẽ ô lẫn bản đồ vẽ bằng
  // vùng đa giác đều hiện đủ. Mỗi ô một điểm ảnh trên ảnh nhỏ rồi phóng lên, không làm mịn để mảng có cạnh rõ.
  const { cols, rows } = map;
  const x0 = -map.cols * CELL * 0.5;
  const z0 = -map.rows * CELL * 0.5;
  const cx = (c: number): number => x0 + (c + 0.5) * CELL;
  const cz = (r: number): number => z0 + (r + 0.5) * CELL;
  const tier = new Int8Array(cols * rows);
  const kind: TerrainKind[] = new Array(cols * rows);
  const ramp = new Uint8Array(cols * rows);
  const cells = document.createElement("canvas");
  cells.width = cols;
  cells.height = rows;
  const cg = cells.getContext("2d")!;
  const img = cg.createImageData(cols, rows);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const x = cx(c);
      const z = cz(r);
      kind[i] = map.terrainAt(x, z);
      ramp[i] = map.onRamp(x, z) ? 1 : 0;
      tier[i] = kind[i] === "cliff" ? -1 : Math.min(2, map.tierAt(x, z));
      const col = ramp[i] ? RAMP_RGB : kind[i] === "cliff" ? CLIFF_RGB : mix(TIER_RGB[Math.max(0, tier[i])], kind[i]);
      img.data.set([col[0], col[1], col[2], 255], i * 4);
    }
  cg.putImageData(img, 0, 0);
  g.imageSmoothingEnabled = false;
  g.drawImage(cells, X(x0), Y(z0), cols * CELL * s, rows * CELL * s);
  g.imageSmoothingEnabled = true;

  // rừng: chấm thưa như điểm dữ liệu, cách ô một chấm
  g.fillStyle = "rgba(120, 240, 170, 0.75)";
  const dotR = Math.max(1.2, Math.min(2.4, CELL * s * 0.22));
  for (let r = 0; r < rows; r += 2)
    for (let c = (r / 2) % 2 ? 1 : 0; c < cols; c += 2) if (kind[r * cols + c] === "forest") g.fillRect(X(cx(c)) - dotR, Y(cz(r)) - dotR, dotR * 2, dotR * 2);

  // dốc: vạch chéo vàng trên mảng dốc để nổi khỏi tầng
  g.strokeStyle = "rgba(255, 220, 130, 0.55)";
  g.lineWidth = Math.max(1, CELL * s * 0.18);
  g.beginPath();
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      if (!ramp[r * cols + c] || (r + c) % 2) continue;
      const px = X(x0 + c * CELL);
      const py = Y(z0 + r * CELL);
      g.moveTo(px, py + CELL * s);
      g.lineTo(px + CELL * s, py);
    }
  g.stroke();

  // đường đồng mức: cạnh ô giữa hai tầng khác nhau (không tính dốc, vách đá), phát sáng như vạch số liệu
  glow(`rgba(${CYAN}, 0.9)`, 6);
  g.strokeStyle = `rgba(${CYAN}, 0.85)`;
  g.lineWidth = Math.max(1.4, CELL * s * 0.28);
  g.lineCap = "square";
  g.beginPath();
  const edge = (i: number, j: number): boolean => !ramp[i] && !ramp[j] && tier[i] >= 0 && tier[j] >= 0 && tier[i] !== tier[j];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      if (c + 1 < cols && edge(i, i + 1)) {
        const px = X(x0 + (c + 1) * CELL);
        g.moveTo(px, Y(z0 + r * CELL));
        g.lineTo(px, Y(z0 + (r + 1) * CELL));
      }
      if (r + 1 < rows && edge(i, i + cols)) {
        const py = Y(z0 + (r + 1) * CELL);
        g.moveTo(X(x0 + c * CELL), py);
        g.lineTo(X(x0 + (c + 1) * CELL), py);
      }
    }
  g.stroke();
  g.lineCap = "butt";
  noGlow();

  // sông: lòng tối, viền sáng
  g.lineJoin = "round";
  g.lineCap = "round";
  for (const r of map.riverDefs) {
    const line = (): void => {
      g.beginPath();
      r.path.forEach(([x, z], i) => (i ? g.lineTo(X(x), Y(z)) : g.moveTo(X(x), Y(z))));
    };
    const width = Math.max(4, r.half * 2 * s);
    glow("rgba(70, 170, 255, 0.9)", 12);
    g.strokeStyle = "#4fb4ff";
    g.lineWidth = width + 2.5;
    line();
    g.stroke();
    noGlow();
    g.strokeStyle = "#0d3350";
    g.lineWidth = width;
    line();
    g.stroke();
  }

  // đá: vòng tròn mảnh
  g.strokeStyle = "rgba(170, 190, 210, 0.5)";
  g.lineWidth = 1.2;
  for (const b of map.rocks) {
    g.beginPath();
    g.arc(X(b.x), Y(b.z), Math.max(2.5, b.r * s), 0, Math.PI * 2);
    g.stroke();
  }

  // cầu và bãi cạn
  for (const c of map.crossings()) {
    const { x, z, half, kind } = c.def;
    const across = c.river.bank;
    g.save();
    g.translate(X(x), Y(z));
    g.rotate(Math.atan2(c.dirX, -c.dirZ));
    if (kind === "bridge") {
      g.fillStyle = "#0a1a2b";
      g.fillRect(-across * s, -half * s, across * 2 * s, half * 2 * s);
      glow("rgba(255, 255, 255, 0.9)", 8);
      g.strokeStyle = "#e8f6ff";
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(-across * s, -half * s);
      g.lineTo(across * s, -half * s);
      g.moveTo(-across * s, half * s);
      g.lineTo(across * s, half * s);
      g.stroke();
      noGlow();
    } else {
      g.strokeStyle = "#e8c98a";
      g.lineWidth = 1.8;
      g.setLineDash([6, 5]);
      g.strokeRect(-across * s, -half * s, across * 2 * s, half * 2 * s);
      g.setLineDash([]);
    }
    g.restore();
  }
  g.restore();

  // lưới ô đặt tên, để nói được "đưa quân tới D6": thước đo chung với map-preview và ô ly trên sân (ruler.ts)
  const ruler = mapRuler(map);
  const fontPx = Math.max(15, pad * s * 0.4);
  const line = (x0: number, z0: number, x1: number, z1: number): void => {
    g.beginPath();
    g.moveTo(X(x0), Y(z0));
    g.lineTo(X(x1), Y(z1));
    g.stroke();
  };
  g.lineWidth = 1;
  g.strokeStyle = `rgba(${CYAN}, 0.06)`;
  for (const x of ruler.minorX) line(x, -map.halfH, x, map.halfH);
  for (const z of ruler.minorZ) line(-map.halfW, z, map.halfW, z);
  g.strokeStyle = `rgba(${CYAN}, 0.14)`;
  g.fillStyle = `rgba(${CYAN}, 0.85)`;
  g.font = `600 ${fontPx}px Consolas, 'Courier New', monospace`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  const ce = ruler.colEdges;
  const re = ruler.rowEdges;
  ce.forEach((x, i) => {
    line(x, -map.halfH, x, map.halfH);
    if (i + 1 < ce.length) {
      g.fillText(colName(i), X((x + ce[i + 1]) / 2), Y(-map.halfH - pad * 0.5));
      g.fillText(colName(i), X((x + ce[i + 1]) / 2), Y(map.halfH + pad * 0.5));
    }
  });
  re.forEach((z, i) => {
    line(-map.halfW, z, map.halfW, z);
    if (i + 1 < re.length) {
      g.fillText(String(i + 1), X(-map.halfW - pad * 0.5), Y((z + re[i + 1]) / 2));
      g.fillText(String(i + 1), X(map.halfW + pad * 0.5), Y((z + re[i + 1]) / 2));
    }
  });
  g.strokeStyle = "rgba(242, 193, 78, 0.6)";
  g.setLineDash([10, 8]);
  for (const x of ruler.guideX) line(x, -map.halfH, x, map.halfH);
  for (const z of ruler.guideZ) line(-map.halfW, z, map.halfW, z);
  g.setLineDash([]);

  // khung phát sáng
  glow(`rgba(${CYAN}, 1)`, 16);
  trace(bounds);
  g.strokeStyle = `rgba(${CYAN}, 0.95)`;
  g.lineWidth = 2.4;
  g.stroke();
  noGlow();
  return canvas;
}

/** Vân lưới mờ của mặt bàn, lặp lại. */
function tableTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "#050b14";
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = "rgba(120, 210, 255, 0.08)";
  g.lineWidth = 2;
  g.strokeRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class TacticalMap {
  readonly scene = new THREE.Scene();
  private display: THREE.MeshBasicMaterial;
  private table: THREE.MeshBasicMaterial;
  private fog: THREE.MeshBasicMaterial;
  private sweep: THREE.MeshBasicMaterial;
  private fogMesh: THREE.Mesh;
  private sweepMesh: THREE.Mesh;
  private readonly halfH: number;

  constructor(map: GameMap, fogTex: THREE.Texture, maxAnisotropy: number) {
    const size = Math.max(map.w, map.h);
    const pad = size * PAD;
    this.halfH = map.halfH;
    const flat = { transparent: true, depthTest: false, depthWrite: false, toneMapped: false, fog: false };

    const tableTex = tableTexture();
    tableTex.repeat.set(96, 96);
    this.table = new THREE.MeshBasicMaterial({ map: tableTex, ...flat });
    const table = new THREE.Mesh(new THREE.PlaneGeometry(size * 16, size * 16), this.table);
    table.rotation.x = -Math.PI / 2;
    table.renderOrder = 0;

    const tex = new THREE.CanvasTexture(drawDisplay(map));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = Math.min(8, maxAnisotropy);
    this.display = new THREE.MeshBasicMaterial({ map: tex, ...flat });
    const displayGeo = new THREE.PlaneGeometry(map.w + pad * 2, map.h + pad * 2);
    displayGeo.rotateX(-Math.PI / 2);
    const display = new THREE.Mesh(displayGeo, this.display);
    display.renderOrder = 1;

    // sương mù: vùng chưa thấy tối hẳn đi nhưng vẫn đọc được địa hình
    const fogGeo = new THREE.PlaneGeometry(map.w, map.h);
    fogGeo.rotateX(-Math.PI / 2);
    const pos = fogGeo.getAttribute("position");
    const uv = fogGeo.getAttribute("uv");
    for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + map.halfW) / map.w, (pos.getZ(i) + map.halfH) / map.h);
    this.fog = new THREE.MeshBasicMaterial({ color: 0x02060c, alphaMap: fogTex, ...flat });
    this.fogMesh = new THREE.Mesh(fogGeo, this.fog);
    this.fogMesh.renderOrder = 2;

    // vệt quét chạy dọc bản đồ
    this.sweep = new THREE.MeshBasicMaterial({ color: 0x78d2ff, ...flat, blending: THREE.AdditiveBlending });
    const sweepGeo = new THREE.PlaneGeometry(map.w, Math.max(3, map.h * 0.012));
    sweepGeo.rotateX(-Math.PI / 2);
    this.sweepMesh = new THREE.Mesh(sweepGeo, this.sweep);
    this.sweepMesh.renderOrder = 3;

    this.scene.add(table, display, this.fogMesh, this.sweepMesh);
  }

  /** `k`: 0 = chưa hiện, 1 = phủ kín. */
  set(k: number, showFog: boolean): void {
    this.table.opacity = k;
    this.display.opacity = k;
    this.fog.opacity = k * 0.72;
    this.fogMesh.visible = showFog;
    this.sweep.opacity = k * 0.22;
    const t = (performance.now() / 1000 / SWEEP_SECONDS) % 1;
    this.sweepMesh.position.z = -this.halfH + t * this.halfH * 2;
  }
}
