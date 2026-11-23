/**
 * TẦNG 3 — KHỐI (lõi di chuyển mới 20/11/2026, `Docs/plans/2026-11-20-loi-di-chuyen-moi-thiet-ke.md`).
 *
 * Lệnh đi cho từ 2 xe mặt đất chiến đấu lập một khối (`Group`). Khối KHÔNG có pha; mỗi tick chỉ làm ba việc:
 *  1. đặt ô của từng xe (`stepGroup`): quãng ngắn thì ô = ô cuối (`direct`), quãng dài thì ô bám vệt đường chung cách neo
 *     `back` mét, lệch ngang `lat` mét (`march`);
 *  2. chạy neo: tốc độ khối (xe chậm nhất, xe chậm được hộ tống), phanh vào đích, chậm lại khi có xe tụt, chậm lại khi ô ở
 *     mép ngoài khúc cua chạy nhanh hơn xe của nó đuổi được, co / giãn số cột theo bề rộng lối phía trước;
 *  3. mỗi xe tự lái tới ô của mình (`groupMember` → `drive`), tấn công-di chuyển thì cả khối dừng đánh.
 * Tới nơi: mọi xe đứng ở ô cuối, quay cùng một hướng; khối tan, sư đoàn (nếu có) đóng quân.
 */
import { DEFAULT_FORMATION, FORMATIONS, REAR_RANK, RULES, UNITS, type FormationId, type Mobility, type Side, type WeaponSpec } from "../content";
import { assignMin } from "../assign";
import { clamp, dist2 } from "../fmath";
import { CELL, TIER_H } from "../maps";
import type { Group, Target, Unit } from "../types";
import { DT, sec, accelOf, brakeOf, bodyRadius, wallRadius, AIR_FORMATION_GAP, SLOT_NUDGE, IDLE_ACQUIRE_BONUS, LEASH } from "./shared";
import { World } from "./core";
import { REVERSE_MAX } from "./movement";

/** Khe giữa hai thân xe cạnh nhau trong một hàng / giữa hai hàng (m). */
export const COL_GAP = 0.8;
export const ROW_GAP = 1.2;
/** Khi hành quân các hàng giãn ra chừng này (m) giữa hai thân (đoàn xe chạy giữ khoảng; tới nơi thì khép lại ROW_GAP). */
export const MARCH_ROW_GAP = 2;
/** Tâm khối → đích không quá chừng này (m) và mọi xe nhìn thẳng thấy ô cuối: mỗi xe chạy thẳng tới ô (`direct`). */
const DIRECT_MAX = 35;
/** Tốc độ khối = min(tốc độ trung bình, xe chậm nhất × escortBoost) × BLOCK_K (chừa sức cho xe đuổi ô). */
export const BLOCK_K = 0.9;
/** Neo tăng tốc / hãm theo xe ì nhất × hệ số này (ô chạy êm hơn xe một chút để xe theo kịp). */
const ANCHOR_ACCEL_K = 0.75;
const ANCHOR_BRAKE_K = 0.6;
/** Xe tụt khỏi ô: dưới LAG_OK m thì neo chạy đủ tốc; tới LAG_STOP m thì neo chỉ còn bò (LAG_MIN_K); xa hơn LAG_IGNORE m là xe lạc, neo không chờ. */
const LAG_OK = 4;
const LAG_STOP = 16;
const LAG_MIN_K = 0.35;
/** Hệ số chậm vì xe tụt đổi dần (mỗi tick tiến chừng này phần về giá trị mới): neo không giật theo từng tick. */
const LAG_SMOOTH = 0.04;
/** Lệch ngang / lùi của ô đổi tới mẫu mới nhanh nhất chừng này (m/s). */
const LAT_RATE = 2;
const BACK_RATE = 3;
/** Tốc độ / hướng ô làm mượt (mỗi tick tiến chừng này phần về số đo mới). */
const SLOT_SMOOTH = 0.35;
const LAG_IGNORE = 25;
const LAG_GIVE_UP = sec(6);
/** Neo chờ theo phần tụt của xe ở mức phần trăm này (0,75 = bỏ một phần tư xe tụt nhất). */
const LAG_PCT = 0.75;
/** Hướng khung ô tại một điểm trên vệt = dây cung qua ±FRAME_W m quanh điểm đó (qua cua thì xoay dần, không nhảy). */
const FRAME_W_MIN = 4;
/** Nhìn trước chừng này mét từ hàng đầu để co cột trước lối hẹp; giãn lại sau chừng này lần đo liền đủ rộng. */
const LOOK_AHEAD = 25;
const WIDEN_CHECKS = 7;
/** Giãn cột khi quãng chừng này (m) sau hàng đầu cũng đủ rộng (không đợi cả đoàn dài ra khỏi lối hẹp). */
const BODY_CHECK = 20;
/** Khe chừa mỗi bên giữa mép khối và vật cản khi tính số cột vừa lối (m). */
const WIDTH_MARGIN = 0.4;
/** Ô chuyển dần từ vệt sang hình cuối trong chừng này mét cuối của neo (tối thiểu; thêm nửa bề ngang khối). */
const END_BLEND = 10;
/** Dựng lại hình cuối sớm hơn lúc ô bắt đầu chuyển chừng này mét. */
const REFIT_LEAD = 10;
/** Giãn hết cỡ mà còn hơn chừng này mét đường thì mới xếp lại theo vai (gần đích thì giữ thứ tự đang đi). */
const REFORM_DIST = 60;
/** Khối tan khi chừng này liền không xe nào lại gần ô cuối thêm END_STEP m (xe còn lại tự về ô của nó); tối đa END_MAX sau khi neo tới. */
const END_STALL = sec(6);
const END_STEP = 0.5;
const END_MAX = sec(90);
/** Đi thẳng tới ô: hết thời gian dự kiến cộng chừng này mà chưa xong thì khối tan. */
const DIRECT_WAIT = sec(10);
/** Bám ô đang chạy: hệ số đuổi theo phần tụt (1/s), độ dài nhắm trước (m). */
const KP = 0.7;
const LEAD_MIN = 1.5;
const LEAD_T = 0.8;
const LEAD_MAX = 6;
/** Xe cách ô xa hơn chừng này (m) mà không nhìn thẳng được ô thì tìm đường A* tới ô. */
const SLOT_FAR = 12;
/** Tấn công-di chuyển: hết địch chừng này thì cả khối đi tiếp. */
const HOLD_RESUME = sec(1.5);
/** Phần số xe có vũ khí phải vào cuộc để cả khối dừng đánh / để giữ dừng (một xe tầm xa thấy địch thì khối vẫn áp sát). */
const HOLD_QUORUM = 1 / 3;
const HOLD_KEEP = 1 / 6;
/** Ô biến hình (co / giãn cột, khép hàng) tối thiểu chừng này m/s kể cả khi xe đang chạy hết sức. */
const MORPH_MIN = 0.6;
/** Neo nhìn trước khúc cua ở chừng này giây đường phía trước (theo tốc độ neo) để hãm dần. */
const CORNER_LOOK = [0.6, 1.2, 2];
/** Dừng đánh quá chừng này mà cả khối không bắn được phát nào (địch chỉ thoáng hiện) thì đi tiếp chừng này nữa mới được dừng lại. */
const HOLD_FUTILE = sec(4);
/** Chỗ thử khi dời hình cuối cho vừa chỗ: [dạt ngang, lùi lại] (m), giữa trước rồi lệch dần hai bên, rồi lùi trước đích. */
const FIT_SHIFTS: readonly (readonly [number, number])[] = [
  ...[0, 2, -2, 4, -4, 6, -6, 8, -8, 10, -10].map((d) => [d, 0] as const),
  ...[4, 8, 12, 16].flatMap((b) => [0, 4, -4, 8, -8].map((d) => [d, b] as const))
];

function groupById(this: World, id: number): Group | undefined {
  if (!id) return undefined;
  for (const g of this.groups) if (g.id === id) return g;
  return undefined;
}

/**
 * Đội hình hiện tại của một nhóm xe: kiểu được nhiều xe nhất (bằng nhau thì theo thứ tự bảng FORMATIONS để tất định).
 * null = chưa xe nào được chọn kiểu.
 */
function formationOf(this: World, units: readonly Unit[]): FormationId | null {
  let best: FormationId | null = null;
  let most = 0;
  for (const id of Object.keys(FORMATIONS) as FormationId[]) {
    let n = 0;
    for (const u of units) if (u.formation === id) n++;
    if (n > most) {
      most = n;
      best = id;
    }
  }
  return best;
}

/**
 * Máy bay cùng một lệnh bay theo đội hình mũi tên, mỗi chiếc một điểm đến (người dùng 09/11/2026). Chiếc số nhỏ dẫn đầu, các
 * chiếc sau xòe hai cánh. Máy bay có cánh cùng lệnh thành một phi đội (18/11/2026).
 */
function airSlots(this: World, units: readonly Unit[], x: number, z: number): Map<number, [number, number]> {
  const out = new Map<number, [number, number]>();
  const air = units.filter((u) => u.air !== "none").sort((a, b) => a.id - b.id);
  if (air.length < 2) return out;
  let cx = 0;
  let cz = 0;
  for (const u of air) {
    cx += u.x / air.length;
    cz += u.z / air.length;
  }
  let hx = x - cx;
  let hz = z - cz;
  const l = Math.sqrt(hx * hx + hz * hz);
  if (l < 1e-6) {
    hx = 0;
    hz = 1;
  } else {
    hx /= l;
    hz /= l;
  }
  air.forEach((u, i) => {
    u.wing = UNITS[u.kind].hover ? 0 : air.find((a) => !UNITS[a.kind].hover)?.id ?? 0;
    const wing = Math.ceil(i / 2);
    const lat = (i % 2 === 1 ? -wing : wing) * AIR_FORMATION_GAP;
    const back = wing * AIR_FORMATION_GAP * 0.7;
    u.wingLat = lat;
    u.wingBack = back;
    out.set(u.id, [x + hz * lat - hx * back, z - hx * lat - hz * back]);
  });
  return out;
}

function orderMove(this: World, side: Side, ids: readonly number[], x: number, z: number, kind: "move" | "amove", formation?: FormationId): void {
  const units = this.ownUnits(side, ids);
  // từ 3 xe mặt đất: lập / giữ sư đoàn bền vững (`world/division.ts`)
  this.formDivision(side, units, kind);
  // từ 2 xe chiến đấu trở lên: đi thành khối (Xe Vận Tải đi riêng, vì còn việc hậu cần)
  const fighters = units.filter((u) => u.air === "none" && u.kind !== "hauler");
  const grouped = fighters.length > 1 ? new Set(fighters.map((u) => u.id)) : null;
  if (grouped) this.createGroup(side, fighters, x, z, kind, formation);
  if (formation) for (const u of units) u.formation = formation;
  const ground = units.filter((u) => u.air === "none" && !grouped?.has(u.id));
  const plan = this.formation(ground, x, z);
  const air = this.airSlots(units, x, z);
  for (const u of units) {
    if (grouped?.has(u.id)) continue;
    if (u.air !== "none") {
      const [ax, az] = air.get(u.id) ?? [x, z];
      if (!air.has(u.id)) u.wing = 0;
      u.mission = "move";
      u.mx = clamp(ax, -this.map.airX, this.map.airX);
      u.mz = clamp(az, -this.map.airZ, this.map.airZ);
      u.targetId = 0;
      u.autoTarget = 0;
      this.cancelRtbIfFuel(u);
      continue;
    }
    if (u.kind === "hauler") {
      this.releaseMine(u);
      this.releaseWreck(u);
      u.manual = true;
      u.hState = "idle";
    }
    const [fx, fz] = plan.slots.get(u.id) ?? [x, z];
    u.faceX = plan.fx;
    u.faceZ = plan.fz;
    u.order = kind;
    u.targetId = 0;
    u.autoTarget = 0;
    u.chasing = false;
    u.homeT = 0;
    u.tx = fx;
    u.tz = fz;
    this.setPath(u, fx, fz);
  }
}

