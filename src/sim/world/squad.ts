/** Đội hình hành quân (Squad): xếp ô, chia hàng, xoay đội, hành quân theo khối, chờ xe tụt. */
import { DEFAULT_FORMATION, FORMATIONS, REAR_RANK, RULES, UNITS, type FormationId, type Mobility, type Side, type WeaponSpec } from "../content";
import { assignMin } from "../assign";
import { clamp, dcos, DEG, dist2, turnStep, turnToward } from "../fmath";
import { CELL } from "../maps";
import type { Squad, Target, Unit } from "../types";
import { DT, sec, bodyRadius, spaceRadius, isSquad, wallRadius, FORMATION_GAP, SQUAD_CATCHUP, AIR_FORMATION_GAP, SQUAD_RESHAPE_EXTRA, SQUAD_MIN_TURN_R, SQUAD_PIVOT_COS, PIVOT_COS, ALIGNED_COS, SQUAD_LAG, SQUAD_LOOK, SQUAD_FAR, SQUAD_FORM_MAX, SQUAD_DIRECT, SQUAD_SETTLE_MAX, SQUAD_PIVOT_MAX, SQUAD_WIDEN_CHECKS, SHIFT_OFFSETS, SLOT_NUDGE, TMP, traverseStep } from "./shared";
import { World } from "./core";

/** Ô đội hình phải có khoảng trống ≥ bán kính thân × chừng này (cùng vòng với điểm dò thân `bodyContact`, WALL_PROBE). */
const SLOT_BODY = 0.95;
/** Đội xoay tại chỗ: hướng đội chỉ quay tiếp khi mọi thân xe lệch hướng đội dưới 10°. */
const PIVOT_SYNC_COS = dcos(10 * DEG);
/** Độ dạt ngang thử khi chốt hình đội ở đích (m), thứ tự cố định: giữa trước, rồi lệch dần hai bên. */
const SETTLE_SHIFTS = [0, 2, -2, 4, -4, 6, -6, 8, -8, 10, -10];

/** Bán kính vòng quét khi xe xoay tại chỗ: đế tròn nên đúng bằng bán kính thân (16/11/2026; trước đó nửa đường chéo thân). */
function turnRadius(u: Unit): number {
  return isSquad(u.kind) ? wallRadius(u.kind) : bodyRadius(u.kind) * SLOT_BODY;
}

/**
 * Khoảng cột (m, tâm tới tâm hai xe cạnh nhau trong một hàng) cho các xe `kinds`: ≥ hai bán kính lớn nhất + khe. Đội GIÃN HẾT
 * CỠ (`wide`, đứng ở bãi trống, là lúc đội xoay tại chỗ) thì còn ≥ 2 × nửa đường chéo THÂN VA CHẠM lớn nhất: hai thân song song
 * đặt cạnh nhau cách chừng đó thì cùng xoay góc nào cũng không chạm (người dùng 12/11/2026, hàng ngang Titan cách 5,2 m mà thân
 * dài 6,2 m). Đội đã co hàng qua chỗ hẹp chỉ đi thẳng, không xoay tại chỗ: khoảng hẹp, không thì cầu 9 m chỉ vừa hàng một
 * (10 Titan thành cột dài 76 m thay vì hàng đôi 26 m).
 */
function colSpacing(kinds: Iterable<Unit["kind"]>, wide = true): number {
  // đế tròn (16/11/2026): xoay tại chỗ không quét rộng hơn vòng thân, nên khoảng rộng chỉ cần thêm khe FORMATION_GAP; khoảng
  // hẹp (đội co hàng qua chỗ hẹp) là hai vòng giãn sát nhau
  let r = 0;
  for (const k of kinds) r = Math.max(r, spaceRadius(k));
  return wide ? 2 * r + FORMATION_GAP : 2 * r;
}

/**
 * Đội đang HÀNH QUÂN và đã co hàng (qua chỗ hẹp): khoảng cột hẹp. Mọi lúc khác (đứng chốt hình, xoay tại chỗ, đi thẳng tới
 * ô, giãn hết cỡ) khoảng rộng: đội đứng ở đích rồi nhận lệnh mới là xoay tại chỗ từ đúng thế đứng đó.
 */
function narrowMarch(sq: Squad): boolean {
  return sq.phase === "march" && sq.cols < sq.colsMax;
}

/** Bán kính xoay tại chỗ lớn nhất trong đội. */
function squadTurnR(this: World, sq: Squad): number {
  let r = 0;
  for (const id of sq.ids) {
    const u = this.byId.get(id);
    if (u && u.cat === "unit") r = Math.max(r, turnRadius(u));
  }
  return r;
}


/**
 * Đội hình hiện tại của một nhóm xe: kiểu được nhiều xe nhất (ghép hai sư đoàn khác kiểu thì theo bên đông hơn, bằng nhau
 * thì theo thứ tự bảng FORMATIONS để tất định). null = chưa xe nào được chọn kiểu.
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
 * Máy bay cùng một lệnh bay theo đội hình mũi tên, mỗi chiếc một điểm đến, thay vì cùng lao vào một điểm rồi dồn cục
 * (người dùng 09/11/2026: phải thấy được sự hoành tráng của đội bay). Chiếc số nhỏ dẫn đầu, các chiếc sau xòe hai cánh.
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
    const wing = Math.ceil(i / 2);
    const lat = (i % 2 === 1 ? -wing : wing) * AIR_FORMATION_GAP;
    const back = wing * AIR_FORMATION_GAP * 0.7;
    out.set(u.id, [x + hz * lat - hx * back, z - hx * lat - hz * back]);
  });
  return out;
}

function orderMove(this: World, side: Side, ids: readonly number[], x: number, z: number, kind: "move" | "amove", formation?: FormationId): void {
  const units = this.ownUnits(side, ids);
  // từ 2 xe chiến đấu trở lên: hành quân thành đội hình (Xe Vận Tải đi riêng, vì còn việc hậu cần)
  const fighters = units.filter((u) => u.air === "none" && u.kind !== "hauler");
  const inSquad = fighters.length > 1 ? new Set(fighters.map((u) => u.id)) : null;
  if (inSquad) this.createSquad(side, fighters, x, z, kind, formation);
  if (formation) for (const u of units) u.formation = formation;
  const ground = units.filter((u) => u.air === "none" && !inSquad?.has(u.id));
  const plan = this.formation(ground, x, z);
  const airSlots = this.airSlots(units, x, z);
  for (const u of units) {
    if (inSquad?.has(u.id)) continue;
    if (u.air !== "none") {
      const [ax, az] = airSlots.get(u.id) ?? [x, z];
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
    const f = plan.slots.get(u.id) ?? [x, z];
    u.faceX = plan.fx;
    u.faceZ = plan.fz;
    u.order = kind;
    u.targetId = 0;
    u.autoTarget = 0;
    u.chasing = false;
    u.tx = f[0];
    u.tz = f[1];
    this.setPath(u, f[0], f[1]);
  }
}

/**
 * Đội hình hàng ngang cho một nhóm quân mặt đất (người dùng 06/11/2026: "xếp hàng ngay ngắn, không dính cục"):
 * - quay mặt theo hướng hành quân (tâm nhóm → đích; đích quá gần thì theo hướng trung bình của nhóm);
 * - hàng đầu / giữa / sau theo `UnitSpec.formation`; mỗi vai trò bắt đầu hàng mới; bề ngang ≈ √(n × 2,5) xe;
 * - khoảng cách theo kích cỡ xe thật (2 × bán kính lớn nhất trong hàng + khe hở), hàng cuối thiếu thì căn giữa;
 * - chia ô theo vị trí đang đứng (xe phía trước vào hàng trước, xe bên trái vào ô bên trái) để đường đi không cắt nhau;
 * - ô bị chặn hoặc trùng thì dịch sang ô trống gần nhất.
 * Tâm khối đội hình nằm ở điểm đích. Tất định: chỉ + − × ÷ √ và sắp xếp có khóa phụ là id.
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
  if (n === 1) {
    const u = units[0];
    slots.set(u.id, this.grid.nearestFree(x, z, 8) ?? [x, z]);
    return { slots, fx, fz };
  }
  const rx = fz; // vector sang phải (vuông góc hướng hành quân)
  const rz = -fx;
  const fwd = (u: Unit): number => (u.x - cx) * fx + (u.z - cz) * fz;
  const lat = (u: Unit): number => (u.x - cx) * rx + (u.z - cz) * rz;
  const rank = (u: Unit): number => FORMATIONS[DEFAULT_FORMATION].rank[UNITS[u.kind].group];
  const order = [...units].sort((a, b) => rank(a) - rank(b) || fwd(b) - fwd(a) || a.id - b.id);
  const cols = Math.min(n, Math.ceil(Math.sqrt(n * FORMATIONS[DEFAULT_FORMATION].wide)));
  const rows: Unit[][] = [];
  for (const u of order) {
    const row = rows[rows.length - 1];
    if (!row || row.length >= cols || rank(row[0]) !== rank(u)) rows.push([u]);
    else row.push(u);
  }
  // vòng giãn lớn nhất trong hàng (hai hàng cách tổng hai vòng giãn + khe, như `squadLayout`)
  const lMax = (row: Unit[]): number => {
    let l = 0;
    for (const u of row) l = Math.max(l, spaceRadius(u.kind));
    return l;
  };
  // vị trí từng hàng theo chiều sâu (hàng đầu = 0, lùi dần), rồi dời cho tâm khối nằm ở đích
  const depth: number[] = [0];
  for (let i = 1; i < rows.length; i++) depth.push(depth[i - 1] - (lMax(rows[i - 1]) + lMax(rows[i]) + FORMATION_GAP));
  const shift = -depth[depth.length - 1] / 2; // nửa bề sâu: đẩy cả khối lên để tâm khối nằm ở đích
  const used = new Set<number>();
  rows.forEach((row, ri) => {
    const spacing = colSpacing(row.map((u) => u.kind));
    const f = depth[ri] + shift;
    row.sort((a, b) => lat(a) - lat(b) || a.id - b.id);
    row.forEach((u, i) => {
      const s = (i - (row.length - 1) / 2) * spacing;
      slots.set(u.id, this.freeSlot(x + rx * s + fx * f, z + rz * s + fz * f, rx, rz, fx, fz, used, undefined, turnRadius(u)));
    });
  });
  return { slots, fx, fz };
}

/** Ô trống gần (x, z) nhất chưa có xe nào trong đội hình nhận (dò theo khung đội hình, bước 1 ô lưới). */
function freeSlot(this: World, x: number, z: number, rx: number, rz: number, fx: number, fz: number, used: Set<number>, from?: readonly [number, number], half = 0): [number, number] {
  for (const [i, j] of SLOT_NUDGE) {
    const px = x + (rx * i + fx * j) * CELL;
    const pz = z + (rz * i + fz * j) * CELL;
    if (!this.map.fits(px, pz, 1, 1) || this.grid.blockedAt(px, pz)) continue;
    // ô phải vừa cả thân xe (khoảng trống ≥ nửa bề ngang): vật cản là ràng buộc cứng từ 12/11/2026, ô sát vách / nhà thì xe
    // không đứng tới được và chen vào xe bên cạnh
    if (half > 0 && this.grid.clearanceAt(px, pz) < half) continue;
    // phải cùng một khoảng trống với tâm đội hình (không nhảy sang bờ sông bên kia hay sau vách đá)
    if (from && !this.grid.los(from[0], from[1], px, pz)) continue;
    const c = this.grid.index(px, pz);
    if (used.has(c)) continue;
    used.add(c);
    return [px, pz];
  }
  const f = (half > 0 ? this.grid.nearestFree(x, z, 8, (cx, cz) => this.grid.clearanceAt(cx, cz) >= half && !used.has(this.grid.index(cx, cz))) : null) ?? this.grid.nearestFree(x, z, 8) ?? [x, z];
  used.add(this.grid.index(f[0], f[1]));
  return f;
}

