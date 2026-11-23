/**
 * TẦNG 2 — LÁI (lõi di chuyển mới 20/11/2026, `Docs/plans/2026-11-20-loi-di-chuyen-moi-thiet-ke.md`).
 *
 * Một xe mặt đất có vị trí, hướng thân (hx, hz) và TỐC ĐỘ THẬT `u.speed` (m/s dọc thân, âm = lùi). Chỉ `drive()` đổi tốc độ
 * và hướng thân khi xe chạy: quay thân tối đa `turnRate`, tăng tốc theo `accel`, hãm theo `brake`, rồi tiến dọc thân. Vì vậy xe
 * có quán tính (nặng), không giật, không trượt ngang (thân chỉ dạt ngang khi bị chạm đẩy, `contact.ts`).
 *
 * Trên `drive()`: bám đường A* (`follow`), đuổi mục tiêu (`chase`). Tầng khối (`group.ts`) đặt đích là ô của xe.
 */
import { RULES, UNITS } from "../content";
import { clamp, dangle, dcos, DEG, dist2, dsin, PI, TAU, turnToward } from "../fmath";
import type { Target, Unit } from "../types";
import { DT, sec, accelOf, brakeOf, bodyRadius, wallRadius, isSquad, softOverlap, GOAL_SHIFT, PIVOT_COS, ALIGNED_COS, TMP, traverseStep } from "./shared";
import { World } from "./core";

/** Tới đích "dừng": cách đích không quá chừng này (m) là tới. */
const ARRIVE_R = 0.3;
/** Gần đích chừng này (m), lệch dọc thân không quá NEAR_ALONG và đã gần như đứng thì cũng là tới (khỏi xoay vì vài tấc lệch ngang). */
const NEAR_R = 0.8;
const NEAR_ALONG = 0.45;
/**
 * LÙI (B6, 23/11/2026; Spring `WantReverse`): đích gần hơn chừng này (m) thì so THỜI GIAN tới đích bằng lùi và bằng tiến (quay thân
 * theo `turnRate` + chạy, lùi chạy × REVERSE_SPEED, cộng thời gian quay về hướng mặt được giao khi tới), lùi nếu nhanh hơn rõ
 * (REV_PICK; đang lùi thì giữ lùi tới khi tiến nhanh hơn rõ, REV_KEEP: không đổi chiều qua lại). Xe bị đẩy lệch ô vài mét về phía
 * sau thì lùi về, giữ mặt hướng về phía địch; lệnh đi ngược chiều thì quay đầu (hướng mặt mới là hướng đi).
 */
export const REVERSE_MAX = 16;
const REVERSE_SPEED = 0.5;
const REV_PICK = 0.85;
const REV_KEEP = 1.25;
/** Lệch hướng ≤ 20° thì chạy hết tốc; ≥ 65° thì đứng xoay tại chỗ (không nhích tới: nhích mà lệch nhiều là đâm vào vách / xe bên cạnh); ở giữa thì vừa chạy chậm vừa quay (cua). */
const FULL_COS = 0.9396926207859084;
const STOP_COS = 0.42261826174069944;
/** Phanh vào đích: tốc độ ≤ √(2·hãm·quãng) và ≤ FINAL_K · quãng (đoạn cuối chậm dần đều, không khựng). */
const FINAL_K = 2.5;

/** Nhắm trước trên đường A* chừng này (m) tối thiểu; xa hơn khi chạy nhanh (tốc độ × PATH_LOOK_T). */
const PATH_LOOK = 3;
const PATH_LOOK_T = 0.7;
/** Điểm giữa đường coi như đã qua khi tới gần chừng này (m), hoặc đã vượt quá nó theo hướng đoạn kế tiếp. */
const WAYPOINT_PASS = 1;
/** Qua khúc cua gấp 90° thì chậm còn chừng này phần tốc độ (cua thẳng thì không chậm). */
const CORNER_SLOW = 0.3;

/** NÉ XE: nhìn trước tối thiểu chừng này (m) cộng quãng chạy trong LOOK_T giây; khe chừa thêm khi lách (m). */
const LOOK_MIN = 3;
const LOOK_T = 1.6;
const AVOID_GAP = 0.6;
/** Bám đuôi xe đi cùng chiều: giữ khoảng FOLLOW_GAP (m) giữa hai thân, đuổi khoảng thiếu trong FOLLOW_T giây. */
const FOLLOW_GAP = 0.8;
const FOLLOW_T = 0.8;
/** Gặp vật cản trong làn: dừng cách thân nó chừng này (m) nếu chưa lách được. */
const STOP_GAP = 0.3;
/** Xe cùng phe chậm hơn chừng này (m/s) là đang đứng ì: không né, không phanh vì nó (va chạm đẩy nó dạt, `contact.ts`). */
export const STALL_V = 0.3;
/** Xe phía trước đi cùng chiều mà chậm hơn chừng này phần tốc độ mình muốn thì được vượt (lách như vật cản). */
const OVERTAKE_K = 0.7;
/** Hai xe ngược chiều lệch nhau quá chừng này (m) về phía trái của nhau thì lách theo phía đó thay vì giữ phải. */
const ONCOMING_KEEP = 1;
/** Độ lệch hướng lớn nhất khi lách (≈ 40°, tính theo tan). */
const STEER_MAX = 0.85;

/** Kẹt: muốn đi mà gần như không tiến chừng này tick thì tìm đường vòng; gần đích (< GIVE_UP_NEAR m) mà kẹt GIVE_UP tick thì coi như tới. */
const STUCK_REPLAN = sec(1.2);
const GIVE_UP = sec(6);
const GIVE_UP_FAR = sec(12);
const GIVE_UP_NEAR = 8;
/** Lại gần đích thêm chừng này (m) là "còn tiến" (`follow`): chưa đủ GIVE_UP giây không tiến thì chưa bỏ cuộc. */
const PROGRESS_STEP = 0.5;

/** Bán kính thân khi tìm / nối tắt đường (cùng vòng với điểm dò thân `bodyContact`); máy bay: 0,7 m. */
function pathHalf(u: Unit): number {
  return u.air === "none" ? Math.max(0.71, wallRadius(u.kind)) : 0.7;
}

/** Tốc độ tối đa của xe lúc này (m/s, chưa tính địa hình): trong khối thì xe chậm được hộ tống chạy nhanh hơn (`Group.speed`). */
function speedOf(this: World, u: Unit): number {
  const v = UNITS[u.kind].speed;
  if (!u.group) return v;
  const g = this.groupById(u.group);
  return g && g.speed * GROUP_HEADROOM > v ? g.speed * GROUP_HEADROOM : v;
}
/** Xe trong khối được chạy nhanh hơn tốc độ khối chừng này lần (để đuổi kịp ô của mình). */
export const GROUP_HEADROOM = 1.15;

