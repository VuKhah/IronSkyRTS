/** Di chuyển một xe: quay thân, bước tới, đi theo đường A*, né vách, đẩy xe không chồng lên nhau. */
import { RULES, SOFT_PASS, UNITS } from "../content";
import { dcos, dist2, dsin, TAU, turnToward } from "../fmath";
import type { Target, Unit } from "../types";
import type { StandLayer } from "../grid";
import { DT, sec, bodyRadius, spaceRadius, wallRadius, isSquad, HEX_COS30, GOAL_SHIFT, PIVOT_COS, ALIGNED_COS, TMP, traverseStep } from "./shared";
import { World } from "./core";
/** Độ lệch hướng / phanh né xe nhỏ dần khi cách đích dưới chừng này mét. */
const AVOID_FADE = 9;
/** Đích ở phía sau và gần hơn chừng này mét thì xe lùi thẳng (không xoay 180°), tốc độ × REVERSE_SPEED. */
const REVERSE_MAX = 6;
const REVERSE_SPEED = 0.5;
/** Bán kính chấp nhận của điểm qua giữa đường (m). */
const WAYPOINT_R = 2.5;
/** Hai điểm dò liền nhau trên vòng thân cách nhau không quá chừng này (m): không ô 2 m nào lọt giữa hai điểm. */
const PROBE_STEP = 1;

/** Đứng yên từ chừng này giây thì xe là vật cản khi xe cùng phe tìm đường (bước 2 kế hoạch đế). */
const STAND_AFTER = 1;
/** Đích đè vòng giãn quân đứng: dời tối đa chừng này bước 0,5 m (`clearGoal`). */
const STAND_GOAL_STEPS = 24;
/** Lớp xe đứng chỉ in trong chừng này mét ngoài vòng giãn (xa hơn thì không ảnh hưởng A*: nửa thân lớn nhất 3,8 + dư 3 m). */
const STAND_REACH = 7;
/** Xe đi đường còn dài hơn chừng này (m) thì tìm lại đường mỗi REPLAN_EVERY giây (xe đứng chắn đường có thể đã đi, hoặc mới đứng). */
const REPLAN_MIN = 12;
const REPLAN_EVERY = 2;
/** Kiểm chừng này đoạn đường phía trước xem có xe đứng chắn không (chỉ tìm lại khi bị chắn). */
const REPLAN_LOOK = 3;
/** Lớp xe đứng dựng lại sau chừng này tick (0,5 s; xe đứng từ 1 s mới là vật cản nên trễ chừng này không đáng kể). */
const STAND_REBUILD = 5;

/** Bán kính thân khi tìm / nối tắt đường (cùng vòng với điểm dò thân `bodyContact`); máy bay: 0,7 m như cũ. */
function pathHalf(u: Unit): number {
  return u.air === "none" ? Math.max(0.71, wallRadius(u.kind)) : 0.7;
}


/**
 * Quay thân xe về hướng (dx, dz) với tốc độ `turnRate` độ/giây: xoay tại chỗ (người dùng chốt 06/11/2026, mọi xe mặt đất).
 * Trả về true khi lệch ≤ 30° (được lăn bánh, vừa chạy vừa chỉnh tiếp). Quân cố định đang hạ bệ thì thu bệ trước, chưa quay.
 * Quay thân cũng tính là chuyển động (mất trạng thái cố định, phần vẽ cho xích / bánh chạy).
 */
function turnHull(this: World, u: Unit, dx: number, dz: number): boolean {
  const spec = UNITS[u.kind];
  if (u.hx * dx + u.hz * dz < ALIGNED_COS) {
    const dep = spec.weapon?.deploy;
    if (dep && u.still > 0) {
      u.still = Math.min(u.still, sec(dep.time)) - 1;
      u.packing = true;
      return false;
    }
    turnToward(u.hx, u.hz, dx, dz, traverseStep(spec.turnRate ?? 90), TMP);
    u.hx = TMP.x;
    u.hz = TMP.z;
    u.moved = true;
  }
  return u.hx * dx + u.hz * dz >= PIVOT_COS;
}

/**
 * Hướng đi khi né xe (vector đơn vị) = hướng muốn đi (dx, dz) + độ lệch hướng ORCA `avX/avZ` (hướng ORCA chọn − hướng muốn đi,
 * tính ở cuối tick trước), độ lệch nhỏ dần khi cách đích (gx, gz) dưới AVOID_FADE m (để xe vẫn đỗ đúng chỗ đỗ / ô đội hình).
 * Không lệch đáng kể thì [0, 0].
 */
