/**
 * TẦNG 1 — CHẠM MỀM (lõi di chuyển mới 20/11/2026; luật đẩy "như mọi người" 23/11/2026, kế hoạch
 * `Docs/plans/2026-11-20-di-chuyen-theo-so-dong-ke-hoach.md` B1).
 *
 * Sau khi mọi xe đã lái xong trong tick, tách các cặp xe mặt đất đang chồng thân, ITERS lượt Jacobi (cộng dồn lực tách của mọi cặp
 * rồi mới áp: không phụ thuộc thứ tự duyệt). Luật mỗi cặp:
 *  - XE ĐỨNG DẠT CHO XE ĐI (Spring `collideeYields`): cùng phe, một xe đang đi (hoặc vừa bị đẩy dạt trong tick này: cú đẩy lan theo
 *    dây chuyền), xe kia đứng / đứng ì (không hạ bệ đóng quân, tiểu đội không xô được xe) → xe đứng dạt, xe đi không bị cản (tầng
 *    lái cũng không né, không phanh vì xe đứng). Xe đứng nằm trước mũi xe đi thì dạt SANG NGANG làn, phần chồng dọc làn xe đi chịu;
 *  - TRONG MỘT KHỐI: xe ưu tiên cao hơn (`gprio`: ô đang ở trước trên đường đi của khối) đang đi thì xe ưu tiên thấp dạt, kể cả khi
 *    nó cũng đang muốn đi (mỗi xe một mức ưu tiên duy nhất: không kẹt vòng "cậu nhường – không cậu nhường");
 *  - cặp khác (khác phe, hai xe cùng đi): chia phần chồng theo khối lượng (bodyR²; xe đứng nhẹ hơn, bộ binh rất nhẹ, quân hạ bệ đóng
 *    quân không bị đẩy);
 *  - xe đứng bị đẩy vào vách không nhích được thì thành vật cứng ở các lượt sau (phần chồng dồn về xe đi, xe đi mất đà); cuối tick
 *    đẩy hẳn thân ra khỏi vách (`keepOffWalls`).
 * Lưới băm ô NEAR_CELL m dùng chung cho tầng lái (`nearGround`) và tầng này.
 */
import { UNITS } from "../content";
import type { Unit } from "../types";
import { sec, bodyRadius, softOverlap, isSquad, WALL_PUSH } from "./shared";
import { World } from "./core";
import { STALL_V } from "./movement";

/** Cạnh ô lưới băm (m). */
const NEAR_CELL = 8;
/** Phần chồng thân sửa mỗi lượt (cặp thường; còn lại sửa tiếp lượt / tick sau: chuyển động mượt, không giật). */
const CONTACT_K = 0.55;
/** Một xe bị đẩy tối đa chừng này mét mỗi lượt (cặp thường: tách dần qua vài tick, không hất xe sang ngang thấy được). */
const PUSH_MAX = 0.3;
/** Xe đứng yên (không lệnh, không trong khối đang chạy) nhẹ hơn chừng này lần (cặp khác phe). */
const STANDING_MASS = 0.45;
/** Quân đã hạ bệ trong khối đang xếp hàng nặng gấp chừng này lần (đẩy được nhưng khó). */
const ANCHOR_MASS = 3;
/** Tiểu đội bộ binh nhẹ chừng này lần so với xe cùng cỡ đế. */
const SQUAD_MASS = 0.2;
/**
 * XE ĐI ĐẨY XE ĐỨNG (B1, 23/11/2026; Spring `HandleUnitCollisions`: `collideeYields`): xe đang đi (hoặc xe vừa bị đẩy trong tick
 * này, cú đẩy lan theo dây chuyền) chạm xe cùng phe đang đứng / đứng ì (không hạ bệ) thì xe đứng dạt: nằm trước mũi xe đi thì dạt
 * SANG NGANG làn (phần chồng dọc làn xe đi tự chịu, chậm lại chờ), ở bên / sau thì nhận YIELD_SHARE phần chồng theo pháp tuyến;
 * tối đa YIELD_MAX m mỗi lượt. Xe đi không phanh, không né xe đứng (`avoid`). Xe đứng kẹt vách không dạt được thì phần chồng dồn
 * lại cho xe đi (lượt sau), xe đi mất đà.
 */
const YIELD_SHARE = 0.9;
const YIELD_MAX = 0.3;
/** Số lượt giải va chạm mỗi tick (Jacobi): cú đẩy lan qua chừng này xe đứng trong một tick. */
const ITERS = 3;
/** Số lần đẩy ra khỏi vật cản tối đa trong một tick (× WALL_PUSH m): thân lún vách thì gỡ dần vài tick, không hất xe đi một quãng. */
const STATIC_ITERS = 2;