/**
 * Quay thân xe về hướng (dx, dz) với tốc độ `turnRate` (xoay tại chỗ được, mọi xe mặt đất). Trả về true khi lệch ≤ 30°.
 * Quân cố định đang hạ bệ thì thu bệ trước, chưa quay. Quay thân cũng tính là chuyển động (phần vẽ cho xích / bánh chạy).
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
 * LÁI MỘT XE tới điểm (gx, gz). Đây là chỗ DUY NHẤT đổi tốc độ / hướng thân của xe mặt đất đang chạy.
 *  - `stop`: dừng đúng tại điểm (hãm dần); false: chạy qua điểm (bám đường, bám ô đang chạy).
 *  - `vCap`: trần tốc độ (m/s) do tầng trên đặt (tốc độ khối, tốc độ chia để cả khối cùng tới, phanh trước khúc cua).
 *  - `revMax`: đích ở sau lưng và gần hơn chừng này (m) thì lùi (0 = không lùi). Chỉ khi `stop`.
 * Thứ tự: hướng muốn đi → né xe (`avoid`) → quay thân (`turnRate`) → tốc độ đích (địa hình, trần, phanh vào đích, độ lệch
 * hướng) → tăng / hãm dần → tiến dọc thân (vách là vật cản cứng). Trả về true khi đã tới (chỉ khi `stop`).
 */
function drive(this: World, u: Unit, gx: number, gz: number, stop: boolean, vCap = Infinity, revMax = REVERSE_MAX): boolean {
  u.driveT = this.tick;
  const spec = UNITS[u.kind];
  const ex = gx - u.x;
  const ez = gz - u.z;
  const d = Math.sqrt(ex * ex + ez * ez);
  if (stop && this.arrivedAt(u, ex, ez, d)) {
    u.speed = 0;
    u.stuck = 0;
    return true;
  }
  // quân cố định đang hạ bệ: thu bệ xong mới chạy (mất đúng ngần ấy thời gian đã hạ bệ, tối đa deploy.time)
  const dep = spec.weapon?.deploy;
  if (dep && u.still > 0) {
    u.still = Math.min(u.still, sec(dep.time)) - 1;
    u.packing = true;
    u.speed = 0;
    u.going = true;
    return false;
  }
  const dx = d > 1e-6 ? ex / d : u.hx;
  const dz = d > 1e-6 ? ez / d : u.hz;
  // LÙI hay TIẾN: theo thời gian tới đích (xem REVERSE_MAX)
  let rev = false;
  if (stop && d < revMax && d > 0.05) {
    const om = (spec.turnRate ?? 90) * DEG;
    const vf = this.speedOf(u);
    const af = dangle(u.hx, u.hz, dx, dz);
    let tf = af / om + d / vf;
    let tr = (PI - af) / om + d / (vf * REVERSE_SPEED);
    if (u.faceX !== 0 || u.faceZ !== 0) {
      tf += dangle(dx, dz, u.faceX, u.faceZ) / om;
      tr += dangle(-dx, -dz, u.faceX, u.faceZ) / om;
    }
    // đang lùi (hoặc vừa chọn lùi mà còn đứng: sát đích hai cách gần bằng nhau) thì giữ lùi tới khi tiến nhanh hơn rõ
    const keep = u.speed < -0.05 || (u.revPick && u.speed <= 0.05);
    rev = keep ? tr < tf * REV_KEEP : tr < tf * REV_PICK;
  }
  if (stop) u.revPick = rev;
  const sg = rev ? -1 : 1;
  let wx = dx * sg;
  let wz = dz * sg;
  let cap = vCap;
  // bị kìm vì bám đuôi xe đang chạy phía trước (xếp hàng): không tính là kẹt
  let queued = false;
  if (!rev && d > 0.5) {
    const a = this.avoid(u, wx, wz, d, stop, Math.min(vCap, this.speedOf(u)));
    wx = AV.x;
    wz = AV.z;
    if (a < cap) {
      cap = a;
      queued = AV.q;
    }
  }
  // TRƯỢT THEO VÁCH: thân đang chạm vách / đá mà hướng muốn đi đâm vào nó thì lái theo hướng dọc vách (bỏ phần đâm vào): xe tự
  // trượt qua góc vách. Không có bước này thì mỗi tick xe quay mũi về hướng muốn đi (đâm vào góc) rồi luật chạm vách lại quay
  // ngược, hai việc triệt tiêu nhau, xe đứng ì ở góc
  if (!rev && d > 0.5) {
    // thử chạm ở bước rất ngắn trước (điểm dò thân nằm sát mép ô: bước 2 cm đã chạm mà 0,3 m lại lọt), rồi 0,3 m
    let c0 = this.bodyContact(u, u.x + wx * 0.06, u.z + wz * 0.06);
    if (c0[2] === 0) c0 = this.bodyContact(u, u.x + wx * 0.3, u.z + wz * 0.3);
    if (c0[2] > 0) {
      const pl = Math.sqrt(c0[0] * c0[0] + c0[1] * c0[1]);
      if (pl > 1e-6) {
        const nx = c0[0] / pl;
        const nz = c0[1] / pl;
        const dd = wx * nx + wz * nz;
        if (dd < 0) {
          const tx = wx - nx * dd;
          const tz = wz - nz * dd;
          const tl = Math.sqrt(tx * tx + tz * tz);
          if (tl > 0.2) {
            wx = tx / tl;
            wz = tz / tl;
          }
        }
      }
    }
  }
  // quay thân về hướng muốn đi (hoặc quay đuôi về phía đích khi lùi). Đang chạy thì chỉnh liên tục (không có vùng chết: vùng chết
  // làm xe trôi lệch đường rồi bị giật về theo bậc, lắc qua lại); đứng yên thì lệch dưới 3° khỏi quay
  const hw = u.hx * wx + u.hz * wz;
  if (hw < ALIGNED_COS || (hw < 0.999999 && (u.speed > 0.3 || u.speed < -0.3))) {
    turnToward(u.hx, u.hz, wx, wz, traverseStep(spec.turnRate ?? 90), TMP);
    u.hx = TMP.x;
    u.hz = TMP.z;
    u.moved = true;
  }
  const c = u.hx * wx + u.hz * wz;
  // tốc độ đích
  const rally = this.mobilized(u) ? 1 + RULES.abilities.mobilize.speed : 1;
  let vt = this.speedOf(u) * rally * this.moveFactor(u, u.hx * sg, u.hz * sg) * (rev ? REVERSE_SPEED : 1);
  if (vCap < vt) vt = vCap;
  // tốc độ tầng trên giao (trước khi né xe kìm lại): đo "kẹt" so với số này; đang xếp hàng sau xe chạy thì đo so với tốc độ bám đuôi
  const want = vt;
  const wantStuck = queued && cap < vt ? cap : vt;
  // muốn tiến tới (không chỉ đứng ô / quay mặt): là XE ĐI, xe cùng phe đang đứng phải dạt cho nó (`contact.ts`)
  if (want > 0.05) u.going = true;
  if (cap < vt) vt = cap;
  if (stop) {
    const dd = d - 0.05 > 0 ? d - 0.05 : 0;
    const vb = Math.min(Math.sqrt(2 * brakeOf(u.kind) * dd), FINAL_K * dd);
    if (vb < vt) vt = vb;
  }
  // thẳng hướng mới chạy hết tốc; lệch nhiều thì chậm lại vừa cua; lệch quá thì đứng xoay
  const k = c >= FULL_COS ? 1 : c <= STOP_COS ? 0 : (c - STOP_COS) / (FULL_COS - STOP_COS);
  vt *= k;
  // tăng / hãm dần: quán tính
  const target = vt * sg;
  const slowing = target * u.speed < 0 || (target < 0 ? -target : target) < (u.speed < 0 ? -u.speed : u.speed);
  const rate = (slowing ? brakeOf(u.kind) : accelOf(u.kind)) * DT;
  u.speed += clamp(target - u.speed, -rate, rate);
  let step = u.speed * DT;
  if (stop) {
    // không chạy vượt đích theo trục thân
    const along = ex * u.hx + ez * u.hz;
    if (step > 0 && along >= 0 && step > along) step = along;
    else if (step < 0 && along <= 0 && step < along) step = along;
  }
  const ox = u.x;
  const oz = u.z;
  if (step > 1e-5 || step < -1e-5) {
    if (!this.tryMove(u, u.x + u.hx * step, u.z + u.hz * step)) {
      // vách chặn mũi / đuôi: mất đà; hướng muốn đi cũng đâm vào vách thì quay thân dần song song với vách (bỏ phần đâm vào vách).
      // Hướng muốn đi đã ra khỏi vách thì để xe tự xoay về hướng đó (bẻ theo vách lúc này là kéo thân ngược lại, xe xoay mãi tại chỗ)
      const [nx, nz] = this.wallNormal(u, u.x + u.hx * step * 3, u.z + u.hz * step * 3);
      if (nx * wx + nz * wz < 0) this.wallTurn(u, step > 0 ? 1 : -1);
      u.speed *= 0.5;
    }
  }
  const moved = dist2(ox, oz, u.x, u.z);
  // muốn đi (kể cả đang bị chắn) cũng là "không đứng yên": quân cố định chờ trong dòng xe không tự hạ bệ giữa đường thành tảng đá
  // chắn lối; chỉ hạ bệ khi thật sự dừng (tới ô, dừng lại bắn)
  if (moved > 1e-8 || want * k > 0.05) u.moved = true;
  // KẸT: muốn đi (theo địa hình, trước khi bị né xe kìm) mà gần như không tiến
  const wantStep = wantStuck * k * DT;
  if (wantStep > 0.04 && moved < wantStep * wantStep * 0.09) u.stuck++;
  else if (u.stuck > 0) u.stuck--;
  return stop && this.arrivedAt(u, gx - u.x, gz - u.z, Math.sqrt(dist2(u.x, u.z, gx, gz)));
}