/** Tới đích lệnh di chuyển: đứng chờ; thân xe tự xoay dần về `faceX/faceZ` (cuối updateGround). */
function arrive(this: World, u: Unit): void {
  this.setIdle(u);
}

// ------------------------------------------------------------------ đội hình hành quân (squad)

/** Lập đội hình cho một nhóm xe chiến đấu (từ 2 xe) đi tới (x, z). Xem `Squad` trong types.ts. */
function createSquad(this: World, side: Side, units: readonly Unit[], x: number, z: number, kind: "move" | "amove", chosen?: FormationId): void {
  const n = units.length;
  // Tư lệnh chọn thì theo lựa chọn đó; không chọn thì đi tiếp kiểu đang dùng; chưa từng chọn thì mặc định
  const current = this.formationOf(units);
  const formation = chosen ?? current ?? DEFAULT_FORMATION;
  if (current) for (const u of units) u.formation = current; // ghép nhóm: mọi xe về một kiểu
  let cx = 0;
  let cz = 0;
  let ax = 0;
  let az = 0;
  for (const u of units) {
    cx += u.x / n;
    cz += u.z / n;
    ax += u.hx;
    az += u.hz;
  }
  // đội vừa giải tán cùng nhận một hướng đội hình (faceX/faceZ): dùng hướng đó, thân xe có thể đang quay dở
  const f0 = units[0];
  if ((f0.faceX !== 0 || f0.faceZ !== 0) && units.every((u) => u.faceX * f0.faceX + u.faceZ * f0.faceZ > 0.999)) {
    ax = f0.faceX * n;
    az = f0.faceZ * n;
  }
  const al = Math.sqrt(ax * ax + az * az);
  let wx = x - cx;
  let wz = z - cz;
  let wl = Math.sqrt(wx * wx + wz * wz);
  if (wl < 1e-6) {
    wx = al > 1e-6 ? ax : 0;
    wz = al > 1e-6 ? az : 1;
    wl = Math.sqrt(wx * wx + wz * wz);
  }
  wx /= wl;
  wz /= wl;
  const sq: Squad = {
    id: this.nextId++,
    side,
    kind,
    formation,
    rankOf: {},
    speed: 0,
    rigid: false,
    rolling: false,
    ids: [],
    offLat: [],
    offBack: [],
    cols: 1,
    colsMax: 1,
    width: 0,
    depth: 0,
    rMax: 0,
    x: cx,
    z: cz,
    hx: wx,
    hz: wz,
    wantX: wx,
    wantZ: wz,
    goalX: x,
    goalZ: z,
    path: [],
    pathI: 0,
    trail: [],
    s: 0,
    phase: "form",
    phaseT: 0,
    byRank: true,
    hold: false,
    holding: false,
    shift: 0,
    shiftWant: 0,
    wideFor: 0,
    settleMax: 0
  };
  // Đội vừa cùng nhau tới nơi (cùng nhận một hướng đội hình, ai cũng còn đứng gần ô cuối của mình) là ĐÃ VÀO HÀNG:
  // giữ nguyên hình dạng đang đứng (người dùng chốt 06/11/2026: không ai đổi chỗ), dù nó có giống lưới chuẩn hay không.
  const sameFace = (f0.faceX !== 0 || f0.faceZ !== 0) && units.every((u) => u.faceX * f0.faceX + u.faceZ * f0.faceZ > 0.999);
  // Tư lệnh đổi sang kiểu đội hình khác thì dựng lại theo kiểu đó. Lệnh tấn công mà phải quay đầu thì cũng dựng lại để giáp
  // ra trước, vì đưa Pháo đi đầu vào giao tranh là sai về chiến thuật (người dùng chốt 09/11/2026). Còn lại giữ chỗ đứng.
  const turnsBack = sameFace && wx * f0.faceX + wz * f0.faceZ < 0;
  const changed = chosen !== undefined && chosen !== current;
  const formed = sameFace && !changed && !(kind === "amove" && turnsBack) && units.every((u) => u.order === "idle" && dist2(u.x, u.z, u.tx, u.tz) < 9);
  const colsFull = Math.min(n, Math.ceil(Math.sqrt(n * FORMATIONS[sq.formation].wide)));
  sq.byRank = !formed;
  sq.ids = units.map((u) => u.id);
  this.squadRanks(sq, units, wx, wz, cx, cz);
  sq.speed = this.squadSpeed(units);
  if (formed) {
    // hình dạng hiện tại, đo theo hướng đội hình đang quay
    this.squadAdopt(sq, f0.faceX, f0.faceZ);
    sq.colsMax = Math.max(colsFull, sq.cols);
  }
  let direct = false;
  if (wl <= SQUAD_DIRECT) direct = this.squadDirect(sq, units, wx, wz, cx, cz, colsFull, formed);
  sq.rigid = direct && formed;
  if (!direct) {
    if (formed) {
      this.squadAdopt(sq, f0.faceX, f0.faceZ);
      sq.colsMax = Math.max(colsFull, sq.cols);
    } else {
      // quân lộn xộn: dựng đội hình theo vai trò ngay tại chỗ, quay theo hướng đi, chia ô tối ưu rồi tập hợp
      this.squadArrange(sq, units, wx, wz, cx, cz, colsFull);
      this.squadAssign(sq);
      sq.colsMax = colsFull;
    }
  }
  // ô cuối cùng của từng xe khi tới nơi (tâm khối ở đích, quay theo hướng đi): AI và "về lại chỗ" dùng
  const fx = x + wx * (sq.depth / 2);
  const fz = z + wz * (sq.depth / 2);
  sq.ids.forEach((id, i) => {
    const u = this.byId.get(id) as Unit;
    u.squad = sq.id;
    u.order = kind;
    u.targetId = 0;
    u.autoTarget = 0;
    u.chasing = false;
    u.path = [];
    u.pathI = 0;
    if (direct) [u.tx, u.tz] = this.squadSlot(sq, i);
    else {
      u.tx = fx + wz * sq.offLat[i] - wx * sq.offBack[i];
      u.tz = fz - wx * sq.offLat[i] - wz * sq.offBack[i];
    }
    u.faceX = wx;
    u.faceZ = wz;
  });
  if (direct) {
    // đã đặt ở squadDirect
  } else if (formed && sq.hx * wx + sq.hz * wz < SQUAD_PIVOT_COS) {
    sq.phase = "pivot";
    sq.phaseT = 0;
  } else if (formed) this.squadMarch(sq);
  // quân lộn xộn cũng lăn bánh ngay, tự vào hàng trên đường đi (cả khối chậm lại chờ xe đang tụt), không đứng tập hợp tại chỗ
  else this.squadMarch(sq);
  this.squads.push(sq);
}

