/**
 * Bản đồ giấy trên bàn tác chiến: thứ người chơi thấy khi kéo camera ra xa. Vẽ một lần từ dữ liệu bản đồ bằng canvas 2D
 * (đường đồng mức, sông, rừng, cầu, lưới ô A1, B2…), đặt trên mặt bàn gỗ. Chỉ là phần vẽ, không ảnh hưởng luật chơi.
 *
 * Có cảnh riêng để lúc đã nhìn trọn bản đồ giấy thì không phải vẽ cảnh 3D nữa, và nhờ `depthTest: false` nó phủ mờ dần
 * lên cảnh 3D mà không bị địa hình nhô lên che mất.
 */
import * as THREE from "three";
import type { GameMap, Vec2 } from "../sim/maps";

const TEX = 2048;
/** Lề giấy ngoài bản đồ, tính theo tỉ lệ cạnh dài (chỗ ghi chữ cái, số lưới). */
const PAD = 0.055;
/** Số ô lưới theo cạnh ngang: cùng cách đặt tên với `npm run map-preview`. */
const GRID_COLS = 12;

const TERRAIN_INK: Partial<Record<string, string>> = {
  forest: "rgba(112, 146, 84, 0.42)",
  road: "rgba(186, 164, 122, 0.85)",
  sand: "rgba(226, 205, 150, 0.8)",
  mud: "rgba(150, 124, 88, 0.55)",
  snow: "rgba(250, 250, 248, 0.85)"
};

const colName = (i: number): string => (i < 26 ? String.fromCharCode(65 + i) : `A${String.fromCharCode(39 + i)}`);