/**
 * Chỗ đến cho các xe đi RIÊNG cùng một lệnh (một xe chiến đấu lẻ, Xe Vận Tải): hàng ngang quay theo hướng đi, tâm ở điểm bấm,
 * ô vướng thì dịch sang ô trống gần nhất; ô không được đè xe đứng khác (xe lẻ không dừng giữa khe).
 */
function formation(this: World, units: readonly Unit[], x: number, z: number): { slots: Map<number, [number, number]>; fx: number; fz: number } {
  const slots = new Map<number, [number, number]>();
  const n = units.length;
  if (n === 0) return { slots, fx: 0, fz: 0 };
  let cx = 0;
  let cz = 0;
  for (const u of units) {
    cx += u.x / n;
    cz += u.z / n;
  }
  let fx = x - cx;
  let fz = z - cz;
  let l = Math.sqrt(fx * fx + fz * fz);
  if (l < 2) {
    fx = 0;
    fz = 0;
    for (const u of units) {
      fx += u.hx;
      fz += u.hz;
    }
    l = Math.sqrt(fx * fx + fz * fz);
    if (l < 1e-6) {
      fx = 0;
      fz = 1;
      l = 1;
    }
  }
  fx /= l;
  fz /= l;
  const rx = fz;
  const rz = -fx;
  const order = [...units].sort((a, b) => (a.x - cx) * rx + (a.z - cz) * rz - ((b.x - cx) * rx + (b.z - cz) * rz) || a.id - b.id);
  const cols = Math.min(n, Math.ceil(Math.sqrt(n * 2.5)));
  const used = new Set<number>();
  const taken: Taken = { x: [], z: [], r: [] };
  order.forEach((u, i) => {
    const row = Math.floor(i / cols);
    const inRow = Math.min(cols, n - row * cols);
    const col = (i % cols) - (inRow - 1) / 2;
    const sp = 2 * bodyRadius(u.kind) + COL_GAP;
    const px = x + rx * col * sp - fx * row * sp;
    const pz = z + rz * col * sp - fz * row * sp;
    // xe đứng ở chỗ đến lúc ra lệnh có thể sắp đi (lệnh cùng tick): không né lúc này, tới nơi mà chỗ còn bị chiếm thì "tới gần là
    // tới" (`follow` → `goalTaken`)
    slots.set(u.id, this.freeSpot(u, px, pz, used, ALL_UNITS, -1, fx, fz, taken));
  });
  return { slots, fx, fz };
}

/** Các ô đã chọn (tâm, bán kính thân): ô mới không được đè lên (ô 2 m của lưới nhỏ hơn thân xe, tránh trùng ô lưới là chưa đủ). */
type Taken = { x: number[]; z: number[]; r: number[] };
/** Hai ô cạnh nhau phải cách nhau ít nhất tổng hai thân + chừng này (m): hai ô đè nhau thì hai xe không bao giờ cùng vào ô, cả đám kẹt. */
const SLOT_CLEAR = 0.3;
function clashes(t: Taken, x: number, z: number, r: number): boolean {
  for (let k = 0; k < t.x.length; k++) {
    const lim = r + t.r[k] + SLOT_CLEAR;
    if (dist2(x, z, t.x[k], t.z[k]) < lim * lim) return true;
  }
  return false;
}

/** Ô đứng được gần (x, z) nhất cho xe u: vừa thân (khoảng trống), không đè ô xe khác đã nhận (`taken`), không đè xe đứng ngoài lệnh. */
function freeSpot(this: World, u: Unit, x: number, z: number, used: Set<number>, ignore: ReadonlySet<number>, tier: number, fx: number, fz: number, taken?: Taken, from?: readonly [number, number]): [number, number] {
  const r = bodyRadius(u.kind);
  const take = (px: number, pz: number): [number, number] => {
    used.add(this.grid.index(px, pz));
    if (taken) {
      taken.x.push(px);
      taken.z.push(pz);
      taken.r.push(r);
    }
    return [px, pz];
  };
  const wr = wallRadius(u.kind);
  // ô dự phòng phải cùng tầng (không rơi xuống chân vách / lên thềm khác), không nằm trên dốc, và (có `from`) tới được từ tâm hình cuối
  // với đúng cỡ xe (không rơi vào hốc xe không lọt)
  const half = Math.max(0.71, wr);
  const okTier = (px: number, pz: number): boolean => (tier < 0 || (this.map.tierAt(px, pz) === tier && !this.nearRamp(px, pz))) && (!from || this.grid.reachable(from[0], from[1], px, pz, half));
  // dịch theo khung hướng mặt (phải, trước) chứ không theo trục bản đồ: hai phe soi gương chọn ô soi gương (luật công bằng số 4)
  const rx = fz;
  const rz = -fx;
  for (const [i, j] of SLOT_NUDGE) {
    const px = x + (rx * i + fx * j) * CELL;
    const pz = z + (rz * i + fz * j) * CELL;
    if (!this.map.fits(px, pz, 1, 1) || this.grid.blockedAt(px, pz) || this.grid.clearanceAt(px, pz) < wr || !okTier(px, pz)) continue;
    const c = this.grid.index(px, pz);
    if (used.has(c) || (taken && clashes(taken, px, pz, r))) continue;
    if (this.standingAt(px, pz, r, ignore)) continue;
    return take(px, pz);
  }
  const f =
    this.grid.nearestFree(x, z, 10, (cx, cz) => this.grid.clearanceAt(cx, cz) >= wr && okTier(cx, cz) && !used.has(this.grid.index(cx, cz)) && !(taken && clashes(taken, cx, cz, r))) ??
    this.grid.nearestFree(x, z, 8, (cx, cz) => this.grid.clearanceAt(cx, cz) >= wr && okTier(cx, cz) && !used.has(this.grid.index(cx, cz))) ??
    [x, z];
  return take(f[0], f[1]);
}

/** Tập "bỏ qua mọi xe" cho `freeSpot` / `standingAt` (không né xe đứng nào). */
const ALL_UNITS: ReadonlySet<number> = { has: () => true } as unknown as ReadonlySet<number>;

/** Có xe mặt đất ĐỨNG (không lệnh, không trong khối) ngoài tập `ignore` đè lên vòng bán kính r quanh (x, z) không. */
function standingAt(this: World, x: number, z: number, r: number, ignore: ReadonlySet<number>): boolean {
  for (const v of this.units) {
    if (v.hp <= 0 || v.air !== "none" || ignore.has(v.id) || v.order !== "idle" || v.group) continue;
    const lim = r + bodyRadius(v.kind) + 0.2;
    if (dist2(x, z, v.x, v.z) < lim * lim) return true;
  }
  return false;
}

// ------------------------------------------------------------------ mẫu đội hình

/** Tuyến (theo vai) của xe trong kiểu đội hình: số nhỏ đứng trước. */
function rankOf(kind: Unit["kind"], f: FormationId): number {
  return FORMATIONS[f].rank[UNITS[kind].group];
}

/** Số cột khi rộng rãi: bề ngang ≈ √(số xe × wide) xe mỗi hàng. */
function colsFor(n: number, f: FormationId): number {
  return Math.max(1, Math.min(n, Math.ceil(Math.sqrt(n * FORMATIONS[f].wide))));
}

/**
 * Xếp xe thành hàng cho mẫu đầy đủ, nhìn theo hướng (fx, fz) từ tâm (cx, cz). `byRole`: theo tuyến của vai (giáp trước, pháo
 * sau; mỗi tuyến bắt đầu hàng mới; đội hình có đoạn hậu thì một phần ba giáp phía sau ra cuối); không thì theo đúng thứ tự xe
 * đang đứng từ trước ra sau (đội đã vào hàng: không ai phải băng qua đội). Mỗi tuyến chia đều số xe mỗi hàng; trong hàng xếp
 * từ trái sang phải theo chỗ đang đứng. Trả về các hàng (mảng xe) và tuyến của từng hàng.
 */
function rowsFor(units: readonly Unit[], cx: number, cz: number, fx: number, fz: number, f: FormationId, byRole: boolean, cols: number): { rows: Unit[][]; ranks: number[] } {
  const rx = fz;
  const rz = -fx;
  const fwd = (u: Unit): number => (u.x - cx) * fx + (u.z - cz) * fz;
  const lat = (u: Unit): number => (u.x - cx) * rx + (u.z - cz) * rz;
  const rank = new Map<number, number>();
  for (const u of units) rank.set(u.id, byRole ? rankOf(u.kind, f) : 0);
  if (byRole && FORMATIONS[f].rearGuard) {
    // đoạn hậu: một phần ba xe GIAP ở phía sau nhất ra tuyến cuối
    const armor = units.filter((u) => UNITS[u.kind].group === "GIAP").sort((a, b) => fwd(a) - fwd(b) || a.id - b.id);
    for (const u of armor.slice(0, Math.floor(armor.length / 3))) rank.set(u.id, REAR_RANK);
  }
  // XE CÙNG LÔ ĐỨNG LIỀN NHAU (thiết kế sư đoàn 09/11/2026): trong cùng tuyến, xếp theo lô (lô ở trước hơn đi trước), trong lô theo
  // chỗ đang đứng. Xe không thuộc lô (lot 0) là một lô riêng
  const lotKey = (u: Unit): number => (u.lot ? u.lot : -u.id);
  const lotFwd = new Map<number, number>();
  const lotN = new Map<number, number>();
  for (const u of units) {
    const k = lotKey(u) * 16 + rank.get(u.id)!;
    lotFwd.set(k, (lotFwd.get(k) ?? 0) + fwd(u));
    lotN.set(k, (lotN.get(k) ?? 0) + 1);
  }
  const lf = (u: Unit): number => {
    const k = lotKey(u) * 16 + rank.get(u.id)!;
    return lotFwd.get(k)! / lotN.get(k)!;
  };
  // CÁNH (`flank`, vd. phòng không của đội hình Giữ / Hộ tống Pháo): rút ra khỏi các tuyến, lát nữa đứng hai đầu hàng giữa
  const flankCode = byRole ? FORMATIONS[f].flank : undefined;
  const flankers = flankCode ? units.filter((u) => UNITS[u.kind].group === flankCode && rank.get(u.id) !== REAR_RANK) : [];
  const onFlank = new Set(flankers.map((u) => u.id));
  const order = units.filter((u) => !onFlank.has(u.id)).sort((a, b) => rank.get(a.id)! - rank.get(b.id)! || lf(b) - lf(a) || lotKey(a) - lotKey(b) || fwd(b) - fwd(a) || a.id - b.id);
  const rows: Unit[][] = [];
  const ranks: number[] = [];
  for (let i = 0; i < order.length; ) {
    const rk = rank.get(order[i].id)!;
    let j = i;
    while (j < order.length && rank.get(order[j].id) === rk) j++;
    const k = j - i;
    const nRows = Math.ceil(k / cols);
    const base = Math.floor(k / nRows);
    const extra = k % nRows;
    let p = i;
    for (let r = 0; r < nRows; r++) {
      const cnt = base + (r < extra ? 1 : 0);
      // trong hàng: theo lô (lô lệch trái hơn đứng trái), trong lô theo chỗ đang lệch trái / phải
      const row = order.slice(p, p + cnt);
      const lotLat = new Map<number, number>();
      for (const u of row) lotLat.set(lotKey(u), (lotLat.get(lotKey(u)) ?? 0) + lat(u));
      rows.push(row.sort((a, b) => lotLat.get(lotKey(a))! - lotLat.get(lotKey(b))! || lotKey(a) - lotKey(b) || lat(a) - lat(b) || a.id - b.id));
      ranks.push(rk);
      p += cnt;
    }
    i = j;
  }
  // xe cánh đứng HAI ĐẦU HÀNG GIỮA (hàng không phải tuyến đầu, không phải đoạn hậu; hàng giữa nhất trước), lần lượt trái rồi phải, xe
  // đang lệch trái hơn sang trái: che sườn cho tuyến giữa (Pháo của đội Hộ tống). Đội toàn xe cánh thì xếp như thường
  if (flankers.length && rows.length) {
    const cand: number[] = [];
    for (let r = 0; r < rows.length; r++) if (ranks[r] !== ranks[0] && ranks[r] !== REAR_RANK) cand.push(r);
    if (!cand.length) for (let r = 0; r < rows.length; r++) cand.push(r);
    // hàng giữa nhất trước, rồi lan ra hai phía
    const mid = (cand.length - 1) / 2;
    cand.sort((a, b) => Math.abs(cand.indexOf(a) - mid) - Math.abs(cand.indexOf(b) - mid) || a - b);
    const fl = [...flankers].sort((a, b) => lat(a) - lat(b) || a.id - b.id);
    // trái lấy từ đầu danh sách (lệch trái nhất), phải lấy từ cuối
    let lo = 0;
    let hi = fl.length - 1;
    for (let k = 0; lo <= hi; k++) {
      const row = rows[cand[Math.floor(k / 2) % cand.length]];
      if (k % 2 === 0) row.unshift(fl[lo++]);
      else row.push(fl[hi--]);
    }
  } else if (flankers.length) {
    rows.push(flankers);
    ranks.push(0);
  }
  return { rows, ranks };
}