/**
 * Thử chế độ "đi thẳng tới ô" cho quãng ngắn: đội hình dựng sẵn ở đích (tâm khối ở đích, quay theo hướng đi), chia ô bằng
 * phân công tối ưu (không đường nào cắt nhau). Đội đã vào hàng thì đội hình ở đích là chính hình dạng đang đứng, xoay
 * theo hướng đi; quân lộn xộn thì dựng lưới chuẩn theo vai trò. Được khi mọi ô đứng được và đường thẳng tới ô không vướng.
 */
function squadDirect(this: World, sq: Squad, units: readonly Unit[], wx: number, wz: number, cx: number, cz: number, cols: number, formed: boolean): boolean {
  if (formed) {
    // đội đã vào hàng: DỊCH NGUYÊN KHỐI, mọi xe đi cùng một vector (đường song song, không ai đổi chỗ), tới nơi quay mặt
    // về hướng vừa đi. Lùi lại thì hàng sau thành hàng đầu (người dùng chốt giữ nguyên chỗ đứng).
    sq.x += sq.goalX - cx;
    sq.z += sq.goalZ - cz;
  } else {
    this.squadArrange(sq, units, wx, wz, cx, cz, cols);
    sq.colsMax = cols;
    sq.hx = wx;
    sq.hz = wz;
    sq.x = sq.goalX + wx * (sq.depth / 2);
    sq.z = sq.goalZ + wz * (sq.depth / 2);
  }
  sq.phase = "direct";
  // phải đi vòng xa thật sự (qua cầu, vòng khe núi) thì không đi thẳng được: hành quân thành khối
  const mob = this.slowestMobility(sq);
  const route = this.grid.findPath(cx, cz, sq.goalX, sq.goalZ, this.grid.field(mob, false));
  if (!route) {
    sq.phase = "form";
    return false;
  }
  let len = 0;
  let px = cx;
  let pz = cz;
  for (let k = 0; k < route.length; k += 2) {
    len += Math.sqrt(dist2(px, pz, route[k], route[k + 1]));
    px = route[k];
    pz = route[k + 1];
  }
  if (len > Math.sqrt(dist2(cx, cz, sq.goalX, sq.goalZ)) * 1.35 + 4) {
    sq.phase = "form";
    return false;
  }
  // Bấm sát vật cản (bờ sông, vách đá): tìm chỗ gần nhất mà CẢ KHỐI đứng vừa, giữ nguyên hình dạng
  if (!this.squadFits(sq)) {
    const bx = sq.x;
    const bz = sq.z;
    let found = false;
    for (const [ox, oz] of SHIFT_OFFSETS) {
      sq.x = bx + ox;
      sq.z = bz + oz;
      if (this.squadFits(sq)) {
        found = true;
        break;
      }
    }
    if (!found) {
      sq.x = bx;
      sq.z = bz;
    }
  }
  // vẫn có ô vướng thì dời riêng ô đó sang ô trống gần nhất (cùng khoảng trống với tâm khối) chưa ai nhận
  const used = new Set<number>();
  const rx = sq.hz;
  const rz = -sq.hx;
  for (let i = 0; i < sq.ids.length; i++) {
    const [sx, sz] = this.squadSlot(sq, i);
    const ccx = sq.x - sq.hx * (sq.depth / 2);
    const ccz = sq.z - sq.hz * (sq.depth / 2);
    const [fx, fz] = this.freeSlot(sx, sz, rx, rz, sq.hx, sq.hz, used, [ccx, ccz], sq.rMax * SLOT_BODY);
    if (this.grid.blockedAt(fx, fz) || !this.grid.los(ccx, ccz, fx, fz)) {
      sq.phase = "form";
      return false;
    }
    sq.offLat[i] = (fx - sq.x) * rx + (fz - sq.z) * rz;
    sq.offBack[i] = (sq.x - fx) * sq.hx + (sq.z - fz) * sq.hz;
  }
  // dịch nguyên khối thì ai ở ô nấy; dựng mới thì chia ô tối ưu
  if (!formed) this.squadAssign(sq);
  sq.phaseT = 0;
  return true;
}

/** Mọi ô của đội hình (đặt theo người dẫn đầu hiện tại) đều đứng được và cùng một khoảng trống với tâm khối. */
function squadFits(this: World, sq: Squad): boolean {
  const cx = sq.x - sq.hx * (sq.depth / 2);
  const cz = sq.z - sq.hz * (sq.depth / 2);
  if (this.grid.blockedAt(cx, cz)) return false;
  for (let i = 0; i < sq.ids.length; i++) {
    const [sx, sz] = this.squadSlot(sq, i);
    if (this.grid.blockedAt(sx, sz) || this.map.inset(sx, sz) < 1 || this.grid.clearanceAt(sx, sz) < sq.rMax * SLOT_BODY || !this.grid.los(cx, cz, sx, sz)) return false;
  }
  return true;
}

/**
 * Chia ô cho các xe hiện có bằng phân công tối ưu (tổng quãng đường thẳng nhỏ nhất, `assignMin`): không hai đường đi nào
 * cắt nhau. Ô giữ nguyên chỗ (offLat / offBack theo chỉ số), chỉ đổi xe nào vào ô nào. Đang xếp theo vai trò thì mỗi xe
 * chỉ nhận ô của hàng đúng vai trò của nó.
 */
function squadAssign(this: World, sq: Squad): void {
  const n = sq.ids.length;
  if (n < 2) return;
  const units = sq.ids.map((id) => this.byId.get(id) as Unit);
  // mỗi ô thuộc về tuyến + lô của xe đang giữ nó: đổi chỗ trong cùng lô, xe cùng lô luôn đứng cạnh nhau
  // (xe "hai cánh" chỉ đổi chỗ với xe hai cánh, không thì phân công đẩy chúng vào giữa đội hình)
  const flankCode = FORMATIONS[sq.formation].flank;
  const key = (u: Unit): string => `${sq.rankOf[u.id]}:${u.lot}:${UNITS[u.kind].group === flankCode ? 1 : 0}`;
  const cost: number[][] = [];
  for (let i = 0; i < n; i++) {
    const [sx, sz] = this.squadSlot(sq, i);
    const want = key(units[i]);
    const row: number[] = [];
    for (let j = 0; j < n; j++) {
      const u = units[j];
      row.push(sq.byRank && key(u) !== want ? 1e9 : Math.sqrt(dist2(u.x, u.z, sx, sz)));
    }
    cost.push(row);
  }
  const a = assignMin(cost);
  sq.ids = a.map((j) => units[j].id);
}

