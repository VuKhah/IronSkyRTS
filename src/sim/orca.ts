/**
 * ORCA (Optimal Reciprocal Collision Avoidance, van den Berg và cộng sự 2011): mỗi xe chọn vận tốc gần vận tốc muốn đi nhất
 * mà không va xe nào trong `horizon` giây tới, hai xe cùng né thì mỗi xe gánh một phần. Viết lại bằng TypeScript theo cấu
 * trúc của thư viện RVO2 (Apache-2.0, UNC Chapel Hill): mỗi xe láng giềng cho một NỬA MẶT PHẲNG vận tốc được phép (đường
 * ORCA), rồi giải quy hoạch tuyến tính 2D (linearProgram1/2/3) trong vòng tròn tốc độ tối đa.
 *
 * Thuần toán, không đụng World: chỉ dùng + − × ÷ và Math.sqrt (tất định, được phép trong sim). Trục: x và z của sân.
 * Đường thẳng (px, pz, dx, dz): đi qua điểm p theo hướng đơn vị d; vùng được phép là phía TRÁI hướng d, tức det(d, p − v) ≤ 0.
 */

export interface OrcaLine {
  px: number;
  pz: number;
  dx: number;
  dz: number;
}

const EPS = 1e-5;

const det = (ax: number, az: number, bx: number, bz: number): number => ax * bz - az * bx;

/**
 * Đường ORCA cho xe A trước xe B. rel = vị trí B − vị trí A, vA / vB = vận tốc hiện tại, r = tổng bán kính hai xe, share =
 * phần trách nhiệm của A (0,5: hai xe chia đôi; 1: B đứng yên hay không né, A gánh hết). dt = độ dài tick (dùng khi hai
 * thân đã chồng nhau: tách ra ngay trong tick tới).
 */
export function orcaLine(
  relX: number,
  relZ: number,
  vaX: number,
  vaZ: number,
  vbX: number,
  vbZ: number,
  r: number,
  horizon: number,
  share: number,
  dt: number,
  out: OrcaLine
): void {
  const rvX = vaX - vbX;
  const rvZ = vaZ - vbZ;
  const d2 = relX * relX + relZ * relZ;
  const r2 = r * r;
  let ux: number;
  let uz: number;
  if (d2 > r2) {
    // chưa chạm: hình nón vận tốc va chạm (cụt ở đầu bởi hình tròn bán kính r / horizon)
    const inv = 1 / horizon;
    const wx = rvX - inv * relX;
    const wz = rvZ - inv * relZ;
    const w2 = wx * wx + wz * wz;
    const dot1 = wx * relX + wz * relZ;
    if (dot1 < 0 && dot1 * dot1 > r2 * w2) {
      // chiếu lên vòng tròn cụt
      const wl = Math.sqrt(w2);
      const nx = wx / wl;
      const nz = wz / wl;
      out.dx = nz;
      out.dz = -nx;
      ux = (r * inv - wl) * nx;
      uz = (r * inv - wl) * nz;
    } else {
      // chiếu lên một trong hai cạnh nón
      const leg = Math.sqrt(d2 - r2);
      if (det(relX, relZ, wx, wz) > 0) {
        out.dx = (relX * leg - relZ * r) / d2;
        out.dz = (relX * r + relZ * leg) / d2;
      } else {
        out.dx = -(relX * leg + relZ * r) / d2;
        out.dz = -(-relX * r + relZ * leg) / d2;
      }
      const dot2 = rvX * out.dx + rvZ * out.dz;
      ux = dot2 * out.dx - rvX;
      uz = dot2 * out.dz - rvZ;
    }
  } else {
    // đã chồng thân: tách ra trong một tick
    const inv = 1 / dt;
    const wx = rvX - inv * relX;
    const wz = rvZ - inv * relZ;
    const wl = Math.sqrt(wx * wx + wz * wz);
    const nx = wl > EPS ? wx / wl : 0;
    const nz = wl > EPS ? wz / wl : 1;
    out.dx = nz;
    out.dz = -nx;
    ux = (r * inv - wl) * nx;
    uz = (r * inv - wl) * nz;
  }
  out.px = vaX + share * ux;
  out.pz = vaZ + share * uz;
}