/**
 * Tọa độ ô của các hàng: hàng sau lùi tổng hai thân lớn nhất của hai hàng + ROW_GAP; trong hàng xe cạnh nhau cách tổng hai thân +
 * COL_GAP, hàng căn giữa. Tâm khối (giữa mép trước và mép sau) ở (0, 0). `r(i)` = bán kính thân của phần tử thứ i trong hàng.
 * Trả về lat / back theo thứ tự đọc và nửa bề ngang tới mép thân ngoài cùng.
 */
function layoutRows(rows: readonly (readonly number[])[], rowGap = ROW_GAP): { lat: number[][]; back: number[]; halfW: number; halfD: number } {
  const lat: number[][] = [];
  const back: number[] = [];
  let halfW = 0;
  let b = 0;
  for (let r = 0; r < rows.length; r++) {
    const rr = rows[r];
    let rowR = 0;
    for (const x of rr) rowR = Math.max(rowR, x);
    if (r > 0) {
      let prevR = 0;
      for (const x of rows[r - 1]) prevR = Math.max(prevR, x);
      b += prevR + rowR + rowGap;
    }
    back.push(b);
    const xs: number[] = [];
    let p = 0;
    for (let k = 0; k < rr.length; k++) {
      if (k > 0) p += rr[k - 1] + rr[k] + COL_GAP;
      xs.push(p);
    }
    const left = xs.length ? xs[0] - rr[0] : 0;
    const right = xs.length ? xs[xs.length - 1] + rr[rr.length - 1] : 0;
    const mid = (left + right) / 2;
    lat.push(xs.map((v) => v - mid));
    halfW = Math.max(halfW, (right - left) / 2);
  }
  let r0 = 0;
  let rl = 0;
  for (const x of rows[0] ?? []) r0 = Math.max(r0, x);
  for (const x of rows[rows.length - 1] ?? []) rl = Math.max(rl, x);
  const front = -r0;
  const rear = (back[back.length - 1] ?? 0) + rl;
  const midD = (front + rear) / 2;
  return { lat, back: back.map((v) => v - midD), halfW, halfD: (rear - front) / 2 };
}

/**
 * Đặt mẫu `cols` cột. cols ≥ số cột mẫu đầy đủ: mẫu đầy đủ (xếp theo vai lúc lập khối). Ít cột hơn (qua lối hẹp): xếp theo THỨ
 * TỰ XE ĐANG ĐI dọc đường (xe nào đang ở trước thì đi trước, trong hàng theo chỗ đang lệch trái / phải), như đoàn xe thật qua cầu:
 * trong lối hẹp không xe nào phải vượt xe nào. Ra chỗ rộng thì giãn lại mẫu đầy đủ (xe tự xếp lại theo vai). Ghi lat / back vào g.
 */
function relayout(this: World, g: Group, cols: number, role = true): void {
  const n = g.ids.length;
  let front0 = Infinity;
  for (let i = 0; i < n; i++) if (g.back[i] < front0) front0 = g.back[i];
  if (cols >= g.colsMax && role) {
    for (let i = 0; i < n; i++) {
      g.lat[i] = g.lat0[i];
      g.back[i] = g.back0[i];
    }
    g.cols = g.colsMax;
    g.halfW = g.halfWFor[g.colsMax - 1];
    g.role = true;
  } else {
    const { rows, L } = this.physicalLayout(g, Math.min(cols, g.colsMax));
    rows.forEach((r, ri) =>
      r.forEach((i, k) => {
        g.lat[i] = L.lat[ri][k];
        g.back[i] = L.back[ri];
      })
    );
    g.cols = Math.min(cols, g.colsMax);
    g.halfW = L.halfW;
    g.role = false;
  }
  // giữ nguyên chỗ HÀNG ĐẦU: khối dài ra / ngắn lại về phía sau (hàng đầu không bỗng tụt sau ô của nó)
  let front1 = Infinity;
  for (let i = 0; i < n; i++) if (g.back[i] < front1) front1 = g.back[i];
  if (front0 < Infinity && front1 < Infinity) g.s += front1 - front0;
}

/** Mẫu `cols` cột xếp theo thứ tự xe đang đi dọc đường (xem `relayout`): các hàng (chỉ số ô) và tọa độ ô. */
function physicalLayout(this: World, g: Group, cols: number): { rows: number[][]; L: ReturnType<typeof layoutRows> } {
  const n = g.ids.length;
  const [ax, az, tx, tz] = trailFrame(g, g.s);
  const key: number[] = [];
  const side: number[] = [];
  const live: number[] = [];
  for (let i = 0; i < n; i++) {
    const u = memberAt(this, g, i);
    const x = u ? u.x : g.sx[i];
    const z = u ? u.z : g.sz[i];
    key.push((x - ax) * tx + (z - az) * tz);
    side.push((x - ax) * tz - (z - az) * tx);
    live.push(i);
  }
  live.sort((a, b) => key[b] - key[a] || side[a] - side[b] || a - b);
  const nRows = Math.ceil(n / cols);
  const base = Math.floor(n / nRows);
  const extra = n % nRows;
  const rows: number[][] = [];
  let p = 0;
  for (let r = 0; r < nRows; r++) {
    const cnt = base + (r < extra ? 1 : 0);
    rows.push(live.slice(p, p + cnt).sort((a, b) => side[a] - side[b] || a - b));
    p += cnt;
  }
  const L = layoutRows(
    rows.map((r) => r.map((i) => bodyRadius((this.byId.get(g.ids[i]) as Unit | undefined)?.kind ?? "titan"))),
    MARCH_ROW_GAP
  );
  // lùi đo từ hàng đầu (neo = hàng đầu)
  const f0 = L.back.length ? L.back[0] : 0;
  for (let r = 0; r < L.back.length; r++) L.back[r] -= f0;
  return { rows, L };
}

/** Nửa bề ngang khối nếu dùng `cols` cột lúc này (mẫu đầy đủ đo sẵn; mẫu co cột theo đúng các xe sẽ nằm chung hàng). */
function widthFor(this: World, g: Group, cols: number): number {
  return cols >= g.colsMax ? g.halfWFor[g.colsMax - 1] : this.physicalLayout(g, cols).L.halfW;
}

// ------------------------------------------------------------------ lập khối