function steer(this: World, u: Unit, dx: number, dz: number, gx: number, gz: number): [number, number] {
  const a2 = u.avX * u.avX + u.avZ * u.avZ;
  if (a2 < 0.0025) return [0, 0];
  const dg = Math.sqrt(dist2(u.x, u.z, gx, gz));
  const fade = dg >= AVOID_FADE ? 1 : dg <= 3 ? 0 : (dg - 3) / (AVOID_FADE - 3);
  if (fade <= 0) return [0, 0];
  const sx = dx + u.avX * fade;
  const sz = dz + u.avZ * fade;
  const l = Math.sqrt(sx * sx + sz * sz);
  return l < 1e-6 ? [0, 0] : [sx / l, sz / l];
}

/** Hệ số phanh né xe, nhạt dần về 1 khi cách đích (gx, gz) dưới AVOID_FADE m (xe vào chỗ đỗ / ô đội hình dứt khoát). */
function brakeNear(this: World, u: Unit, gx: number, gz: number): number {
  if (u.brake >= 1) return 1;
  const dg = Math.sqrt(dist2(u.x, u.z, gx, gz));
  const fade = dg >= AVOID_FADE ? 1 : dg <= 3 ? 0 : (dg - 3) / (AVOID_FADE - 3);
  return 1 - (1 - u.brake) * fade;
}

/** Đi thẳng về (x, z) cách d mét, không quá tốc độ của xe; quân cố định thì thu bệ trước. */
function stepToward(this: World, u: Unit, x: number, z: number, d: number): void {
  if (d < 0.05) return;
  const spec = UNITS[u.kind];
  const dep = spec.weapon?.deploy;
  if (dep && u.still > 0) {
    // lệch rất ít thì đứng yên giữ bệ; lệch nhiều thì phải thu bệ rồi mới chạy
    if (d > 0.4) {
      u.still = Math.min(u.still, sec(dep.time)) - 1;
      u.packing = true;
    }
    return;
  }
  let dx = (x - u.x) / d;
  let dz = (z - u.z) / d;
  // LÙI XE: đích ở phía sau (lệch mũi > 120°) và gần (dưới REVERSE_MAX m) thì lùi thẳng, nửa tốc độ, không quay thân. Không thì
  // xe về ô ở hàng sau phải xoay 180° ngay giữa hàng (quệt xe bên cạnh), đi vài mét rồi xoay lại
  const back = d < REVERSE_MAX && dx * u.hx + dz * u.hz < -0.5;
  // né xe (ORCA, xem `orcaPass` / `steer`): chỉ khi còn đi xa, nhích chỉnh hàng thì thôi
  if (d >= 3 && !back) {
    const v = this.speedOf(u) * (this.mobilized(u) ? 1 + RULES.abilities.mobilize.speed : 1) * this.moveFactor(u, dx, dz);
    u.prefX = dx * v;
    u.prefZ = dz * v;
    const [sx, sz] = this.steer(u, dx, dz, x, z);
    if (sx !== 0 || sz !== 0) {
      dx = sx;
      dz = sz;
    }
  }
  // đi xa (từ 3 m): quay thân về hướng đi trước, lệch nhiều thì xoay tại chỗ; nhích chỉnh hàng thì khỏi quay thân
  if (d >= 3 && !back && !this.turnHull(u, dx, dz)) return;
  const rally = this.mobilized(u) ? 1 + RULES.abilities.mobilize.speed : 1;
  const step = Math.min(this.speedOf(u) * DT * rally * this.moveFactor(u, dx, dz) * this.brakeNear(u, x, z) * (back ? REVERSE_SPEED : 1), d);
  const ox = u.x;
  const oz = u.z;
  this.tryMove(u, u.x + dx * step, u.z + dz * step);
  u.moved = u.moved || dist2(ox, oz, u.x, u.z) > 1e-6;
}

// ------------------------------------------------------------------ quân mặt đất

function setIdle(this: World, u: Unit): void {
  u.order = "idle";
  u.tx = u.x;
  u.tz = u.z;
  u.targetId = 0;
  u.path = [];
  u.pathI = 0;
  u.chasing = false;
}

function halt(this: World, u: Unit): void {
  u.path = [];
  u.pathI = 0;
}