/** Đã tới đích "dừng" chưa: rất sát, hoặc khá sát mà lệch dọc thân rất ít và xe gần như đứng (chỉ lệch ngang vài tấc). */
function arrivedAt(this: World, u: Unit, ex: number, ez: number, d: number): boolean {
  if (d <= ARRIVE_R) return true;
  if (d > NEAR_R) return false;
  const along = ex * u.hx + ez * u.hz;
  return (along < 0 ? -along : along) <= NEAR_ALONG && (u.speed < 0 ? -u.speed : u.speed) < 0.4;
}

/**
 * Kết quả của lần gọi `avoid` gần nhất (tránh cấp phát mảng mỗi tick): hướng lái, và `q` = trần tốc độ đang áp là do BÁM ĐUÔI một xe
 * đang chạy (xếp hàng: chờ trong hàng không phải là kẹt).
 */
const AV = { x: 0, z: 0, q: false };
let FOLLOW_CAP = Infinity;
/** Các xe chắn phía trước (lệch ngang, bán kính chạm, quãng dọc) để chọn KHE lách (`avoid`); bộ đệm dùng lại mỗi tick. */
const GATE_N = 24;
const G_LAT = new Float64Array(GATE_N);
const G_R = new Float64Array(GATE_N);
const G_AL = new Float64Array(GATE_N);
/** Khe hẹp: lách sát (chỉ chừa chừng này m mỗi bên) khi không có chỗ lách thoải mái (AVOID_GAP) gần làn. */
const TIGHT_GAP = 0.15;
/** Đổi phía lách so với phía đã chọn / phía tự nhiên bị tính thêm chừng này m (giữ phía, không lắc qua lại). */
const SIDE_COST = 0.6;

/** Độ lệch ngang c (dương = phải) có làm thân xe chạm một xe ở cổng (quãng dọc ≤ `end`) không. */
function gateHits(n: number, end: number, c: number): boolean {
  for (let j = 0; j < n; j++) {
    if (G_AL[j] > end) continue;
    const dl = c - G_LAT[j];
    if ((dl < 0 ? -dl : dl) < G_R[j] - 1e-6) return true;
  }
  return false;
}

/**
 * Chọn độ lệch ngang c (m, dương = phải) gần làn nhất mà thân xe cách mọi xe chắn ở cổng (quãng dọc ≤ `end`) ít nhất bán kính chạm +
 * `margin`. Ứng viên là hai mép của từng xe; đổi phía so với `side` tốn thêm SIDE_COST. NaN nếu không có (hoặc chỉ có ngoài `maxShift`).
 * `skipSide` ≠ 0: bỏ ứng viên phía đó (phía đó vướng vách).
 */
function gateLat(n: number, end: number, margin: number, side: number, maxShift: number, skipSide: number): number {
  let bestC = NaN;
  let bestCost = Infinity;
  for (let k = 0; k < n; k++) {
    if (G_AL[k] > end) continue;
    for (let e = -1; e <= 1; e += 2) {
      const c = G_LAT[k] + e * (G_R[k] + margin);
      if ((c < 0 ? -c : c) > maxShift || (skipSide !== 0 && (c > 0 ? 1 : -1) === skipSide)) continue;
      let ok = true;
      for (let j = 0; j < n && ok; j++) {
        if (G_AL[j] > end) continue;
        const dl = c - G_LAT[j];
        if ((dl < 0 ? -dl : dl) < G_R[j] + margin - 1e-6) ok = false;
      }
      if (!ok) continue;
      const cost = (c < 0 ? -c : c) + ((c > 0 ? 1 : -1) !== side ? SIDE_COST : 0);
      // hòa điểm thì lấy bên phải hơn: không phụ thuộc thứ tự duyệt xe (thứ tự ô lưới ở hai phe ngược nhau)
      if (cost < bestCost - 1e-9 || (cost <= bestCost + 1e-9 && c > bestC)) {
        bestCost = cost;
        bestC = c;
      }
    }
  }
  return bestC;
}