/** Lập khối cho các xe chiến đấu `units` (từ 2 xe) đi tới (x, z). Xem `Group` trong types.ts. */
function createGroup(this: World, side: Side, units: readonly Unit[], x: number, z: number, kind: "move" | "amove", chosen?: FormationId): void {
  const n = units.length;
  const current = this.formationOf(units);
  const formation = chosen ?? current ?? DEFAULT_FORMATION;
  if (current) for (const u of units) u.formation = current;
  let cx = 0;
  let cz = 0;
  for (const u of units) {
    cx += u.x / n;
    cz += u.z / n;
  }
  const f0 = units[0];
  const sameFace = (f0.faceX !== 0 || f0.faceZ !== 0) && units.every((u) => u.faceX * f0.faceX + u.faceZ * f0.faceZ > 0.999);
  const changed = chosen !== undefined && chosen !== current;
  // ĐÃ VÀO HÀNG: cùng tới nơi trong một khối (cùng hướng mặt), ai cũng còn đứng gần ô cuối của mình
  const formed = sameFace && !changed && units.every((u) => u.order === "idle" && !u.group && dist2(u.x, u.z, u.tx, u.tz) < 9);
  let fx = x - cx;
  let fz = z - cz;
  const dist = Math.sqrt(fx * fx + fz * fz);
  if (dist >= 2) {
    fx /= dist;
    fz /= dist;
  } else if (sameFace) {
    fx = f0.faceX;
    fz = f0.faceZ;
  } else {
    fx = 0;
    fz = 0;
    for (const u of units) {
      fx += u.hx;
      fz += u.hz;
    }
    const l = Math.sqrt(fx * fx + fz * fz);
    if (l < 1e-6) {
      fx = 0;
      fz = 1;
    } else {
      fx /= l;
      fz /= l;
    }
  }
  const turnBack = sameFace && fx * f0.faceX + fz * f0.faceZ < -0.2;
  // XẾP THEO VAI (giáp trước, pháo sau; người dùng 06/11/2026: "quân lộn xộn thì dựng đội hình theo vai"): quân chưa vào hàng, Tư lệnh
  // đổi kiểu đội hình, hay tấn công-di chuyển mà phải quay đầu (09/11: giáp phải ra trước). Đội ĐÃ VÀO HÀNG nhận lệnh đi thường thì
  // giữ chỗ đứng (06/11: quay đầu thì hàng sau thành hàng đầu, không ai băng qua đội)
  const byRole = !formed || changed || (kind === "amove" && turnBack);
  const g: Group = {
    id: this.nextId++,
    side,
    kind,
    formation,
    mode: "direct",
    ids: [],
    lat: [],
    back: [],
    lat0: [],
    back0: [],
    latS: [],
    backS: [],
    colsMax: 1,
    cols: 1,
    halfW: 0,
    halfWFor: [],
    path: [],
    cum: [],
    s: 0,
    v: 0,
    speed: 0,
    accel: 0,
    brake: 0,
    goalX: x,
    goalZ: z,
    faceX: fx,
    faceZ: fz,
    endX: [],
    endZ: [],
    sx: [],
    sz: [],
    psx: [],
    psz: [],
    wx0: [],
    wz0: [],
    wait: [],
    lagT: [],
    lagK: 1,
    role: true,
    endFit: false,
    vs: [],
    dx: [],
    dz: [],
    pace: [],
    revMax: REVERSE_MAX,
    hold: false,
    holdT: -1000,
    holdFrom: -1000,
    noHold: -1000,
    t: 0,
    doneT: -1,
    wideFor: 0,
    colsT: -1000,
    bestD: [],
    progT: 0,
    engagedNow: 0,
    engagedPrev: 0
  };
  // tốc độ khối và quán tính của neo
  let slowest = Infinity;
  let sum = 0;
  let acc = Infinity;
  let brk = Infinity;
  for (const u of units) {
    const sp = UNITS[u.kind].speed;
    slowest = Math.min(slowest, sp);
    sum += sp;
    acc = Math.min(acc, accelOf(u.kind));
    brk = Math.min(brk, brakeOf(u.kind));
  }
  g.speed = Math.min(sum / n, slowest * RULES.escortBoost) * BLOCK_K;
  g.accel = acc * ANCHOR_ACCEL_K;
  g.brake = brk * ANCHOR_BRAKE_K;
  const ignore = new Set(units.map((u) => u.id));

  // ---- DỊCH NGUYÊN KHỐI (đội đã vào hàng, quãng ngắn; người dùng duyệt 06/11/2026): giữ nguyên hình khối, mỗi xe tịnh tiến song song,
  // tới nơi quay mặt về hướng vừa đi (quay đầu thì hàng sau thành hàng đầu, không ai đổi chỗ)
  if (formed && dist <= DIRECT_MAX && !(kind === "amove" && turnBack)) {
    let hx = 0;
    let hz = 0;
    for (const u of units) {
      hx += u.tx / n;
      hz += u.tz / n;
    }
    const ox = x - hx;
    const oz = z - hz;
    const ends = units.map((u): [number, number] => [u.tx + ox, u.tz + oz]);
    if (ends.every(([ex, ez], k) => this.slotOk(units[k], ex, ez, x, z, ignore)) && units.every((u, k) => this.grid.los(u.x, u.z, ends[k][0], ends[k][1], wallRadius(u.kind)))) {
      this.startDirect(g, units, ends);
      return;
    }
  }

  // ---- mẫu đầy đủ theo hướng đi
  const colsMax = colsFor(n, formation);
  const { rows } = rowsFor(units, cx, cz, fx, fz, formation, byRole, colsMax);
  // hai mẫu cùng thứ tự: mẫu hành quân (hàng giãn MARCH_ROW_GAP) và mẫu đứng ở đích (hàng khép ROW_GAP)
  const radii = rows.map((r) => r.map((u) => bodyRadius(u.kind)));
  const L0 = layoutRows(radii, MARCH_ROW_GAP);
  const LE = layoutRows(radii);
  const latE: number[] = [];
  const backE: number[] = [];
  rows.forEach((r, ri) =>
    r.forEach((_u, k) => {
      latE.push(LE.lat[ri][k]);
      backE.push(LE.back[ri]);
    })
  );
  // mẫu hành quân đo lùi từ HÀNG ĐẦU (neo = hàng đầu): hàng đầu lùi 0, các hàng sau lùi dần
  const front0 = L0.back.length ? L0.back[0] : 0;
  rows.forEach((r, ri) =>
    r.forEach((u, k) => {
      g.ids.push(u.id);
      g.lat0.push(L0.lat[ri][k]);
      g.back0.push(L0.back[ri] - front0);
      g.lat.push(L0.lat[ri][k]);
      g.back.push(L0.back[ri] - front0);
      g.latS.push(L0.lat[ri][k]);
      g.backS.push(L0.back[ri] - front0);
    })
  );
  g.colsMax = colsMax;
  g.cols = colsMax;
  g.halfW = L0.halfW;
  const unitsInOrder = g.ids.map((id) => this.byId.get(id) as Unit);

  // ---- hình cuối: tâm ở điểm bấm, quay theo hướng đi, dời cho vừa chỗ
  const [ex, ez] = this.fitEnd(unitsInOrder, latE, backE, x, z, fx, fz, ignore, colsMax);

  // ---- quãng ngắn, mọi xe nhìn thẳng thấy ô cuối, không phải xếp lại theo vai: mỗi xe chạy thẳng tới ô (phân ô tối ưu: đường không
  // cắt nhau). Quân lộn xộn phải xếp theo vai thì hành quân theo neo kể cả quãng ngắn: khối vừa đi vừa tự xếp, xe tới ô hàng sau
  // không đứng chắn xe đang lên hàng đầu
  if (dist <= DIRECT_MAX && !byRole) {
    const perm = this.assignSlots(unitsInOrder, ex, ez);
    const us = perm.map((k) => unitsInOrder[k]);
    if (us.every((u, k) => this.grid.los(u.x, u.z, ex[k], ez[k], wallRadius(u.kind)))) {
      this.startDirect(g, us, ex.map((v, k): [number, number] => [v, ez[k]]), true);
      return;
    }
  }

  // ---- HÀNH QUÂN: neo chạy trên một đường A* chung theo bề ngang xe to nhất, kiểu xe chậm nhất
  const gx = this.goalCenter(ex, ez);
  let half = 0.71;
  let mob: Mobility = "track";
  let slow = Infinity;
  for (const u of units) {
    half = Math.max(half, wallRadius(u.kind));
    if (UNITS[u.kind].speed < slow) {
      slow = UNITS[u.kind].speed;
      mob = UNITS[u.kind].mobility ?? "wheel";
    }
  }
  // ĐƯỜNG CHUNG BẮT ĐẦU Ở MÉP SAU đám xe (theo hướng đi) và neo (hàng đầu) xuất phát ở đúng độ sâu của khối: mọi hàng đã nằm trên
  // đường thật ngay từ đầu, đoạn vệt đầu đường đi qua chính chỗ các xe đang đứng (không phải kéo dài vệt ra sau vào vách / bãi quặng)
  let behind = Infinity;
  for (const u of units) behind = Math.min(behind, (u.x - cx) * fx + (u.z - cz) * fz);
  let sx0 = cx + fx * behind;
  let sz0 = cz + fz * behind;
  if (this.grid.blockedAt(sx0, sz0) || this.grid.clearanceAt(sx0, sz0) < half || !this.grid.los(cx, cz, sx0, sz0)) {
    const f = this.grid.nearestFree(sx0, sz0, 6, (px, pz) => this.grid.clearanceAt(px, pz) >= half && this.grid.los(cx, cz, px, pz)) ?? this.grid.nearestFree(cx, cz, 6, (px, pz) => this.grid.clearanceAt(px, pz) >= half);
    if (f) [sx0, sz0] = f;
  }
  // neo dừng ở hàng đầu của hình cuối
  let frontE = 0;
  for (const b of backE) frontE = Math.min(frontE, b);
  let gxa = gx[0] - fx * frontE;
  let gza = gx[1] - fz * frontE;
  if (this.grid.blockedAt(gxa, gza) || this.grid.clearanceAt(gxa, gza) < half || !this.grid.los(gx[0], gx[1], gxa, gza)) {
    gxa = gx[0];
    gza = gx[1];
  }
  const field = this.grid.field(mob, false);
  const layer = this.anchorLayer(-1, ignore);
  let p = this.grid.findPath(sx0, sz0, gxa, gza, field, half, layer);
  // mép sau đám xe rơi vào TÚI (vài xe đứng trong hốc đá / sát mép bản đồ): đường từ đó phải vòng ra cửa túi. Thử thêm tâm và mép
  // trước đám xe; lấy chỗ có tổng quãng nhỏ nhất = độ dài đường + phần xuất phát lên trước mép sau (xe sau phải đi bù phần đó), hơn
  // POCKET_MARGIN m mới đổi (người dùng 17/11/2026: "đường đi ra bãi trống, không vòng qua túi")
  if (p) {
    let ahead = -Infinity;
    for (const u of units) ahead = Math.max(ahead, (u.x - cx) * fx + (u.z - cz) * fz);
    let bestCost = polyLen(sx0, sz0, p);
    for (const k of [0, ahead]) {
      let px = cx + fx * k;
      let pz = cz + fz * k;
      if (this.grid.blockedAt(px, pz) || this.grid.clearanceAt(px, pz) < half) {
        const f = this.grid.nearestFree(px, pz, 6, (qx, qz) => this.grid.clearanceAt(qx, qz) >= half);
        if (!f) continue;
        [px, pz] = f;
      }
      const q = this.grid.findPath(px, pz, gxa, gza, field, half, layer);
      if (!q) continue;
      const lead = (px - sx0) * fx + (pz - sz0) * fz;
      const cost = polyLen(px, pz, q) + (lead > 0 ? lead : 0);
      if (cost + POCKET_MARGIN < bestCost) {
        bestCost = cost;
        sx0 = px;
        sz0 = pz;
        p = q;
      }
    }
  }
  if (!p) {
    // không có đường chung cho xe to nhất: mỗi xe tự tìm đường tới ô cuối
    const perm = this.assignSlots(unitsInOrder, ex, ez);
    this.startDirect(
      g,
      perm.map((k) => unitsInOrder[k]),
      ex.map((v, k): [number, number] => [v, ez[k]]),
      true
    );
    return;
  }
  g.mode = "march";
  g.path = [sx0, sz0, ...p];
  g.cum = [0];
  for (let k = 2; k < g.path.length; k += 2) g.cum.push(g.cum[g.cum.length - 1] + Math.sqrt(dist2(g.path[k - 2], g.path[k - 1], g.path[k], g.path[k + 1])));
  // neo xuất phát ở độ sâu khối (hàng cuối ở đầu đường), không quá nửa đường
  let depth = 0;
  for (const b of g.back) depth = Math.max(depth, b);
  g.s = Math.min(depth, g.cum[g.cum.length - 1] * 0.5);
  // nửa bề ngang mẫu đầy đủ (mẫu co cột đo lúc cần, `widthFor`)
  for (let c = 1; c < colsMax; c++) g.halfWFor.push(0);
  g.halfWFor.push(L0.halfW);
  g.endX = ex;
  g.endZ = ez;
  // phân ô ở chỗ xuất phát (mẫu đặt quanh tâm, quay theo hướng đầu đường): xe vào hàng ngắn nhất, không cắt nhau
  const startX: number[] = [];
  const startZ: number[] = [];
  for (let i = 0; i < g.ids.length; i++) {
    const [px, pz] = rawSlot(g, i, g.s);
    startX.push(px);
    startZ.push(pz);
  }
  const perm = this.assignSlots(unitsInOrder, startX, startZ);
  g.ids = perm.map((k) => unitsInOrder[k].id);
  // hàng nằm sau đầu đường (chỉ khi đường ngắn hơn độ sâu khối): cả đoạn vệt kéo dài từ ô xuất phát tới đầu đường đi được thì bám
  // vệt, không thì xe đứng chờ tại chỗ tới lượt
  for (let i = 0; i < g.ids.length; i++) {
    const u = unitsInOrder[perm[i]];
    let ok = true;
    if (g.s - g.back[i] < 0) {
      const [ax0, az0] = rawSlot(g, i, g.back[i]);
      ok = slotFree(this, g, u, startX[i], startZ[i]) && this.grid.los(startX[i], startZ[i], ax0, az0, wallRadius(u.kind));
    }
    g.wait.push(!ok);
    g.wx0.push(u.x);
    g.wz0.push(u.z);
  }
  for (let i = 0; i < g.ids.length; i++) {
    const [px, pz] = this.trailSlot(g, i, g.s);
    g.sx.push(px);
    g.sz.push(pz);
    g.psx.push(px);
    g.psz.push(pz);
    g.pace.push(0);
    g.lagT.push(0);
    g.vs.push(0);
    g.dx.push(fx);
    g.dz.push(fz);
  }
  this.adoptMembers(g);
  this.groups.push(g);
}

/** Gắn xe vào khối: ô, lệnh, hướng mặt cuối; xóa đường riêng. */
function adoptMembers(this: World, g: Group): void {
  g.ids.forEach((id, i) => {
    const u = this.byId.get(id) as Unit;
    u.group = g.id;
    u.slot = i;
    u.order = g.kind;
    u.targetId = 0;
    u.autoTarget = 0;
    u.chasing = false;
    u.path = [];
    u.pathI = 0;
    u.homeT = 0;
    u.avoidId = 0;
    u.tx = g.endX[i];
    u.tz = g.endZ[i];
    u.faceX = g.faceX;
    u.faceZ = g.faceZ;
  });
}

/**
 * Khối ĐI THẲNG TỚI Ô: xe `us[k]` tới ô `ends[k]`; tốc độ mỗi xe chia theo quãng để cả khối tới cùng lúc (xe xa nhất chạy hết
 * tốc độ của nó). Xe nào không nhìn thẳng thấy ô (`paths`) thì tự tìm đường A* tới ô.
 */