/**
 * Lớp xe đứng của phe `side` cho tick này (dựng lười, một lần mỗi tick mỗi phe): mọi quân mặt đất cùng phe đã đứng yên từ
 * STAND_AFTER giây hoặc đã hạ bệ, in khoảng cách từ tâm từng ô tới vòng giãn của chúng (quân hạ bệ: vòng ngoại tiếp lục giác)
 * trong STAND_REACH m. Chỉ xe cùng phe (như ORCA): không tránh trước xe địch, không lộ xe địch trong sương mù.
 */
function standLayer(this: World, side: 0 | 1, mover: Unit["kind"]): [Float32Array, Int32Array] {
  const g = this.grid;
  // xe và tiểu đội bộ binh thấy xe đứng khác nhau (chạm mềm): mỗi phe hai lớp
  const sq = isSquad(mover);
  const L = side * 2 + (sq ? 1 : 0);
  let clear = this.standClear[L];
  let owner = this.standOwner[L];
  if (!clear || !owner) {
    clear = this.standClear[L] = new Float32Array(g.size);
    owner = this.standOwner[L] = new Int32Array(g.size);
    this.standTick[L] = -1;
  }
  if (this.standTick[L] >= 0 && this.tick - this.standTick[L] < STAND_REBUILD) return [clear, owner];
  this.standTick[L] = this.tick;
  clear.fill(Infinity);
  owner.fill(-1);
  const discs: number[] = [];
  const still = sec(STAND_AFTER);
  for (const v of this.units) {
    if (v.side !== side || v.hp <= 0 || v.air !== "none") continue;
    const anch = this.anchored(v);
    if (!anch && v.still < still) continue;
    // chạm mềm (tiểu đội đứng với xe tìm đường, hoặc xe đứng với tiểu đội tìm đường): vòng in nhỏ đi nửa đế tiểu đội, nên xe đi
    // qua sát tiểu đội được (chỉ tốn hơn vì ô gần vật cản tính chậm), tiểu đội lọt giữa hai xe đứng sát nhau
    const soft = isSquad(v.kind) !== sq ? bodyRadius(sq ? mover : v.kind) : 0;
    // tiểu đội tìm đường với bán kính nhỏ (người túm lại, `wallRadius`): bù phần vòng giãn của nó để A* giữ đúng khoảng luật va
    // chạm (Titan ↔ tiểu đội 2,65 m, hai tiểu đội 6,4 m)
    const own = sq ? spaceRadius(mover) - wallRadius(mover) : 0;
    // xe tìm đường thấy xe đứng theo LUẬT LÁCH MỀM (A1a): in vòng THÂN (cả quân hạ bệ), `standFor` đặt ngưỡng SOFT_PASS × đế
    // người đi. Tiểu đội (tìm đường hay đang đứng) giữ số cũ
    const r = !sq && !isSquad(v.kind) ? bodyRadius(v.kind) : (anch ? spaceRadius(v.kind) / HEX_COS30 : spaceRadius(v.kind)) - soft + own;
    discs.push(v.x, v.z, r, v.id);
    const R = r + STAND_REACH;
    const c0 = g.colOf(v.x - R, v.z);
    const c1 = g.colOf(v.x + R, v.z);
    const r0 = g.rowOf(v.x, v.z - R);
    const r1 = g.rowOf(v.x, v.z + R);
    for (let cz = r0; cz <= r1; cz++)
      for (let cx = c0; cx <= c1; cx++) {
        const dx = g.centerX(cx) - v.x;
        const dz = g.centerZ(cz) - v.z;
        const d = Math.sqrt(dx * dx + dz * dz) - r;
        if (d > STAND_REACH) continue;
        const i = cz * g.cols + cx;
        // bằng nhau thì giữ xe mã nhỏ (thứ tự duyệt cố định), không phụ thuộc phe
        if (d < clear[i]) {
          clear[i] = d;
          owner[i] = v.id;
        }
      }
  }
  this.standDiscs[L] = new Float64Array(discs);
  return [clear, owner];
}

/**
 * Lớp xe đứng cho xe u tự tìm đường (bỏ qua thân chính nó); máy bay không dùng. Xe: ngưỡng lách mềm SOFT_PASS × đế, đoạn thẳng
 * kiểm theo vòng in chính xác (`discs`). Tiểu đội: như cũ (ngưỡng nửa bề ngang, tra theo ô).
 */