/**
 * Lấy đúng hình dạng các xe đang đứng làm đội hình, đo theo hướng (hx, hz): gom hàng theo chiều sâu (lệch ≤ 1,5 m là cùng
 * hàng), thứ tự "gấp dây", người dẫn đầu ở giữa hàng đầu. Không ai phải nhích. Tắt xếp theo vai trò.
 */
function squadAdopt(this: World, sq: Squad, hx: number, hz: number): void {
  const units = sq.ids.map((id) => this.byId.get(id) as Unit);
  const n = units.length;
  let cx = 0;
  let cz = 0;
  for (const u of units) {
    cx += u.x / n;
    cz += u.z / n;
  }
  const fwd = (u: Unit): number => (u.x - cx) * hx + (u.z - cz) * hz;
  const lat = (u: Unit): number => (u.x - cx) * hz - (u.z - cz) * hx;
  let front = -Infinity;
  for (const u of units) front = Math.max(front, fwd(u));
  const sorted = [...units].sort((a, b) => fwd(b) - fwd(a) || a.id - b.id);
  const rows: Unit[][] = [];
  for (const u of sorted) {
    const row = rows[rows.length - 1];
    if (row && fwd(row[0]) - fwd(u) <= 1.5) row.push(u);
    else rows.push([u]);
  }
  sq.byRank = false;
  sq.ids = [];
  sq.offLat = [];
  sq.offBack = [];
  let minL = Infinity;
  let maxL = -Infinity;
  let cols = 1;
  let rMax = 0;
  rows.forEach((row, ri) => {
    row.sort((a, b) => lat(a) - lat(b) || a.id - b.id);
    if (ri % 2 === 1) row.reverse();
    cols = Math.max(cols, row.length);
    for (const u of row) {
      sq.ids.push(u.id);
      sq.offLat.push(lat(u));
      sq.offBack.push(front - fwd(u));
      minL = Math.min(minL, lat(u));
      maxL = Math.max(maxL, lat(u));
      rMax = Math.max(rMax, bodyRadius(u.kind));
    }
  });
  sq.cols = cols;
  sq.rMax = rMax;
  sq.width = maxL - minL + 2 * rMax;
  sq.depth = Math.max(...sq.offBack);
  sq.hx = hx;
  sq.hz = hz;
  sq.x = cx + hx * front;
  sq.z = cz + hz * front;
}

/**
 * Xếp thứ tự và ô trong đội hình theo hướng (hx, hz), tâm khối ở (cx, cz): vai trò (đầu / giữa / sau) trước, xe đang ở
 * phía trước vào hàng trước, trong hàng thì trái sang phải theo vị trí đang đứng (đường đi không cắt nhau).
 */
function squadArrange(this: World, sq: Squad, units: readonly Unit[], hx: number, hz: number, cx: number, cz: number, cols: number): void {
  const rx = hz;
  const rz = -hx;
  const fwd = (u: Unit): number => (u.x - cx) * hx + (u.z - cz) * hz;
  const lat = (u: Unit): number => (u.x - cx) * rx + (u.z - cz) * rz;
  const rank = (u: Unit): number => (sq.byRank ? sq.rankOf[u.id] : 0);
  // xe cùng lô đi liền nhau trên "sợi dây": lô nào đang ở trước vào trước
  const lotFwd = new Map<number, number>();
  for (const u of units) if (u.lot && (!lotFwd.has(u.lot) || fwd(u) > (lotFwd.get(u.lot) as number))) lotFwd.set(u.lot, fwd(u));
  const lead = (u: Unit): number => (u.lot ? (lotFwd.get(u.lot) as number) : fwd(u));
  const order = [...units].sort((a, b) => rank(a) - rank(b) || lead(b) - lead(a) || a.lot - b.lot || fwd(b) - fwd(a) || a.id - b.id);
  const rows: Unit[][] = [];
  for (const u of order) {
    const row = rows[rows.length - 1];
    if (!row || row.length >= cols || rank(row[0]) !== rank(u)) rows.push([u]);
    else row.push(u);
  }
  // thứ tự "gấp dây": hàng chẵn trái → phải, hàng lẻ phải → trái (khớp squadLayout)
  sq.ids = [];
  rows.forEach((row, ri) => {
    // trong một hàng, lô nào đứng bên trái thì vào trước, không để hai lô xen kẽ nhau
    const lotSum = new Map<number, [number, number]>();
    for (const u of row) {
      const e = lotSum.get(u.lot) ?? [0, 0];
      e[0] += lat(u);
      e[1]++;
      lotSum.set(u.lot, e);
    }
    const lotLat = (u: Unit): number => {
      if (!u.lot) return lat(u);
      const e = lotSum.get(u.lot) as [number, number];
      return e[0] / e[1];
    };
    row.sort((a, b) => lotLat(a) - lotLat(b) || a.lot - b.lot || lat(a) - lat(b) || a.id - b.id);
    if (ri % 2 === 1) row.reverse();
    for (const u of row) sq.ids.push(u.id);
  });
  sq.colsMax = cols;
  sq.cols = cols;
  this.squadLayout(sq);
  sq.hx = hx;
  sq.hz = hz;
  sq.x = cx + hx * (sq.depth / 2);
  sq.z = cz + hz * (sq.depth / 2);
}

/**
 * Tính ô (lệch ngang, lùi sau) cho `sq.cols` xe mỗi hàng, theo đúng thứ tự `sq.ids`; mỗi vai trò bắt đầu hàng mới.
 * Thứ tự kiểu "gấp dây": hàng chẵn xếp trái → phải, hàng lẻ phải → trái. Co / giãn hàng chỉ là gấp lại sợi dây với độ
 * dài khúc khác: hai xe cạnh nhau trên dây vẫn cạnh nhau (không ai chạy chéo qua đội), xe đầu dây (hàng đầu) vẫn ở đầu.
 */
function squadLayout(this: World, sq: Squad): void {
  const unit = (id: number): Unit => this.byId.get(id) as Unit;
  const rank = (id: number): number => (sq.byRank ? sq.rankOf[id] : 0);
  const def = FORMATIONS[sq.formation];
  // mã "hai cánh" (phòng không của đội hình hộ tống) đứng dọc hai bên tuyến giữa, chỉ khi đội đang giãn hết cỡ; đội co hàng qua chỗ hẹp thì xếp hàng như thường
  const flanking = sq.byRank && def.flank !== undefined && sq.cols >= sq.colsMax;
  const flank: number[] = [];
  const rows: number[][] = [];
  sq.ids.forEach((id, i) => {
    if (flanking && UNITS[unit(id).kind].group === def.flank) {
      flank.push(i);
      return;
    }
    const row = rows[rows.length - 1];
    if (!row || row.length >= sq.cols || rank(sq.ids[row[0]]) !== rank(id)) rows.push([i]);
    else row.push(i);
  });
  const rMax = (row: number[]): number => {
    let r = 0;
    for (const i of row) r = Math.max(r, bodyRadius(unit(sq.ids[i]).kind));
    return r;
  };
  // vòng giãn lớn nhất trong hàng: hai hàng liền nhau cách tổng hai vòng giãn + khe (đế tròn 16/11/2026; trước đó theo chiều
  // dài thân chữ nhật, người dùng 12/11/2026: theo bán kính cũ thì hai hàng Titan lồng nhau 2,4 m dọc thân)
  const lMax = (row: number[]): number => {
    let l = 0;
    for (const i of row) l = Math.max(l, spaceRadius(unit(sq.ids[i]).kind));
    return l;
  };
  sq.offLat = new Array<number>(sq.ids.length).fill(0);
  sq.offBack = new Array<number>(sq.ids.length).fill(0);
  sq.width = 0;
  sq.rMax = 0;
  let back = 0;
  rows.forEach((row, ri) => {
    const r = rMax(row);
    if (ri > 0) back += lMax(rows[ri - 1]) + lMax(row) + FORMATION_GAP;
    // khoảng cột theo xe trong hàng (`colSpacing`); khoảng hàng theo chiều dài ở trên tự đủ chỗ xoay tại chỗ
    const spacing = colSpacing(
      row.map((i) => unit(sq.ids[i]).kind),
      !narrowMarch(sq)
    );
    row.forEach((i, j) => {
      const col = ri % 2 === 1 ? row.length - 1 - j : j;
      sq.offLat[i] = (col - (row.length - 1) / 2) * spacing;
      sq.offBack[i] = back;
    });
    sq.width = Math.max(sq.width, (row.length - 1) * spacing + 2 * r);
    sq.rMax = Math.max(sq.rMax, r);
  });
  sq.depth = back;
  if (flank.length) this.squadFlanks(sq, flank, rows);
}