function startDirect(this: World, g: Group, us: readonly Unit[], ends: readonly (readonly [number, number])[], paths = false): void {
  g.mode = "direct";
  g.ids = us.map((u) => u.id);
  g.endX = ends.map((e) => e[0]);
  g.endZ = ends.map((e) => e[1]);
  let T = 0;
  const d = us.map((u, k) => Math.sqrt(dist2(u.x, u.z, ends[k][0], ends[k][1])));
  us.forEach((u, k) => {
    const v = Math.min(UNITS[u.kind].speed, g.speed / BLOCK_K);
    T = Math.max(T, d[k] / v);
  });
  g.pace = us.map((u, k) => Math.max(UNITS[u.kind].speed * 0.3, T > 1e-6 ? d[k] / T : UNITS[u.kind].speed));
  g.doneT = sec(T) + DIRECT_WAIT;
  g.sx = g.endX.slice();
  g.sz = g.endZ.slice();
  g.psx = g.endX.slice();
  g.psz = g.endZ.slice();
  this.adoptMembers(g);
  if (paths)
    us.forEach((u, k) => {
      if (!this.grid.los(u.x, u.z, ends[k][0], ends[k][1], wallRadius(u.kind))) this.setPath(u, ends[k][0], ends[k][1]);
    });
  this.groups.push(g);
}

/**
 * Phân xe vào ô (x[k], z[k]) tối ưu theo bình phương quãng; chỉ đổi giữa xe cùng loại (ô xếp theo cỡ thân) và cùng lô (xe cùng lô đứng
 * liền nhau). Trả về chỉ số xe theo ô.
 */
function assignSlots(this: World, us: readonly Unit[], x: readonly number[], z: readonly number[]): number[] {
  const cost = x.map((px, k) => us.map((u) => (u.kind === us[k].kind && u.lot === us[k].lot ? dist2(u.x, u.z, px, z[k]) : 1e12)));
  return assignMin(cost);
}

/**
 * Ô (px, pz) đứng được cho xe u trong hình cuối có tâm (ox, oz): vừa thân, cùng tầng và cùng khoảng trống với tâm, không nằm trên
 * dốc (dốc là lối đi: xe đỗ trên dốc chắn đường đồng đội), không đè xe đứng ngoài lệnh.
 */
function slotOk(this: World, u: Unit, px: number, pz: number, ox: number, oz: number, ignore: ReadonlySet<number>): boolean {
  if (!this.map.fits(px, pz, 1, 1) || !this.bodyFits(u, px, pz)) return false;
  if (this.nearRamp(px, pz) || this.map.tierAt(px, pz) !== this.map.tierAt(ox, oz)) return false;
  if (!this.grid.los(ox, oz, px, pz)) return false;
  // tới được từ tâm hình cuối với ĐÚNG CỠ xe đó (ô trong hốc thềm mà xe to không lọt: Tên Lửa Loạt húc vách mãi)
  if (!this.grid.reachable(ox, oz, px, pz, Math.max(0.71, wallRadius(u.kind)))) return false;
  return !this.standingAt(px, pz, bodyRadius(u.kind), ignore);
}

/** Điểm (x, z) nằm trên khối dốc (mặt đất không ở đúng một tầng). */
function onRamp(this: World, x: number, z: number): boolean {
  const y = this.map.groundY(x, z);
  return Math.abs(y - this.map.tierAt(x, z) * TIER_H) > 0.3;
}

/** Trên dốc hoặc ngay miệng dốc (trong RAMP_KEEP m): không đỗ xe ở đây, để trống lối lên xuống. */
const RAMP_KEEP = 3;
function nearRamp(this: World, x: number, z: number): boolean {
  return this.onRamp(x, z) || this.onRamp(x + RAMP_KEEP, z) || this.onRamp(x - RAMP_KEEP, z) || this.onRamp(x, z + RAMP_KEEP) || this.onRamp(x, z - RAMP_KEEP);
}

/**
 * Hình cuối: mẫu (lat, back) đặt tâm ở (x, z), quay theo (fx, fz). Thử dời tâm theo FIT_SHIFTS cho mọi ô đứng được (đích sát vách
 * / bãi đá thì dạt ngang, hết cách thì dừng trước đích); vẫn không vừa thì thử mẫu ÍT CỘT HƠN (thêm hàng, cùng thứ tự đọc `us`)
 * cho khối gọn trong chỗ trống (thềm nhỏ, bãi hẹp), không dồn ô lẻ ra chắn lối vào. Hết cách mới tìm ô trống gần nhất cho từng ô
 * vướng. Trả về ô cuối theo thứ tự ô.
 */
function fitEnd(this: World, us: readonly Unit[], lat: readonly number[], back: readonly number[], x: number, z: number, fx: number, fz: number, ignore: ReadonlySet<number>, cols = 0): [number[], number[]] {
  const rx = fz;
  const rz = -fx;
  const layouts: { lat: readonly number[]; back: readonly number[] }[] = [{ lat, back }];
  for (let c = cols - 1; c >= 1; c--) {
    const n = us.length;
    const nRows = Math.ceil(n / c);
    const base = Math.floor(n / nRows);
    const extra = n % nRows;
    const rows: number[][] = [];
    let p = 0;
    for (let r = 0; r < nRows; r++) {
      const cnt = base + (r < extra ? 1 : 0);
      const row: number[] = [];
      for (let k = 0; k < cnt; k++) row.push(p + k);
      rows.push(row);
      p += cnt;
    }
    const L = layoutRows(rows.map((r) => r.map((i) => bodyRadius(us[i].kind))));
    const la = new Array<number>(n);
    const ba = new Array<number>(n);
    rows.forEach((r, ri) =>
      r.forEach((i, k) => {
        la[i] = L.lat[ri][k];
        ba[i] = L.back[ri];
      })
    );
    layouts.push({ lat: la, back: ba });
  }
  let best = 0;
  let bestL = 0;
  let bestBad = Infinity;
  for (let li = 0; li < layouts.length && bestBad > 0; li++) {
    const { lat: la, back: ba } = layouts[li];
    for (let s = 0; s < FIT_SHIFTS.length; s++) {
      const [sl, sb] = FIT_SHIFTS[s];
      const ox = x + rx * sl - fx * sb;
      const oz = z + rz * sl - fz * sb;
      if (this.grid.blockedAt(ox, oz)) continue;
      let bad = 0;
      for (let i = 0; i < us.length && bad < bestBad; i++) {
        const px = ox + rx * la[i] - fx * ba[i];
        const pz = oz + rz * la[i] - fz * ba[i];
        if (!this.slotOk(us[i], px, pz, ox, oz, ignore)) bad++;
      }
      if (bad < bestBad) {
        bestBad = bad;
        best = s;
        bestL = li;
        if (bad === 0) break;
      }
    }
  }
  const [sl, sb] = FIT_SHIFTS[best];
  const { lat: la, back: ba } = layouts[bestL];
  const ox = x + rx * sl - fx * sb;
  const oz = z + rz * sl - fz * sb;
  const ex: number[] = [];
  const ez: number[] = [];
  const used = new Set<number>();
  const taken: Taken = { x: [], z: [], r: [] };
  const okI: boolean[] = [];
  // ô của mẫu đứng được thì giữ trước (các ô mẫu đã cách nhau đủ), ô vướng tìm chỗ sau, không đè lên ô nào đã giữ
  for (let i = 0; i < us.length; i++) {
    const px = ox + rx * la[i] - fx * ba[i];
    const pz = oz + rz * la[i] - fz * ba[i];
    const ok = this.slotOk(us[i], px, pz, ox, oz, ignore) && !used.has(this.grid.index(px, pz));
    okI.push(ok);
    ex.push(px);
    ez.push(pz);
    if (ok) {
      used.add(this.grid.index(px, pz));
      taken.x.push(px);
      taken.z.push(pz);
      taken.r.push(bodyRadius(us[i].kind));
    }
  }
  for (let i = 0; i < us.length; i++) if (!okI[i]) [ex[i], ez[i]] = this.freeSpot(us[i], ex[i], ez[i], used, ignore, this.map.tierAt(ox, oz), fx, fz, taken, [ox, oz]);
  return [ex, ez];
}

/** Tâm của hình cuối (trung bình các ô cuối). */
function goalCenter(this: World, ex: readonly number[], ez: readonly number[]): [number, number] {
  let x = 0;
  let z = 0;
  for (let i = 0; i < ex.length; i++) {
    x += ex[i] / ex.length;
    z += ez[i] / ex.length;
  }
  return [x, z];
}

/** Đường từ tâm đám xe phải ngắn hơn đường từ mép sau (đã trừ phần lùi) ít nhất chừng này (m) mới đổi chỗ xuất phát. */
const POCKET_MARGIN = 5;

/** Chiều dài đường gấp khúc từ (x, z) qua các điểm `p`. */
function polyLen(x: number, z: number, p: readonly number[]): number {
  let s = 0;
  for (let k = 0; k + 1 < p.length; k += 2) {
    s += Math.sqrt(dist2(x, z, p[k], p[k + 1]));
    x = p[k];
    z = p[k + 1];
  }
  return s;
}

// ------------------------------------------------------------------ vệt đường của neo

/** Điểm trên đường chung ở quãng s (m): trước điểm đầu / sau điểm cuối thì kéo dài theo đoạn đầu / đoạn cuối. */
function pathPoint(g: Group, s: number): [number, number] {
  const P = g.path;
  const C = g.cum;
  const m = C.length;
  if (m < 2) return [P[0], P[1]];
  let k: number;
  if (s <= 0) k = 0;
  else if (s >= C[m - 1]) k = m - 2;
  else {
    let lo = 0;
    let hi = m - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (C[mid] <= s) lo = mid;
      else hi = mid;
    }
    k = lo;
  }
  const len = C[k + 1] - C[k];
  const t = len > 1e-9 ? (s - C[k]) / len : 0;
  const ax = P[k * 2];
  const az = P[k * 2 + 1];
  return [ax + (P[k * 2 + 2] - ax) * t, az + (P[k * 2 + 3] - az) * t];
}

/** Điểm vệt và hướng dây cung ở quãng sb (m) của đường chung: [x, z, hướng x, hướng z]. */
function trailFrame(g: Group, sb: number): [number, number, number, number] {
  const w = Math.max(FRAME_W_MIN, g.halfW);
  const [px, pz] = pathPoint(g, sb);
  const [ax, az] = pathPoint(g, sb - w);
  const [bx, bz] = pathPoint(g, sb + w);
  let tx = bx - ax;
  let tz = bz - az;
  const l = Math.sqrt(tx * tx + tz * tz);
  if (l < 1e-6) {
    tx = g.faceX;
    tz = g.faceZ;
  } else {
    tx /= l;
    tz /= l;
  }
  return [px, pz, tx, tz];
}

/** Ô thứ i theo đúng hình học vệt (chưa kiểm vật cản): điểm vệt ở s − back, lệch ngang lat theo hướng dây cung ở đó. */
function rawSlot(g: Group, i: number, s: number): [number, number] {
  const [px, pz, tx, tz] = trailFrame(g, s - g.back[i]);
  return [px + tz * g.lat[i], pz - tx * g.lat[i]];
}

/** Xe u đứng được ở (x, z) và (x, z) thông với chỗ xuất phát của neo. */
function slotFree(w: World, g: Group, u: Unit | null, x: number, z: number): boolean {
  const wr = u ? wallRadius(u.kind) : 1;
  return !w.grid.blockedAt(x, z) && w.grid.clearanceAt(x, z) >= wr && w.grid.los(g.path[0], g.path[1], x, z);
}