/**
 * NÉ XE (tầng 2): xét các xe mặt đất gần phía trước.
 *  - LÁCH (theo làn của hướng MUỐN đi): xe đứng / cắt ngang / ngược chiều trong làn → lệch hướng sang phía trống (xe kia lệch
 *    phải thì lách trái và ngược lại; thẳng hàng thì GIỮ BÊN PHẢI: hai xe ngược chiều cùng giữ phải là tự tránh nhau, đối xứng hai
 *    phe), nhớ phía đã chọn tới khi qua xe đó. Xe đi cùng chiều thì không lách (khối giữ làn).
 *  - PHANH (theo làn của hướng THÂN, vì xe chỉ chạy dọc thân): xe đi cùng chiều phía trước → BÁM ĐUÔI (tốc độ ≤ tốc độ dọc của
 *    nó + khoảng trống thừa / FOLLOW_T); vật cản khác → hãm để dừng kịp trước khi chạm. Xe đã quay thân lách ra thì làn thân
 *    trống, chạy tiếp được (hai xe chắn nhau không khóa chết).
 * Đích "dừng" gần hơn xe kia thì không né (xe tới ô cạnh xe khác không phải phanh vì xe đứng sau ô).
 * Ghi hướng lái vào `AV`, trả về trần tốc độ (m/s).
 */
/** Hướng lái của tầng né trộn chừng này phần hướng tick trước (Spring trộn 70%; Pottinger: "đừng quyết lại mỗi tick"). */
const STEER_KEEP = 0.6;

/**
 * NÉ XE (tầng 2): `avoidRaw` chọn hướng lách / trần tốc độ cho tick này, rồi hướng lái được LÀM MƯỢT với hướng tick trước (xe
 * không lắc mũi theo từng tick khi xe chắn đổi qua lại trong đám đông). Ghi hướng lái vào `AV`, trả về trần tốc độ (m/s).
 */
function avoid(this: World, u: Unit, wx: number, wz: number, dGoal: number, stop: boolean, vWant: number): number {
  FOLLOW_CAP = Infinity;
  const cap = this.avoidRaw(u, wx, wz, dGoal, stop, vWant);
  AV.q = cap < Infinity && FOLLOW_CAP <= cap + 1e-9;
  if (u.avT === this.tick - 1 && u.avX * AV.x + u.avZ * AV.z > 0) {
    let mx = u.avX * STEER_KEEP + AV.x * (1 - STEER_KEEP);
    let mz = u.avZ * STEER_KEEP + AV.z * (1 - STEER_KEEP);
    const l = Math.sqrt(mx * mx + mz * mz);
    if (l > 1e-6) {
      mx /= l;
      mz /= l;
      AV.x = mx;
      AV.z = mz;
    }
  }
  u.avX = AV.x;
  u.avZ = AV.z;
  u.avT = this.tick;
  return cap;
}