function standFor(this: World, u: Unit): StandLayer | null {
  if (u.air !== "none") return null;
  const [clear, owner] = this.standLayer(u.side, u.kind);
  if (isSquad(u.kind)) return { clear, owner, self: u.id };
  const L = u.side * 2;
  return { clear, owner, self: u.id, need: SOFT_PASS * bodyRadius(u.kind), discs: this.standDiscs[L] };
}

function setPath(this: World, u: Unit, x: number, z: number): boolean {
  // tìm đường nhanh nhất theo kiểu xe (bánh / xích) và địa hình (B3b)
  const spec = UNITS[u.kind];
  [x, z] = this.clearGoal(u, x, z);
  // Tìm theo bảng khoảng trống của lưới cho đúng bề ngang xe (`findPath` với half): không qua lối hẹp hơn thân, ô càng sát vật
  // cản (vách, nhà, khối quặng) càng tính như chậm nên đường đi giữa lối, đoạn nối tắt chừa đủ nửa bề ngang thân. Trước
  // 12/11/2026 đường men sát vách từng ô và nối tắt sát góc: thân xe quẹt mép dốc rồi mũi quay vào vách (dốc B7)
  // BƯỚC 2 (16/11/2026): xe cùng phe đang đứng / hạ bệ là vật cản (lớp `standLayer`): xe tìm đường VÒNG qua chúng như Art of
  // War 3, không lao vào rồi đẩy / lách. Đích bị xe đứng vây kín (A* duyệt quá STAND_SEARCH_MAX ô) thì tìm lại như cũ, bỏ lớp này
  const field = this.grid.field(spec.mobility ?? "wheel", !!spec.slowResist);
  const st = this.standFor(u);
  let p = st ? this.grid.findPath(u.x, u.z, x, z, field, pathHalf(u), st) : null;
  if (!p) p = this.grid.findPath(u.x, u.z, x, z, field, pathHalf(u));
  u.path = p ?? [];
  u.replanAt = this.tick + sec(REPLAN_EVERY);
  u.pathI = 0;
  u.stuck = 0;
  return p !== null;
}

/**
 * Điểm dò thân xe [x, z, x, z, …] (lệch so với tâm): VÒNG TRÒN bán kính `bodyR` × WALL_PROBE (16/11/2026, mô hình đã lọt đế tròn), các điểm
 * cách nhau ≤ PROBE_STEP m, thêm một vòng trong ở nửa bán kính cho đế to (ô 2 m không lọt vào giữa thân). Vòng tròn không đổi
 * khi xoay nên không cần quay theo hướng thân, và xe xoay tại chỗ sát vách không bao giờ quệt. Trước đó (12/11) là chu vi hình
 * chữ nhật thân theo `radius` × `halfLen`.
 */
const PROBE_CACHE = new Map<string, Float64Array>();
function probesOf(kind: keyof typeof UNITS): Float64Array {
  let p = PROBE_CACHE.get(kind);
  if (p) return p;
  const R = wallRadius(kind);
  const pts: number[] = [];
  // vòng điểm dò phải đối xứng qua tâm TUYỆT ĐỐI (luật công bằng số 4): số điểm chẵn, nửa sau là âm đúng của nửa đầu. Trước
  // 16/11/2026 n có thể lẻ (đổi cỡ đế ra n lẻ thì bãi mỏ hai phe bố trí lệch nhau) và dcos / dsin chỉ xấp xỉ nên cặp đối nhau
  // không bằng âm của nhau.
  const ring = (r: number): void => {
    const half = Math.max(4, Math.ceil((TAU * r) / PROBE_STEP / 2));
    const n = half * 2;
    const a: number[] = [];
    for (let i = 0; i < half; i++) a.push(r * dcos((TAU * i) / n), r * dsin((TAU * i) / n));
    pts.push(...a);
    for (let i = 0; i < a.length; i++) pts.push(-a[i]);
  };
  ring(R);
  if (R > 2) ring(R * 0.5);
  p = new Float64Array(pts);
  PROBE_CACHE.set(kind, p);
  return p;
}

/**
 * Thân xe đặt ở (x, z) chạm vật cản không: [hướng đẩy ra x, z (chưa chuẩn hóa), số điểm dò chạm]. Vật cản là mọi ô bị chặn
 * của lưới (vách, đá, nước sâu, nhà, khối quặng). Hướng đẩy = tổng ngược hướng các điểm chạm; (0, 0) mà số điểm chạm > 0 là bị
 * kẹp đều hai bên (khe hẹp). Thân tròn nên hướng mũi (fx, fz) không ảnh hưởng; tham số giữ lại cho các chỗ gọi cũ.
 */