/** Dựng lưới băm các xe mặt đất còn sống (vị trí lúc gọi). Gọi đầu phần xe chạy và trước khi tách va chạm. */
function buildNear(this: World): void {
  const cols = Math.ceil((this.map.halfW * 2) / NEAR_CELL) + 1;
  const rows = Math.ceil((this.map.halfH * 2) / NEAR_CELL) + 1;
  if (this.nearHead.length !== cols * rows) this.nearHead = new Int32Array(cols * rows);
  this.nearCols = cols;
  this.nearRows = rows;
  this.nearHead.fill(-1);
  const arr = this.nearArr;
  arr.length = 0;
  for (const u of this.units) if (u.hp > 0 && u.air === "none") arr.push(u);
  if (this.nearNext.length < arr.length) this.nearNext = new Int32Array(arr.length * 2);
  for (let i = 0; i < arr.length; i++) {
    const c = this.nearCell(arr[i].x, arr[i].z);
    this.nearNext[i] = this.nearHead[c];
    this.nearHead[c] = i;
  }
}

function nearCell(this: World, x: number, z: number): number {
  let cx = Math.floor((x + this.map.halfW) / NEAR_CELL);
  let cz = Math.floor((z + this.map.halfH) / NEAR_CELL);
  if (cx < 0) cx = 0;
  else if (cx >= this.nearCols) cx = this.nearCols - 1;
  if (cz < 0) cz = 0;
  else if (cz >= this.nearRows) cz = this.nearRows - 1;
  return cz * this.nearCols + cx;
}

/** Chỉ số (trong `nearArr`) các xe mặt đất có ô lưới băm chạm hình vuông (x ± r, z ± r); ghi vào `NEAR_IDX`, trả về số lượng. */
const NEAR_IDX: number[] = [];
function nearIdx(w: World, x: number, z: number, r: number): number {
  NEAR_IDX.length = 0;
  const c0 = w.nearCell(x - r, z - r);
  const c1 = w.nearCell(x + r, z + r);
  const x0 = c0 % w.nearCols;
  const z0 = (c0 - x0) / w.nearCols;
  const x1 = c1 % w.nearCols;
  const z1 = (c1 - x1) / w.nearCols;
  for (let cz = z0; cz <= z1; cz++)
    for (let cx = x0; cx <= x1; cx++) for (let i = w.nearHead[cz * w.nearCols + cx]; i >= 0; i = w.nearNext[i]) NEAR_IDX.push(i);
  return NEAR_IDX.length;
}

/** Các xe mặt đất trong lưới băm quanh (x, z) bán kính r (lọc thô theo ô, người gọi tự đo khoảng cách). Mảng dùng lại mỗi lần gọi. */
const NEAR_UNITS: Unit[] = [];
function nearGround(this: World, x: number, z: number, r: number): Unit[] {
  const n = nearIdx(this, x, z, r);
  NEAR_UNITS.length = n;
  for (let k = 0; k < n; k++) NEAR_UNITS[k] = this.nearArr[NEAR_IDX[k]];
  return NEAR_UNITS;
}

/** Quân đã hạ bệ xong (Pháo, Tên Lửa Loạt, SkyGuard đứng yên đủ lâu): không bị đẩy. */
function anchored(this: World, u: Unit): boolean {
  const dep = UNITS[u.kind].weapon?.deploy;
  return !!dep && u.still >= sec(dep.time);
}

/**
 * Khối lượng va chạm của xe: bodyR² × trạng thái (đứng yên nhẹ hơn, bộ binh rất nhẹ). Hạ bệ ở chỗ đóng quân = vô cùng; hạ bệ
 * trong khối đang xếp hàng thì chỉ nặng gấp ANCHOR_MASS (đồng đội còn đẩy qua được, không thành tảng đá chắn lối vào hàng).
 */
function contactMass(w: World, u: Unit): number {
  const r = bodyRadius(u.kind);
  if (w.anchored(u)) return u.group ? r * r * ANCHOR_MASS : Infinity;
  let m = r * r;
  if (isSquad(u.kind)) m *= SQUAD_MASS;
  // đứng yên: không lệnh, không thuộc khối đang chạy, không vừa nhích
  if (!u.moved && u.order === "idle" && !u.group) m *= STANDING_MASS;
  return m;
}