/** Đặt các xe "hai cánh" dọc hai bên tuyến giữa, chia đều hai phía, từ trước ra sau. Chưa có hàng nào thì xếp một hàng. */
function squadFlanks(this: World, sq: Squad, flank: readonly number[], rows: readonly number[][]): void {
  const rankOfRow = (row: readonly number[]): number => sq.rankOf[sq.ids[row[0]]];
  const center = rows.filter((row) => rankOfRow(row) !== 0 && rankOfRow(row) !== REAR_RANK);
  const pool = center.length ? center : rows;
  let from = Infinity;
  let to = -Infinity;
  let halfW = 0;
  for (const row of pool)
    for (const i of row) {
      from = Math.min(from, sq.offBack[i]);
      to = Math.max(to, sq.offBack[i]);
      halfW = Math.max(halfW, Math.abs(sq.offLat[i]));
    }
  if (from === Infinity) {
    from = to = 0;
  }
  let r = 0;
  for (const i of flank) r = Math.max(r, spaceRadius((this.byId.get(sq.ids[i]) as Unit).kind));
  const lat = halfW + sq.rMax + r + FORMATION_GAP;
  const perSide = Math.ceil(flank.length / 2);
  flank.forEach((i, k) => {
    const s = Math.floor(k / 2);
    sq.offLat[i] = k % 2 === 0 ? -lat : lat;
    sq.offBack[i] = perSide > 1 ? from + ((to - from) * s) / (perSide - 1) : (from + to) / 2;
  });
  sq.width = Math.max(sq.width, 2 * (lat + r));
  sq.rMax = Math.max(sq.rMax, r);
}

/** Tính tuyến của từng xe theo mã phân nhóm; đội hình có đoạn hậu thì 1/3 số xe GIAP ở phía sau, tính cả lô, thành tuyến cuối. */
function squadRanks(this: World, sq: Squad, units: readonly Unit[], hx: number, hz: number, cx: number, cz: number): void {
  const def = FORMATIONS[sq.formation];
  sq.rankOf = {};
  for (const u of units) sq.rankOf[u.id] = def.rank[UNITS[u.kind].group];
  if (!def.rearGuard) return;
  const fwd = (u: Unit): number => (u.x - cx) * hx + (u.z - cz) * hz;
  const armor = units.filter((u) => UNITS[u.kind].group === "GIAP").sort((a, b) => fwd(a) - fwd(b) || a.id - b.id);
  const want = Math.floor(armor.length / 3);
  if (want === 0) return;
  let taken = 0;
  const lots = new Set<number>();
  for (const u of armor) {
    if (taken >= want && !(u.lot && lots.has(u.lot))) break;
    sq.rankOf[u.id] = REAR_RANK;
    taken++;
    if (u.lot) lots.add(u.lot);
  }
}

/** Tốc độ chung của khối: xe chậm được hộ tống nên đi nhanh hơn chính nó, tới mức trần. Chỉ toàn xe chậm thì không đổi. */
function squadSpeed(this: World, units: readonly Unit[]): number {
  let min = Infinity;
  let sum = 0;
  for (const u of units) {
    const v = UNITS[u.kind].speed;
    min = Math.min(min, v);
    sum += v;
  }
  return Math.min(sum / units.length, min * RULES.escortBoost);
}

/** Tốc độ riêng của một xe lúc này: trong đội thì không thấp hơn tốc độ khối (cộng phần đuổi kịp). */
function speedOf(this: World, u: Unit): number {
  const v = UNITS[u.kind].speed;
  if (!u.squad) return v;
  const sq = this.squadById(u.squad);
  if (!sq) return v;
  // dịch nguyên khối: tất cả đúng một tốc độ, xe nhanh không vượt lên chiếm làn của xe chậm
  if (sq.phase === "direct" && sq.rigid) return sq.speed;
  return sq.speed > v ? sq.speed * SQUAD_CATCHUP : v;
}

/** Ô của xe thứ i: [x, z, hướng x, hướng z]. Đang hành quân thì bám vệt người dẫn đầu, còn lại theo khối cứng. */
function squadSlot(this: World, sq: Squad, i: number): [number, number, number, number] {
  const lat = sq.offLat[i] + sq.shift;
  const back = sq.offBack[i];
  if (sq.phase === "march") {
    const p = this.trailAt(sq, sq.s - back);
    return [p[0] + p[3] * lat, p[1] - p[2] * lat, p[2], p[3]];
  }
  return [sq.x + sq.hz * lat - sq.hx * back, sq.z - sq.hx * lat - sq.hz * back, sq.hx, sq.hz];
}

/** Điểm trên vệt người dẫn đầu tại quãng đường s (nội suy; trước điểm đầu thì kéo thẳng lùi theo hướng điểm đầu). */
function trailAt(this: World, sq: Squad, s: number): [number, number, number, number] {
  const t = sq.trail;
  const n = t.length / 6;
  if (n === 0) return [sq.x, sq.z, sq.hx, sq.hz];
  if (s <= t[4]) {
    const d = t[4] - s;
    return [t[0] - t[2] * d, t[1] - t[3] * d, t[2], t[3]];
  }
  let k = n - 1;
  while (k > 0 && t[k * 6 + 4] > s) k--;
  if (k === n - 1) return [t[k * 6], t[k * 6 + 1], t[k * 6 + 2], t[k * 6 + 3]];
  const a = k * 6;
  const b = a + 6;
  const span = t[b + 4] - t[a + 4];
  const f = span > 1e-9 ? (s - t[a + 4]) / span : 0;
  let hx = t[a + 2] + (t[b + 2] - t[a + 2]) * f;
  let hz = t[a + 3] + (t[b + 3] - t[a + 3]) * f;
  const hl = Math.sqrt(hx * hx + hz * hz);
  if (hl > 1e-9) {
    hx /= hl;
    hz /= hl;
  } else {
    hx = t[b + 2];
    hz = t[b + 3];
  }
  return [t[a] + (t[b] - t[a]) * f, t[a + 1] + (t[b + 1] - t[a + 1]) * f, hx, hz];
}

/**
 * Cả đội đã xoay tại chỗ xong: GIỮ NGUYÊN CHỖ ĐỨNG (không xếp lại theo vai trò, người dùng chốt 06/11/2026: quay đầu
 * 180° thì hàng sau thành hàng đầu). Đội hình mới lấy đúng vị trí đang đứng, đo theo hướng mới: xoay bao nhiêu độ cũng
 * không ai phải nhích. Thứ tự vẫn kiểu "gấp dây" (theo hàng từ trước ra sau) để sau này co / giãn hàng vẫn gọn.
 */
function squadAfterPivot(this: World, sq: Squad): void {
  this.squadAdopt(sq, sq.wantX, sq.wantZ);
  sq.cols = Math.min(sq.cols, sq.colsMax);
  this.squadMarch(sq);
}

/** Bắt đầu hành quân: tìm đường cho người dẫn đầu (tới đích + nửa bề sâu, để tâm khối dừng đúng đích), vệt thẳng phía sau. */
function squadMarch(this: World, sq: Squad): void {
  const [gx, gz] = this.grid.nearestFree(sq.goalX + sq.wantX * (sq.depth / 2), sq.goalZ + sq.wantZ * (sq.depth / 2), 8) ?? [sq.goalX, sq.goalZ];
  const [hx0, hz0] = this.grid.nearestFree(sq.x, sq.z, 6) ?? [sq.x, sq.z];
  let mob: Mobility = "wheel";
  let slowest = Infinity;
  for (const id of sq.ids) {
    const spec = UNITS[(this.byId.get(id) as Unit).kind];
    if (spec.speed < slowest) {
      slowest = spec.speed;
      mob = spec.mobility ?? "wheel";
    }
  }
  // người dẫn đầu đi giữa hành lang (tránh men sát vật cản): đội hình khỏi co / dạt vô cớ
  sq.path = this.grid.findPath(hx0, hz0, gx, gz, this.grid.corridor(mob)) ?? this.grid.findPath(hx0, hz0, gx, gz, this.grid.field(mob, false)) ?? [gx, gz];
  sq.pathI = 0;
  sq.trail = [];
  const L = sq.depth + 12;
  for (let b = L; b >= 0; b -= 1) sq.trail.push(sq.x - sq.hx * b, sq.z - sq.hz * b, sq.hx, sq.hz, sq.s - b, 0);
  sq.phase = "march";
  sq.phaseT = 0;
}

