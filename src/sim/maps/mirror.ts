/** Bộ vẽ tự đối xứng: dựng đủ bản đồ từ một nửa (MapDef.symmetric) bằng phép xoay 180° quanh tâm. Tách từ game-map.ts (16/11/2026). */
import type { Blob, MapDef, MineDef, RegionDef, RiverDef, Vec2 } from "./types";

const EPS = 1e-9;
const atCenter = (x: number, z: number): boolean => Math.abs(x) < EPS && Math.abs(z) < EPS;
const flip = ([x, z]: Vec2): Vec2 => [-x, -z];
/** Mỗi phần tử kèm bản xoay 180° ngay sau nó (giữ thứ tự khai báo); phần tử nằm đúng tâm không nhân đôi. */
function withTwins<T extends { x: number; z: number }>(list: readonly T[], twin: (e: T) => T): T[] {
  const out: T[] = [];
  for (const e of list) {
    out.push(e);
    if (!atCenter(e.x, e.z)) out.push(twin(e));
  }
  return out;
}

/** Sông tự đối xứng: xoay 180° rồi đảo chiều thì trùng chính nó (ví dụ sông chảy qua tâm theo đường thẳng). */
function selfSymmetric(path: readonly Vec2[]): boolean {
  const n = path.length;
  for (let i = 0; i < n; i++) {
    const [x, z] = path[i];
    const [mx, mz] = path[n - 1 - i];
    if (Math.abs(x + mx) > EPS || Math.abs(z + mz) > EPS) return false;
  }
  return true;
}

/**
 * Dựng đủ bản đồ từ một nửa (MapDef.symmetric): mọi thứ được thêm bản xoay 180° quanh tâm, (x, z) → (-x, -z),
 * mỏ đổi chủ Lam ↔ Đỏ. Sông tự đối xứng (chảy qua tâm) thì chỉ nhân đôi lối qua; sông khác thì nhân đôi cả sông.
 * Khối dốc được soi gương riêng (GameMap.ramps), vì lưới ô chỉ tính ở nửa phía Lam.
 */
export function mirrorDef(def: MapDef): MapDef {
  const swap = (o: MineDef["owner"]): MineDef["owner"] => (o === 0 ? 1 : o === 1 ? 0 : -1);
  const blob = (b: Blob): Blob => ({ ...b, x: -b.x, z: -b.z });
  const rivers: RiverDef[] = [];
  for (const r of def.rivers) {
    const crossings = withTwins(r.crossings, (c) => ({ ...c, x: -c.x, z: -c.z }));
    if (selfSymmetric(r.path)) rivers.push({ ...r, crossings });
    else rivers.push(r, { ...r, path: r.path.map(flip), crossings: r.crossings.map((c) => ({ ...c, x: -c.x, z: -c.z })) });
  }
  const regions: RegionDef[] = [];
  for (const g of def.regions ?? []) {
    regions.push(g);
    if (g.circle && !atCenter(g.circle.x, g.circle.z)) regions.push({ ...g, circle: { ...g.circle, x: -g.circle.x, z: -g.circle.z } });
    if (g.poly) regions.push({ ...g, poly: g.poly.map(flip) });
  }
  return {
    ...def,
    bases: def.bases.flatMap((b) => [b, flip(b)]),
    mines: withTwins(def.mines, (m) => ({ ...m, x: -m.x, z: -m.z, owner: swap(m.owner) })),
    points: (def.points ?? []).flatMap((p) => (atCenter(p[0], p[1]) ? [p] : [p, flip(p)])),
    tiers: (def.tiers ?? []).flatMap((t) => [t, { ...t, poly: t.poly.map(flip) }]),
    rocks: withTwins(def.rocks, blob),
    rivers,
    regions
  };
}
