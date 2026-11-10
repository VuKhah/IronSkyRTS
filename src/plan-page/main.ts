/**
 * Bản Vẽ Mặt Bằng (plan.html). Người dùng 10/11/2026: "chỉ giữ lại đúng một tấm bản lớn với tất cả các khối được xếp sao
 * cho diện tích là nhỏ nhất (không tính quân đội)".
 *
 * Mỗi loại công trình một nhà, đặt bằng luật thật của sim (World Phòng Thử Nghiệm): nền móng gồm thân + viền trong mô hình,
 * hai nhà cạnh nhau dùng chung đúng `RULES.buildPadCells` ô cấm xây, lối ra không bị vây. Cách xếp là bài toán XẾP HÌNH CHỮ
 * NHẬT VÀO HỘP: mỗi nhà = hình chữ nhật cỡ nền móng + 1 ô cấm xây ở cạnh phải và cạnh dưới (nên hai nhà sát nhau cách đúng 1
 * ô). Thử nhiều bề rộng hộp, nhiều thứ tự và cả hai hướng xoay, đặt theo "đường chân trời" (chỗ thấp nhất rồi trái nhất), giữ
 * phương án hình bao nhỏ nhất mà sim chấp nhận. Bộ số ngẫu nhiên có seed nên mở trang lần nào cũng ra cùng một bản vẽ. Mọi
 * kích thước đọc từ content.ts / World, nên đổi cỡ nhà thì bản vẽ tự xếp lại.
 */
import * as THREE from "three";
import { BUILDINGS, doorDir, FACTION_OF, rotHalf, rotOffset, RULES, type BuildingId } from "../sim/content";
import { CELL } from "../sim/maps";
import { World } from "../sim/world";
import { buildModel, disposeRig } from "../render/models";
import { search, type Spot } from "./pack";

