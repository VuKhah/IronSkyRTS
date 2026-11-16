/** Di chuyển một xe: quay thân, bước tới, đi theo đường A*, né vách, đẩy xe không chồng lên nhau. */
import { RULES, UNITS } from "../content";
import { dcos, DEG, dist2, dsin, TAU, turnToward } from "../fmath";
import { orcaLine, orcaSolve, type OrcaLine } from "../orca";
import type { Target, Unit } from "../types";
import type { StandLayer } from "../grid";
import { DT, sec, bodyRadius, spaceRadius, wallRadius, softOverlap, isSquad, HEX_COS30, MOVER_SHARE, WALL_PUSH, GOAL_SHIFT, PIVOT_COS, ALIGNED_COS, TMP, traverseStep } from "./shared";
import { World } from "./core";

/** Hai xe cùng chạy coi là "ngược chiều" khi góc giữa hai hướng thân lớn hơn 120° (cos < −0,5). */
const HEAD_ON_COS = -0.5;
/** Xe ngược chiều thấy nhau từ cách mép thân chừng này (m) thì bắt đầu lách. */
const PASS_LOOK = 6;
/** Lách sang bên mỗi tick khi chưa chạm (m; 1,5 m/s, chậm hơn nhiều so với tốc độ chạy). */
const PASS_STEER = 0.15;
/** ORCA: không va xe nào trong chừng này giây tới (theo vận tốc hiện tại của xe kia). */
const AVOID_T = 2.5;
/** Xét láng giềng trong chừng này mét (đủ cho hai xe 5 m/s lao vào nhau trong AVOID_T giây). */
const AVOID_LOOK = 26;
/** Số láng giềng gần nhất tối đa mỗi xe xét (như RVO2 maxNeighbors). */
const ORCA_NEIGHBORS = 10;
/** Xe rỗng gặp xe chở hàng gánh chừng này phần trách nhiệm né (xe chở hàng giữ làn hơn). */
const ORCA_YIELD = 0.75;
/** Vận tốc ORCA chọn phải nằm trong nón ±25° quanh mũi xe (xe không trượt ngang; lệch > 30° là phải xoay tại chỗ). */
const ORCA_CONE_COS = dcos(25 * DEG);
const ORCA_CONE_SIN = dsin(25 * DEG);
/** ORCA giữ xe gần như đứng chừng này tick liền (1,5 s) thì thôi né xe đứng yên trong ORCA_RELEASE tick (3 s) để lách qua. */
const ORCA_HOLD_MAX = 15;
const ORCA_RELEASE = 30;
/** Xe trong đội cách ô dưới chừng này mét là "đúng ô" (ORCA không cho hai xe đúng ô cùng đội né nhau). */
const SQUAD_IN_SLOT = 2.5;
/** Hướng muốn đi lệch mũi quá 40° thì xe sắp xoay tại chỗ (không giải ORCA, tick sau xe đứng xoay). */
const ORCA_SKIP_COS = dcos(40 * DEG);
/** Độ lệch hướng / phanh né xe nhỏ dần khi cách đích dưới chừng này mét. */
const AVOID_FADE = 9;
/** Đích ở phía sau và gần hơn chừng này mét thì xe lùi thẳng (không xoay 180°), tốc độ × REVERSE_SPEED. */
const REVERSE_MAX = 6;
const REVERSE_SPEED = 0.5;
/** Bán kính chấp nhận của điểm qua giữa đường (m). */
const WAYPOINT_R = 2.5;
/** Hai điểm dò liền nhau trên vòng thân cách nhau không quá chừng này (m): không ô 2 m nào lọt giữa hai điểm. */
const PROBE_STEP = 1;
/** Số lần đẩy ra khỏi vật cản tối đa trong một tick (× WALL_PUSH m). */
const STATIC_ITERS = 6;

