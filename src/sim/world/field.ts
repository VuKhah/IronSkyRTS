/**
 * Bãi tài nguyên (người dùng 12/11/2026: mỏ không còn là một khối mà là một bãi, nhiều điểm tiếp xúc hơn): bố trí các khối
 * quặng / giếng Dầu và chỗ đỗ Xe Vận Tải quanh tâm mỏ, theo địa hình thật (bậc núi hẹp thì bãi tự xếp thành dãy).
 */
import { RULES, UNITS } from "../content";
import { CELL } from "../maps";
import type { Mine, MineSpot, Unit } from "../types";
import { World } from "./core";
import { R2 } from "./shared";

/** 8 hướng đỗ (cos, sin viết sẵn: sim không gọi Math.cos). */
const DIRS8: readonly (readonly [number, number])[] = [
  [1, 0], [R2, R2], [0, 1], [-R2, R2], [-1, 0], [-R2, -R2], [0, -1], [R2, -R2]
];
/** Xe Vận Tải giả để dò thân ở chỗ đỗ. */
const PROBE_HAULER = { kind: "hauler", air: "none", hx: 1, hz: 0 } as Unit;

/** Ô lệch (theo ô) có thể đặt khối: trong bán kính `spread` m quanh tâm, xếp gần tâm trước (hòa: theo hàng rồi cột). */
let OFFSETS: readonly (readonly [number, number])[] | null = null;
function offsets(): readonly (readonly [number, number])[] {
  if (OFFSETS) return OFFSETS;
  const r = Math.floor(RULES.field.spread / CELL);
  const out: [number, number][] = [];
  for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if ((i * i + j * j) * CELL * CELL <= RULES.field.spread * RULES.field.spread + 1e-9) out.push([i, j]);
  out.sort((a, b) => a[0] * a[0] + a[1] * a[1] - (b[0] * b[0] + b[1] * b[1]) || a[1] - b[1] || a[0] - b[0]);
  return (OFFSETS = out);
}

/** Khoảng cách từ tâm khối tới tâm chỗ đỗ theo hướng (ux, uz) (m): tới mép ô theo hướng đó + nửa thân xe + khe `gap`. */
function parkOffset(ux: number, uz: number): number {
  const edge = (CELL / 2) / Math.max(ux < 0 ? -ux : ux, uz < 0 ? -uz : uz);
  return edge + (UNITS.hauler.halfLen ?? UNITS.hauler.radius) + RULES.field.gap;
}

/** Hai xe đỗ (tâm, hướng) có chồng thân không (hình chữ nhật thân thật + `pad` m mỗi bên, phép tách trục). */
function parkedOverlap(a: MineSpot, b: MineSpot, pad: number): boolean {
  const W = UNITS.hauler.radius + pad;
  const L = (UNITS.hauler.halfLen ?? UNITS.hauler.radius) + pad;
  const dx = b.px - a.px;
  const dz = b.pz - a.pz;
  for (const [ux, uz] of [[a.fx, a.fz], [a.fz, -a.fx], [b.fx, b.fz], [b.fz, -b.fx]]) {
    const ra = L * Math.abs(a.fx * ux + a.fz * uz) + W * Math.abs(a.fz * ux - a.fx * uz);
    const rb = L * Math.abs(b.fx * ux + b.fz * uz) + W * Math.abs(b.fz * ux - b.fx * uz);
    if (Math.abs(dx * ux + dz * uz) >= ra + rb) return false;
  }
  return true;
}

/**
 * Bố trí bãi của mỏ `m`. Khối quặng / giếng: ô trong bán kính `spread` m quanh tâm, cùng tầng với tâm, không trên dốc / vùng
 * quanh dốc, không bị chặn, cách các khối khác ≥ `minGap` m. Mỗi khối một chỗ đỗ: thử 8 hướng, hướng quay ra ngoài bãi trước;
 * hợp lệ khi chỗ đỗ cùng tầng, thân Xe Vận Tải đỗ ở đó (mũi vào khối) không chạm vật cản nào, không chồng thân xe đỗ chỗ khác,
 * và khối mới không đè lên thân xe đỗ chỗ đã chọn. Chọn tham lam theo thứ tự cố định, tối đa `deposits` chỗ. Bãi ở nửa bản đồ
 * bên kia (đối xứng qua tâm) lật ngược mọi độ lệch và hướng, nên hai bãi đối xứng có bố trí đối xứng (luật công bằng số 4).
 * Đặt `spots`, `slots` (toàn 0), `cells` (đã chặn trên lưới), `radius`.
 */