let PUSH_X = new Float64Array(64);
let PUSH_Z = new Float64Array(64);
/** Mỗi xe trong lượt: 1 = nhận cú đẩy dạt (trần YIELD_MAX); PUSHED: xe đứng đã bị đẩy dạt trong tick này (lan tiếp cú đẩy). */
let YIELDED = new Uint8Array(64);
let PUSHED = new Uint8Array(64);
/** Xe đứng bị đẩy mà không nhích được (kẹt vách): coi như vật cứng ở các lượt sau. */
let PINNED = new Uint8Array(64);

/** Tách các cặp xe mặt đất chồng thân (xem chú thích đầu file và YIELD_SHARE). */
function resolveContacts(this: World): void {
  this.buildNear();
  const arr = this.nearArr;
  const n = arr.length;
  if (PUSH_X.length < n) {
    PUSH_X = new Float64Array(n * 2);
    PUSH_Z = new Float64Array(n * 2);
    YIELDED = new Uint8Array(n * 2);
    PUSHED = new Uint8Array(n * 2);
    PINNED = new Uint8Array(n * 2);
  }
  PUSHED.fill(0, 0, n);
  PINNED.fill(0, 0, n);
  // xe đang lăn thật (muốn đi và có tốc độ)
  const rolling = (u: Unit): boolean => u.going && (u.speed >= STALL_V || u.speed <= -STALL_V);
  // xe j phải dạt cho xe i: (i đang đi / vừa bị đẩy dạt trong tick này mà j không đi) hoặc (i đang lăn mà j đứng ì); j không hạ bệ,
  // chưa kẹt vách; tiểu đội bộ binh không xô được xe
  const yields = (j: number, i: number): boolean => {
    const a = arr[i];
    const b = arr[j];
    // quân hạ bệ đã đóng quân là vật cứng; hạ bệ khi khối còn đang xếp (đỗ ô chờ đồng đội) thì vẫn dạt cho đồng đội đi qua
    if (PINNED[j] !== 0 || (this.anchored(b) && b.group === 0) || (isSquad(a.kind) && !isSquad(b.kind))) return false;
    // TRONG MỘT KHỐI: mỗi xe một mức ưu tiên duy nhất = thứ tự ô (ô hàng trước ưu tiên hơn; Pottinger: không có vòng "cậu nhường –
    // không cậu nhường"): xe ô trước đang đi được đẩy dạt xe ô sau, kể cả khi xe đó cũng đang muốn đi (giáp lên trước, pháo lùi sau)
    if (a.group !== 0 && a.group === b.group) return a.going && a.gprio < b.gprio;
    if ((a.going || PUSHED[i] === 1) && !b.going && !(PUSHED[j] === 1 && !a.going)) return true;
    return rolling(a) && !rolling(b) && b.going && PUSHED[j] === 0;
  };
  for (let it = 0; it < ITERS; it++) {
    PUSH_X.fill(0, 0, n);
    PUSH_Z.fill(0, 0, n);
    YIELDED.fill(0, 0, n);
    let any = false;
    for (let i = 0; i < n; i++) {
      const a = arr[i];
      const ra = bodyRadius(a.kind);
      const m = nearIdx(this, a.x, a.z, ra + 4);
      for (let k = 0; k < m; k++) {
        const j = NEAR_IDX[k];
        if (j <= i) continue;
        const b = arr[j];
        const touch = ra + bodyRadius(b.kind) - softOverlap(a.kind, b.kind);
        const ex = b.x - a.x;
        const ez = b.z - a.z;
        if (ex >= touch || ex <= -touch || ez >= touch || ez <= -touch) continue;
        const d2 = ex * ex + ez * ez;
        if (d2 >= touch * touch) continue;
        const d = Math.sqrt(d2);
        let nx: number;
        let nz: number;
        if (d < 1e-6) {
          // trùng tâm: tách theo hướng bên phải thân xe a (không phụ thuộc mã xe hay phe)
          nx = a.hz;
          nz = -a.hx;
        } else {
          nx = ex / d;
          nz = ez / d;
        }
        const over = touch - d;
        // ---- xe đứng dạt cho xe cùng phe đang đi / đang bị đẩy
        const same = a.side === b.side;
        const bYields = same && yields(j, i);
        const aYields = !bYields && same && yields(i, j);
        if (aYields || bYields) {
          const mi = bYields ? i : j;
          const si = bYields ? j : i;
          const mover = arr[mi];
          const st = arr[si];
          // pháp tuyến từ xe đẩy sang xe đứng
          const sx = bYields ? nx : -nx;
          const sz = bYields ? nz : -nz;
          // xe đứng ở TRƯỚC MŨI xe đang đi: chỉ dạt SANG NGANG làn (đủ hết chồng theo hình học, tối đa YIELD_MAX), phần chồng dọc
          // làn xe đi tự chịu (chậm lại chờ nó dạt): xe đứng không bị lôi đi dọc đường xe kia. Thẳng mũi thì dạt sang phải xe đi. Xe
          // đứng ở bên / sau: đẩy theo pháp tuyến, nó nhận YIELD_SHARE phần
          const sg = mover.speed < 0 ? -1 : 1;
          const hx = mover.hx * sg;
          const hz = mover.hz * sg;
          const rx = st.x - mover.x;
          const rz = st.z - mover.z;
          const al = rx * hx + rz * hz;
          if (mover.going && al > 0.05 * touch) {
            const lat = rx * hz - rz * hx;
            const s = lat > 0.05 ? 1 : lat < -0.05 ? -1 : 1;
            const alat = lat < 0 ? -lat : lat;
            const needLat = al < touch ? Math.sqrt(touch * touch - al * al) - alat : 0;
            const dl = needLat > YIELD_MAX ? YIELD_MAX : needLat > 0 ? needLat : 0;
            PUSH_X[si] += hz * s * dl;
            PUSH_Z[si] -= hx * s * dl;
            // phần chồng còn lại sau khi dạt (theo hình học) về xe đi, ngược hướng đi
            const nl = alat + dl;
            const d2n = al * al + nl * nl;
            const rest = d2n < touch * touch ? touch - Math.sqrt(d2n) : 0;
            PUSH_X[mi] -= hx * rest;
            PUSH_Z[mi] -= hz * rest;
          } else {
            const push = over * YIELD_SHARE;
            PUSH_X[si] += sx * push;
            PUSH_Z[si] += sz * push;
            const rest = over - push;
            PUSH_X[mi] -= sx * rest;
            PUSH_Z[mi] -= sz * rest;
          }
          YIELDED[si] = 1;
          any = true;
          continue;
        }
        const ma = contactMass(this, a);
        const mb = contactMass(this, b);
        if (ma === Infinity && mb === Infinity) continue;
        const push = over * CONTACT_K;
        // phần mỗi xe chịu: tỉ lệ nghịch khối lượng
        const sa = ma === Infinity ? 0 : mb === Infinity ? 1 : mb / (ma + mb);
        const sb = 1 - sa;
        PUSH_X[i] -= nx * push * sa;
        PUSH_Z[i] -= nz * push * sa;
        PUSH_X[j] += nx * push * sb;
        PUSH_Z[j] += nz * push * sb;
        any = true;
      }
    }
    if (!any) break;
    for (let i = 0; i < n; i++) {
      let px = PUSH_X[i];
      let pz = PUSH_Z[i];
      const l2 = px * px + pz * pz;
      if (l2 < 1e-10) continue;
      const lim = YIELDED[i] ? YIELD_MAX : PUSH_MAX;
      if (l2 > lim * lim) {
        const k = lim / Math.sqrt(l2);
        px *= k;
        pz *= k;
      }
      const u = arr[i];
      const ox = u.x;
      const oz = u.z;
      this.tryMove(u, u.x + px, u.z + pz, true);
      const got = (u.x - ox) * (u.x - ox) + (u.z - oz) * (u.z - oz);
      if (YIELDED[i]) {
        // bị đẩy mà nhích chưa tới một nửa (vách chặn): vật cứng ở các lượt sau
        if (got < (px * px + pz * pz) * 0.25) PINNED[i] = 1;
        else PUSHED[i] = 1;
      }
      // bị đẩy ngược chiều đang chạy thì mất đà (không cố húc xuyên xe khác)
      const along = px * u.hx + pz * u.hz;
      if ((u.speed > 0 && along < -0.02) || (u.speed < 0 && along > 0.02)) u.speed *= 0.8;
      // bị xô lệch đủ xa thì tính là đã nhúc nhích (mất trạng thái cố định)
      if (got > 0.0025) u.moved = true;
    }
  }
  this.keepOffWalls();
}

/**
 * Bước cuối mỗi tick: ĐẨY HẲN thân xe mặt đất ra khỏi vật cản, lặp tối đa STATIC_ITERS lần × WALL_PUSH m trong cùng tick, tới
 * khi hết chạm (vật cản tĩnh giải cuối cùng: xe khác xô mạnh tới đâu thì vị trí cuối tick vẫn không nằm trong vách / nhà).
 * Bị kẹp đều hai bên (hướng đẩy triệt tiêu) thì thôi.
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

const methods = { buildNear, nearCell, nearGround, anchored, resolveContacts, keepOffWalls };
type Methods = typeof methods;
declare module "./core" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface World extends Methods {}
}
Object.assign(World.prototype, methods);