function bodyContact(this: World, u: Unit, x: number, z: number, _fx = u.hx, _fz = u.hz): [number, number, number] {
  if (u.air !== "none") return [0, 0, 0];
  const p = probesOf(u.kind);
  // xa vật cản hơn bán kính thân (+ 1,5 m vì khoảng trống đo ở tâm ô): khỏi dò
  if (this.grid.clearanceAt(x, z) > wallRadius(u.kind) + 1.5) return [0, 0, 0];
  let px = 0;
  let pz = 0;
  let hits = 0;
  for (let i = 0; i < p.length; i += 2) {
    const ox = p[i];
    const oz = p[i + 1];
    if (this.grid.blockedAt(x + ox, z + oz)) {
      px -= ox;
      pz -= oz;
      hits++;
    }
  }
  return [px, pz, hits];
}

/** Hướng đẩy ra khỏi vật cản tại (x, z) (xem `bodyContact`), chưa chuẩn hóa; (0, 0) = thân không chạm gì. */
function wallNormal(this: World, u: Unit, x: number, z: number, fx = u.hx, fz = u.hz): [number, number] {
  const c = this.bodyContact(u, x, z, fx, fz);
  return [c[0], c[1]];
}

/**
 * Đích sát vách thì dời ra cho vừa thân xe (quay theo hướng đi tới đích), mỗi bước 0,5 m theo pháp tuyến vách, tối đa
 * GOAL_SHIFT m: thân xe không được lấn vào vách nên đích quá sát thì xe không bao giờ tới nơi.
 */
function clearGoal(this: World, u: Unit, x: number, z: number): [number, number] {
  if (u.air !== "none") return [x, z];
  const dx = x - u.x;
  const dz = z - u.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  const fx = d > 1e-6 ? dx / d : u.hx;
  const fz = d > 1e-6 ? dz / d : u.hz;
  for (let i = 0; i < GOAL_SHIFT * 2; i++) {
    const [px, pz] = this.wallNormal(u, x, z, fx, fz);
    const l = Math.sqrt(px * px + pz * pz);
    if (l < 1e-9) break;
    const nx = x + (px / l) * 0.5;
    const nz = z + (pz / l) * 0.5;
    if (this.grid.blockedAt(nx, nz)) break;
    x = nx;
    z = nz;
  }
  return [x, z];
}

/**
 * KHÔNG DỪNG GIỮA KHE (A1a): đích của xe LẺ (chỉ gọi từ `orderMove` cho xe không vào đội hình; đội hình lo ô của mình) đè vòng
 * giãn quân đứng cùng phe thì dời ra, mỗi bước 0,5 m theo tổng hướng ra khỏi các quân đó; hướng triệt tiêu (đích đúng giữa khe)
 * thì lùi về phía xe đang đứng, tức là lùi ra khỏi khe.
 */
function clearStand(this: World, u: Unit, x: number, z: number): [number, number] {
  if (u.air !== "none" || isSquad(u.kind)) return [x, z];
  const dx = x - u.x;
  const dz = z - u.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  const fx = d > 1e-6 ? dx / d : u.hx;
  const fz = d > 1e-6 ? dz / d : u.hz;
  {
    const still = sec(STAND_AFTER);
    const su = spaceRadius(u.kind);
    for (let i = 0; i < STAND_GOAL_STEPS; i++) {
      let px = 0;
      let pz = 0;
      let hit = false;
      for (const v of this.units) {
        if (v === u || v.side !== u.side || v.hp <= 0 || v.air !== "none" || isSquad(v.kind)) continue;
        if (!this.anchored(v) && v.still < still) continue;
        const ox = x - v.x;
        const oz = z - v.z;
        const lim = su + spaceRadius(v.kind);
        const o2 = ox * ox + oz * oz;
        if (o2 >= lim * lim) continue;
        hit = true;
        const o = Math.sqrt(o2);
        if (o > 1e-6) {
          px += ox / o;
          pz += oz / o;
        }
      }
      if (!hit) break;
      let l = Math.sqrt(px * px + pz * pz);
      if (l < 1e-6) {
        px = -fx;
        pz = -fz;
        l = 1;
      }
      const nx = x + (px / l) * 0.5;
      const nz = z + (pz / l) * 0.5;
      if (this.grid.blockedAt(nx, nz)) break;
      x = nx;
      z = nz;
    }
  }
  return [x, z];
}