/**
 * Ô thứ i khi neo ở quãng s (chỉ theo vệt, chưa pha hình cuối). Lưới an toàn:
 *  - hàng chưa tới lượt vào đường (s − back < 0, vệt kéo dài ra sau chỗ xuất phát) mà chỗ kéo dài vướng vách / không thông với
 *    chỗ xuất phát: ô chờ ở chỗ xuất phát của xe (`wx0`), tới lượt mới nhập vào đoàn (xếp hàng qua cửa hẹp);
 *  - ô rơi vào vách / sát vách hơn thân xe thì co lệch ngang về phía đường (lối hẹp chưa kịp co cột).
 */
function trailSlot(this: World, g: Group, i: number, s: number): [number, number] {
  const sb = s - g.backS[i];
  const [px, pz, tx, tz] = trailFrame(g, sb);
  // hàng chưa tới lượt vào đường mà phải đứng chờ (quyết định một lần lúc lập khối): ô là chỗ xuất phát của xe
  if (sb < 0 && g.wait[i]) return [g.wx0[i], g.wz0[i]];
  return [px + tz * g.latS[i], pz - tx * g.latS[i]];
}

/**
 * Lệch ngang muốn của ô thứ i lúc neo ở quãng s: lệch theo mẫu, co dần về phía đường nếu ô rơi vào vách / sát vách hơn thân xe
 * (lối hẹp chưa kịp co cột).
 */
function latTarget(this: World, g: Group, i: number, s: number): number {
  const sb = s - g.back[i];
  if (sb < 0) return g.lat[i];
  const [px, pz, tx, tz] = trailFrame(g, sb);
  const e = this.byId.get(g.ids[i]);
  const wr = e && e.cat === "unit" ? wallRadius(e.kind) : 1;
  let lat = g.lat[i];
  for (let k = 0; k < 4; k++) {
    const x = px + tz * lat;
    const z = pz - tx * lat;
    if (!this.grid.blockedAt(x, z) && this.grid.clearanceAt(x, z) >= wr) return lat;
    lat *= 0.6;
  }
  return lat;
}

/**
 * Ô thứ i khi neo ở quãng s: theo vệt; ô vệt tới gần ô cuối (trong END_BLEND + nửa bề ngang khối) thì chuyển dần sang ô cuối. Neo
 * tới nơi thì mọi ô là ô cuối: đuôi đoàn còn ở xa tự chạy nốt về ô (đoàn xe thật cũng vậy), neo không phải chờ.
 */
function slotAt(this: World, g: Group, i: number, s: number): [number, number] {
  if (g.doneT >= 0) return [g.endX[i], g.endZ[i]];
  const B = END_BLEND + g.halfW;
  const [px, pz] = this.trailSlot(g, i, s);
  const d = Math.sqrt(dist2(px, pz, g.endX[i], g.endZ[i]));
  if (d >= B) return [px, pz];
  const a = 1 - d / B;
  return [px + (g.endX[i] - px) * a, pz + (g.endZ[i] - pz) * a];
}

// ------------------------------------------------------------------ mỗi tick

function updateGroups(this: World): void {
  if (!this.groups.length) return;
  for (const g of this.groups) this.stepGroup(g);
  this.groups = this.groups.filter((g) => g.ids.length > 0);
}

/** Xe thứ i của khối nếu còn sống và còn thuộc khối. */
function memberAt(w: World, g: Group, i: number): Unit | null {
  const id = g.ids[i];
  if (!id) return null;
  const u = w.byId.get(id);
  return u && u.cat === "unit" && u.hp > 0 && u.group === g.id ? u : null;
}

/** Tính lại ưu tiên trong khối mỗi chừng này tick. */
const PRIO_EVERY = 5;
const PRIO_KEY: number[] = [];
const PRIO_IDX: number[] = [];
/**
 * Ưu tiên trong khối (`Unit.gprio`): ô ở trước trên đường đi của khối thì ưu tiên hơn. Hành quân (neo chưa tới cuối): theo độ lùi
 * của ô trong mẫu đang dùng (`backS`; co hàng qua lối hẹp thì theo đúng thứ tự cột); đi thẳng tới ô / neo đã tới: theo hàng của ô
 * cuối (hàng trước trước). Bằng nhau thì theo số ô (tất định, hai phe soi gương như nhau).
 */
function groupPriority(this: World, g: Group): void {
  const n = g.ids.length;
  PRIO_KEY.length = 0;
  PRIO_IDX.length = 0;
  const end = g.mode === "direct" || g.doneT >= 0;
  for (let i = 0; i < n; i++) {
    PRIO_IDX.push(i);
    PRIO_KEY.push(end ? -((g.endX[i] - g.goalX) * g.faceX + (g.endZ[i] - g.goalZ) * g.faceZ) : g.backS[i]);
  }
  PRIO_IDX.sort((a, b) => PRIO_KEY[a] - PRIO_KEY[b] || a - b);
  for (let r = 0; r < n; r++) {
    const u = memberAt(this, g, PRIO_IDX[r]);
    if (u) u.gprio = r;
  }
}

function stepGroup(this: World, g: Group): void {
  g.t++;
  if (g.t % SWAP_EVERY === 0) this.swapSlots(g);
  if ((g.t - 1) % PRIO_EVERY === 0) this.groupPriority(g);
  let alive = 0;
  for (let i = 0; i < g.ids.length; i++) if (memberAt(this, g, i)) alive++;
  if (alive === 0) {
    g.ids = [];
    return;
  }
  // ĐỦ QUÂN MỚI DỪNG ĐÁNH: đếm theo tick trước (không phụ thuộc thứ tự duyệt xe)
  g.engagedPrev = g.engagedNow;
  g.engagedNow = 0;
  if (g.kind === "amove") {
    let armed = 0;
    for (let i = 0; i < g.ids.length; i++) {
      const u = memberAt(this, g, i);
      if (u && UNITS[u.kind].weapon) armed++;
    }
    const need = Math.max(1, Math.ceil(armed * (g.hold ? HOLD_KEEP : HOLD_QUORUM)));
    if (g.engagedPrev >= need && this.tick >= g.noHold) {
      if (!g.hold) g.holdFrom = this.tick;
      g.hold = true;
      g.holdT = this.tick;
    }
  }
  if (g.hold && this.tick - g.holdT > HOLD_RESUME) g.hold = false;
  // DỪNG ĐÁNH VÔ ÍCH: địch nấp sau vách / mép rừng chỉ thoáng hiện, cả khối đứng chờ mà không xe nào bắn được: quá HOLD_FUTILE thì đi
  // tiếp một quãng (vừa đi vừa bắn, đổi chỗ đứng là đổi tầm nhìn), không đứng chờ bóng ma
  if (g.hold && this.tick - g.holdFrom > HOLD_FUTILE) {
    let last = -1000;
    for (let i = 0; i < g.ids.length; i++) {
      const u = memberAt(this, g, i);
      if (u && u.lastShot > last) last = u.lastShot;
    }
    if (this.tick - last > HOLD_FUTILE) {
      g.hold = false;
      g.noHold = this.tick + HOLD_FUTILE;
    }
  }
  if (g.mode === "direct") {
    // xong khi mọi xe đã tới ô và đứng; hết giờ dự kiến mà không còn xe nào tiến thì tan (xe còn lại tự về ô của nó)
    if (this.endProgress(g) || (g.t > g.doneT && g.t - g.progT > END_STALL)) this.finishGroup(g);
    return;
  }
  this.marchAnchor(g);
  // neo đã tới: tan khi mọi xe vào ô, hoặc END_STALL liền không xe nào lại gần ô thêm (đoàn dài qua cầu cần lâu hơn một mốc cố định)
  if (g.doneT >= 0 && (this.endProgress(g) || g.t - Math.max(g.progT, g.doneT) > END_STALL || g.t - g.doneT > END_MAX)) this.finishGroup(g);
}

/** Mọi xe đã vào ô cuối và đứng chưa; ghi tiến độ (`bestD`, `progT`): có xe lại gần ô thêm END_STEP m là còn tiến. */
function endProgress(this: World, g: Group): boolean {
  let all = true;
  for (let i = 0; i < g.ids.length; i++) {
    const u = memberAt(this, g, i);
    if (!u) continue;
    const d2 = dist2(u.x, u.z, g.endX[i], g.endZ[i]);
    if (d2 > 0.81 || u.speed !== 0) all = false;
    const d = Math.sqrt(d2);
    if (g.bestD[i] === undefined || d < g.bestD[i] - END_STEP) {
      g.bestD[i] = d;
      g.progT = g.t;
    }
  }
  return all;
}

/** Lượt đổi ô mỗi chừng này tick; đổi khi tổng bình phương quãng giảm hơn SWAP_GAIN m² và hơn SWAP_K phần. */
const SWAP_EVERY = 5;
const SWAP_GAIN = 1;
const SWAP_K = 0.15;

/**
 * ĐỔI Ô Ở ĐÍCH (GAP2 ch. 20; Pottinger): neo đã tới, hai xe CÙNG LOẠI, CÙNG LÔ mà đổi ô cuối cho nhau thì tổng bình phương quãng giảm
 * rõ thì đổi (ô phân theo bình phương quãng không cắt đường nhau). Thứ tự trong cột đổi trên đường (hai khối cắt nhau, đoàn qua cầu
 * hàng một, xe bị đẩy dạt) thì ô cuối theo kịp: xe tới trước nhận ô gần nó, không băng ngang trước mũi xe tới sau, không đối đầu
 * đổi chỗ ở đích.
 */
function swapSlots(this: World, g: Group): void {
  if (g.mode !== "march" || g.doneT < 0) return;
  const n = g.ids.length;
  for (let i = 0; i < n; i++) {
    const a = memberAt(this, g, i);
    if (!a) continue;
    for (let j = i + 1; j < n; j++) {
      const b = memberAt(this, g, j);
      if (!b || b.kind !== a.kind || b.lot !== a.lot) continue;
      const now = dist2(a.x, a.z, g.endX[i], g.endZ[i]) + dist2(b.x, b.z, g.endX[j], g.endZ[j]);
      const swp = dist2(a.x, a.z, g.endX[j], g.endZ[j]) + dist2(b.x, b.z, g.endX[i], g.endZ[i]);
      if (now - swp <= SWAP_GAIN || swp > now * (1 - SWAP_K)) continue;
      g.ids[i] = b.id;
      g.ids[j] = a.id;
      a.slot = j;
      b.slot = i;
      a.tx = g.endX[j];
      a.tz = g.endZ[j];
      b.tx = g.endX[i];
      b.tz = g.endZ[i];
      a.path = [];
      a.pathI = 0;
      b.path = [];
      b.pathI = 0;
      g.bestD[i] = Infinity;
      g.bestD[j] = Infinity;
      break;
    }
  }
}