/** Kiểu di chuyển của xe chậm nhất trong đội (dùng để tìm đường cho cả đội). */
function slowestMobility(this: World, sq: Squad): Mobility {
  let mob: Mobility = "wheel";
  let slowest = Infinity;
  for (const id of sq.ids) {
    const spec = UNITS[(this.byId.get(id) as Unit).kind];
    if (spec.speed < slowest) {
      slowest = spec.speed;
      mob = spec.mobility ?? "wheel";
    }
  }
  return mob;
}

function squadById(this: World, id: number): Squad | undefined {
  for (const sq of this.squads) if (sq.id === id) return sq;
  return undefined;
}

/** Mọi xe đã thu bệ và quay thân gần đúng hướng tới ô của mình. */
function squadReady(this: World, sq: Squad): boolean {
  return sq.ids.every((id, i) => {
    const u = this.byId.get(id) as Unit;
    const [sx, sz] = this.squadSlot(sq, i);
    const d = Math.sqrt(dist2(u.x, u.z, sx, sz));
    if (d <= 0.4) return true;
    if (UNITS[u.kind].weapon?.deploy && u.still > 0) return false;
    return d < 3 || (u.hx * (sx - u.x) + u.hz * (sz - u.z)) / d >= PIVOT_COS;
  });
}

/** Xe rời đội hình (lệnh mới, bị hạ): các xe còn lại dồn hàng, giữ thứ tự. */
function leaveSquad(this: World, u: Unit): void {
  const sq = this.squadById(u.squad);
  u.squad = 0;
  if (!sq) return;
  const i = sq.ids.indexOf(u.id);
  if (i < 0) return;
  sq.ids.splice(i, 1);
  // xe vừa bị hạ trong tick trước có thể chưa được dọn khỏi đội (updateSquads chạy sau lệnh)
  sq.ids = sq.ids.filter((id) => {
    const m = this.byId.get(id);
    return !!m && m.cat === "unit" && m.hp > 0;
  });
  if (sq.ids.length) this.squadLayout(sq);
}

/** Giải tán đội hình khi tới nơi: mọi xe đứng chờ tại chỗ, quay theo hướng đội hình. */
function disbandSquad(this: World, sq: Squad): void {
  for (const id of sq.ids) {
    const u = this.byId.get(id);
    if (!u || u.cat !== "unit") continue;
    u.squad = 0;
    this.setIdle(u);
    u.faceX = sq.phase === "direct" ? sq.wantX : sq.hx;
    u.faceZ = sq.phase === "direct" ? sq.wantZ : sq.hz;
  }
  sq.ids = [];
}

/** Mỗi tick, trước khi xe di chuyển: dọn xe đã mất, rồi cho người dẫn đầu của từng đội hình đi một bước. */
function updateSquads(this: World): void {
  for (const sq of this.squads) {
    const before = sq.ids.length;
    sq.ids = sq.ids.filter((id) => {
      const u = this.byId.get(id);
      return !!u && u.cat === "unit" && u.hp > 0 && u.squad === sq.id;
    });
    if (sq.ids.length && sq.ids.length !== before) this.squadLayout(sq);
    if (sq.ids.length === 1) this.disbandSquad(sq);
    if (sq.ids.length) this.stepSquad(sq);
  }
  this.squads = this.squads.filter((sq) => sq.ids.length > 0);
}

function stepSquad(this: World, sq: Squad): void {
  sq.phaseT++;
  const hold = sq.hold;
  sq.hold = false;
  sq.holding = hold;
  sq.speed = this.squadSpeed(sq.ids.map((id) => this.byId.get(id) as Unit));
  const speed = sq.speed;
  let lag = 0;
  for (let i = 0; i < sq.ids.length; i++) lag = Math.max(lag, this.squadLag(sq, i, this.byId.get(sq.ids[i]) as Unit)[0]);
  // xe tụt khỏi ô thì cả khối chậm lại chờ; lúc hành quân không dừng hẳn (tối thiểu 25%) để không bao giờ kẹt chết
  const wait = clamp(1 - (lag - SQUAD_LAG) / SQUAD_LAG, sq.phase === "march" ? 0.25 : 0, 1);
  switch (sq.phase) {
    case "form":
      if (lag < 1.2 || sq.phaseT > sec(SQUAD_FORM_MAX)) this.squadMarch(sq);
      return;
    case "pivot": {
      // cả đội xoay tại chỗ, đồng bộ theo xe quay chậm nhất; xong khi mọi thân xe đã quay đúng hướng
      let rate = Infinity;
      for (const id of sq.ids) rate = Math.min(rate, UNITS[(this.byId.get(id) as Unit).kind].turnRate ?? 90);
      // hướng đội chỉ quay tiếp khi mọi thân xe đã theo kịp (lệch < 10°): xe vừa vào ô muộn, thân còn lệch nhiều, mà xoay theo
      // đường ngắn nhất thì có thể xoay NGƯỢC CHIỀU cả đội và quệt xe bên cạnh (thân song song cùng xoay mới không chạm nhau)
      const synced = sq.ids.every((id) => {
        const u = this.byId.get(id) as Unit;
        return u.hx * sq.hx + u.hz * sq.hz >= PIVOT_SYNC_COS;
      });
      if (synced) {
        turnToward(sq.hx, sq.hz, sq.wantX, sq.wantZ, traverseStep(rate), TMP);
        sq.hx = TMP.x;
        sq.hz = TMP.z;
      }
      const done =
        sq.hx === sq.wantX &&
        sq.hz === sq.wantZ &&
        sq.ids.every((id) => {
          const u = this.byId.get(id) as Unit;
          return u.hx * sq.wantX + u.hz * sq.wantZ >= ALIGNED_COS;
        });
      if (done || sq.phaseT > sec(SQUAD_PIVOT_MAX)) this.squadAfterPivot(sq);
      return;
    }
    case "settle":
      // 0,4 m: giải tán là xe đứng luôn tại chỗ; xe vừa đổi ô (đội co / giãn hàng ở đích) còn cách ô 0,8 m thì lệch hẳn khỏi hàng
      if (lag < 0.4 || sq.phaseT > sq.settleMax) this.disbandSquad(sq);
      return;
    case "direct":
      if (sq.rigid && !sq.rolling) {
        // quân cố định thu bệ, xe chậm xoay thân lâu hơn: chờ đủ mặt rồi mới cùng đi, không thì xe nhanh vượt lên rồi đỗ chắn làn của xe chậm
        if (this.squadReady(sq) || sq.phaseT > sec(SQUAD_PIVOT_MAX)) {
          sq.rolling = true;
          sq.phaseT = 0;
        }
        return;
      }
      // mỗi xe tự đi thẳng tới ô; xong khi ai cũng tới ô (hoặc quá lâu)
      if (lag < 0.8 || sq.phaseT > sec(SQUAD_FORM_MAX + SQUAD_DIRECT / speed)) this.disbandSquad(sq);
      return;
    case "march":
      break;
  }
  if (sq.phaseT % 3 === 1) this.squadFit(sq);
  const R = Math.max(sq.width / 2, SQUAD_MIN_TURN_R);
  // các hàng đang ở khúc cua (vệt đang quay): xe mép ngoài phải chạy xa hơn, nên cả khối chậm lại cho vừa tốc độ
  let turning = false;
  const t = sq.trail;
  for (let k = t.length - 6; k >= 0 && t[k + 4] >= sq.s - sq.depth - 0.5; k -= 6)
    if (t[k + 5]) {
      turning = true;
      break;
    }
  let v = speed * wait * (hold ? 0 : 1) * (turning ? R / (R + sq.width / 2) : 1);
  if (v <= 0) return;
  // dạt ngang dần (nửa tốc độ hành quân) để né vật cản một bên
  const slide = v * DT * 0.5;
  sq.shift += clamp(sq.shiftWant - sq.shift, -slide, slide);
  // người dẫn đầu đi đúng theo đường A*
  let rem = v * DT;
  while (rem > 1e-9 && sq.pathI * 2 < sq.path.length) {
    const wx = sq.path[sq.pathI * 2];
    const wz = sq.path[sq.pathI * 2 + 1];
    const d = Math.sqrt(dist2(sq.x, sq.z, wx, wz));
    if (d <= rem) {
      sq.x = wx;
      sq.z = wz;
      sq.s += d;
      rem -= d;
      sq.pathI++;
      continue;
    }
    sq.x += ((wx - sq.x) / d) * rem;
    sq.z += ((wz - sq.z) / d) * rem;
    sq.s += rem;
    rem = 0;
  }
  // hướng đội hình quay dần về hướng đường đi, bán kính quay R (bề ngang / 2): khúc cua thành cú xoay cánh cửa từng hàng
  let turned = false;
  if (sq.pathI * 2 < sq.path.length) {
    const dx = sq.path[sq.pathI * 2] - sq.x;
    const dz = sq.path[sq.pathI * 2 + 1] - sq.z;
    const dl = Math.sqrt(dx * dx + dz * dz);
    if (dl > 1e-6) {
      turnToward(sq.hx, sq.hz, dx / dl, dz / dl, turnStep((v * DT) / R), TMP);
      turned = TMP.x !== sq.hx || TMP.z !== sq.hz;
      sq.hx = TMP.x;
      sq.hz = TMP.z;
    }
  }
  t.push(sq.x, sq.z, sq.hx, sq.hz, sq.s, turned ? 1 : 0);
  // bỏ phần vệt đã ở quá xa phía sau hàng cuối
  let drop = 0;
  while (drop + 12 < t.length && t[drop + 6 + 4] < sq.s - sq.depth - 12) drop += 6;
  if (drop) t.splice(0, drop);
  if (sq.pathI * 2 >= sq.path.length) this.squadSettle(sq, speed);
}