/** Tối ưu trên một đường (đường thứ `no`), giữ các đường trước nó. false = vô nghiệm. */
function lp1(lines: readonly OrcaLine[], no: number, radius: number, optX: number, optZ: number, dirOpt: boolean, res: { x: number; z: number }): boolean {
  const L = lines[no];
  const dot = L.px * L.dx + L.pz * L.dz;
  const disc = dot * dot + radius * radius - (L.px * L.px + L.pz * L.pz);
  if (disc < 0) return false;
  const sq = Math.sqrt(disc);
  let tL = -dot - sq;
  let tR = -dot + sq;
  for (let i = 0; i < no; i++) {
    const M = lines[i];
    const denom = det(L.dx, L.dz, M.dx, M.dz);
    const numer = det(M.dx, M.dz, L.px - M.px, L.pz - M.pz);
    if (denom <= EPS && denom >= -EPS) {
      // song song
      if (numer < 0) return false;
      continue;
    }
    const t = numer / denom;
    if (denom >= 0) tR = Math.min(tR, t);
    else tL = Math.max(tL, t);
    if (tL > tR) return false;
  }
  let t: number;
  if (dirOpt) t = optX * L.dx + optZ * L.dz > 0 ? tR : tL;
  else {
    t = L.dx * (optX - L.px) + L.dz * (optZ - L.pz);
    if (t < tL) t = tL;
    else if (t > tR) t = tR;
  }
  res.x = L.px + t * L.dx;
  res.z = L.pz + t * L.dz;
  return true;
}

/** Vận tốc gần (optX, optZ) nhất thỏa mọi đường, trong vòng tròn bán kính `radius`. Trả về số đường đã thỏa (= lines.length là có nghiệm). */
function lp2(lines: readonly OrcaLine[], radius: number, optX: number, optZ: number, dirOpt: boolean, res: { x: number; z: number }): number {
  const o2 = optX * optX + optZ * optZ;
  if (dirOpt) {
    res.x = optX * radius;
    res.z = optZ * radius;
  } else if (o2 > radius * radius) {
    const l = Math.sqrt(o2);
    res.x = (optX / l) * radius;
    res.z = (optZ / l) * radius;
  } else {
    res.x = optX;
    res.z = optZ;
  }
  for (let i = 0; i < lines.length; i++) {
    const L = lines[i];
    if (det(L.dx, L.dz, L.px - res.x, L.pz - res.z) > 0) {
      const tx = res.x;
      const tz = res.z;
      if (!lp1(lines, i, radius, optX, optZ, dirOpt, res)) {
        res.x = tx;
        res.z = tz;
        return i;
      }
    }
  }
  return lines.length;
}

