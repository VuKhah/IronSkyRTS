/** Va chạm giữa các xe: né nhau bằng ORCA, đẩy xe không chồng lên nhau, tách xe khỏi vách. Tách từ movement.ts (16/11/2026). */
import { UNITS } from "../content";
import { dcos, DEG, dsin } from "../fmath";
import { orcaLine, orcaSolve, type OrcaLine } from "../orca";
import type { Unit } from "../types";
import { DT, sec, bodyRadius, spaceRadius, softOverlap, isSquad, HEX_COS30, MOVER_SHARE, WALL_PUSH } from "./shared";
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
/** Xe trong đội lệch ô từ chừng này mét là "đang về ô" (luật nhường trong đội đang chạy, `separate`). */
const SQUAD_IN_SLOT = 2.5;
/** Hướng muốn đi lệch mũi quá 40° thì xe sắp xoay tại chỗ (không giải ORCA, tick sau xe đứng xoay). */
const ORCA_SKIP_COS = dcos(40 * DEG);
/** Số lần đẩy ra khỏi vật cản tối đa trong một tick (× WALL_PUSH m). */
const STATIC_ITERS = 6;

function sideStep(m: Unit, ox: number, oz: number): [number, number] {
  const lo = ox * m.hz - oz * m.hx; // xe kia lệch về bên (+) hay (−) hướng chạy
  const sg = lo > 1e-9 ? -1 : 1;
  return [m.hz * sg, -m.hx * sg];
}

/**
 * Đưa xe u tiến / lùi DỌC TRỤC THÂN quãng ngắn nhất để tâm cách (ox, oz) ít nhất `target` m (nghiệm của |e − t·h| = target, e từ u
 * tới điểm kia), tối đa 3 lần phần thiếu + 0,2 m mỗi tick (phần còn lại gỡ tiếp tick sau); qua tryMove (không lấn vách).
 */
/** Phép tách dọc thân dời xe tối đa chừng này (m) mỗi tick. */
const AXIS_STEP_MAX = 1;
function axisApart(w: World, u: Unit, ox: number, oz: number, target: number): void {
  const ex = ox - u.x;
  const ez = oz - u.z;
  const e2 = ex * ex + ez * ez;
  const T2 = target * target;
  if (e2 >= T2) return;
  const eh = ex * u.hx + ez * u.hz;
  const disc = eh * eh - e2 + T2;
  const r = Math.sqrt(disc);
  const t1 = eh - r;
  const t2 = eh + r;
  // xe đang chạy: gỡ theo CHIỀU ĐANG CHẠY (đang lách qua khe vừa thân thì đi tiếp, không bị đẩy lùi ra); xe đứng: chiều gần nhất
  const mv = u.moved ? (u.x - u.px) * u.hx + (u.z - u.pz) * u.hz : 0;
  let t = mv > 1e-4 ? t2 : mv < -1e-4 ? t1 : -t1 < t2 ? t1 : t2;
  // tối đa AXIS_STEP_MAX m mỗi tick (lồng sâu thì gỡ dần qua vài tick, không giật xa trong một tick)
  const cap = Math.min(3 * (target - Math.sqrt(e2)) + 0.2, AXIS_STEP_MAX);
  if (t > cap) t = cap;
  else if (t < -cap) t = -cap;
  w.tryMove(u, u.x + u.hx * t, u.z + u.hz * t);
}

/** Cú đẩy lệch trục thân quá chừng này (|cos| < 0,35, tức lệch hơn ~70°) thì xe không gánh được: phần đẩy chuyển cho xe kia. */
const AXIS_PUSH_MIN = 0.35;

/**
 * Đẩy xe để tách ra (dx, dz) qua tryMove; trả về phần tách được THEO HƯỚNG ĐẨY. XE XÍCH KHÔNG TRƯỢT NGANG (người dùng 16/11 và
 * 17/11/2026: "xe chỉ có thể đi theo phương tới, không có chuyện đi ngang"): xe mặt đất chỉ bị đẩy tiến / lùi DỌC TRỤC THÂN, đủ
 * xa để tách đúng quãng cần theo hướng đẩy (tối đa 1,5 lần + 0,2 m); cú đẩy gần vuông góc thân thì không nhận, phần thiếu chuyển
 * cho xe kia (`separate`). Tiểu đội bộ binh (lính bước ngang được) vẫn bị đẩy theo đúng hướng.
 */
