/** Di chuyển một xe: quay thân, bước tới, đi theo đường A*, né vách, đẩy xe không chồng lên nhau. */
import { RULES, UNITS } from "../content";
import { dist2, turnToward } from "../fmath";
import type { Target, Unit } from "../types";
import { DT, sec, MOVER_SHARE, WALL_CLEAR, WALL_PUSH, GOAL_SHIFT, WALL_FAR, PROBES, PIVOT_COS, ALIGNED_COS, TMP, traverseStep } from "./shared";
import { World } from "./core";

/** Hai xe cùng chạy coi là "ngược chiều" khi góc giữa hai hướng thân lớn hơn 120° (cos < −0,5). */
const HEAD_ON_COS = -0.5;
/** Xe ngược chiều thấy nhau từ cách mép thân chừng này (m) thì bắt đầu lách. */
const PASS_LOOK = 6;
/** Lách sang bên mỗi tick khi chưa chạm (m; 1,5 m/s, chậm hơn nhiều so với tốc độ chạy). */
const PASS_STEER = 0.15;
/** Bán kính chấp nhận của điểm qua giữa đường (m). */
const WAYPOINT_R = 2.5;

/** Nửa bề ngang thân xe dùng khi tìm / nối tắt đường (cùng cỡ với điểm dò vách `wallNormal`); máy bay: 0,7 m như cũ. */
function pathHalf(u: Unit): number {
  return u.air === "none" ? Math.max(0.7, UNITS[u.kind].radius * WALL_CLEAR) : 0.7;
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
  const dx = (x - u.x) / d;
  const dz = (z - u.z) / d;
  // đi xa (từ 3 m): quay thân về hướng đi trước, lệch nhiều thì xoay tại chỗ; nhích chỉnh hàng thì khỏi quay thân
  if (d >= 3 && !this.turnHull(u, dx, dz)) return;
  const rally = this.mobilized(u) ? 1 + RULES.abilities.mobilize.speed : 1;
  const step = Math.min(this.speedOf(u) * DT * rally * this.moveFactor(u, dx, dz), d);
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

function setPath(this: World, u: Unit, x: number, z: number): boolean {
  // tìm đường nhanh nhất theo kiểu xe (bánh / xích) và địa hình (B3b)
  const spec = UNITS[u.kind];
  [x, z] = this.clearGoal(u, x, z);
  // Đường đi giữa lối ("hành lang": ô sát vách coi như chậm) và đoạn nối tắt chừa đủ nửa bề ngang thân xe; trước 12/11/2026
  // đường men sát vách từng ô và nối tắt sát góc, thân xe quẹt mép dốc rồi trượt dọc mép, mũi quay vào vách (người dùng thấy
  // ở dốc B7 của Cao Nguyên Ba Bậc)
  const p = this.grid.findPath(u.x, u.z, x, z, this.grid.corridor(spec.mobility ?? "wheel", !!spec.slowResist), pathHalf(u));
  u.path = p ?? [];
  u.pathI = 0;
  u.stuck = 0;
  return p !== null;
}

/**
 * Hướng đẩy ra khỏi vách tại (x, z): tổng ngược hướng các điểm dò quanh thân (WALL_CLEAR × bán kính) rơi vào ô bị chặn
 * cố định (vách, đá, sông), chưa chuẩn hóa. (0, 0) = thân không chạm gì, hoặc hai bên chạm đều nhau (khe hẹp).
 */
function wallNormal(this: World, u: Unit, x: number, z: number, fx = u.hx, fz = u.hz): [number, number] {
  // xa vách hơn WALL_FAR ô (lớn hơn mọi thân xe): khỏi dò
  if (this.grid.wallDist[this.grid.index(x, z)] > WALL_FAR) return [0, 0];
  const spec = UNITS[u.kind];
  // điểm dò nằm trên hình elip theo thân xe: nửa rộng = bán kính, nửa dài = halfLen, trục dài theo hướng thân (fx, fz)
  const W = spec.radius * WALL_CLEAR;
  const L = (spec.halfLen ?? spec.radius) * WALL_CLEAR;
  let px = 0;
  let pz = 0;
  for (const [c, s] of PROBES) {
    const ox = fx * c * L - fz * s * W;
    const oz = fz * c * L + fx * s * W;
    if (this.map.staticBlocked(x + ox, z + oz)) {
      px -= ox;
      pz -= oz;
    }
  }
  return [px, pz];
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

function tryMove(this: World, u: Unit, nx: number, nz: number): boolean {
  // thân xe không lấn sâu thêm vào vách: ở chỗ mới mà thân chạm vách thì bỏ phần bước đi hướng vào vách, chỉ giữ phần trượt
  // dọc vách (khe hẹp hai bên đều chạm thì pháp tuyến triệt tiêu, đi như cũ)
  const [px, pz] = this.wallNormal(u, nx, nz);
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
  if (!this.grid.blockedAt(nx, nz)) {
    u.x = nx;
    u.z = nz;
    return true;
  }
  if (!this.grid.blockedAt(nx, u.z)) {
    u.x = nx;
    return true;
  }
  if (!this.grid.blockedAt(u.x, nz)) {
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
    if (!this.grid.los(u.x, u.z, nx, nz, pathHalf(u))) break;
    const f = this.grid.field(spec.mobility ?? "wheel", !!spec.slowResist);
    const need = Math.min(f.k[this.grid.index(wx, wz)], f.k[this.grid.index(nx, nz)]);
    if (this.grid.minSpeedAlong(f, u.x, u.z, nx, nz) < need) break;
    u.pathI++;
  }
  // tốc độ theo địa hình và độ dốc, đo theo hướng tới điểm kế tiếp trên đường
  const fdx = u.path[u.pathI * 2] - u.x;
  const fdz = u.path[u.pathI * 2 + 1] - u.z;
  const fd = Math.sqrt(fdx * fdx + fdz * fdz);
  // lệch hướng nhiều: đứng lại xoay tại chỗ (chưa chạy, không tính là kẹt)
  if (fd > 1e-6 && !this.turnHull(u, fdx / fd, fdz / fd)) return false;
  const rally = this.mobilized(u) ? 1 + RULES.abilities.mobilize.speed : 1;
  const full = this.speedOf(u) * DT * rally * (fd > 1e-6 ? this.moveFactor(u, fdx / fd, fdz / fd) : this.moveFactor(u, 0, 0));
  let step = full;
  const ox = u.x;
  const oz = u.z;
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

/** Thân xe để tính va chạm: nửa bề ngang = bán kính × 0,85, nửa chiều dài = halfLen × 0,9 (thùng / giáp hơi tròn góc). */
const BODY_W = 0.85;
const BODY_L = 0.9;
const BODIES = new Map<string, readonly [number, number, number]>();
/** [nửa ngang, nửa dài, nửa đường chéo] của thân xe (tính một lần cho mỗi loại quân). */
function bodyOf(u: Unit): readonly [number, number, number] {
  let b = BODIES.get(u.kind);
  if (!b) {
    const s = UNITS[u.kind];
    const w = s.radius * BODY_W;
    const l = Math.max(s.halfLen ?? s.radius, s.radius) * BODY_L;
    b = [w, l, Math.sqrt(w * w + l * l)];
    BODIES.set(u.kind, b);
  }
  return b;
}

/**
 * Hai thân xe hình chữ nhật xoay theo hướng thân có lồng nhau không (phép tách trục, SAT: hai hình lồi không chạm nhau khi và
 * chỉ khi có một trục, ở đây là một trong bốn cạnh, mà hình chiếu của chúng lên trục đó rời nhau). Trả về [độ lồng nhỏ nhất,
 * hướng đẩy x, hướng đẩy z] (hướng từ a sang b, theo trục có độ lồng nhỏ nhất); độ lồng ≤ 0 là không chạm.
 */
function boxOverlap(a: Unit, ba: readonly number[], b: Unit, bb: readonly number[], dx: number, dz: number): [number, number, number] {
  let best = Infinity;
  let bx = 0;
  let bz = 0;
  for (let k = 0; k < 4; k++) {
    const u = k < 2 ? a : b;
    // trục: hướng thân hoặc vuông góc thân của a rồi của b
    const ux = k % 2 === 0 ? u.hx : u.hz;
    const uz = k % 2 === 0 ? u.hz : -u.hx;
    const ca = a.hx * ux + a.hz * uz;
    const sa = a.hz * ux - a.hx * uz;
    const cb = b.hx * ux + b.hz * uz;
    const sb = b.hz * ux - b.hx * uz;
    const ra = ba[1] * (ca < 0 ? -ca : ca) + ba[0] * (sa < 0 ? -sa : sa);
    const rb = bb[1] * (cb < 0 ? -cb : cb) + bb[0] * (sb < 0 ? -sb : sb);
    const dist = dx * ux + dz * uz;
    const ov = ra + rb - (dist < 0 ? -dist : dist);
    if (ov <= 0) return [ov, 0, 0];
    if (ov < best) {
      best = ov;
      bx = dist < 0 ? -ux : ux;
      bz = dist < 0 ? -uz : uz;
    }
  }
  return [best, bx, bz];
}

/** 1 = a nhường b (a rỗng, b đang chở hàng), −1 = b nhường a, 0 = ngang nhau. */
function yieldsTo(a: Unit, b: Unit): number {
  const la = a.cargo > 0 || a.scrap > 0;
  const lb = b.cargo > 0 || b.scrap > 0;
  return la === lb ? 0 : lb ? 1 : -1;
}

function separate(this: World): void {
  const g: Unit[] = [];
  for (const u of this.units) if (u.air === "none" && u.hp > 0) g.push(u);
  for (let i = 0; i < g.length; i++) {
    const a = g[i];
    const ra = UNITS[a.kind].radius;
    const ba = bodyOf(a);
    for (let j = i + 1; j < g.length; j++) {
      const b = g[j];
      const rb = UNITS[b.kind].radius;
      const bb = bodyOf(b);
      // Hai xe CÙNG MỘT ĐỘI HÌNH: va chạm theo hình tròn bán kính = nửa bề ngang × 0,8, vì khoảng hàng của đội hình đang tính
      // theo bán kính (tính theo thân dài thì Pháo 9 m kẹt giữa hai Titan đoạn hậu; đổi cùng lúc với ORCA). Còn lại (Xe Vận
      // Tải, xe lẻ, xe khác đội): theo HÌNH CHỮ NHẬT đúng thân xe, không thì mũi xe chui vào hông xe kia gần 1 m khi cắt ngang.
      const sameSq = a.squad !== 0 && a.squad === b.squad;
      const both = a.moved && b.moved;
      const min = (ra + rb) * 0.8;
      const touch = sameSq ? min : ba[2] + bb[2];
      // hai xe cùng chạy thì nhìn xa thêm PASS_LOOK để kịp lách trước khi chạm
      const reach = both ? Math.max(touch, ra + rb + PASS_LOOK) : touch;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      if (dx >= reach || dx <= -reach || dz >= reach || dz <= -reach) continue;
      const d2 = dx * dx + dz * dz;
      if (d2 >= reach * reach) continue;
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
      const pa = this.anchored(a);
      const pb = this.anchored(b);
      if (pa && pb) continue;
      // hai xe cùng chạy NGƯỢC CHIỀU, xe kia ở phía trước mỗi xe. Đi thẳng hàng trên cùng một đường A* là chuyện thường (xe
      // ra mỏ và xe về nhà đi chung một lối): khi đó lực đẩy dọc đường nối hai tâm triệt tiêu đúng bằng phần vừa tiến, kẹt mãi
      const headOn = both && a.hx * b.hx + a.hz * b.hz < HEAD_ON_COS && dx * a.hx + dz * a.hz > 0 && -dx * b.hx - dz * b.hz > 0;
      // độ lồng (over) và hướng đẩy (nx, nz: từ a sang b)
      let over = min - d;
      if (!sameSq) {
        const c = boxOverlap(a, ba, b, bb, dx, dz);
        over = c[0];
        if (over > 0) {
          nx = c[1];
          nz = c[2];
        }
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
      const wa = pa ? 0 : pb ? 1 : ya > 0 ? MOVER_SHARE : ya < 0 ? 1 - MOVER_SHARE : a.moved === b.moved ? 0.5 : a.moved ? MOVER_SHARE : 1 - MOVER_SHARE;
      // xe chạy gặp xe đứng, hoặc hai xe chạy đối đầu: ngoài đẩy ra còn LÁCH SANG BÊN (vuông góc hướng chạy, phía xa xe kia);
      // đối đầu mà có xe được ưu tiên thì xe đó giữ làn, xe nhường lách
      const aSide = !pa && ((a.moved && !b.moved) || (headOn && ya >= 0));
      const bSide = !pb && ((b.moved && !a.moved) || (headOn && ya <= 0));
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

/** Quân đã hạ bệ xong (chân chống cắm đất): đứng chết tại chỗ, xe khác tông vào không xô được. */
/** Đẩy xe mặt đất ra khỏi vách / đá / sông khi thân xe lấn vào (xem WALL_CLEAR). Tổng hai hướng đối nhau triệt tiêu đúng số. */
function keepOffWalls(this: World): void {
  for (const u of this.units) {
    if (u.hp <= 0 || u.air !== "none" || this.anchored(u)) continue;
    const [px, pz] = this.wallNormal(u, u.x, u.z);
    const l = Math.sqrt(px * px + pz * pz);
    if (l < 1e-9) continue;
    const nx = u.x + (px / l) * WALL_PUSH;
    const nz = u.z + (pz / l) * WALL_PUSH;
    if (!this.grid.blockedAt(nx, nz)) {
      u.x = nx;
      u.z = nz;
    }
  }
}

function anchored(this: World, u: Unit): boolean {
  const dep = UNITS[u.kind].weapon?.deploy;
  return !!dep && u.still >= sec(dep.time);
}

const methods = { turnHull, stepToward, setIdle, halt, setPath, wallNormal, clearGoal, tryMove, terrainFactor, moveFactor, follow, chase, separate, keepOffWalls, anchored };
type Methods = typeof methods;
declare module "./core" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface World extends Methods {}
}
Object.assign(World.prototype, methods);