/**
 * Bước xe tới (nx, nz), vật cản là RÀNG BUỘC CỨNG (12/11/2026): thân ở chỗ mới chạm vật cản thì bỏ phần bước đi hướng vào vật
 * cản (trượt dọc vách / tường nhà); rồi chỉ nhận chỗ mới khi tâm không vào ô chặn VÀ thân không chạm nhiều điểm hơn chỗ cũ
 * (đang lún sẵn thì bước nào bớt lún cũng được, để tự thoát). Không được thì thử riêng từng trục. Trước đây chỉ cấm tâm xe vào
 * ô chặn, thân thì chỉ bị đẩy ra dần 0,3 m mỗi tick.
 */
function tryMove(this: World, u: Unit, nx: number, nz: number): boolean {
  const [px, pz, hNew] = this.bodyContact(u, nx, nz);
  const l = Math.sqrt(px * px + pz * pz);
  if (l > 1e-9) {
    const ux = px / l;
    const uz = pz / l;
    const vx = nx - u.x;
    const vz = nz - u.z;
    const dot = vx * ux + vz * uz;
    if (dot < 0) {
      nx -= ux * dot;
      nz -= uz * dot;
    }
  }
  const hNow = hNew > 0 ? this.bodyContact(u, u.x, u.z)[2] : 0;
  const ok = (x: number, z: number): boolean => !this.grid.blockedAt(x, z) && (hNew === 0 && x === nx && z === nz ? true : this.bodyContact(u, x, z)[2] <= hNow);
  if (ok(nx, nz)) {
    u.x = nx;
    u.z = nz;
    return true;
  }
  if (ok(nx, u.z)) {
    u.x = nx;
    return true;
  }
  if (ok(u.x, nz)) {
    u.z = nz;
    return true;
  }
  return false;
}

/** Hệ số tốc độ do địa hình của xe mặt đất đang đứng tại (x, z): loại địa hình × kiểu xe (chưa tính độ dốc). */
function terrainFactor(this: World, u: Unit): number {
  const spec = UNITS[u.kind];
  return this.grid.field(spec.mobility ?? "wheel", !!spec.slowResist).k[this.grid.index(u.x, u.z)];
}

/**
 * Hệ số tốc độ lúc này của xe mặt đất đi theo hướng (dx, dz) (vector đơn vị): loại địa hình dưới xe × độ dốc.
 * Lên dốc chậm dần (RULES.terrain.slopeSlow), xuống dốc không nhanh hơn.
 */
function moveFactor(this: World, u: Unit, dx: number, dz: number): number {
  let k = this.terrainFactor(u);
  // phòng hờ: xe lỡ đứng trên ô không đi được thì vẫn bò ra được
  if (!(k > 0)) k = 0.3;
  const T = RULES.terrain;
  const L = T.slopeProbe;
  // mặt tầng phẳng tuyệt đối nên chỉ trên khối dốc mới có độ dốc; điểm đo rơi vào ô mép vách thì không tính (xe không
  // đi vào đó được, vách chặn chứ không làm chậm)
  const ax = u.x + dx * L;
  const az = u.z + dz * L;
  const grade = this.map.staticBlocked(ax, az) ? 0 : (this.map.groundY(ax, az) - this.map.groundY(u.x, u.z)) / L;
  if (grade > 0) k *= Math.max(T.slopeMin, 1 - T.slopeSlow * grade);
  return k;
}