function avoidRaw(this: World, u: Unit, wx: number, wz: number, dGoal: number, stop: boolean, vWant: number): number {
  AV.x = wx;
  AV.z = wz;
  const ru = bodyRadius(u.kind);
  const v0 = u.speed > 1 ? u.speed : 1;
  let look = LOOK_MIN + ru + v0 * LOOK_T;
  if (stop && dGoal + ru < look) look = dGoal + ru;
  const reach = look + 4;
  const near = this.nearGround(u.x, u.z, reach);
  let cap = Infinity;
  let best: Unit | null = null;
  let bestAlong = Infinity;
  let bestLat = 0;
  let bestNeed = 0;
  let sticky: Unit | null = null;
  let stickyLat = 0;
  let stickyAlong = 0;
  let stickyNeed = 0;
  const softU = isSquad(u.kind);
  const hx = u.hx;
  const hz = u.hz;
  let gn = 0;
  for (let i = 0; i < near.length; i++) {
    const v = near[i];
    if (v === u) continue;
    // XE ĐỨNG CÙNG PHE (tick trước không đi, hoặc muốn đi mà đang đứng ì < STALL_V; không hạ bệ): không né, không phanh: chạm thì nó
    // dạt sang (`contact.ts`; Spring `GetObstacleAvoidanceDir` cũng bỏ qua xe cùng phe đứng yên). Phanh chờ cả xe muốn đi mà đang
    // đứng là cả đám đứng chờ nhau mãi. Bộ binh vẫn né xe đứng (tiểu đội không xô được xe)
    if (v.side === u.side && (!v.wasGoing || (v.speed < STALL_V && v.speed > -STALL_V)) && (v.group !== 0 || !this.anchored(v)) && (!softU || isSquad(v.kind))) continue;
    // cùng khối, ô của nó sau ô mình (ưu tiên thấp hơn): nó dạt cho mình (`contact.ts`), không né, không phanh vì nó
    if (u.group !== 0 && v.group === u.group && v.gprio > u.gprio && (!softU || isSquad(v.kind))) continue;
    const rv = bodyRadius(v.kind);
    const ex = v.x - u.x;
    const ez = v.z - u.z;
    // lọc đúng bán kính (lưới băm chỉ lọc thô theo ô, mà ô ở hai phe lệch nhau: tập xe xét phải như nhau ở hai phe)
    if (ex * ex + ez * ez > reach * reach) continue;
    // tiểu đội bộ binh với xe chạm mềm (được chồng tới bán kính đế tiểu đội, như `contact.ts`): làn hẹp đi chừng đó
    const soft = softU !== isSquad(v.kind) ? softOverlap(u.kind, v.kind) : 0;
    const touch = ru + rv - soft;
    const need = touch + AVOID_GAP;
    // xe kia đi cùng chiều: bám theo, không vượt (khối giữ làn). Xe ngoài khối chậm hơn mình nhiều thì vượt; xe cùng khối chỉ vượt
    // khi nó gần như dừng hẳn
    const ahead = v.speed * (v.hx * wx + v.hz * wz);
    const same = v.speed > 0.4 && v.hx * wx + v.hz * wz > 0.5 && (u.group !== 0 && v.group === u.group ? v.speed > 0.6 : ahead >= vWant * OVERTAKE_K);
    // ---- phanh theo làn thân
    const ah = ex * hx + ez * hz;
    if (ah > 0 && ah <= look + rv) {
      const lh = ex * hz - ez * hx;
      const alh = lh < 0 ? -lh : lh;
      if (alh < touch) {
        const gap = ah - Math.sqrt(touch * touch - lh * lh);
        const vAlong = v.speed * (v.hx * hx + v.hz * hz);
        if (vAlong > 0.4 && v.hx * hx + v.hz * hz > 0.5) {
          const c = vAlong + (gap - FOLLOW_GAP) / FOLLOW_T;
          if (c < cap) cap = c > 0 ? c : 0;
          if (c < FOLLOW_CAP) FOLLOW_CAP = c > 0 ? c : 0;
        } else {
          const room = gap - STOP_GAP;
          const c = room > 0 ? Math.sqrt(2 * brakeOf(u.kind) * room) : 0;
          if (c < cap) cap = c;
        }
      }
    }
    // ---- lách theo làn hướng muốn đi
    if (same) continue;
    const along = ex * wx + ez * wz;
    if (along <= 0 || along > look + rv) continue;
    // lệch ngang của xe kia: dương = bên PHẢI hướng chạy (phải = (wz, −wx))
    const lat = ex * wz - ez * wx;
    const alat = lat < 0 ? -lat : lat;
    // ghi vào cổng cả xe ngoài làn mà sát làn: lách sang phía nó thì đâm vào nó
    if (alat < need + 2 * ru + 2 && gn < GATE_N) {
      G_LAT[gn] = lat;
      G_R[gn] = touch;
      G_AL[gn] = along;
      gn++;
    }
    if (alat >= need) continue;
    if (u.avoidId === v.id) {
      sticky = v;
      stickyLat = lat;
      stickyAlong = along;
      stickyNeed = need;
    }
    // cùng quãng thì lấy xe lệch phải hơn (không phụ thuộc thứ tự duyệt)
    if (along < bestAlong || (along === bestAlong && lat > bestLat)) {
      best = v;
      bestAlong = along;
      bestLat = lat;
      bestNeed = need;
    }
  }
  // xe đang lách dở vẫn còn trong làn thì lách tiếp xe đó (không nhảy sang xe khác, không lắc)
  if (sticky) {
    best = sticky;
    bestLat = stickyLat;
    bestAlong = stickyAlong;
    bestNeed = stickyNeed;
  }
  if (!best) {
    u.avoidId = 0;
    return cap;
  }
  // phía lách: XE NGƯỢC CHIỀU thì cả hai cùng GIỮ BÊN PHẢI (cùng một luật nên luôn tự tránh nhau, đối xứng hai phe), trừ khi xe kia
  // đã lệch rõ sang phải mình (> ONCOMING_KEEP m) thì lách trái cho khỏi cắt ngang. Vật cản khác (đứng, cắt ngang): lách phía tự nhiên
  // (xe kia lệch phải thì lách trái và ngược lại), nhớ phía đã chọn, chỉ bỏ khi xe kia đã nằm hẳn về phía đó
  const oncoming = best.speed > 0.4 && best.hx * wx + best.hz * wz < -0.5;
  const natural = bestLat > 0.05 ? -1 : bestLat < -0.05 ? 1 : 1;
  let side = natural;
  if (oncoming) side = bestLat > ONCOMING_KEEP ? -1 : 1;
  else if (u.avoidId === best.id && !(u.avoidSide !== natural && (bestLat > 1.2 || bestLat < -1.2))) side = u.avoidSide;
  // CHỌN KHE: xét mọi xe chắn ngang hàng xe gần nhất (cổng), lấy độ lệch gần làn nhất mà thân lọt thoải mái; không có thì lọt sát
  // (khe giữa hai xe đứng vừa đủ thân); vẫn không có thì lách phía đã chọn như cũ
  const end = bestAlong + ru + 2.5;
  const maxShift = 2 * bestNeed + ru;
  let skip = 0;
  for (let tries = 0; tries < 2; tries++) {
    // độ dạt ngang cần (dương = sang phải) để xe kia nằm cách làn một khoảng `need` ở phía đối diện; lách thế mà đâm vào xe bên
    // cạnh (hai xe đứng sát nhau) thì mới chọn khe
    let shift = side > 0 ? bestLat + bestNeed : bestLat - bestNeed;
    if (gateHits(gn, end, shift)) {
      let c = gateLat(gn, end, AVOID_GAP, side, maxShift, skip);
      if (c !== c) c = gateLat(gn, end, TIGHT_GAP, side, maxShift, skip);
      if (c === c) {
        shift = c;
        side = c > 0 ? 1 : -1;
      }
    }
    let k = shift / (bestAlong > 1.5 ? bestAlong : 1.5);
    if (k > STEER_MAX) k = STEER_MAX;
    else if (k < -STEER_MAX) k = -STEER_MAX;
    let sx = wx + wz * k;
    let sz = wz - wx * k;
    const l = Math.sqrt(sx * sx + sz * sz);
    sx /= l;
    sz /= l;
    // hướng lách phải còn chỗ cho thân xe (không lách vào vách); phía này bí thì thử phía kia một lần
    const px = u.x + sx * (ru + 1.5);
    const pz = u.z + sz * (ru + 1.5);
    if (!this.grid.blockedAt(px, pz) && this.grid.clearanceAt(px, pz) >= wallRadius(u.kind) * 0.8) {
      AV.x = sx;
      AV.z = sz;
      u.avoidId = best.id;
      u.avoidSide = side;
      return cap;
    }
    skip = side;
    side = -side;
  }
  // hai phía đều bí: không lách, chỉ hãm (xe đứng chắn lối sẽ bị đẩy nhẹ, `contact.ts`)
  u.avoidId = best.id;
  return cap;
}

/** Xe bị vách chặn mũi (dir = 1) hay đuôi (−1): quay thân dần song song với vách (bỏ phần hướng đâm vào vách). */
function wallTurn(this: World, u: Unit, dir: number): void {
  const [px, pz, hits] = this.bodyContact(u, u.x + u.hx * dir * 0.3, u.z + u.hz * dir * 0.3);
  const pl = Math.sqrt(px * px + pz * pz);
  if (hits === 0 || pl < 1e-6) return;
  const nx = px / pl;
  const nz = pz / pl;
  const hx = u.hx * dir;
  const hz = u.hz * dir;
  const dd = hx * nx + hz * nz;
  if (dd >= 0) return;
  let tx = hx - nx * dd;
  let tz = hz - nz * dd;
  const tl = Math.sqrt(tx * tx + tz * tz);
  if (tl < 1e-6) return;
  tx = (tx / tl) * dir;
  tz = (tz / tl) * dir;
  turnToward(u.hx, u.hz, tx, tz, traverseStep(UNITS[u.kind].turnRate ?? 90), TMP);
  u.hx = TMP.x;
  u.hz = TMP.z;
  u.moved = true;
}

/** Xe không được lái tick này (đứng chờ, đang bắn, vừa tới): hãm dần về 0 và trôi nốt quãng hãm dọc thân. */
function coast(this: World, u: Unit): void {
  if (u.speed === 0) return;
  const r = brakeOf(u.kind) * DT;
  u.speed = u.speed > r ? u.speed - r : u.speed < -r ? u.speed + r : 0;
  if (u.speed === 0) return;
  const ox = u.x;
  const oz = u.z;
  if (!this.tryMove(u, u.x + u.hx * u.speed * DT, u.z + u.hz * u.speed * DT)) u.speed = 0;
  if (dist2(ox, oz, u.x, u.z) > 1e-8) u.moved = true;
}

// ------------------------------------------------------------------ bám đường A*

function setIdle(this: World, u: Unit): void {
  u.order = "idle";
  u.tx = u.x;
  u.tz = u.z;
  u.targetId = 0;
  u.path = [];
  u.pathI = 0;
  u.chasing = false;
  u.homeT = 0;
}

function halt(this: World, u: Unit): void {
  u.path = [];
  u.pathI = 0;
}