/** Vô nghiệm: nới đều các đường ORCA (từ đường `begin`), giữ cứng `nHard` đường đầu, cho vi phạm lớn nhất nhỏ nhất. */
function lp3(lines: readonly OrcaLine[], nHard: number, begin: number, radius: number, res: { x: number; z: number }): void {
  let dist = 0;
  const proj: OrcaLine[] = [];
  const tmp = { x: 0, z: 0 };
  for (let i = begin; i < lines.length; i++) {
    const Li = lines[i];
    if (det(Li.dx, Li.dz, Li.px - res.x, Li.pz - res.z) <= dist) continue;
    proj.length = 0;
    for (let k = 0; k < nHard; k++) proj.push(lines[k]);
    for (let j = nHard; j < i; j++) {
      const Lj = lines[j];
      const dt = det(Li.dx, Li.dz, Lj.dx, Lj.dz);
      let px: number;
      let pz: number;
      if (dt <= EPS && dt >= -EPS) {
        if (Li.dx * Lj.dx + Li.dz * Lj.dz > 0) continue; // cùng hướng
        px = 0.5 * (Li.px + Lj.px);
        pz = 0.5 * (Li.pz + Lj.pz);
      } else {
        const s = det(Lj.dx, Lj.dz, Li.px - Lj.px, Li.pz - Lj.pz) / dt;
        px = Li.px + s * Li.dx;
        pz = Li.pz + s * Li.dz;
      }
      let dx = Lj.dx - Li.dx;
      let dz = Lj.dz - Li.dz;
      const l = Math.sqrt(dx * dx + dz * dz);
      if (l < EPS) continue;
      dx /= l;
      dz /= l;
      proj.push({ px, pz, dx, dz });
    }
    tmp.x = res.x;
    tmp.z = res.z;
    if (lp2(proj, radius, -Li.dz, Li.dx, true, res) < proj.length) {
      res.x = tmp.x;
      res.z = tmp.z;
    }
    dist = det(Li.dx, Li.dz, Li.px - res.x, Li.pz - res.z);
  }
}

/** Lệch hướng muốn đi sang phải khi bị ép (tan góc lệch): gỡ thế "hai xe thẳng hàng cùng phanh chờ nhau". */
export const ORCA_KEEP_RIGHT = 0.3;

function solveOnce(lines: readonly OrcaLine[], nHard: number, maxSpeed: number, prefX: number, prefZ: number, res: { x: number; z: number }): void {
  const fail = lp2(lines, maxSpeed, prefX, prefZ, false, res);
  if (fail < lines.length) lp3(lines, nHard, fail, maxSpeed, res);
}

/**
 * Giải ORCA: vận tốc gần (prefX, prefZ) nhất, |v| ≤ maxSpeed, thỏa `nHard` đường cứng đầu tiên (ràng buộc của xe, luôn có
 * nghiệm v = 0) và các đường ORCA sau đó; ORCA vô nghiệm (kẹt giữa nhiều xe) thì chọn vận tốc vi phạm ít nhất. Ghi vào `res`.
 *
 * GIỮ BÊN PHẢI: hai xe đi đúng thẳng hàng ngược chiều thì nghiệm tối ưu của cả hai là cùng chậm lại dọc đường nối, bế tắc
 * (RVO2 gỡ bằng nhiễu ngẫu nhiên, sim tất định không dùng được). Nghiệm gần như đứng chờ thì giải lại với hướng muốn đi lệch
 * sang phải (x, z) → (z, −x) một góc nhỏ: hai xe lách về hai phía, như luật đi bên phải. Mọi xe cùng một
 * quy ước nên xoay bản đồ 180° vẫn ra cùng kết quả (công bằng hai phe).
 */
export function orcaSolve(lines: readonly OrcaLine[], nHard: number, maxSpeed: number, prefX: number, prefZ: number, res: { x: number; z: number }): void {
  solveOnce(lines, nHard, maxSpeed, prefX, prefZ, res);
  // chỉ khi nghiệm gốc gần như đứng chờ (tiến theo hướng muốn đi dưới 80%): cắt ngang thì ORCA tự có nghiệm tốt (một xe chậm,
  // một xe đi tiếp), ép cả hai lệch phải thì cả hai cùng trôi về một phía, vẫn gặp nhau
  const p2 = prefX * prefX + prefZ * prefZ;
  if (res.x * prefX + res.z * prefZ >= KEEP_RIGHT_BELOW * p2) return;
  solveOnce(lines, nHard, maxSpeed, prefX + prefZ * ORCA_KEEP_RIGHT, prefZ - prefX * ORCA_KEEP_RIGHT, res);
}

/** Nghiệm gốc tiến theo hướng muốn đi dưới chừng này phần tốc độ muốn đi thì mới thử nghiệm "giữ bên phải". */
const KEEP_RIGHT_BELOW = 0.8;