/** Đi theo đường; trả về true khi đã tới nơi (hoặc bỏ cuộc vì kẹt quá lâu). */
function follow(this: World, u: Unit): boolean {
  if (u.pathI * 2 >= u.path.length) return true;
  const spec = UNITS[u.kind];
  // Quân cố định (deploy): thu bệ xong mới chạy được, mất đúng ngần ấy thời gian đã hạ bệ (tối đa deploy.time)
  const dep = spec.weapon?.deploy;
  if (dep && u.still > 0) {
    u.still = Math.min(u.still, sec(dep.time)) - 1;
    u.packing = true;
    return false;
  }
  // TÌM LẠI KHI BỊ CHẮN (bước 2): đường còn dài thì mỗi REPLAN_EVERY giây xem REPLAN_LOOK đoạn phía trước có xe cùng phe mới
  // đứng chắn không; có thì tìm lại theo lớp xe đứng. Không bị chắn thì giữ đường (tìm lại vô cớ từ giữa đường làm xe bánh rời
  // đường cái sớm: so thời gian trên lưới 8 hướng có sai số). Tìm không ra thì giữ đường cũ
  if (this.tick >= u.replanAt && u.path.length >= 2) {
    const ex = u.path[u.path.length - 2];
    const ez = u.path[u.path.length - 1];
    u.replanAt = this.tick + sec(REPLAN_EVERY);
    const st = this.standFor(u);
    let blocked = false;
    if (st && dist2(u.x, u.z, ex, ez) > REPLAN_MIN * REPLAN_MIN) {
      let ax = u.x;
      let az = u.z;
      for (let k = u.pathI; k * 2 < u.path.length && k < u.pathI + REPLAN_LOOK && !blocked; k++) {
        const bx = u.path[k * 2];
        const bz = u.path[k * 2 + 1];
        if (!this.grid.los(ax, az, bx, bz, pathHalf(u), st) && this.grid.los(ax, az, bx, bz, pathHalf(u))) blocked = true;
        ax = bx;
        az = bz;
      }
    }
    if (blocked) {
      const old = u.path;
      const oi = u.pathI;
      const s = u.stuck;
      if (!this.setPath(u, ex, ez)) {
        u.path = old;
        u.pathI = oi;
      }
      u.stuck = s;
    }
  }
  // Điểm qua giữa đường có BÁN KÍNH CHẤP NHẬN: tới gần trong WAYPOINT_R và từ đây nhìn thẳng được (bằng cả thân xe) tới điểm
  // kế tiếp thì coi như đã qua. Không thì hai xe cùng nhắm đúng một điểm (chân dốc: đường "hành lang" của mọi xe qua cùng
  // một ô) đẩy nhau chia đôi rồi quay vòng quanh điểm đó mãi.
  // Đoạn cắt thẳng cũng không được băng qua ô chậm hơn điểm bỏ qua và điểm kế tiếp (không thì bánh xe quệt vào bùn mà A* vừa
  // tránh), như bước kéo thẳng đường trong findPath.
  while ((u.pathI + 1) * 2 < u.path.length) {
    const wx = u.path[u.pathI * 2];
    const wz = u.path[u.pathI * 2 + 1];
    const nx = u.path[u.pathI * 2 + 2];
    const nz = u.path[u.pathI * 2 + 3];
    if (dist2(u.x, u.z, wx, wz) > WAYPOINT_R * WAYPOINT_R) break;
    // nối tắt cũng không được cắt sát xe cùng phe đang đứng (đường A* vừa đi vòng qua chúng)
    if (!this.grid.los(u.x, u.z, nx, nz, pathHalf(u), this.standFor(u) ?? undefined)) break;
    const f = this.grid.field(spec.mobility ?? "wheel", !!spec.slowResist);
    const need = Math.min(f.k[this.grid.index(wx, wz)], f.k[this.grid.index(nx, nz)]);
    if (this.grid.minSpeedAlong(f, u.x, u.z, nx, nz) < need) break;
    u.pathI++;
  }
  // tốc độ theo địa hình và độ dốc, đo theo hướng tới điểm kế tiếp trên đường
  const fdx = u.path[u.pathI * 2] - u.x;
  const fdz = u.path[u.pathI * 2 + 1] - u.z;
  const fd = Math.sqrt(fdx * fdx + fdz * fdz);
  const ox = u.x;
  const oz = u.z;
  const rally = this.mobilized(u) ? 1 + RULES.abilities.mobilize.speed : 1;
  // Né xe chủ động: có lực lái (dự đoán va chạm ở cuối tick trước) thì hướng đi = hướng tới điểm kế tiếp + lực lái; xe quay thân
  // theo hướng đó rồi chạy (không trượt ngang), tốc độ nhân hệ số phanh. Gần đích thì lực lái nhỏ dần để vẫn đỗ đúng chỗ.
  const gx = u.path[u.path.length - 2];
  const gz = u.path[u.path.length - 1];
  if (fd > 1e-6) {
    const v = this.speedOf(u) * rally * this.moveFactor(u, fdx / fd, fdz / fd);
    u.prefX = (fdx / fd) * v;
    u.prefZ = (fdz / fd) * v;
  }
  const brake = this.brakeNear(u, gx, gz);
  const [sx, sz] = this.steer(u, fd > 1e-6 ? fdx / fd : u.hx, fd > 1e-6 ? fdz / fd : u.hz, gx, gz);
  if (sx !== 0 || sz !== 0) {
    if (!this.turnHull(u, sx, sz)) return false;
    const full = this.speedOf(u) * DT * rally * this.moveFactor(u, sx, sz) * brake;
    this.tryMove(u, u.x + sx * full, u.z + sz * full);
    const moved2 = dist2(ox, oz, u.x, u.z);
    u.moved = u.moved || moved2 > 1e-6;
    if (moved2 < full * full * 0.04) u.stuck++;
    else if (u.stuck > 0) u.stuck--;
    return false;
  }
  // lệch hướng nhiều: đứng lại xoay tại chỗ (chưa chạy, không tính là kẹt)
  if (fd > 1e-6 && !this.turnHull(u, fdx / fd, fdz / fd)) return false;
  const full = this.speedOf(u) * DT * rally * (fd > 1e-6 ? this.moveFactor(u, fdx / fd, fdz / fd) : this.moveFactor(u, 0, 0)) * brake;
  let step = full;
  while (step > 1e-9 && u.pathI * 2 < u.path.length) {
    const wx = u.path[u.pathI * 2];
    const wz = u.path[u.pathI * 2 + 1];
    const dx = wx - u.x;
    const dz = wz - u.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d <= step) {
      if (!this.tryMove(u, wx, wz)) break;
      step -= d;
      u.pathI++;
      continue;
    }
    this.tryMove(u, u.x + (dx / d) * step, u.z + (dz / d) * step);
    break;
  }
  const moved2 = dist2(ox, oz, u.x, u.z);
  u.moved = u.moved || moved2 > 1e-6;
  // "kẹt" so với tốc độ thực tế lúc này (lội bùn, leo dốc chậm không phải là kẹt)
  const expect = full * 0.2;
  if (moved2 < expect * expect) u.stuck++;
  else if (u.stuck > 0) u.stuck--;
  if (u.stuck >= 12 && u.path.length >= 2) {
    const ex = u.path[u.path.length - 2];
    const ez = u.path[u.path.length - 1];
    if (dist2(u.x, u.z, ex, ez) < 25 || u.stuck >= 40) {
      u.path = [];
      u.pathI = 0;
      u.stuck = 0;
      return true;
    }
    if (u.stuck % 12 === 0) {
      const s = u.stuck;
      this.setPath(u, ex, ez);
      u.stuck = s;
    }
  }
  return u.pathI * 2 >= u.path.length;
}