function setPath(this: World, u: Unit, x: number, z: number): boolean {
  // tìm đường nhanh nhất theo kiểu xe (bánh / xích) và địa hình, đúng bề ngang thân (bảng khoảng trống của lưới); đích sát vách
  // thì dời ra cho vừa thân. Xe với xe là việc cục bộ (né, đẩy dạt: B3 23/11/2026, "mọi người" đều vậy): tìm đường chỉ xét địa hình,
  // nhà và QUÂN ĐÃ HẠ BỆ (không đẩy được, như vật cản tĩnh; Spring: quân "pushResistant" đứng yên dùng mặt nạ công trình)
  const spec = UNITS[u.kind];
  [x, z] = this.clearGoal(u, x, z);
  const field = this.grid.field(spec.mobility ?? "wheel", !!spec.slowResist);
  const layer = u.air === "none" ? this.anchorLayer(u.id) : undefined;
  let p = this.grid.findPath(u.x, u.z, x, z, field, pathHalf(u), layer);
  // quân hạ bệ vây kín đích / lối duy nhất: đi đường thường (va chạm lo phần còn lại)
  if (!p && layer) p = this.grid.findPath(u.x, u.z, x, z, field, pathHalf(u));
  u.path = p ?? [];
  u.pathFromX = u.x;
  u.pathFromZ = u.z;
  u.pathI = 0;
  u.stuck = 0;
  u.progD = 1e9;
  u.progT = this.tick;
  return p !== null;
}

/** In vật cản quân hạ bệ ra thêm chừng này mét quanh vòng thân (A* đi vòng chừa khoảng, ô gần thì tính chậm). */
const ANCHOR_PAD = 4;
/** Khe chừa thêm giữa thân xe tìm đường và vòng thân quân hạ bệ (m). */
const ANCHOR_MARGIN = 0.3;
let ANC_CLEAR = new Float32Array(0);
let ANC_OWNER = new Int32Array(0);
const ANC_TOUCHED: number[] = [];
let ANC_TICK = -1;
/** Thế giới đã dựng bộ đệm (hai trận chạy nối nhau mà trùng số tick không được dùng nhầm lớp của nhau). */
let ANC_WORLD: World | null = null;
let ANC_DISCS = new Float64Array(0);
let ANC_IGNORE: ReadonlySet<number> | null = null;

/**
 * LỚP QUÂN ĐÃ HẠ BỆ cho tìm đường (B3): mọi quân mặt đất đã hạ bệ xong ở chỗ đóng quân (Pháo, Tên Lửa Loạt, SkyGuard đứng đủ lâu, không
 * lệnh, không trong khối) là vật cản như nhà. Dựng một lần mỗi tick (`ignore` = các xe sắp cùng đi, dựng riêng). Không có quân nào
 * hạ bệ thì trả về undefined (tìm đường như thường). `self` = xe đang tìm đường (thân mình không chắn mình).
 */
function anchorLayer(this: World, self: number, ignore?: ReadonlySet<number>): import("../grid").StandLayer | undefined {
  const g = this.grid;
  if (ANC_WORLD !== this || ANC_TICK !== this.tick || ignore || ANC_IGNORE) {
    ANC_WORLD = this;
    ANC_TICK = this.tick;
    ANC_IGNORE = ignore ?? null;
    if (ANC_CLEAR.length !== g.size) {
      ANC_CLEAR = new Float32Array(g.size).fill(Infinity);
      ANC_OWNER = new Int32Array(g.size).fill(-1);
      ANC_TOUCHED.length = 0;
    }
    for (const i of ANC_TOUCHED) {
      ANC_CLEAR[i] = Infinity;
      ANC_OWNER[i] = -1;
    }
    ANC_TOUCHED.length = 0;
    const discs: number[] = [];
    for (const v of this.units) {
      if (v.hp <= 0 || v.air !== "none" || v.order !== "idle" || v.group !== 0 || !this.anchored(v) || ignore?.has(v.id)) continue;
      const r = bodyRadius(v.kind);
      discs.push(v.x, v.z, r, v.id);
      const R = r + ANCHOR_PAD;
      const c0 = g.colOf(v.x - R, v.z);
      const c1 = g.colOf(v.x + R, v.z);
      const r0 = g.rowOf(v.x, v.z - R);
      const r1 = g.rowOf(v.x, v.z + R);
      for (let cz = r0; cz <= r1; cz++)
        for (let cx = c0; cx <= c1; cx++) {
          const dx = g.centerX(cx) - v.x;
          const dz = g.centerZ(cz) - v.z;
          const d = Math.sqrt(dx * dx + dz * dz) - r;
          if (d > ANCHOR_PAD) continue;
          const i = cz * g.cols + cx;
          if (ANC_CLEAR[i] === Infinity) ANC_TOUCHED.push(i);
          if (d < ANC_CLEAR[i]) {
            ANC_CLEAR[i] = d;
            ANC_OWNER[i] = v.id;
          }
        }
    }
    ANC_DISCS = new Float64Array(discs);
  }
  if (!ANC_DISCS.length) return undefined;
  const u = this.byId.get(self);
  const need = (u && u.cat === "unit" ? bodyRadius(u.kind) : 0.71) + ANCHOR_MARGIN;
  return { clear: ANC_CLEAR, owner: ANC_OWNER, self, need, discs: ANC_DISCS, maxExpand: Infinity };
}

/** Hướng lái theo đường: điểm phía trước trên ĐOẠN đang đi; gần khúc cua thì cắt sang đoạn sau chỉ khi đoạn cắt đủ rộng cho thân. */
function pathAim(this: World, u: Unit): [number, number] {
  const i = u.pathI * 2;
  const bx = u.path[i];
  const bz = u.path[i + 1];
  const ax = u.pathI > 0 ? u.path[i - 2] : u.pathFromX;
  const az = u.pathI > 0 ? u.path[i - 1] : u.pathFromZ;
  const ex = bx - ax;
  const ez = bz - az;
  const L2 = ex * ex + ez * ez;
  if (L2 < 1e-6) return [bx, bz];
  const L = Math.sqrt(L2);
  let t = ((u.x - ax) * ex + (u.z - az) * ez) / L2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const sp = u.speed > 0 ? u.speed : 0;
  const look = Math.max(PATH_LOOK, sp * PATH_LOOK_T);
  const rest = L * (1 - t);
  if (look <= rest) return [ax + ex * t + (ex / L) * look, az + ez * t + (ez / L) * look];
  if (i + 3 < u.path.length) {
    const nx = u.path[i + 2] - bx;
    const nz = u.path[i + 3] - bz;
    const nl = Math.sqrt(nx * nx + nz * nz);
    if (nl > 1e-6) {
      const o = Math.min(look - rest, nl);
      const cx = bx + (nx / nl) * o;
      const cz = bz + (nz / nl) * o;
      // cắt góc chỉ khi đoạn cắt đủ rộng cho thân và không băng qua ô chậm hơn hai đầu khúc cua (A* vừa tránh bùn thì không lăn vào)
      if (this.grid.los(u.x, u.z, cx, cz, pathHalf(u))) {
        const spec = UNITS[u.kind];
        const f = this.grid.field(spec.mobility ?? "wheel", !!spec.slowResist);
        const need = Math.min(f.k[this.grid.index(bx, bz)], f.k[this.grid.index(cx, cz)]);
        if (this.grid.minSpeedAlong(f, u.x, u.z, cx, cz) >= need) return [cx, cz];
      }
    }
  }
  return [bx, bz];
}