const PAPER = "#f4f1e8";
/** Tên ngắn cho nhà nhỏ 4 × 4 m (tên đầy đủ dài hơn nhà). */
const SHORT: Partial<Record<BuildingId, string>> = {
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

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setClearColor(0x000000, 0);

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

/** Đặt một phương án vào World Phòng Thử Nghiệm bằng luật thật; trả về World nếu mọi nhà đều hợp lệ. */
function realize(spots: Spot[], ox: number, oz: number): World | null {
  const w = new World(1, { sandbox: true, map: "big-test" });
  for (const s of spots) {
    const kind = s.kind as BuildingId;
    // tâm nhà = tâm nền móng (thân nằm chính giữa); nấc xoay 1 = nằm ngang (đổi rộng / sâu)
    const x = ox + (s.cx + s.w / 2) * CELL;
    const z = oz + (s.cz + s.h / 2) * CELL;
    const rot = s.rot ? 1 : 0;
    if (w.sandboxPlaceError(kind, x, z, rot) !== null) return null;
    const n = w.buildings.length;
    w.step([{ side: 0, order: { t: "sbSpawn", kind, side: 0, x, z, rot } } as never]);
    if (w.buildings.length === n) return null;
  }
  return w;
}

function drawBoard(): void {
  const probe = new World(1, { sandbox: true, map: "big-test" });
  // góc bản vẽ: một đường lưới trên bãi trống của bản đồ thử 960 m (lưới sim: −halfW + k·2)
  const ox = -60;
  const oz = 40;
  const plans = search((Object.keys(BUILDINGS) as BuildingId[]).map((kind) => {
    const [fw, fh] = probe.footCells(kind, 0);
    return { kind, fw, fh };
  }), RULES.buildPadCells);
  let pick: { spots: Spot[]; W: number; H: number; area: number } | null = null;
  let w: World | null = null;
  let tried = 0;
  for (const p of plans) {
    tried++;
    w = realize(p.spots, ox, oz);
    if (w) {
      pick = p;
      break;
    }
  }
  const host = document.getElementById("layout")!;
  if (!pick || !w) {
    host.textContent = "Không tìm được cách xếp nào hợp lệ theo luật hiện tại.";
    return;
  }
  const pad = RULES.buildPadCells;
  const lower = (Object.keys(BUILDINGS) as BuildingId[]).reduce((s, k) => {
    const [a, b] = probe.footCells(k, 0);
    return s + a * b;
  }, 0);
  const blds = w.buildings.filter((b) => b.side === 0 && b.x >= ox - 1 && b.z >= oz - 1 && b.x <= ox + pick!.W * CELL + 1 && b.z <= oz + pick!.H * CELL + 1);

  const LS = 16; // px / m
  const M = (pad + 1) * CELL; // lề giấy quanh hình bao: đủ thấy ô cấm xây ngoài cùng
  const X0 = ox - M;
  const Z0 = oz - M;
  const X1 = ox + pick.W * CELL + M;
  const Z1 = oz + pick.H * CELL + M;
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
  for (const b of blds) {
    const m = w.marginOf(b.kind);
    const [bw, bd] = w.blockHalf(b.kind, b.rot);
    rect(b.x - bw - m - pad * CELL, b.z - bd - m - pad * CELL, b.x + bw + m + pad * CELL, b.z + bd + m + pad * CELL, "#f6d0cb");
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
  // lưới đất 2 m (đúng lưới sim) + lưới 0,4 m mờ
  const lines = (step: number, style: string): void => {
    g.strokeStyle = style;
    g.lineWidth = 1;
    g.beginPath();
    for (let x = Math.ceil((X0 + w!.map.halfW) / step) * step - w!.map.halfW; x <= X1; x += step) {
      g.moveTo(Math.round(px(x)) + 0.5, 0);
      g.lineTo(Math.round(px(x)) + 0.5, cv.height);
    }
    for (let z = Math.ceil((Z0 + w!.map.halfH) / step) * step - w!.map.halfH; z <= Z1; z += step) {
      g.moveTo(0, Math.round(pz(z)) + 0.5);
      g.lineTo(cv.width, Math.round(pz(z)) + 0.5);
    }
    g.stroke();
  };
  lines(0.4, "#e8e2d2");
  lines(CELL, "#cfc6b0");

  // mọi mô hình ở đúng chỗ, chụp trực giao từ trên xuống một lần
  const sc = new THREE.Scene();
  sc.add(new THREE.HemisphereLight(0xffffff, 0x8a8478, 1.7));
  const lt = new THREE.DirectionalLight(0xffffff, 1.4);
  lt.position.set(4, 10, 6);
  sc.add(lt);
  const rigs: ReturnType<typeof buildModel>[] = [];
  for (const b of blds) {
    const rig = buildModel(b.kind, FACTION_OF[0], false);
    rig.root.position.set(b.x, w.map.groundY(b.x, b.z) + 0.06, b.z);
    rig.root.rotation.y = (b.rot * Math.PI) / 2;
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

  // viền khối ô, nền móng thật, khu ráp / giếng phóng, mũi tên cửa ra, tên nhà
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
    const label = SHORT[b.kind] ?? BUILDINGS[b.kind].name;
    const tw = g.measureText(label).width;
    const m = w.marginOf(b.kind);
    g.fillStyle = "#fffdf6e6";
    g.fillRect(px(b.x) - tw / 2 - 3, pz(b.z + bd + m) - 15, tw + 6, 14);
    g.fillStyle = "#2b2b2b";
    g.fillText(label, px(b.x) - tw / 2, pz(b.z + bd + m) - 4);
  }
  // khung hình bao (theo nền móng) + kích thước
  g.strokeStyle = "#2b2b2b";
  g.lineWidth = 2;
  g.setLineDash([10, 5]);
  g.strokeRect(px(ox), pz(oz), pick.W * CELL * LS, pick.H * CELL * LS);
  g.setLineDash([]);
  g.font = "700 13px 'Be Vietnam Pro', sans-serif";
  g.fillStyle = "#2b2b2b";
  g.fillText(`${pick.W} ô (${pick.W * CELL} m)`, px(ox) + 4, pz(oz) - 8);
  g.save();
  g.translate(px(ox) - 8, pz(oz + pick.H * CELL) - 4);
  g.rotate(-Math.PI / 2);
  g.fillText(`${pick.H} ô (${pick.H * CELL} m)`, 0, 0);
  g.restore();
  g.fillRect(10, cv.height - 14, 10 * LS, 3);
  g.font = "11px 'Be Vietnam Pro', sans-serif";
  g.fillText("10 m (5 ô)", 10, cv.height - 18);

  const fill = Math.round((lower / pick.area) * 100);
  figure(
    host,
    cv,
    `<b>${blds.length} công trình</b> trong hình bao <b>${pick.W} × ${pick.H} ô = ${pick.area} ô</b> (${pick.W * CELL} × ${pick.H * CELL} m). ` +
      `Riêng các nền móng chiếm ${lower} ô (${fill}% hình bao); phần còn lại là ô cấm xây dùng chung giữa các nhà và chỗ trống không lấp được. ` +
      `Mọi nhà đặt hợp lệ theo luật hiện tại của sim (đã thử ${tried} phương án từ nhỏ tới lớn).`
  );
}

drawBoard();