function shove(w: World, u: Unit, dx: number, dz: number): [number, number] {
  const l2 = dx * dx + dz * dz;
  if (l2 < 1e-12) return [0, 0];
  const ox = u.x;
  const oz = u.z;
  if (isSquad(u.kind)) {
    w.tryMove(u, u.x + dx, u.z + dz);
    return [u.x - ox, u.z - oz];
  }
  const l = Math.sqrt(l2);
  const nx = dx / l;
  const nz = dz / l;
  const c = u.hx * nx + u.hz * nz;
  if (c > -AXIS_PUSH_MIN && c < AXIS_PUSH_MIN) return [0, 0];
  const t = Math.min(l / (c < 0 ? -c : c), 1.5 * l + 0.2) * (c < 0 ? -1 : 1);
  w.tryMove(u, u.x + u.hx * t, u.z + u.hz * t);
  const m = (u.x - ox) * nx + (u.z - oz) * nz;
  return [nx * m, nz * m];
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
 * - bán kính chung: tổng hai vòng `spaceRadius` (quân mặt đất = vòng thân từ T2 16/11/2026; ORCA viết cho vòng tròn nên khớp luật va chạm),
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
      // Từ 17/11/2026 (xe xích không trượt ngang, không chen qua nhau được nữa): XE LỆCH Ô né đồng đội như né xe khác, để lái vòng
      // qua đồng đội khi đuổi về ô; xe đúng ô vẫn không né đồng đội (khối giữ hàng)
      // Chỉ lúc hành quân: ở đích khối đứng yên, đồng đội đã vào ô là vật cản của A* (`standLayer`), ORCA giữa đồng đội chỉ làm hai xe
      // về ô phanh chờ nhau (đo: Titan phanh còn 1% sau lưng Tên Lửa Loạt cũng đang về ô)
      if (a.squad !== 0 && a.squad === b.squad && (a.slotOff < SQUAD_IN_SLOT || this.squadById(a.squad)?.phase !== "march")) continue;
      // đã kẹt: thôi né xe đứng yên và xe cũng đang kẹt (hai xe đối đầu chờ nhau trong lối hẹp); luật va chạm gỡ tiếp
      if (release && crawling(b)) continue;
      // xe cùng phe BIẾT NHƯỜNG ĐƯỜNG (`world/yield.ts`) tự dạt khỏi lối, xe đi giữ đúng lối và chờ nếu lối chưa mở (`laneWait`):
      // không né (né thì ORCA bẻ xe lệch khỏi lối trước khi xe kia kịp dạt, đâm vào chỗ xe vừa dạt tới rồi kẹt; đo 16/11 lưới 3×3)
      if (this.canYield(b) || this.yielding(b)) continue;
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
      // tiểu đội với xe chạm mềm: né theo khoảng đã trừ phần được chồng (nửa đế tiểu đội). Quân đã hạ bệ (đứng yên hẳn) thì né theo
      // THÂN THẬT hai xe như A* (lớp xe đứng tính bằng `bodyR`): khe giữa hai quân hạ bệ vừa thân thì đi qua được (17/11/2026, xe
      // xích không trượt ngang chen qua được nữa nên ORCA phải cho lái thẳng vào khe)
      const rr = this.anchored(b) ? bodyRadius(a.kind) + bodyRadius(b.kind) : sa + sb - softOverlap(a.kind, b.kind);
      const r = Math.min(rr, d * 0.98);
      const [vbx, vbz] = vel(b);
      const y = yieldsTo(a, b);
      // đồng đội đúng ô không né (giữ hàng): xe lệch ô gánh trọn; hai xe cùng lệch ô chia đôi
      const mate = a.squad !== 0 && a.squad === b.squad;
      const share = !solver(b) || (mate && b.slotOff < SQUAD_IN_SLOT) ? 1 : mate ? 0.5 : y > 0 ? ORCA_YIELD : y < 0 ? 1 - ORCA_YIELD : 0.5;
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
      // vòng `spaceRadius` (quân mặt đất = vòng thân). Quân đã hạ bệ là LỤC GIÁC tĩnh (trung đoạn = vòng đó), tầm xét tới đỉnh
      const both = a.moved && b.moved;
      const ra2 = !a.moved || this.yielding(a);
      const rb2 = !b.moved || this.yielding(b);
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
        // xe đang dạt nhường đường chạy theo xích, tự nhìn trước (`driveTo` careful): không lách ngang kiểu tài xế đối đầu
        if (!headOn || pa || pb || ra2 || rb2) continue;
        const lat = dx * a.hz - dz * a.hx;
        if ((lat < 0 ? -lat : lat) >= ra + rb) continue;
        const [lax, laz] = sideStep(a, dx, dz);
        const [lbx, lbz] = sideStep(b, -dx, -dz);
        // chỉ tiểu đội bộ binh bước ngang được; xe xích đối đầu tự lái né bằng ORCA (`steer`)
        if (isSquad(a.kind)) shove(this, a, lax * PASS_STEER, laz * PASS_STEER);
        if (isSquad(b.kind)) shove(this, b, lbx * PASS_STEER, lbz * PASS_STEER);
        continue;
      }
      // xe đang chạy nhường xe đã đứng yên: xe chạy chịu phần lớn lực đẩy (lách qua), xe đã vào hàng chỉ xê dịch chút ít
      // (vẫn nhường một chút để khe hẹp nới dần, xe chạy không kẹt mãi). Hai xe cùng chạy hoặc cùng đứng thì chia đều.
      // Quân ĐÃ HẠ BỆ (chân chống cắm đất) thì không bị xô chút nào: xe kia chịu trọn; hai quân cùng hạ bệ thì không ai nhích.
      // Hai xe cùng chạy mà một xe đang CHỞ HÀNG, xe kia rỗng: xe rỗng nhường như xe chạy nhường xe đứng (luật đường hẹp
      // của tài xế; đối xứng hai phe vì chỉ xét hàng trên xe). Hai xe đối đầu ở một góc sát vách: xe bị vách chặn không lách
      // được, đường đi lại kéo cả hai về cùng một điểm góc, giằng co mãi nếu chia đều.
      // XE KHÔNG BỊ XÔ TRƯỢT (người dùng 16/11/2026: "xe không tự nhiên đẩy đi, phải chạy theo hướng bánh xích"): xe ĐỨNG và xe
      // đang dạt NHƯỜNG ĐƯỜNG (`world/yield.ts`, tự chạy theo xích) không nhận cú đẩy từ xe đang chạy cùng phe; xe chạy chịu trọn.
      // Nhường đường dọn lối trước nên chạm hiếm; chạm thì xe chạy tự lách. Khác phe giữ luật cũ (xe đứng nhích 15%).
      const ya = a.moved === b.moved ? yieldsTo(a, b) : 0;
      let wa = pa ? 0 : pb ? 1 : ya > 0 ? MOVER_SHARE : ya < 0 ? 1 - MOVER_SHARE : a.moved === b.moved ? 0.5 : a.moved ? MOVER_SHARE : 1 - MOVER_SHARE;
      if (!pa && !pb && a.side === b.side && soft === 0) {
        if (ra2 !== rb2) wa = ra2 ? 0 : 1;
        // hai xe cùng không "lái đi" (đứng, hoặc đang dạt nhường): xe đang chạy (dạt) nhận trọn, xe đứng không bị xô
        else if (ra2 && a.moved !== b.moved) wa = a.moved ? 1 : 0;
      }
      // KHÔNG DỪNG Ở CHỖ CHỒNG ĐẾ (A1a): hai quân cùng phe cùng đứng mà chồng vòng giãn (vừa lách tới, vừa dừng) thì quân dừng SAU
      // nhường trọn, quân đứng trước không xê dịch; dừng cùng tick thì chia đều (đối xứng hai phe). Đo 12 seed (9 Titan đi 30 m):
      // xe đã vào hàng bị xô 0,00 m (bản cũ tới 1,09 m); số lần đội chạm hết giờ 24 s (lỗi sẵn có của squad.ts, A1b) 4 / 12 so
      // với 3 / 12, đổi theo vị trí thả quân chứ không theo luật này
      if (!pa && !pb && !a.moved && !b.moved && a.side === b.side && soft === 0 && a.still !== b.still) wa = a.still < b.still ? 1 : 0;
      // xe chạy gặp xe đứng, hoặc hai xe chạy đối đầu: ngoài đẩy ra còn LÁCH SANG BÊN (vuông góc hướng chạy, phía xa xe kia);
      // đối đầu mà có xe được ưu tiên thì xe đó giữ làn, xe nhường lách
      // xe đang dạt nhường đường (`ra2` / `rb2` dù đang chạy) không bị lách ngang: nó chạy theo xích
      let aSide = !pa && !(a.moved && ra2) && ((a.moved && !b.moved) || (headOn && ya >= 0));
      let bSide = !pb && !(b.moved && rb2) && ((b.moved && !a.moved) || (headOn && ya <= 0));
      // tiểu đội gặp xe: LÍNH NHƯỜNG XE (chịu phần lớn cú đẩy, không lách), xe đi tiếp như không có gì
      if (soft > 0 && !pa && !pb) {
        const sqA = isSquad(a.kind);
        wa = sqA ? MOVER_SHARE : 1 - MOVER_SHARE;
        aSide = false;
        bSide = false;
      }
      // CÙNG ĐỘI HÌNH ĐANG CHẠY, một xe đúng ô, một xe đang về ô (lệch ô từ SQUAD_IN_SLOT m): xe đúng ô NHƯỜNG ĐƯỜNG (chịu phần lớn
      // cú đẩy và lách sang bên) rồi tự về ô; không thì xe tụt hàng kẹt ngoài hàng lúc hành quân (12/11/2026). CHỈ khi xe đúng ô
      // cũng đang chạy: xe đã ĐỨNG YÊN trong hàng thì giữ chỗ như mọi xe đứng, xe về ô tìm đường vòng (bước 2, `squadMember`);
      // áp cả lúc đứng thì xe về ô ủi xe đã vào hàng ra khỏi hàng (người dùng chụp ảnh 16/11/2026)
      if (!pa && !pb && a.squad !== 0 && a.squad === b.squad) {
        const offA = a.slotOff >= SQUAD_IN_SLOT;
        const offB = b.slotOff >= SQUAD_IN_SLOT;
        const inSlotMoving = offA ? b.moved : a.moved;
        if (offA !== offB && inSlotMoving) {
          wa = offA ? 1 - MOVER_SHARE : MOVER_SHARE;
          aSide = !offA;
          bSide = !offB;
        }
      }
      // lách sang bên chỉ còn cho tiểu đội bộ binh: xe xích không trượt ngang (`shove` chỉ đẩy dọc trục thân)
      const [lax, laz] = aSide && isSquad(a.kind) ? sideStep(a, dx, dz) : [0, 0];
      const [lbx, lbz] = bSide && isSquad(b.kind) ? sideStep(b, -dx, -dz) : [0, 0];
      // Đẩy qua tryMove: sát vách thì trượt dọc vách thay vì bỏ cả cú đẩy (trước đây cả hai đứng im lồng vào nhau). Hai cú đẩy
      // tính từ cùng một trạng thái; phần xe này không đi được (cả đẩy dọc lẫn lách ngang) thì xe kia đi bù theo hướng ngược
      // lại, một lượt cho cả hai chiều, nên đổi vai a / b (thứ tự mã xe) ra cùng kết quả. Quân đã hạ bệ không bị bù.
      // XE XÍCH (không phải bộ binh): mỗi xe chỉ tiến / lùi DỌC TRỤC THÂN đúng quãng cần để tách phần của mình (`axisApart`, tính
      // trên cùng một trạng thái), phần còn thiếu thì xe kia (rồi xe này) đi bù tới đủ khoảng chạm. Hai xe đứng ngang hàng lồng nhau
      // vẫn gỡ được: tiến / lùi dọc thân là xa nhau ra
      if (!isSquad(a.kind) && !isSquad(b.kind) && (pa || pb)) {
        // một bên là quân đã hạ bệ (lục giác tĩnh): xe kia tiến / lùi dọc thân tới khi ra khỏi lục giác (tính lại theo lục giác)
        const h = pa ? a : b;
        const m = pa ? b : a;
        const rr = spaceRadius(m.kind) - soft;
        for (let k = 0; k < 3; k++) {
          const ox = m.x - h.x;
          const oz = m.z - h.z;
          const c = hexOverlap(h, ox, oz, spaceRadius(h.kind), rr);
          if (c[0] <= 0.005) break;
          axisApart(this, m, h.x, h.z, Math.sqrt(ox * ox + oz * oz) + c[0] + 0.01);
        }
        continue;
      }
      if (!isSquad(a.kind) && !isSquad(b.kind)) {
        const ax0 = a.x;
        const az0 = a.z;
        const bx0 = b.x;
        const bz0 = b.z;
        if (!pa && wa > 0) axisApart(this, a, bx0, bz0, d + over * wa);
        if (!pb && wa < 1) axisApart(this, b, ax0, az0, d + over * (1 - wa));
        const need = d + over;
        if (!pb && wa < 1) axisApart(this, b, a.x, a.z, need);
        if (!pa && wa > 0) axisApart(this, a, b.x, b.z, need);
        continue;
      }
      const dax = -nx * over * wa + lax * over;
      const daz = -nz * over * wa + laz * over;
      const dbx = nx * over * (1 - wa) + lbx * over;
      const dbz = nz * over * (1 - wa) + lbz * over;
      const [mxa, mza] = shove(this, a, dax, daz);
      const [mxb, mzb] = shove(this, b, dbx, dbz);
      // xe được miễn đẩy (phần chia 0: hạ bệ, xe đứng / đang nhường gặp xe cùng phe đang chạy) cũng không nhận phần bù
      if (!pb && wa < 1) shove(this, b, mxa - dax, mza - daz);
      if (!pa && wa > 0) shove(this, a, mxb - dbx, mzb - dbz);
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

const methods = { separate, keepOffWalls, anchored, orcaPass };
type Methods = typeof methods;
declare module "./core" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface World extends Methods {}
}
Object.assign(World.prototype, methods);