/** Quãng đường còn lại theo đường (m), từ chỗ xe tới cuối đường. */
function pathRest(u: Unit): number {
  let s = 0;
  let x = u.x;
  let z = u.z;
  for (let k = u.pathI * 2; k + 1 < u.path.length; k += 2) {
    const dx = u.path[k] - x;
    const dz = u.path[k + 1] - z;
    s += Math.sqrt(dx * dx + dz * dz);
    x = u.path[k];
    z = u.path[k + 1];
  }
  return s;
}

/**
 * Đi theo đường; trả về true khi đã tới nơi (hoặc bỏ cuộc vì kẹt quá lâu). `vCap`: trần tốc độ của tầng trên.
 * Đoạn cuối lái vào đích kiểu "dừng"; trước đó nhắm điểm phía trước (`pathAim`), phanh sớm trước khúc cua gấp và trước đích.
 */
function follow(this: World, u: Unit, vCap = Infinity): boolean {
  if (u.pathI * 2 >= u.path.length) return true;
  // điểm giữa đường đã qua: tới gần, hoặc đã vượt quá nó theo hướng đoạn kế tiếp
  while ((u.pathI + 1) * 2 < u.path.length) {
    const wx = u.path[u.pathI * 2];
    const wz = u.path[u.pathI * 2 + 1];
    const passed = dist2(u.x, u.z, wx, wz) <= WAYPOINT_PASS * WAYPOINT_PASS || (u.x - wx) * (u.path[u.pathI * 2 + 2] - wx) + (u.z - wz) * (u.path[u.pathI * 2 + 3] - wz) > 0;
    if (!passed) break;
    u.pathFromX = wx;
    u.pathFromZ = wz;
    u.pathI++;
  }
  const n = u.path.length;
  const gx = u.path[n - 2];
  const gz = u.path[n - 1];
  let done: boolean;
  // TỚI GẦN LÀ TỚI (người dùng duyệt 16/11/2026): đích bị xe khác đang đứng chiếm và xe đã tới sát xe đó thì coi như tới
  if (this.goalTaken(u, gx, gz)) done = true;
  else if ((u.pathI + 1) * 2 >= n) done = this.drive(u, gx, gz, true, vCap);
  else {
    const [ax, az] = this.pathAim(u);
    let cap = vCap;
    // phanh trước đích (quãng theo đường, đoạn cuối có thể ngắn hơn quãng hãm)
    const rest = pathRest(u);
    const vEnd = Math.sqrt(2 * brakeOf(u.kind) * Math.max(0, rest - 0.3));
    if (vEnd < cap) cap = vEnd;
    // phanh trước khúc cua gấp ở điểm sắp tới
    const i = u.pathI * 2;
    const ax0 = u.pathI > 0 ? u.path[i - 2] : u.pathFromX;
    const az0 = u.pathI > 0 ? u.path[i - 1] : u.pathFromZ;
    const e1x = u.path[i] - ax0;
    const e1z = u.path[i + 1] - az0;
    const e2x = u.path[i + 2] - u.path[i];
    const e2z = u.path[i + 3] - u.path[i + 1];
    const l1 = Math.sqrt(e1x * e1x + e1z * e1z);
    const l2 = Math.sqrt(e2x * e2x + e2z * e2z);
    if (l1 > 1e-6 && l2 > 1e-6) {
      const cc = (e1x * e2x + e1z * e2z) / (l1 * l2);
      if (cc < 0.95) {
        const kc = cc >= 0 ? CORNER_SLOW + (1 - CORNER_SLOW) * cc : CORNER_SLOW * (1 + cc);
        const vc = this.speedOf(u) * kc;
        const dw = Math.sqrt(dist2(u.x, u.z, u.path[i], u.path[i + 1]));
        const vCorner = Math.sqrt(vc * vc + 2 * brakeOf(u.kind) * Math.max(0, dw - WAYPOINT_PASS));
        if (vCorner < cap) cap = vCorner;
      }
    }
    this.drive(u, ax, az, false, cap);
    done = false;
  }
  if (done) {
    u.pathI = n / 2;
    return true;
  }
  // tiến độ: lại gần đích thêm PROGRESS_STEP thì ghi nhận (xe húc chậm qua hàng xe đứng vẫn là đang tiến, không phải kẹt)
  const dg = Math.sqrt(dist2(u.x, u.z, gx, gz));
  if (dg < u.progD - PROGRESS_STEP) {
    u.progD = dg;
    u.progT = this.tick;
  }
  // KẸT: tìm đường vòng qua xe đứng; vẫn kẹt lâu gần đích (hoặc rất lâu) và mấy giây liền không lại gần thêm thì coi như tới
  if (u.stuck >= STUCK_REPLAN) {
    const near = dg < GIVE_UP_NEAR;
    if (((near && u.stuck >= GIVE_UP) || u.stuck >= GIVE_UP_FAR) && this.tick - u.progT >= GIVE_UP) {
      u.path = [];
      u.pathI = 0;
      u.stuck = 0;
      return true;
    }
    this.unstick(u, gx, gz);
  }
  return false;
}

/**
 * Xe muốn đi mà bị chắn quá STUCK_REPLAN (vách, xe địch, quân hạ bệ, xe đang đi đối đầu; xe đứng cùng phe thì bị đẩy dạt nên không
 * tính): tìm lại đường tới (gx, gz), THƯA (tối đa mỗi 2 giây một lần: tìm lại dày sinh va chạm mới, SupCom 1 "đứng hình"). Trả về
 * true nếu xe vừa có đường mới.
 */
function unstick(this: World, u: Unit, gx: number, gz: number): boolean {
  if (u.stuck < STUCK_REPLAN || this.tick < u.repathAt) return false;
  u.repathAt = this.tick + sec(2);
  // giữ bộ đếm kẹt và tiến độ: tìm lại đường không phải là đã tiến (không thì xe đối đầu trong khe tìm lại mãi, không bao giờ bỏ cuộc)
  const s = u.stuck;
  const pd = u.progD;
  const pt = u.progT;
  const ok = this.setPath(u, gx, gz);
  u.stuck = s;
  u.progD = pd;
  u.progT = pt;
  return ok;
}

/**
 * Đích (gx, gz) bị một xe mặt đất khác ĐANG ĐỨNG chiếm (thân nó đè lên chỗ thân xe u sẽ đứng) và xe u đã tới sát xe đó (cách không
 * quá tổng hai thân + GOAL_NEAR m): tới gần là tới. Không thì xe bám đích nằm trong thân xe kia, bị đẩy vòng quanh mãi.
 */