/** Neo một tick: co / giãn cột, tốc độ (khối, đích, xe tụt, ô ở mép cua), rồi đặt ô mới của từng xe. */
function marchAnchor(this: World, g: Group): void {
  const L = g.cum[g.cum.length - 1];
  // khối đã bắt đầu mở ra thành hình cuối (`refitEnd`) thì thôi co / giãn: hình cuối tự chọn số cột vừa chỗ (`fitEnd`)
  if ((g.t + g.id) % 3 === 0 && g.s < L && !g.endFit) this.fitWidth(g);
  // lệch ngang / lùi của từng ô đổi dần tới mẫu mới (co / giãn cột, co sát vách): khối biến hình êm, ô không nhảy cóc. Ô chỉ biến
  // hình bằng PHẦN TỐC ĐỘ CÒN DƯ của xe nó (xe đang chạy hết sức thì ô dịch chậm lại, tối thiểu MORPH_MIN): ô dịch nhanh hơn sức xe thì
  // bộ giới hạn bên dưới phải phanh gấp cả khối, xe đuổi ô lao quá ô rồi hãm tụt, cả khối tăng–hãm liên tục
  for (let i = 0; i < g.ids.length; i++) {
    const u = memberAt(this, g, i);
    const cap = u ? this.speedOf(u) * 0.95 : Infinity;
    const latMax = Math.max(MORPH_MIN, Math.min(LAT_RATE, Math.sqrt(Math.max(0, cap * cap - g.v * g.v))));
    const lt = this.latTarget(g, i, g.s);
    g.latS[i] += clamp(lt - g.latS[i], -latMax * DT, latMax * DT);
    // ô dồn lên (lùi ít đi) là ô chạy nhanh hơn neo: chỉ bằng phần dư; ô lùi lại (chậm hơn neo) thì thoải mái
    const fwdMax = Math.max(MORPH_MIN, Math.min(BACK_RATE, cap - g.v));
    g.backS[i] += clamp(g.back[i] - g.backS[i], -fwdMax * DT, BACK_RATE * DT);
  }
  // tốc độ muốn của neo
  let vt = g.hold ? 0 : g.speed;
  vt = Math.min(vt, Math.sqrt(2 * g.brake * Math.max(0, L - g.s)));
  // xe tụt (đo dọc đường đi của ô): neo chậm lại chờ, hệ số chậm đổi dần. Xe lạc (quá xa, hoặc tụt mãi quá LAG_GIVE_UP) thì neo
  // thôi chờ, xe tự đuổi theo
  // lấy phần tụt của 3/4 số xe (bỏ vài xe tụt nhất): một xe bị chắn tạm không kéo cả sư đoàn chậm theo
  const lags: number[] = [];
  for (let i = 0; i < g.ids.length; i++) {
    const u = memberAt(this, g, i);
    if (!u) continue;
    const ex = g.sx[i] - u.x;
    const ez = g.sz[i] - u.z;
    const d = Math.sqrt(ex * ex + ez * ez);
    const behind = g.vs[i] > 0.3 ? ex * g.dx[i] + ez * g.dz[i] : d;
    if (behind > LAG_OK) g.lagT[i]++;
    else g.lagT[i] = 0;
    lags.push(d < LAG_IGNORE && g.lagT[i] < LAG_GIVE_UP && behind > 0 ? behind : 0);
  }
  lags.sort((a, b) => a - b);
  const lag = lags.length ? lags[Math.min(lags.length - 1, Math.floor(lags.length * LAG_PCT))] : 0;
  const kLag = lag > LAG_OK ? Math.max(LAG_MIN_K, 1 - (lag - LAG_OK) / (LAG_STOP - LAG_OK)) : 1;
  g.lagK += (kLag - g.lagK) * LAG_SMOOTH;
  vt *= g.lagK;
  // NHÌN TRƯỚC KHÚC CUA: ô ở mép ngoài cua phía trước sẽ chạy nhanh hơn xe của nó thì neo hãm DẦN từ trước (như người lái thấy khúc
  // cua), không đợi vào cua mới phanh gấp: neo phanh gấp thì xe đang đuổi ô lao quá ô rồi hãm tụt hẳn, cả khối tăng–hãm liên tục
  if (g.v > 0.5) for (const k of CORNER_LOOK) {
    const sa = g.s + g.v * k;
    if (sa >= L) break;
    const step = g.v * DT;
    let ratio = 0;
    for (let i = 0; i < g.ids.length; i++) {
      const u = memberAt(this, g, i);
      if (!u || (g.wait[i] && sa - g.backS[i] < 0.5)) continue;
      const [ax, az] = this.slotAt(g, i, sa);
      const [bx, bz] = this.slotAt(g, i, sa + step);
      const m = Math.sqrt(dist2(ax, az, bx, bz));
      const r = m / (this.speedOf(u) * DT * 0.95);
      if (r > ratio) ratio = r;
    }
    if (ratio > 1) {
      const vSafe = g.v / ratio;
      const vNow = Math.sqrt(vSafe * vSafe + 2 * g.brake * (sa - g.s));
      if (vNow < vt) vt = vNow;
    }
  }
  const rate = (vt < g.v ? g.brake : g.accel) * DT;
  let v = g.v + clamp(vt - g.v, -rate, rate);
  if (v < 0) v = 0;
  let ds = Math.min(v * DT, L - g.s);
  // sắp vào đoạn cuối (sớm hơn REFIT_LEAD m, trước khi ô nào bắt đầu chuyển sang ô cuối cũ: ô không nhảy): dựng lại hình cuối theo đúng
  // thứ tự xe đang đi (khối đã qua lối hẹp thì không xáo lại ngay trước khi dừng)
  if (!g.endFit && g.s > L - (END_BLEND + g.halfW + REFIT_LEAD)) this.refitEnd(g);
  // ô ở chỗ neo hiện tại theo mẫu đang dùng (vừa co / giãn cột thì ô nhảy chỗ: không tính là ô chạy nhanh)
  for (let i = 0; i < g.ids.length; i++) {
    const [px, pz] = this.slotAt(g, i, g.s);
    g.psx[i] = px;
    g.psz[i] = pz;
  }
  // ô ở mép ngoài khúc cua không được chạy nhanh hơn xe của nó đuổi được (cua gấp thì cả khối chậm lại)
  for (let it = 0; it < 2 && ds > 1e-6; it++) {
    let ratio = 0;
    for (let i = 0; i < g.ids.length; i++) {
      const u = memberAt(this, g, i);
      // ô đang chờ tới lượt vào đường (đứng yên, hay vừa nhảy từ chỗ chờ vào đầu đường) không tính
      if (!u || (g.wait[i] && g.s + ds - g.backS[i] < 0.5)) continue;
      const [px, pz] = this.slotAt(g, i, g.s + ds);
      const m = Math.sqrt(dist2(px, pz, g.psx[i], g.psz[i]));
      const cap = this.speedOf(u) * DT * 0.95;
      if (m / cap > ratio) ratio = m / cap;
    }
    if (ratio <= 1) break;
    ds /= ratio;
  }
  if (ds / DT < v) v = ds / DT;
  g.v = v;
  g.s += ds;
  if (g.s >= L - 1e-6 && g.doneT < 0) {
    g.s = L;
    g.doneT = g.t;
  }
  for (let i = 0; i < g.ids.length; i++) {
    const [px, pz] = this.slotAt(g, i, g.s);
    g.sx[i] = px;
    g.sz[i] = pz;
    // tốc độ và hướng ô (làm mượt): xe bám ô theo số này, không theo từng bước nhảy của ô
    const vx = (px - g.psx[i]) / DT;
    const vz = (pz - g.psz[i]) / DT;
    const v2 = Math.sqrt(vx * vx + vz * vz);
    g.vs[i] += (v2 - g.vs[i]) * SLOT_SMOOTH;
    if (v2 > 0.05) {
      let dx = g.dx[i] + (vx / v2 - g.dx[i]) * SLOT_SMOOTH;
      let dz = g.dz[i] + (vz / v2 - g.dz[i]) * SLOT_SMOOTH;
      const l = Math.sqrt(dx * dx + dz * dz);
      if (l > 1e-6) {
        dx /= l;
        dz /= l;
        g.dx[i] = dx;
        g.dz[i] = dz;
      }
    }
  }
}

/** Giãn cột: lối phải rộng hơn bề ngang mẫu mới thêm chừng này (m), và cách lần đổi cột trước ít nhất COLS_DWELL (chống bật tắt). */
const WIDEN_HYST = 1;
const COLS_DWELL = sec(2);

/**
 * Nửa bề ngang ƯỚC của khối c cột: c xe to nhất của khối đứng cạnh nhau (cận trên của mọi hàng c xe; ổn định, chỉ phụ thuộc khối
 * gồm những xe nào: đo theo mẫu sắp lại từng lần thì số đo nhảy, khối giãn rồi co ngay 0,3 s sau).
 */
const HW_R: number[] = [];
function halfWOf(this: World, g: Group, c: number): number {
  HW_R.length = 0;
  for (let i = 0; i < g.ids.length; i++) {
    const u = memberAt(this, g, i);
    if (u) HW_R.push(bodyRadius(u.kind));
  }
  HW_R.sort((a, b) => b - a);
  let w = 0;
  const k = Math.min(c, HW_R.length);
  for (let i = 0; i < k; i++) w += 2 * HW_R[i];
  return (w + (k - 1) * COL_GAP) / 2;
}

/**
 * Co / giãn số cột theo bề rộng lối trên vệt phía trước. CO NGAY khi bề ngang ước của số cột đang dùng không lọt lối phía trước;
 * GIÃN chậm và có độ trễ: lối phía trước và cả quãng khối đang chiếm phải rộng hơn bề ngang mẫu mới WIDEN_HYST m, đo liền
 * WIDEN_CHECKS lần, cách lần đổi trước COLS_DWELL (bộ điều khiển hai ngưỡng: không bật tắt qua lại ở mép lối).
 */
function fitWidth(this: World, g: Group): void {
  let front = Infinity;
  let rear = -Infinity;
  for (let i = 0; i < g.ids.length; i++) {
    front = Math.min(front, g.back[i]);
    rear = Math.max(rear, g.back[i]);
  }
  const L = g.cum[g.cum.length - 1];
  const sf = g.s - front;
  // lấy mẫu ở các mốc CỐ ĐỊNH trên đường (bội số 2 m): mốc trượt theo cửa sổ thì số đo cạnh vách nhảy hơn 1 m giữa hai lần đo
  const minClear = (a: number, b: number): number => {
    let m = Infinity;
    for (let s = Math.ceil(Math.max(0, a) / 2) * 2; s <= Math.min(L, b); s += 2) {
      const [px, pz] = pathPoint(g, s);
      const c = this.grid.clearanceAt(px, pz);
      if (c < m) m = c;
    }
    return m;
  };
  // nhìn trước tới LOOK_AHEAD m nhưng dừng trước ĐOẠN CUỐI của đường (END_BLEND + REFIT_LEAD m): ở đó hình cuối tự chọn số cột vừa chỗ
  // (`fitEnd`), đích giữa bãi đá không bắt cả đoàn co hàng từ xa
  const ahead = minClear(sf - 2, Math.max(sf, Math.min(sf + LOOK_AHEAD, L - END_BLEND - REFIT_LEAD)));
  let fit = 1;
  for (let c = g.colsMax; c >= 1; c--)
    if (this.halfWOf(g, c) + WIDTH_MARGIN <= ahead) {
      fit = c;
      break;
    }
  if (fit < g.cols) {
    this.relayout(g, fit, false);
    g.wideFor = 0;
    g.colsT = g.t;
    return;
  }
  if (fit === g.cols || g.t - g.colsT < COLS_DWELL) {
    g.wideFor = 0;
    return;
  }
  // giãn: quãng hàng đầu vừa đi qua (BODY_CHECK m) và phía trước đều phải dư WIDEN_HYST; đuôi đoàn còn trong lối hẹp thì ô tự co
  // lệch ngang theo vách
  const room = Math.min(ahead, minClear(Math.max(g.s - rear - 2, sf - BODY_CHECK), sf));
  let fitB = g.cols;
  for (let c = fit; c > g.cols; c--)
    if (this.halfWOf(g, c) + WIDTH_MARGIN + WIDEN_HYST <= room) {
      fitB = c;
      break;
    }
  if (fitB > g.cols && ++g.wideFor >= WIDEN_CHECKS) {
    // giãn hết cỡ mà còn đủ đường thì xếp lại theo vai; gần đích thì giữ thứ tự đang đi (không xáo đội ngay trước khi dừng)
    this.relayout(g, fitB, L - g.s > REFORM_DIST);
    g.wideFor = 0;
    g.colsT = g.t;
  } else if (fitB <= g.cols) g.wideFor = 0;
}