function layoutField(this: World, m: Mine): void {
  const F = RULES.field;
  const s = m.z > 0 || (m.z === 0 && m.x < 0) ? 1 : -1;
  // bãi nằm đúng tâm bản đồ là ảnh đối xứng của chính nó: chọn khối theo từng CẶP đối xứng qua tâm (khối + ảnh xoay 180°)
  const self = m.x === 0 && m.z === 0;
  const g = this.grid;
  const C = g.cols;
  const tier = this.map.tierAt(m.x, m.z);
  const spots: MineSpot[] = [];
  const cells: number[] = [];
  const used = new Set<number>();
  /** Khối ở ô `ci` với chỗ đỗ hợp lệ (đã tạm chặn ô ci trên lưới khi trả về khác null; null thì không chặn gì). */
  const tryDeposit = (ci: number): MineSpot | null => {
    const x = g.centerX(ci % C);
    const z = g.centerZ(Math.floor(ci / C));
    if (g.blockedIdx(ci) || this.map.tierAt(x, z) !== tier || this.map.onRamp(x, z) || this.map.rampApron(x, z)) return null;
    if (spots.some((p) => (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z) < F.minGap * F.minGap)) return null;
    // khối mới không được đè lên thân xe đỗ ở các chỗ đã chọn
    g.block([ci], 1);
    if (spots.some((p) => this.bodyContact(PROBE_HAULER, p.px, p.pz, p.fx, p.fz)[2] > 0)) {
      g.block([ci], -1);
      return null;
    }
    // hướng đỗ: quay ra ngoài bãi trước (khối ở đúng tâm thì theo thứ tự bảng)
    const ox = x - m.x;
    const oz = z - m.z;
    const order = DIRS8.map((d, k) => [k, d[0] * s * ox + d[1] * s * oz] as const).sort((a, b) => b[1] - a[1] || a[0] - b[0]);
    for (const [k, out] of order) {
      if (out < -1e-9 && (ox !== 0 || oz !== 0)) break; // không đỗ phía trong bãi
      const ux = DIRS8[k][0] * s;
      const uz = DIRS8[k][1] * s;
      const off = parkOffset(ux, uz);
      const px = x + ux * off;
      const pz = z + uz * off;
      if (g.blockedAt(px, pz) || this.map.tierAt(px, pz) !== tier || this.map.onRamp(px, pz)) continue;
      const sp: MineSpot = { x, z, px, pz, fx: -ux, fz: -uz };
      if (this.bodyContact(PROBE_HAULER, px, pz, -ux, -uz)[2] > 0) continue;
      if (spots.some((p) => parkedOverlap(p, sp, F.parkPad))) continue;
      return sp;
    }
    g.block([ci], -1);
    return null;
  };
  for (const [oi, oj] of offsets()) {
    if (spots.length >= F.deposits) break;
    const ci = g.index(m.x + oi * CELL * s, m.z + oj * CELL * s);
    if (used.has(ci)) continue;
    used.add(ci);
    const a = tryDeposit(ci);
    if (!a) continue;
    if (!self) {
      spots.push(a);
      cells.push(ci);
      continue;
    }
    // bãi ở tâm: ảnh xoay 180° của khối này cũng phải đặt được, với chỗ đỗ đúng là ảnh xoay của chỗ đỗ này
    const cj = g.index(-a.x, -a.z);
    used.add(cj);
    spots.push(a);
    const b = spots.length < F.deposits ? tryDeposit(cj) : null;
    if (!b || b.px !== -a.px || b.pz !== -a.pz) {
      spots.pop();
      if (b) g.block([cj], -1);
      g.block([ci], -1);
      continue;
    }
    spots.push(b);
    cells.push(ci, cj);
  }
  // ô trống bị các khối vây kín bên trong bãi (không thông ra ngoài) cũng là bãi: chặn luôn, không thì thành "đảo" không xe nào
  // tới được và xe bị đẩy vào đó thì kẹt
  cells.push(...this.fieldPockets(m.x, m.z, cells));
  m.spots = spots;
  m.slots = spots.map(() => 0);
  m.cells = cells;
  const L = UNITS.hauler.halfLen ?? UNITS.hauler.radius;
  m.radius = spots.reduce((r, p) => Math.max(r, Math.sqrt((p.px - m.x) * (p.px - m.x) + (p.pz - m.z) * (p.pz - m.z)) + L), CELL);
}

/**
 * Ô trống trong vùng bãi (tâm (cx, cz), bán kính `spread` + 3 ô) không thông ra ngoài vùng đó: loang từ mép vùng; ô nào không
 * loang tới thì chặn (trả về danh sách ô đã chặn). Các khối `deposits` đã chặn sẵn trên lưới.
 */
function fieldPockets(this: World, cx: number, cz: number, deposits: readonly number[]): number[] {
  if (!deposits.length) return [];
  const g = this.grid;
  const C = g.cols;
  const R = Math.ceil(RULES.field.spread / CELL) + 3;
  const c0 = g.cellX(cx);
  const r0 = g.cellZ(cz);
  const inBox = (c: number, r: number): boolean => Math.abs(c - c0) <= R && Math.abs(r - r0) <= R && c >= 0 && r >= 0 && c < C && r < g.rows;
  const seen = new Set<number>();
  const q: number[] = [];
  for (let r = r0 - R; r <= r0 + R; r++)
    for (let c = c0 - R; c <= c0 + R; c++) {
      if (!inBox(c, r) || (Math.abs(c - c0) < R && Math.abs(r - r0) < R)) continue;
      const i = r * C + c;
      if (!g.blockedIdx(i)) {
        seen.add(i);
        q.push(i);
      }
    }
  for (let h = 0; h < q.length; h++) {
    const c = q[h] % C;
    const r = (q[h] - c) / C;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nc = c + dc;
      const nr = r + dr;
      if (!inBox(nc, nr)) continue;
      const j = nr * C + nc;
      if (seen.has(j) || g.blockedIdx(j)) continue;
      seen.add(j);
      q.push(j);
    }
  }
  const out: number[] = [];
  for (let r = r0 - R + 1; r < r0 + R; r++)
    for (let c = c0 - R + 1; c < c0 + R; c++) {
      if (!inBox(c, r)) continue;
      const i = r * C + c;
      if (!g.blockedIdx(i) && !seen.has(i)) out.push(i);
    }
  g.block(out, 1);
  return out;
}

const methods = { layoutField, fieldPockets };
type Methods = typeof methods;
declare module "./core" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface World extends Methods {}
}
Object.assign(World.prototype, methods);