function chase(this: World, u: Unit, t: Target): void {
  // Đi hết đường mà chưa tới tầm thì tìm lại ngay. Tìm thất bại (đường rỗng) thì chờ hẹn lại, đừng thử lại
  // mỗi tick: mỗi lần thất bại A* quét gần cả bản đồ (~10 ms), hai xe là đủ làm trận chậm hẳn.
  const done = u.pathI * 2 >= u.path.length;
  if (!u.chasing || this.tick >= u.repathAt || (done && u.path.length > 0)) {
    let gx = t.x;
    let gz = t.z;
    // công trình chiếm chỗ ô ở tâm: nhắm ô trống gần nhất cạnh nó
    if (t.cat === "building") {
      const f = this.grid.nearestFree(t.x, t.z, 10);
      if (f) [gx, gz] = f;
    }
    this.setPath(u, gx, gz);
    u.repathAt = this.tick + sec(1);
    u.chasing = true;
  }
  this.follow(u);
}

// ------------------------------------------------------------------ va chạm, đạn, dọn xác

/**
 * Hướng lách của xe m khi xe kia ở lệch (ox, oz) so với nó: vuông góc hướng thân, về phía xa xe kia. Thẳng hàng tuyệt đối thì
 * GIỮ BÊN PHẢI (cùng một quy ước cho mọi xe, mọi phe): hai xe ngược chiều cùng giữ phải thì tự lệch về hai phía, qua được nhau.
 * Trước đây hòa thì chọn theo chẵn / lẻ của mã xe, không đối xứng giữa hai phe.
 */
const methods = { standLayer, standFor, turnHull, stepToward, setIdle, halt, setPath, bodyContact, wallNormal, clearGoal, clearStand, tryMove, terrainFactor, moveFactor, follow, chase, steer, brakeNear };
type Methods = typeof methods;
declare module "./core" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface World extends Methods {}
}
Object.assign(World.prototype, methods);