/**
 * Hình cuối theo thứ tự xe đang đi (gọi một lần khi neo vào đoạn cuối). Khối vẫn đang ở mẫu theo vai thì giữ hình cuối lúc lập khối.
 * Khối đã xếp theo thứ tự đi (qua lối hẹp): hình cuối đủ số cột, hàng trước là các xe đang đi trước, trong hàng theo chỗ lệch trái /
 * phải, hàng khép ROW_GAP; dời cho vừa chỗ như lúc lập khối. Mẫu hành quân cũng chuyển sang đúng các hàng đó để ô chuyển êm.
 */
function refitEnd(this: World, g: Group): void {
  g.endFit = true;
  if (g.role) return;
  const { rows } = this.physicalLayout(g, g.colsMax);
  const radii = rows.map((r) => r.map((i) => bodyRadius((this.byId.get(g.ids[i]) as Unit | undefined)?.kind ?? "titan")));
  const LE = layoutRows(radii);
  const LM = layoutRows(radii, MARCH_ROW_GAP);
  const fm = LM.back.length ? LM.back[0] : 0;
  for (let r = 0; r < LM.back.length; r++) LM.back[r] -= fm;
  const n = g.ids.length;
  const latE = new Array<number>(n).fill(0);
  const backE = new Array<number>(n).fill(0);
  let front0 = Infinity;
  for (let i = 0; i < n; i++) if (g.back[i] < front0) front0 = g.back[i];
  rows.forEach((r, ri) =>
    r.forEach((i, k) => {
      latE[i] = LE.lat[ri][k];
      backE[i] = LE.back[ri];
      g.lat[i] = LM.lat[ri][k];
      g.back[i] = LM.back[ri];
    })
  );
  g.cols = g.colsMax;
  g.halfW = LM.halfW;
  let front1 = Infinity;
  for (let i = 0; i < n; i++) if (g.back[i] < front1) front1 = g.back[i];
  g.s += front1 - front0;
  const us = g.ids.map((id) => (this.byId.get(id) as Unit | undefined) ?? (this.units[0] as Unit));
  const ignore = new Set(g.ids);
  // thứ tự đọc của hình cuối theo đúng các hàng vừa xếp
  const order = rows.flat();
  const usO = order.map((i) => us[i]);
  const [exO, ezO] = this.fitEnd(usO, order.map((i) => latE[i]), order.map((i) => backE[i]), g.goalX, g.goalZ, g.faceX, g.faceZ, ignore, g.colsMax);
  const ex = new Array<number>(n);
  const ez = new Array<number>(n);
  order.forEach((i, k) => {
    ex[i] = exO[k];
    ez[i] = ezO[k];
  });
  g.endX = ex;
  g.endZ = ez;
  for (let i = 0; i < n; i++) {
    const u = memberAt(this, g, i);
    if (u) {
      u.tx = ex[i];
      u.tz = ez[i];
    }
  }
}

/** Khối tới nơi (hoặc hết giờ chờ): mọi xe thành xe đứng ở ô cuối của mình, quay về hướng chung. */
function finishGroup(this: World, g: Group): void {
  for (let i = 0; i < g.ids.length; i++) {
    const u = memberAt(this, g, i);
    if (!u) continue;
    u.group = 0;
    u.slot = 0;
    u.order = "idle";
    u.tx = g.endX[i];
    u.tz = g.endZ[i];
    u.faceX = g.faceX;
    u.faceZ = g.faceZ;
    u.path = [];
    u.pathI = 0;
    u.chasing = false;
    u.homeT = 0;
  }
  g.ids = [];
}

/** Xe nhận lệnh mới thì rời khối cũ (ô của nó bỏ trống). */
function leaveGroup(this: World, u: Unit): void {
  const g = this.groupById(u.group);
  u.group = 0;
  u.slot = 0;
  if (!g) return;
  const i = g.ids.indexOf(u.id);
  if (i >= 0) g.ids[i] = 0;
  if (g.ids.every((id) => !id)) g.ids = [];
}

/**
 * Một xe của khối trong tick (gọi từ `updateGround`): chọn mục tiêu theo lệnh, rồi lái tới ô. Lệnh đi: bắn mục tiêu trong tầm
 * khi đang chạy, không dừng. Tấn công-di chuyển: có địch thì cả khối dừng (`hold`), xe trong tầm đứng bắn, xe chạy được tiến lên
 * đánh trong vòng LEASH m quanh ô; hết địch HOLD_RESUME thì đi tiếp. Trả về mục tiêu để bắn.
 */
function groupMember(this: World, u: Unit, w: WeaponSpec | undefined, range: number): Target | null {
  const g = this.groupById(u.group);
  const i = u.slot;
  if (!g || g.ids[i] !== u.id) {
    u.group = 0;
    u.order = "idle";
    return null;
  }
  let fireAt: Target | null = null;
  if (w) {
    if (g.kind === "amove") {
      const t = this.acquire(u, w, range + IDLE_ACQUIRE_BONUS);
      if (t) {
        const inR = this.inRange(u.x, u.z, w, t, range);
        const sx = g.sx[i];
        const sz = g.sz[i];
        if (this.tick < g.noHold) {
          // vừa thôi dừng đánh vô ích: đi tiếp, tháp pháo vẫn bắn mục tiêu trong tầm
          if (inR) fireAt = t;
        } else if (inR || (!w.deploy && dist2(u.x, u.z, sx, sz) < LEASH * LEASH)) {
          // vào cuộc: góp một phiếu dừng đánh (`stepGroup`); cả khối đang dừng thì đứng bắn / tiến lên đánh trong vòng LEASH, chưa dừng
          // thì vừa đi theo khối vừa bắn
          g.engagedNow++;
          if (inR) fireAt = t;
          if (g.hold) {
            fireAt = t;
            if (inR) {
              this.halt(u);
              return fireAt;
            }
            if (!w.deploy) {
              this.chase(u, t);
              return fireAt;
            }
          }
        }
      }
    } else fireAt = this.acquire(u, w, range);
  }
  u.chasing = false;
  this.toSlot(g, u, i);
  return fireAt;
}

/** Tới nơi theo đám đông: gần ô cuối không quá SETTLE_NEAR m mà bị chắn SETTLE_STUCK thì nhận chỗ đang đứng. */
const SETTLE_NEAR = 3;
const SETTLE_STUCK = sec(2);

/**
 * TỚI NƠI THEO ĐÁM ĐÔNG (B4, 23/11/2026; Spring `HandleUnitCollisionsAux`, Battle Drones `arrivalRadius`): xe đã ở gần ô cuối (≤
 * SETTLE_NEAR m) mà bị đồng đội / vách chắn không vào nốt được SETTLE_STUCK thì ô cuối của nó thành chỗ đang đứng (khối đông trên thềm
 * chật không chen nhau từng tấc mãi). Trả về true khi vừa nhận chỗ.
 */
function settleSlot(this: World, g: Group, u: Unit, i: number): boolean {
  if (u.stuck < SETTLE_STUCK || dist2(u.x, u.z, g.endX[i], g.endZ[i]) > SETTLE_NEAR * SETTLE_NEAR) return false;
  g.endX[i] = g.sx[i] = u.tx = u.x;
  g.endZ[i] = g.sz[i] = u.tz = u.z;
  u.stuck = 0;
  u.speed = 0;
  return true;
}

/** Lái xe thứ i của khối tới ô của nó (xem chú thích đầu file). */
function toSlot(this: World, g: Group, u: Unit, i: number): void {
  const sx = g.sx[i];
  const sz = g.sz[i];
  if (g.mode === "direct") {
    if (u.path.length && u.pathI * 2 < u.path.length) {
      if (this.follow(u, g.pace[i])) u.path = [];
      return;
    }
    if (this.settleSlot(g, u, i) || this.drive(u, g.sx[i], g.sz[i], true, g.pace[i], g.revMax)) this.turnHull(u, g.faceX, g.faceZ);
    // bị chắn quá lâu: tìm lại đường tới ô
    else this.unstick(u, sx, sz);
    return;
  }
  const ex = sx - u.x;
  const ez = sz - u.z;
  const d2 = ex * ex + ez * ez;
  // không nhìn thẳng thấy ô (vách, khúc cua) mà ô xa, hoặc ô ĐỨNG YÊN (ô cuối, ô chờ: ô sau vách thềm cách 7 m cũng phải đi vòng, lái
  // thẳng là húc vách mãi): tìm đường A* tới ô, mỗi giây tìm lại; không tìm được thì lái thẳng (trượt dọc vách) chờ lần tìm sau. Ô đang
  // chạy ở gần khuất sau góc thì sắp ló ra, khỏi tìm
  if ((d2 > SLOT_FAR * SLOT_FAR || g.doneT >= 0 || g.vs[i] < 0.15) && d2 > 1 && !this.grid.los(u.x, u.z, sx, sz, wallRadius(u.kind))) {
    if (this.tick >= u.repathAt) {
      this.setPath(u, sx, sz);
      u.repathAt = this.tick + sec(1);
    }
    if (u.path.length && u.pathI * 2 < u.path.length) this.follow(u);
    else this.drive(u, sx, sz, false);
    return;
  }
  // đang đi đường vòng qua xe đứng (`unstick`) tới ô: đi nốt, ô còn xa
  if (u.path.length && u.pathI * 2 < u.path.length && d2 > 9) {
    this.follow(u);
    return;
  }
  if (u.path.length) {
    u.path = [];
    u.pathI = 0;
  }
  // tốc độ và hướng của ô (đã làm mượt ở `marchAnchor`)
  const vx = g.dx[i];
  const vz = g.dz[i];
  const vs = g.vs[i];
  if (vs < 0.15) {
    // ô đứng yên giữa đường (khối dừng đánh / chờ xe tụt): xe hơi vượt lên trước ô vài mét thì đứng luôn, không lùi về
    if (g.doneT < 0) {
      const al = ex * vx + ez * vz;
      const la = ex * vz - ez * vx;
      if (al < 0.5 && al > -4 && la < 1.5 && la > -1.5) return;
    }
    // đã tới nơi: đỗ đúng ô rồi quay về hướng chung (gần ô mà bị chắn lâu thì nhận chỗ đang đứng); bị chắn lâu thì tìm lại đường tới ô
    if ((g.doneT >= 0 && this.settleSlot(g, u, i)) || this.drive(u, sx, sz, true)) this.turnHull(u, g.doneT >= 0 ? g.faceX : u.hx, g.doneT >= 0 ? g.faceZ : u.hz);
    else this.unstick(u, sx, sz);
    return;
  }
  // đuổi điểm trên đường của ô, phía trước chỗ xe đang ngang hàng (xe vượt lên trước ô thì chậm lại chứ không quay đầu)
  const along = ex * vx + ez * vz;
  const lat = ex * vz - ez * vx;
  const lead = clamp(LEAD_MIN + vs * LEAD_T, LEAD_MIN, LEAD_MAX);
  const ax = sx + vx * (lead - along);
  const az = sz + vz * (lead - along);
  const want = vs + KP * along + 0.3 * (lat < 0 ? -lat : lat);
  this.drive(u, ax, az, false, want > 0 ? want : 0);
}

const methods = {
  groupById,
  formationOf,
  airSlots,
  orderMove,
  formation,
  freeSpot,
  standingAt,
  relayout,
  physicalLayout,
  widthFor,
  createGroup,
  adoptMembers,
  startDirect,
  assignSlots,
  slotOk,
  onRamp,
  nearRamp,
  fitEnd,
  goalCenter,
  trailSlot,
  latTarget,
  slotAt,
  updateGroups,
  stepGroup,
  endProgress,
  swapSlots,
  groupPriority,
  marchAnchor,
  fitWidth,
  halfWOf,
  refitEnd,
  finishGroup,
  leaveGroup,
  groupMember,
  toSlot,
  settleSlot
};
type Methods = typeof methods;
declare module "./core" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface World extends Methods {}
}
Object.assign(World.prototype, methods);