const GOAL_NEAR = 1.2;
/** Xe đứng cách ô của nó không quá chừng này (m) là đã yên vị (bằng HOME_SLACK: lệch ít hơn thì xe không tự về ô). */
const SETTLED_R = 1;
function goalTaken(this: World, u: Unit, gx: number, gz: number): boolean {
  // Xe Vận Tải phải vào đúng ô đỗ / ô dỡ hàng (máy trạng thái của nó tự lo), không "tới gần là tới"
  if (u.air !== "none" || u.kind === "hauler") return false;
  const ru = bodyRadius(u.kind);
  const reach = ru * 2 + 8;
  if (dist2(u.x, u.z, gx, gz) > reach * reach) return false;
  const near = this.nearGround(gx, gz, ru + 6);
  for (let i = 0; i < near.length; i++) {
    const v = near[i];
    if (v === u || (v.speed < 0 ? -v.speed : v.speed) > 0.2 || (u.group !== 0 && v.group === u.group)) continue;
    // chỉ xe ĐÃ YÊN VỊ mới là chiếm chỗ: đứng đúng ô của nó, hoặc đã hạ bệ. Xe đứng tạm ngoài ô (đang về ô, đang đổi ô khi sư đoàn
    // xoay) sắp đi chỗ khác: dừng vì nó thì hai xe chờ nhau mãi
    if (!this.anchored(v) && (v.order !== "idle" || dist2(v.x, v.z, v.tx, v.tz) > SETTLED_R * SETTLED_R)) continue;
    const lim = ru + bodyRadius(v.kind);
    if (dist2(gx, gz, v.x, v.z) >= (lim - 0.3) * (lim - 0.3)) continue;
    const touch = lim + GOAL_NEAR;
    if (dist2(u.x, u.z, v.x, v.z) <= touch * touch) return true;
  }
  return false;
}

function chase(this: World, u: Unit, t: Target): void {
  // Đi hết đường mà chưa tới tầm thì tìm lại ngay. Tìm thất bại (đường rỗng) thì chờ hẹn lại, đừng thử lại
  // mỗi tick: mỗi lần thất bại A* quét gần cả bản đồ, hai xe là đủ làm trận chậm hẳn.
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

// ------------------------------------------------------------------ thân xe và vách

/**
 * Điểm dò thân xe [x, z, x, z, …] (lệch so với tâm): VÒNG TRÒN bán kính `bodyR` × WALL_PROBE, các điểm cách nhau ≤ PROBE_STEP m,
 * thêm một vòng trong ở nửa bán kính cho đế to (ô 2 m không lọt vào giữa thân). Đối xứng qua tâm TUYỆT ĐỐI (luật công bằng số 4).
 */
const PROBE_STEP = 1;
const PROBE_CACHE = new Map<string, Float64Array>();
function probesOf(kind: keyof typeof UNITS): Float64Array {
  let p = PROBE_CACHE.get(kind);
  if (p) return p;
  const R = wallRadius(kind);
  const pts: number[] = [];
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
 * của lưới (vách, đá, nước sâu, nhà, khối quặng). (0, 0) mà số điểm chạm > 0 là bị kẹp đều hai bên (khe hẹp).
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

/**
 * Thân xe u đặt tại (x, z) có đứng được không: ô không bị chặn, khoảng trống đủ VÀ không điểm dò thân nào chạm vật cản. Khoảng trống
 * của lưới đo ở tâm ô 2 m nên một mình nó cho qua chỗ thân thật đã chạm vách / đá (xe húc mãi không vào được ô).
 */
function bodyFits(this: World, u: Unit, x: number, z: number): boolean {
  if (this.grid.blockedAt(x, z) || this.grid.clearanceAt(x, z) < wallRadius(u.kind)) return false;
  return this.bodyContact(u, x, z)[2] === 0;
}

/** Hướng đẩy ra khỏi vật cản tại (x, z) (xem `bodyContact`), chưa chuẩn hóa; (0, 0) = thân không chạm gì. */
function wallNormal(this: World, u: Unit, x: number, z: number, fx = u.hx, fz = u.hz): [number, number] {
  const c = this.bodyContact(u, x, z, fx, fz);
  return [c[0], c[1]];
}

/**
 * Đích sát vách thì dời ra cho vừa thân xe, mỗi bước 0,5 m theo pháp tuyến vách, tối đa GOAL_SHIFT m: thân xe không được lấn vào
 * vách nên đích quá sát thì xe không bao giờ tới nơi.
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
 * Bước xe tới (nx, nz); vật cản là RÀNG BUỘC CỨNG. Xe: bước bị vách / nhà chặn thì rút ngắn bước theo đúng hướng đó (tối đa 4
 * lần chia đôi), sượt mép (thêm tối đa một điểm chạm mà lực đẩy của vách không chống hướng chạy) vẫn đi. Tiểu đội bộ binh và
 * cú đẩy va chạm (`free`): bỏ phần bước hướng vào vật cản (trượt dọc vách), rồi thử riêng từng trục.
 */
function tryMove(this: World, u: Unit, nx: number, nz: number, free = false): boolean {
  if (u.air === "none" && !isSquad(u.kind) && !free) {
    const hNow0 = this.bodyContact(u, u.x, u.z)[2];
    let fx = nx - u.x;
    let fz = nz - u.z;
    for (let k = 0; k < 5; k++) {
      const x = u.x + fx;
      const z = u.z + fz;
      if (this.grid.blockedAt(x, z)) {
        fx *= 0.5;
        fz *= 0.5;
        continue;
      }
      // sượt mép: thêm tối đa một điểm chạm mà lực đẩy của vách không chống hướng chạy (lướt dọc mép, không đâm vào); xe lỡ kẹt
      // trong khe hẹp hơn thân (sinh ra sát vách) vẫn lăn dọc khe ra được
      const [px, pz, h] = this.bodyContact(u, x, z);
      if (h <= hNow0 || (h <= hNow0 + 1 && fx * px + fz * pz >= -0.25 * Math.sqrt((fx * fx + fz * fz) * (px * px + pz * pz)))) {
        u.x = x;
        u.z = z;
        return true;
      }
      fx *= 0.5;
      fz *= 0.5;
    }
    return false;
  }
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
  const ax = u.x + dx * L;
  const az = u.z + dz * L;
  const grade = this.map.staticBlocked(ax, az) ? 0 : (this.map.groundY(ax, az) - this.map.groundY(u.x, u.z)) / L;
  if (grade > 0) k *= Math.max(T.slopeMin, 1 - T.slopeSlow * grade);
  return k;
}

const methods = { speedOf, turnHull, drive, arrivedAt, avoid, avoidRaw, wallTurn, coast, setIdle, halt, setPath, anchorLayer, unstick, pathAim, follow, goalTaken, chase, bodyContact, bodyFits, wallNormal, clearGoal, tryMove, terrainFactor, moveFactor };
type Methods = typeof methods;
declare module "./core" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface World extends Methods {}
}
Object.assign(World.prototype, methods);