function drawPaper(map: GameMap): HTMLCanvasElement {
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

  // nền giấy ngả màu, vài vết ố nhẹ
  g.fillStyle = "#e7dbbb";
  g.fillRect(0, 0, canvas.width, canvas.height);
  let seed = 12345;
  const rnd = (): number => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < 260; i++) {
    g.fillStyle = `rgba(120, 92, 54, ${0.012 + rnd() * 0.02})`;
    g.beginPath();
    g.arc(rnd() * canvas.width, rnd() * canvas.height, 20 + rnd() * 150, 0, Math.PI * 2);
    g.fill();
  }

  const bounds: readonly Vec2[] =
    map.def.bounds ?? [
      [-map.halfW, -map.halfH],
      [map.halfW, -map.halfH],
      [map.halfW, map.halfH],
      [-map.halfW, map.halfH]
    ];

  // mọi thứ thuộc địa hình cắt trong khung bản đồ
  g.save();
  trace(bounds);
  g.fillStyle = "#efe6cc";
  g.fill();
  g.clip();

  // vùng địa hình
  for (const r of map.regions) {
    const ink = TERRAIN_INK[r.kind];
    if (!ink) continue;
    g.fillStyle = ink;
    if (r.poly) {
      trace(r.poly);
      g.fill();
    } else if (r.circle) {
      g.beginPath();
      g.arc(X(r.circle.x), Y(r.circle.z), r.circle.r * s, 0, Math.PI * 2);
      g.fill();
    }
  }

  // ký hiệu cây rải đều trong rừng
  const treeStep = Math.max(26, 7 * s);
  g.strokeStyle = "rgba(66, 98, 54, 0.75)";
  g.lineWidth = 1.2;
  for (const r of map.regions) {
    if (r.kind !== "forest") continue;
    g.save();
    if (r.poly) trace(r.poly);
    else if (r.circle) {
      g.beginPath();
      g.arc(X(r.circle.x), Y(r.circle.z), r.circle.r * s, 0, Math.PI * 2);
    }
    g.clip();
    for (let py = 0, row = 0; py < canvas.height; py += treeStep * 0.8, row++)
      for (let px = row % 2 ? treeStep / 2 : 0; px < canvas.width; px += treeStep) {
        g.beginPath();
        g.arc(px, py, 3.2, Math.PI, 0);
        g.moveTo(px, py);
        g.lineTo(px, py + 4);
        g.stroke();
      }
    g.restore();
  }

  // cao nguyên và đồi: mỗi bậc một đường đồng mức
  for (const p of map.plateaus) {
    trace(p.poly);
    g.fillStyle = "rgba(180, 142, 90, 0.16)";
    g.fill();
    g.strokeStyle = "rgba(124, 84, 42, 0.75)";
    g.lineWidth = 1.6;
    g.stroke();
  }
  for (const h of map.hills)
    for (const k of [1, 0.66, 0.33]) {
      g.strokeStyle = "rgba(124, 84, 42, 0.7)";
      g.lineWidth = 1.3;
      g.beginPath();
      g.arc(X(h.x), Y(h.z), h.r * k * s, 0, Math.PI * 2);
      g.stroke();
    }

  // sông: viền đậm, lòng nhạt
  g.lineJoin = "round";
  g.lineCap = "round";
  for (const r of map.riverDefs) {
    const line = (): void => {
      g.beginPath();
      r.path.forEach(([x, z], i) => (i ? g.lineTo(X(x), Y(z)) : g.moveTo(X(x), Y(z))));
    };
    const width = Math.max(4, r.half * 2 * s);
    g.strokeStyle = "#5f8aa6";
    g.lineWidth = width + 2.5;
    line();
    g.stroke();
    g.strokeStyle = "#a6c6d8";
    g.lineWidth = width;
    line();
    g.stroke();
  }

  // đá
  for (const b of map.rocks) {
    g.fillStyle = "rgba(110, 102, 90, 0.75)";
    g.beginPath();
    g.arc(X(b.x), Y(b.z), Math.max(2.5, b.r * s), 0, Math.PI * 2);
    g.fill();
  }

  // cầu và bãi cạn
  for (const c of map.crossings()) {
    const { x, z, half, kind } = c.def;
    const nx = -c.dirZ;
    const nz = c.dirX;
    const across = c.river.bank;
    g.save();
    g.translate(X(x), Y(z));
    g.rotate(Math.atan2(nz, nx));
    if (kind === "bridge") {
      g.fillStyle = "#efe6cc";
      g.fillRect(-across * s, -half * s, across * 2 * s, half * 2 * s);
      g.strokeStyle = "#2c2418";
      g.lineWidth = 2.2;
      g.beginPath();
      g.moveTo(-across * s, -half * s);
      g.lineTo(across * s, -half * s);
      g.moveTo(-across * s, half * s);
      g.lineTo(across * s, half * s);
      g.stroke();
    } else {
      g.strokeStyle = "#6d5a3a";
      g.lineWidth = 2;
      g.setLineDash([6, 5]);
      g.strokeRect(-across * s, -half * s, across * 2 * s, half * 2 * s);
      g.setLineDash([]);
    }
    g.restore();
  }
  g.restore();

  // lưới ô đặt tên, để nói được "đưa quân tới D6"
  const cell = map.w / GRID_COLS;
  const rows = Math.round(map.h / cell);
  const fontPx = Math.max(15, pad * s * 0.42);
  g.strokeStyle = "rgba(58, 46, 28, 0.3)";
  g.lineWidth = 1;
  g.fillStyle = "#3a2e1c";
  g.font = `600 ${fontPx}px Georgia, 'Times New Roman', serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  for (let i = 0; i <= GRID_COLS; i++) {
    const x = -map.halfW + i * cell;
    g.beginPath();
    g.moveTo(X(x), Y(-map.halfH));
    g.lineTo(X(x), Y(map.halfH));
    g.stroke();
    if (i < GRID_COLS) {
      g.fillText(colName(i), X(x + cell / 2), Y(-map.halfH - pad * 0.5));
      g.fillText(colName(i), X(x + cell / 2), Y(map.halfH + pad * 0.5));
    }
  }
  for (let i = 0; i <= rows; i++) {
    const z = -map.halfH + i * cell;
    g.beginPath();
    g.moveTo(X(-map.halfW), Y(z));
    g.lineTo(X(map.halfW), Y(z));
    g.stroke();
    if (i < rows) {
      g.fillText(String(i + 1), X(-map.halfW - pad * 0.5), Y(z + cell / 2));
      g.fillText(String(i + 1), X(map.halfW + pad * 0.5), Y(z + cell / 2));
    }
  }

  // khung bản đồ
  trace(bounds);
  g.strokeStyle = "#2c2418";
  g.lineWidth = 3;
  g.stroke();
  return canvas;
}

export class PaperMap {
  readonly scene = new THREE.Scene();
  private paper: THREE.MeshBasicMaterial;
  private table: THREE.MeshBasicMaterial;
  private fog: THREE.MeshBasicMaterial;
  private fogMesh: THREE.Mesh;

  constructor(map: GameMap, fogTex: THREE.Texture, maxAnisotropy: number) {
    const pad = Math.max(map.w, map.h) * PAD;
    const flat = { transparent: true, depthTest: false, depthWrite: false, toneMapped: false, fog: false };

    this.table = new THREE.MeshBasicMaterial({ color: 0x3f2c1d, ...flat });
    const table = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(map.w, map.h) * 12, Math.max(map.w, map.h) * 12), this.table);
    table.rotation.x = -Math.PI / 2;
    table.renderOrder = 0;

    const tex = new THREE.CanvasTexture(drawPaper(map));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = Math.min(8, maxAnisotropy);
    this.paper = new THREE.MeshBasicMaterial({ map: tex, ...flat });
    const paperGeo = new THREE.PlaneGeometry(map.w + pad * 2, map.h + pad * 2);
    paperGeo.rotateX(-Math.PI / 2);
    const paper = new THREE.Mesh(paperGeo, this.paper);
    paper.renderOrder = 1;

    // sương mù trên giấy: vùng chưa thấy tô sẫm màu mực nhưng vẫn đọc được bản đồ bên dưới
    const fogGeo = new THREE.PlaneGeometry(map.w, map.h);
    fogGeo.rotateX(-Math.PI / 2);
    const pos = fogGeo.getAttribute("position");
    const uv = fogGeo.getAttribute("uv");
    for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + map.halfW) / map.w, (pos.getZ(i) + map.halfH) / map.h);
    this.fog = new THREE.MeshBasicMaterial({ color: 0x2a2116, alphaMap: fogTex, ...flat });
    this.fogMesh = new THREE.Mesh(fogGeo, this.fog);
    this.fogMesh.renderOrder = 2;

    this.scene.add(table, paper, this.fogMesh);
  }

  /** `k`: 0 = chưa hiện, 1 = phủ kín. */
  set(k: number, showFog: boolean): void {
    this.table.opacity = k;
    this.paper.opacity = k;
    this.fog.opacity = k * 0.6;
    this.fogMesh.visible = showFog;
  }
}