/**
 * Người dẫn đầu tới cuối đường: đội hình chuyển sang hình dạng cuối cùng (khối cứng, giãn hết cỡ mà chỗ đứng cho phép,
 * tâm ở đích, quay theo hướng đang đi). Xe còn ở xa (đuôi cột chưa qua cầu…) tự tìm đường về ô của mình.
 */
function squadSettle(this: World, sq: Squad, speed: number): void {
  // ô dừng phải đủ chỗ cho xe XOAY TẠI CHỖ (tới nơi xe nào cũng xoay về hướng đội hình): khoảng trống ≥ nửa đường chéo thân
  // xe lớn nhất của đội, không thì đuôi xe quét vào vách / nhà và bị đẩy ra khỏi ô (vật cản là ràng buộc cứng từ 12/11/2026)
  const turnR = this.squadTurnR(sq);
  sq.settleMax = sec(SQUAD_SETTLE_MAX + sq.depth / speed);
  sq.phase = "settle";
  sq.phaseT = 0;
  sq.shift = 0;
  sq.shiftWant = 0;
  // đội hình đang có (kể cả hình "giữ nguyên chỗ đứng" sau khi xoay) đứng vừa ở đây và không đang co hàng: giữ nguyên
  if (sq.cols >= sq.colsMax) {
    let ok = true;
    for (let i = 0; i < sq.ids.length && ok; i++) {
      const [sx, sz] = this.squadSlot(sq, i);
      ok = !this.grid.blockedAt(sx, sz) && this.map.inset(sx, sz) >= 1 && this.grid.clearanceAt(sx, sz) >= sq.rMax * SLOT_BODY;
    }
    if (ok) return;
  }
  // khối đang đứng ở cuối đường: giữ nguyên chỗ; chỉ khi đổi số xe mỗi hàng (cột vừa qua chỗ hẹp giãn ra) mới đặt lại
  // tâm khối vào đích. Dời chỗ không cần thiết làm xe phải nhích và quay thân lung tung lúc dừng.
  const was = sq.cols;
  const hx0 = sq.x;
  const hz0 = sq.z;
  const place = (): void => {
    if (sq.cols === was) {
      sq.x = hx0;
      sq.z = hz0;
      return;
    }
    sq.x = sq.goalX + sq.hx * (sq.depth / 2);
    sq.z = sq.goalZ + sq.hz * (sq.depth / 2);
  };
  // hai lượt: hình đội mà mọi ô đủ chỗ xoay tại chỗ; không có thì hình đội mà mọi ô chỉ cần vừa nửa bề ngang thân (sát bờ sông,
  // đầu cầu…); vẫn không có mới co thành hàng một. Một lượt duy nhất với điều kiện xoay thì đội tới đầu cầu co thành hàng một
  // dài 66 m, đuôi hàng nằm lại bên kia sông.
  const halfW = sq.rMax * SLOT_BODY;
  let c = sq.colsMax;
  // với mỗi số cột, thử dạt cả khối sang ngang 0, ±2, ±4, ±6 m trước khi bớt cột (đích sát vật cản thì dạt ra, đừng co hàng)
  let shift = 0;
  const fits = (need: number): boolean => {
    for (let i = 0; i < sq.ids.length; i++) {
      const [sx, sz] = this.squadSlot(sq, i);
      if (this.grid.blockedAt(sx, sz) || this.map.inset(sx, sz) < 1 || this.grid.clearanceAt(sx, sz) < need) return false;
    }
    return true;
  };
  search: for (const need of [turnR, halfW]) {
    for (c = sq.colsMax; c > 1; c--) {
      sq.cols = c;
      this.squadLayout(sq);
      for (const d of SETTLE_SHIFTS) {
        place();
        sq.x += sq.hz * d;
        sq.z -= sq.hx * d;
        if (fits(need)) {
          shift = d;
          break search;
        }
      }
    }
  }
  if (c < 2) c = 1;
  sq.cols = c;
  this.squadLayout(sq);
  place();
  sq.x += sq.hz * shift;
  sq.z -= sq.hx * shift;
  // vừa giãn lại hàng (cột qua chỗ hẹp xong): chia ô ở đích theo phân công tối ưu, không ai chạy chéo
  if (c !== was) {
    this.squadAssign(sq);
    sq.settleMax += sec(SQUAD_RESHAPE_EXTRA); // xe phải đổi chỗ thật sự, cho đủ thời gian trước khi giải tán
  }
}

/**
 * Co / giãn / dạt đội hình theo bề rộng đường: đo khoảng trống bên trái, bên phải ở chỗ từng hàng đang đứng và vài điểm
 * phía trước trên đường đi. Vật cản chỉ ở một bên thì cả khối dạt sang bên trống; hai bên đều hẹp (cầu, khe núi) thì co
 * bớt số xe mỗi hàng ngay; chỉ giãn lại khi đã đủ rộng liên tục khoảng 2 giây (cả cột đã qua khỏi chỗ hẹp).
 */