/** Đứng yên từ chừng này giây thì xe là vật cản khi xe cùng phe tìm đường (bước 2 kế hoạch đế). */
const STAND_AFTER = 1;
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
    const r = (anch ? spaceRadius(v.kind) / HEX_COS30 : spaceRadius(v.kind)) - soft + own;
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
  return [clear, owner];
}

/** Lớp xe đứng cho xe u tự tìm đường (bỏ qua thân chính nó); máy bay không dùng. */
function standFor(this: World, u: Unit): StandLayer | null {
  if (u.air !== "none") return null;
  const [clear, owner] = this.standLayer(u.side, u.kind);
  return { clear, owner, self: u.id };
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
  const ring = (r: number): void => {
    const n = Math.max(8, Math.ceil((TAU * r) / PROBE_STEP));
    for (let i = 0; i < n; i++) pts.push(r * dcos((TAU * i) / n), r * dsin((TAU * i) / n));
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
function sideStep(m: Unit, ox: number, oz: number): [number, number] {
  const lo = ox * m.hz - oz * m.hx; // xe kia lệch về bên (+) hay (−) hướng chạy
  const sg = lo > 1e-9 ? -1 : 1;
  return [m.hz * sg, -m.hx * sg];
}

/** Đẩy xe đi (dx, dz) qua tryMove (trượt dọc vách, không lấn vào vách); trả về quãng thật sự đi được. */
function shove(w: World, u: Unit, dx: number, dz: number): [number, number] {
  if (dx * dx + dz * dz < 1e-12) return [0, 0];
  const ox = u.x;
  const oz = u.z;
  w.tryMove(u, u.x + dx, u.z + dz);
  return [u.x - ox, u.z - oz];
}

/**
 * Vòng tròn bán kính r, tâm lệch (ox, oz) so với tâm LỤC GIÁC của quân hạ bệ h (trung đoạn a: tâm tới cạnh; một cạnh phẳng
 * quay về mũi xe lúc hạ bệ) có lồng nhau không. Trả về [độ lồng, hướng đẩy x, z (từ lục giác ra vòng tròn)]; độ lồng ≤ 0 là
 * không chạm. Cách tính: gập điểm vào góc phần tư thứ nhất của khung thân (lục giác đối xứng hai trục), ở đó biên chỉ còn cạnh
 * phẳng phía mũi (0, a) → (R/2, a) và cạnh xiên (R/2, a) → (R, 0), R = a / cos 30°; tính khoảng cách có dấu tới biên rồi mở gập.
 */
function hexOverlap(h: Unit, ox: number, oz: number, a: number, r: number): [number, number, number] {
  // khung thân: f dọc mũi, s sang phải (hz, −hx)
  const f = ox * h.hx + oz * h.hz;
  const s = ox * h.hz - oz * h.hx;
  const af = f < 0 ? -f : f;
  const as = s < 0 ? -s : s;
  const R = a / HEX_COS30;
  let nf: number;
  let ns: number;
  let sd: number;
  // khoảng cách có dấu tới đường chứa từng cạnh (pháp tuyến (0, 1) và (cos 30°, 0,5) theo (s, f))
  const d1 = af - a;
  const d2 = as * HEX_COS30 + af * 0.5 - a;
  if (d1 <= 0 && d2 <= 0) {
    // tâm vòng tròn nằm trong lục giác: đẩy ra theo cạnh gần nhất
    if (d1 >= d2) {
      sd = d1;
      ns = 0;
      nf = 1;
    } else {
      sd = d2;
      ns = HEX_COS30;
      nf = 0.5;
    }
  } else {
    // ngoài: điểm gần nhất trên hai đoạn biên
    const q1s = as < R / 2 ? as : R / 2;
    const e1s = as - q1s;
    const e1f = af - a;
    // đoạn xiên: từ (R/2, a) tới (R, 0), tham số t ∈ [0, 1]
    const vs = R / 2;
    const vf = -a;
    let t = ((as - R / 2) * vs + (af - a) * vf) / (vs * vs + vf * vf);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const e2s = as - (R / 2 + vs * t);
    const e2f = af - (a + vf * t);
    const l1 = e1s * e1s + e1f * e1f;
    const l2 = e2s * e2s + e2f * e2f;
    const es = l1 <= l2 ? e1s : e2s;
    const ef = l1 <= l2 ? e1f : e2f;
    sd = Math.sqrt(l1 <= l2 ? l1 : l2);
    ns = sd > 1e-9 ? es / sd : 0;
    nf = sd > 1e-9 ? ef / sd : 1;
  }
  // mở gập về khung thân rồi về thế giới
  if (s < 0) ns = -ns;
  if (f < 0) nf = -nf;
  return [r - sd, nf * h.hx + ns * h.hz, nf * h.hz - ns * h.hx];
}

/** 1 = a nhường b (a rỗng, b đang chở hàng), −1 = b nhường a, 0 = ngang nhau. */
function yieldsTo(a: Unit, b: Unit): number {
  const la = a.cargo > 0 || a.scrap > 0;
  const lb = b.cargo > 0 || b.scrap > 0;
  return la === lb ? 0 : lb ? 1 : -1;
}

/**
 * NÉ XE BẰNG ORCA (12/11/2026, thay bản dự đoán bẻ lái): mỗi xe mặt đất đang tự đi (có vận tốc muốn đi `prefX/prefZ`, không
 * hạ bệ) chọn vận tốc cho tick sau bằng `orcaSolve`, từ trạng thái lúc mọi xe vừa đi xong (không phụ thuộc thứ tự mã xe):
 * - láng giềng: tối đa ORCA_NEIGHBORS xe gần nhất CÙNG PHE trong AVOID_LOOK m, KỂ CẢ xe cùng đội hình (xe về ô của mình đi
 *   xuyên qua đội được). Xe địch không né: lao vào giao chiến, chạm thì luật đẩy lo (né cả xe địch thì Lynx bẻ lái tránh chính
 *   mục tiêu trước mặt);
 * - bán kính chung: tổng hai VÒNG GIÃN `spaceR` (16/11/2026, đế tròn; ORCA vốn viết cho vòng tròn nên khớp đúng luật va chạm),
 *   quân hạ bệ dùng vòng ngoại tiếp lục giác; tâm đã gần hơn thế thì coi như vừa chạm, không bắt bật ra trong một tick;
 * - trách nhiệm: hai xe cùng né thì chia đôi; xe rỗng gặp xe chở hàng gánh ORCA_YIELD; xe đứng yên / đang nhích / hạ bệ là vật
 *   cản, xe chạy gánh trọn;
 * - xe không trượt ngang, không lùi: hai đường cứng giữ vận tốc trong nón ±ORCA_CONE quanh mũi (đứng yên luôn hợp lệ). Hướng muốn
 *   đi đã lệch mũi quá nón (sắp xoay tại chỗ) thì không giải.
 * Kết quả: `brake` = |v| / |v muốn|, `avX/avZ` = hướng v − hướng muốn đi; tick sau `follow` / `stepToward` dùng qua `steer` /
 * `brakeNear` (nhạt dần gần đích).
 */
function orcaPass(this: World, g: readonly Unit[]): void {
  const lines: OrcaLine[] = [];
  const near: { u: Unit; d2: number }[] = [];
  const res = { x: 0, z: 0 };
  const vel = (u: Unit): [number, number] => (u.moved ? [(u.x - u.px) / DT, (u.z - u.pz) / DT] : [0, 0]);
  const solver = (u: Unit): boolean => (u.prefX !== 0 || u.prefZ !== 0) && !this.anchored(u);
  // gần như không tiến tick này (vận tốc thật < 25% vận tốc muốn đi, hoặc không đi): đọc trạng thái chụp, không phụ thuộc thứ tự
  const crawling = (u: Unit): boolean => {
    if (!u.moved) return true;
    const [x, z] = vel(u);
    return x * x + z * z < 0.0625 * (u.prefX * u.prefX + u.prefZ * u.prefZ);
  };
  for (const a of g) {
    const held = a.orcaHeld;
    a.orcaHeld = 0;
    if (!solver(a)) continue;
    const p = Math.sqrt(a.prefX * a.prefX + a.prefZ * a.prefZ);
    // tiến độ THẬT tick này (không theo hệ số phanh: xe bị ORCA bẻ thân lệch rồi lại bị giữ thì phanh dao động 1 ↔ 0,1 mỗi tick)
    const slow = crawling(a);
    const next = (): number => (held + 1 < ORCA_HOLD_MAX + ORCA_RELEASE ? held + 1 : 0);
    // gần như không tiến được đủ ORCA_HOLD_MAX tick liền (xe đứng yên chắn giữa lối dốc hẹp, hai xe đối đầu trong lối hẹp: ORCA
    // cấm lại gần mà không biết vách hai bên, chờ mãi): trong ORCA_RELEASE tick tiếp theo thôi né xe đứng yên / cũng đang kẹt,
    // xe chạm vào rồi lách qua theo luật va chạm (xe chạy chịu phần lớn cú đẩy, xe chở hàng giữ làn), như các bản RVO trong game
    const release = held >= ORCA_HOLD_MAX;
    a.orcaHeld = release || slow ? next() : 0;
    // hướng muốn đi lệch mũi quá ORCA_SKIP: xe sắp / đang xoay tại chỗ, chưa chạy. Lệch ít hơn (kể cả ngoài nón) vẫn giải trong
    // nón: bỏ qua cả xe vừa bị ORCA bẻ thân lệch quá nón thì tick đó nó lao thẳng hết tốc, không phanh không né
    if (a.prefX * a.hx + a.prefZ * a.hz < ORCA_SKIP_COS * p) continue;
    near.length = 0;
    for (const b of g) {
      if (b === a || b.side !== a.side) continue;
      // xe cùng đội hình không né nhau bằng ORCA: đội hình lo khoảng cách, xe đúng ô nhường đường cho xe đang về ô (`separate`).
      // Cho né nhau thì xe đúng ô cũng lách, cả đội lệch hàng; xe về ô gặp hàng xe đứng (khe hẹp hơn thân) thì chỉ biết phanh
      if (a.squad !== 0 && a.squad === b.squad) continue;
      // đã kẹt: thôi né xe đứng yên và xe cũng đang kẹt (hai xe đối đầu chờ nhau trong lối hẹp); luật va chạm gỡ tiếp
      if (release && crawling(b)) continue;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      if (dx >= AVOID_LOOK || dx <= -AVOID_LOOK || dz >= AVOID_LOOK || dz <= -AVOID_LOOK) continue;
      const d2 = dx * dx + dz * dz;
      if (d2 < AVOID_LOOK * AVOID_LOOK) near.push({ u: b, d2 });
    }
    if (!near.length) continue;
    near.sort((m, n) => m.d2 - n.d2 || m.u.id - n.u.id);
    // hai đường cứng: nón ±ORCA_CONE quanh mũi (vùng được phép ở bên trái hướng của đường)
    const c = ORCA_CONE_COS;
    const s = ORCA_CONE_SIN;
    lines.length = 0;
    lines.push({ px: 0, pz: 0, dx: a.hx * c + a.hz * s, dz: -a.hx * s + a.hz * c });
    lines.push({ px: 0, pz: 0, dx: -(a.hx * c - a.hz * s), dz: -(a.hx * s + a.hz * c) });
    const [vax, vaz] = vel(a);
    const sa = spaceRadius(a.kind);
    for (let k = 0; k < near.length && k < ORCA_NEIGHBORS; k++) {
      const b = near[k].u;
      const rx = b.x - a.x;
      const rz = b.z - a.z;
      const d = Math.sqrt(near[k].d2);
      // bán kính chung = tổng hai vòng giãn (quân hạ bệ: vòng ngoại tiếp lục giác); tâm đã gần hơn thế thì coi như vừa chạm,
      // không bắt bật ra trong một tick (luật va chạm `separate` gỡ phần lồng)
      const sb = this.anchored(b) ? spaceRadius(b.kind) / HEX_COS30 : spaceRadius(b.kind);
      // tiểu đội với xe chạm mềm: né theo khoảng đã trừ phần được chồng (nửa đế tiểu đội)
      const r = Math.min(sa + sb - softOverlap(a.kind, b.kind), d * 0.98);
      const [vbx, vbz] = vel(b);
      const y = yieldsTo(a, b);
      const share = !solver(b) ? 1 : y > 0 ? ORCA_YIELD : y < 0 ? 1 - ORCA_YIELD : 0.5;
      const L = { px: 0, pz: 0, dx: 0, dz: 0 };
      orcaLine(rx, rz, vax, vaz, vbx, vbz, r, AVOID_T, share, DT, L);
      lines.push(L);
    }
    orcaSolve(lines, 2, p, a.prefX, a.prefZ, res);
    const v = Math.sqrt(res.x * res.x + res.z * res.z);
    a.brake = Math.min(1, v / p);
    if (v > 1e-3) {
      a.avX = res.x / v - a.prefX / p;
      a.avZ = res.z / v - a.prefZ / p;
    }
  }
}

function separate(this: World): void {
  const g: Unit[] = [];
  for (const u of this.units) {
    // lực lái / phanh vừa dùng xong ở tick này: tính lại từ đầu
    u.avX = 0;
    u.avZ = 0;
    u.brake = 1;
    if (u.air === "none" && u.hp > 0) g.push(u);
  }
  // NÉ XE (ORCA): một lượt riêng, đọc vị trí và vận tốc lúc mọi xe vừa đi xong, TRƯỚC mọi cú đẩy va chạm (gộp vào vòng đẩy
  // bên dưới thì cặp sau đọc vị trí đã bị cặp trước xô, kết quả đổi theo thứ tự mã xe)
  this.orcaPass(g);
  for (let i = 0; i < g.length; i++) {
    const a = g[i];
    const ra = spaceRadius(a.kind);
    const pa = this.anchored(a);
    for (let j = i + 1; j < g.length; j++) {
      const b = g[j];
      const rb = spaceRadius(b.kind);
      const pb = this.anchored(b);
      if (pa && pb) continue;
      // va chạm theo ĐẾ TRÒN cho mọi cặp (16/11/2026; trước đó hình chữ nhật thân, phép tách trục): hai tâm cách nhau ≥ tổng hai
      // vòng giãn `spaceR`. Quân đã hạ bệ là LỤC GIÁC tĩnh (trung đoạn = vòng giãn), tầm xét tới đỉnh lục giác
      const both = a.moved && b.moved;
      // tiểu đội với xe: chạm MỀM, được chồng tới nửa đế tiểu đội (`softOverlap`)
      const soft = softOverlap(a.kind, b.kind);
      const touch = (pa ? ra / HEX_COS30 : ra) + (pb ? rb / HEX_COS30 : rb) - soft;
      // hai xe cùng chạy thì nhìn xa thêm PASS_LOOK để kịp lách trước khi chạm
      const near = both ? touch + PASS_LOOK : touch;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      if (dx >= near || dx <= -near || dz >= near || dz <= -near) continue;
      const d2 = dx * dx + dz * dz;
      if (d2 >= near * near) continue;
      let d = Math.sqrt(d2);
      let nx: number;
      let nz: number;
      if (d < 1e-6) {
        // trùng tâm: tách theo hướng vuông góc thân xe a (không phụ thuộc mã xe hay phe)
        nx = a.hz;
        nz = -a.hx;
        d = 0;
      } else {
        nx = dx / d;
        nz = dz / d;
      }
      // hai xe cùng chạy NGƯỢC CHIỀU, xe kia ở phía trước mỗi xe. Đi thẳng hàng trên cùng một đường A* là chuyện thường (xe
      // ra mỏ và xe về nhà đi chung một lối): khi đó lực đẩy dọc đường nối hai tâm triệt tiêu đúng bằng phần vừa tiến, kẹt mãi
      const headOn = both && a.hx * b.hx + a.hz * b.hz < HEAD_ON_COS && dx * a.hx + dz * a.hz > 0 && -dx * b.hx - dz * b.hz > 0;
      // độ lồng (over) và hướng đẩy (nx, nz: từ a sang b): hai vòng tròn, hoặc vòng tròn với lục giác của quân hạ bệ
      let over = ra + rb - soft - d;
      if (pa || pb) {
        const c = pa ? hexOverlap(a, dx, dz, ra, rb - soft) : hexOverlap(b, -dx, -dz, rb, ra - soft);
        over = c[0];
        nx = pa ? c[1] : -c[1];
        nz = pa ? c[2] : -c[2];
      }
      if (over <= 0) {
        // chưa chạm: tài xế thấy nhau từ xa thì cùng lách sang bên, chỉ khi giữ nguyên làn thì sẽ tông
        if (!headOn || pa || pb) continue;
        const lat = dx * a.hz - dz * a.hx;
        if ((lat < 0 ? -lat : lat) >= ra + rb) continue;
        const [lax, laz] = sideStep(a, dx, dz);
        const [lbx, lbz] = sideStep(b, -dx, -dz);
        shove(this, a, lax * PASS_STEER, laz * PASS_STEER);
        shove(this, b, lbx * PASS_STEER, lbz * PASS_STEER);
        continue;
      }
      // xe đang chạy nhường xe đã đứng yên: xe chạy chịu phần lớn lực đẩy (lách qua), xe đã vào hàng chỉ xê dịch chút ít
      // (vẫn nhường một chút để khe hẹp nới dần, xe chạy không kẹt mãi). Hai xe cùng chạy hoặc cùng đứng thì chia đều.
      // Quân ĐÃ HẠ BỆ (chân chống cắm đất) thì không bị xô chút nào: xe kia chịu trọn; hai quân cùng hạ bệ thì không ai nhích.
      // Hai xe cùng chạy mà một xe đang CHỞ HÀNG, xe kia rỗng: xe rỗng nhường như xe chạy nhường xe đứng (luật đường hẹp
      // của tài xế; đối xứng hai phe vì chỉ xét hàng trên xe). Hai xe đối đầu ở một góc sát vách: xe bị vách chặn không lách
      // được, đường đi lại kéo cả hai về cùng một điểm góc, giằng co mãi nếu chia đều.
      const ya = a.moved === b.moved ? yieldsTo(a, b) : 0;
      let wa = pa ? 0 : pb ? 1 : ya > 0 ? MOVER_SHARE : ya < 0 ? 1 - MOVER_SHARE : a.moved === b.moved ? 0.5 : a.moved ? MOVER_SHARE : 1 - MOVER_SHARE;
      // xe chạy gặp xe đứng, hoặc hai xe chạy đối đầu: ngoài đẩy ra còn LÁCH SANG BÊN (vuông góc hướng chạy, phía xa xe kia);
      // đối đầu mà có xe được ưu tiên thì xe đó giữ làn, xe nhường lách
      let aSide = !pa && ((a.moved && !b.moved) || (headOn && ya >= 0));
      let bSide = !pb && ((b.moved && !a.moved) || (headOn && ya <= 0));
      // tiểu đội gặp xe: LÍNH NHƯỜNG XE (chịu phần lớn cú đẩy, không lách), xe đi tiếp như không có gì
      if (soft > 0 && !pa && !pb) {
        const sqA = isSquad(a.kind);
        wa = sqA ? MOVER_SHARE : 1 - MOVER_SHARE;
        aSide = false;
        bSide = false;
      }
      // CÙNG ĐỘI HÌNH, một xe đúng ô, một xe đang về ô (lệch ô từ SQUAD_IN_SLOT m, kể cả xe đứng chờ phía trước đội): xe đúng ô
      // NHƯỜNG ĐƯỜNG (chịu phần lớn cú đẩy và lách sang bên) rồi tự về ô; xe về ô đi tiếp. Khe giữa hai xe trong hàng hẹp hơn
      // thân xe lớn (Titan cạnh nhau hở 3,2 m, Pháo rộng 4,6 m): không ai nhường thì xe về ô kẹt ngoài hàng, hoặc bị cả hàng
      // xô theo (Pháo đứng trước đội bị hàng sau xô lên 120 m trong 22 giây)
      if (!pa && !pb && a.squad !== 0 && a.squad === b.squad) {
        const offA = a.slotOff >= SQUAD_IN_SLOT;
        const offB = b.slotOff >= SQUAD_IN_SLOT;
        if (offA !== offB) {
          wa = offA ? 1 - MOVER_SHARE : MOVER_SHARE;
          aSide = !offA;
          bSide = !offB;
        }
      }
      const [lax, laz] = aSide ? sideStep(a, dx, dz) : [0, 0];
      const [lbx, lbz] = bSide ? sideStep(b, -dx, -dz) : [0, 0];
      // Đẩy qua tryMove: sát vách thì trượt dọc vách thay vì bỏ cả cú đẩy (trước đây cả hai đứng im lồng vào nhau). Hai cú đẩy
      // tính từ cùng một trạng thái; phần xe này không đi được (cả đẩy dọc lẫn lách ngang) thì xe kia đi bù theo hướng ngược
      // lại, một lượt cho cả hai chiều, nên đổi vai a / b (thứ tự mã xe) ra cùng kết quả. Quân đã hạ bệ không bị bù.
      const dax = -nx * over * wa + lax * over;
      const daz = -nz * over * wa + laz * over;
      const dbx = nx * over * (1 - wa) + lbx * over;
      const dbz = nz * over * (1 - wa) + lbz * over;
      const [mxa, mza] = shove(this, a, dax, daz);
      const [mxb, mzb] = shove(this, b, dbx, dbz);
      if (!pb) shove(this, b, mxa - dax, mza - daz);
      if (!pa) shove(this, a, mxb - dbx, mzb - dbz);
    }
  }
}

/**
 * Bước cuối mỗi tick (sau khi các xe đẩy nhau, quay thân): ĐẨY HẲN thân xe mặt đất ra khỏi vật cản, lặp tối đa
 * STATIC_ITERS lần × WALL_PUSH m trong cùng tick, tới khi hết chạm (vật cản tĩnh giải cuối cùng, như các game RTS: xe khác xô
 * mạnh tới đâu thì vị trí cuối tick vẫn không nằm trong vách / nhà). Bị kẹp đều hai bên (hướng đẩy triệt tiêu) thì thôi.
 */
function keepOffWalls(this: World): void {
  for (const u of this.units) {
    if (u.hp <= 0 || u.air !== "none" || this.anchored(u)) continue;
    for (let k = 0; k < STATIC_ITERS; k++) {
      const [px, pz, hits] = this.bodyContact(u, u.x, u.z);
      if (hits === 0) break;
      const l = Math.sqrt(px * px + pz * pz);
      if (l < 1e-9) break;
      const nx = u.x + (px / l) * WALL_PUSH;
      const nz = u.z + (pz / l) * WALL_PUSH;
      if (this.grid.blockedAt(nx, nz) || this.bodyContact(u, nx, nz)[2] > hits) break;
      u.x = nx;
      u.z = nz;
    }
  }
}

function anchored(this: World, u: Unit): boolean {
  const dep = UNITS[u.kind].weapon?.deploy;
  return !!dep && u.still >= sec(dep.time);
}

const methods = { standLayer, standFor, turnHull, stepToward, setIdle, halt, setPath, bodyContact, wallNormal, clearGoal, tryMove, terrainFactor, moveFactor, follow, chase, separate, keepOffWalls, anchored, steer, orcaPass, brakeNear };
type Methods = typeof methods;
declare module "./core" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface World extends Methods {}
}
Object.assign(World.prototype, methods);
