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
  const p = this.grid.findPath(u.x, u.z, x, z, this.grid.field(spec.mobility ?? "wheel", !!spec.slowResist));
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

function separate(this: World): void {
  const g: Unit[] = [];
  for (const u of this.units) if (u.air === "none" && u.hp > 0) g.push(u);
  for (let i = 0; i < g.length; i++) {
    const a = g[i];
    const ra = UNITS[a.kind].radius;
    for (let j = i + 1; j < g.length; j++) {
      const b = g[j];
      const rb = UNITS[b.kind].radius;
      // Va chạm theo hình tròn bán kính = nửa bề ngang (tính theo thân dài thật thì phải đổi cả khoảng hàng của đội hình:
      // để cho bước ORCA). Hai xe cùng chạy thì nhìn xa thêm PASS_LOOK để kịp lách trước khi chạm.
      const both = a.moved && b.moved;
      const min = (ra + rb) * 0.8;
      const reach = both ? ra + rb + PASS_LOOK : min;
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
      if (d >= min) {
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
      const wa = pa ? 0 : pb ? 1 : a.moved === b.moved ? 0.5 : a.moved ? MOVER_SHARE : 1 - MOVER_SHARE;
      const over = min - d;
      // xe chạy gặp xe đứng, hoặc hai xe chạy đối đầu: ngoài đẩy ra còn LÁCH SANG BÊN (vuông góc hướng chạy, phía xa xe kia)
      const aSide = !pa && ((a.moved && !b.moved) || headOn);
      const bSide = !pb && ((b.moved && !a.moved) || headOn);
      const [lax, laz] = aSide ? sideStep(a, dx, dz) : [0, 0];
      const [lbx, lbz] = bSide ? sideStep(b, -dx, -dz) : [0, 0];
      // đẩy qua tryMove: sát vách thì trượt dọc vách thay vì bỏ cả cú đẩy (trước đây cả hai đứng im lồng vào nhau); phần xe
      // này không nhích được thì xe kia gánh (trừ quân đã hạ bệ)
      const pushA = over * wa;
      const [mxa, mza] = shove(this, a, -nx * pushA + lax * over, -nz * pushA + laz * over);
      const lackA = pushA + (mxa * nx + mza * nz); // phần đẩy dọc pháp tuyến a chưa đi được
      const pushB = over * (1 - wa) + (pb ? 0 : lackA > 0 ? lackA : 0);
      const [mxb, mzb] = shove(this, b, nx * pushB + lbx * over, nz * pushB + lbz * over);
      const lackB = pushB - (mxb * nx + mzb * nz);
      if (lackB > 1e-6 && !pa && lackA <= 1e-6) shove(this, a, -nx * lackB, -nz * lackB);
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