function squadFit(this: World, sq: Squad): void {
  const kinds = sq.ids.map((id) => (this.byId.get(id) as Unit).kind);
  const wideSp = colSpacing(kinds);
  const narrowSp = colSpacing(kinds, false);
  // bề ngang đội c cột lúc hành quân: giãn hết cỡ thì khoảng cột rộng (đủ xoay tại chỗ), co hàng thì khoảng hẹp (`narrowMarch`)
  const widthOf = (c: number): number => (c - 1) * (c >= sq.colsMax ? wideSp : narrowSp) + 2 * sq.rMax;
  const fullW = widthOf(sq.colsMax);
  const scan = fullW + 1;
  const left: number[] = [];
  const right: number[] = [];
  const sample = (x: number, z: number, hx: number, hz: number): void => {
    left.push(this.freeSide(x, z, hx, hz, -1, scan));
    right.push(this.freeSide(x, z, hx, hz, 1, scan));
  };
  for (const b of new Set(sq.offBack)) {
    const p = this.trailAt(sq, sq.s - b);
    sample(p[0], p[1], p[2], p[3]);
  }
  // nhìn trước theo đường đi
  let px = sq.x;
  let pz = sq.z;
  let k = sq.pathI;
  let ahead = 0;
  while (ahead < SQUAD_LOOK && k * 2 < sq.path.length) {
    const wx = sq.path[k * 2];
    const wz = sq.path[k * 2 + 1];
    const d = Math.sqrt(dist2(px, pz, wx, wz));
    if (d < 1e-6) {
      k++;
      continue;
    }
    const step = Math.min(2, d, SQUAD_LOOK - ahead);
    const dx = (wx - px) / d;
    const dz = (wz - pz) / d;
    px += dx * step;
    pz += dz * step;
    ahead += step;
    sample(px, pz, dx, dz);
    if (step >= d) k++;
  }
  // với c xe mỗi hàng: khoảng dạt ngang khả thi [lo, hi] (null = không vừa)
  const range = (c: number, margin: number): [number, number] | null => {
    const half = widthOf(c) / 2 + margin;
    let lo = -Infinity;
    let hi = Infinity;
    for (let i = 0; i < left.length; i++) {
      lo = Math.max(lo, half - left[i]);
      hi = Math.min(hi, right[i] - half);
    }
    return lo <= hi ? [lo, hi] : null;
  };
  let c = sq.cols;
  if (!range(c, 0)) {
    // hẹp: co ngay tới mức vừa (1 xe mỗi hàng thì đành chịu)
    while (c > 1 && !range(c, 0)) c--;
    sq.wideFor = 0;
  } else if (c < sq.colsMax && range(c + 1, 0.5)) {
    // đủ rộng để giãn thêm một hàng (dư 0,5 m mỗi bên): chờ ổn định rồi mới giãn
    if (++sq.wideFor >= SQUAD_WIDEN_CHECKS) {
      c++;
      sq.wideFor = 0;
    }
  } else sq.wideFor = 0;
  if (c !== sq.cols) {
    sq.cols = c;
    this.squadLayout(sq);
  }
  const r = range(sq.cols, 0);
  sq.shiftWant = r ? clamp(0, r[0], r[1]) : 0;
}

/** Khoảng trống (m) từ điểm (x, z) sang một bên (side = 1 phải, −1 trái) của hướng (hx, hz), đo tối đa `max` m. */
function freeSide(this: World, x: number, z: number, hx: number, hz: number, side: number, max: number): number {
  let t = 0;
  while (t + 1 <= max) {
    const qx = x + hz * side * (t + 1);
    const qz = z - hx * side * (t + 1);
    if (this.grid.blockedAt(qx, qz) || this.map.inset(qx, qz) < 1) break;
    t += 1;
  }
  return t + 0.5;
}

/** Một xe trong đội hình: bắn mục tiêu trong tầm (không bỏ hàng đi đuổi), rồi đi về ô của mình. */
function squadMember(this: World, u: Unit, w: WeaponSpec | undefined, range: number): Target | null {
  const sq = this.squadById(u.squad);
  const i = sq ? sq.ids.indexOf(u.id) : -1;
  if (!sq || i < 0) {
    u.squad = 0;
    this.setIdle(u);
    return null;
  }
  let fireAt: Target | null = null;
  if (w) {
    const t = this.acquire(u, w, range);
    if (t && this.inRange(u.x, u.z, w, t, range)) {
      fireAt = t;
      if (sq.kind === "amove") sq.hold = true;
    }
  }
  if (sq.phase === "pivot") {
    // cả đội xoay tại chỗ: không ai di chuyển, thân quay theo hướng đội hình (đội quay theo xe chậm nhất nên đồng bộ)
    this.turnHull(u, sq.hx, sq.hz);
    return fireAt;
  }
  // đi-và-đánh: cả đội đang dừng bắn thì xe đang tự đi tới ô cũng đứng lại
  if (sq.phase === "direct" && sq.kind === "amove" && sq.holding) return fireAt;
  const [, shx, shz, sx, sz] = this.squadLag(sq, i, u);
  const d = Math.sqrt(dist2(u.x, u.z, sx, sz));
  // cách ô THẬT (kể cả xe đang đứng chờ phía trước ô lúc hành quân): ORCA chỉ cho xe cùng đội né nhau khi có xe lệch ô
  const [ox, oz] = this.squadSlot(sq, i);
  u.slotOff = Math.sqrt(dist2(u.x, u.z, ox, oz));
  if (sq.phase === "direct" && sq.rigid && !sq.rolling) {
    // chưa lăn bánh: chỉ thu bệ và xoay thân về hướng sắp đi
    const dep = UNITS[u.kind].weapon?.deploy;
    if (dep && u.still > 0 && d > 0.4) {
      u.still = Math.min(u.still, sec(dep.time)) - 1;
      u.packing = true;
    } else if (d >= 3) this.turnHull(u, (sx - u.x) / d, (sz - u.z) / d);
    return fireAt;
  }
  // bị che: vách / nhà, hoặc đồng đội cùng phe đang đứng chắn giữa đường (bước 2: đi vòng qua xe đứng, không ủi xe đã vào
  // hàng; người dùng 16/11/2026: "một chiếc tiến tới đang đẩy chiếc còn lại ra khỏi hàng")
  // Chỉ xét xe đứng khi đội không hành quân: lúc hành quân xe bám ô di động trên vệt đội, đồng đội khựng 1 giây là bị coi như
  // chắn đường, xe bỏ ô đi tìm đường (kiểm thử "bám sát ô" tụt 11 m)
  const stand = sq.phase === "march" ? undefined : (this.standFor(u) ?? undefined);
  const blocked = d > 2 && !this.grid.los(u.x, u.z, sx, sz, stand ? Math.max(0.7, wallRadius(u.kind)) : 0.7, stand);
  if (d > SQUAD_FAR || blocked) {
    // xa ô hoặc bị che: tìm đường tới ô (mỗi giây tìm lại một lần, ô còn đang di chuyển)
    if (u.path.length === 0 || this.tick >= u.repathAt) {
      this.setPath(u, sx, sz);
      u.repathAt = this.tick + sec(1);
    }
    // không tìm được đường (ô bị bao kín…): vẫn nhích thẳng về phía ô, đừng đứng im
    if (u.path.length) this.follow(u);
    else this.stepToward(u, sx, sz, d);
  } else {
    u.path = [];
    u.pathI = 0;
    this.stepToward(u, sx, sz, d);
  }
  // đứng sát ô: thân quay dần theo hướng đội hình (đi thẳng tới ô: hướng vừa đi), đi đều, không lắc theo từng chỉnh nhỏ
  if (d < 1.5) {
    if (sq.phase === "direct") this.turnHull(u, sq.wantX, sq.wantZ);
    else this.turnHull(u, shx, shz);
  }
  return fireAt;
}

/**
 * Độ tụt của xe thứ i so với ô (m) và điểm nó nên tới: [tụt, hướng x, hướng z, đích x, đích z]. Lúc hành quân, xe đang
 * đứng TRƯỚC ô của mình (ví dụ đoàn vừa co thành hàng một trước cầu) thì chờ tới lượt: chỉ chỉnh ngang cho thẳng cột,
 * không lùi lại, và không bị tính là tụt (không làm cả khối dừng chờ).
 */
function squadLag(this: World, sq: Squad, i: number, u: Unit): [number, number, number, number, number] {
  const [sx, sz, hx, hz] = this.squadSlot(sq, i);
  const along = (u.x - sx) * hx + (u.z - sz) * hz;
  if (sq.phase === "march" && along > 0.3) {
    const tx = sx + hx * along;
    const tz = sz + hz * along;
    return [Math.sqrt(dist2(u.x, u.z, tx, tz)), hx, hz, tx, tz];
  }
  return [Math.sqrt(dist2(u.x, u.z, sx, sz)), hx, hz, sx, sz];
}

const methods = { formationOf, airSlots, orderMove, formation, freeSlot, arrive, createSquad, squadDirect, squadFits, squadAssign, squadAdopt, squadArrange, squadLayout, squadFlanks, squadRanks, squadSpeed, speedOf, squadSlot, trailAt, squadAfterPivot, squadMarch, slowestMobility, squadById, squadReady, leaveSquad, disbandSquad, updateSquads, stepSquad, squadSettle, squadFit, freeSide, squadMember, squadLag, squadTurnR };
type Methods = typeof methods;
declare module "./core" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface World extends Methods {}
}
Object.assign(World.prototype, methods);
