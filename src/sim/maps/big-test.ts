/**
 * Bản đồ thử kích cỡ thật của quy mô sư đoàn: "The Two Crossings" dài gấp 4 lần mỗi cạnh (960 × 960 m, người dùng chốt
 * 09/11/2026). Chỉ dùng để đo hiệu năng, mở bằng `?map=big-test`; cầu và sông giữ bề rộng thật, chỉ dãn khoảng cách.
 */
import { rampOnEdge } from "./shapes";
import { PLATEAU_1, PLATEAU_2, RAMPS, TWO_CROSSINGS } from "./two-crossings";
import type { MapDef, Vec2 } from "./types";

const K = 4;
const pts = (a: readonly Vec2[]): Vec2[] => a.map(([x, z]) => [x * K, z * K] as const);
const d = TWO_CROSSINGS;

export const BIG_TEST: MapDef = {
  ...d,
  id: "big-test",
  name: "Bản Đồ Thử 960 m",
  blurb: "Bản đồ thử hiệu năng ở kích cỡ sư đoàn.",
  size: { w: d.size.w * K, h: d.size.h * K },
  bounds: d.bounds ? pts(d.bounds) : undefined,
  bases: pts(d.bases),
  mines: d.mines.map((m) => ({ ...m, x: m.x * K, z: m.z * K })),
  points: d.points ? pts(d.points) : undefined,
  tiers: [
    { tier: 1, poly: pts(PLATEAU_1) },
    { tier: 2, poly: pts(PLATEAU_2) }
  ],
  ramps: RAMPS.map((r) => rampOnEdge(pts(r.tier === 1 ? PLATEAU_1 : PLATEAU_2), r.x * K, r.z * K, r.dir, r.width * 2)),
  rocks: d.rocks.map((r) => ({ ...r, x: r.x * K, z: r.z * K, r: r.r * 1.5 })),
  rivers: d.rivers.map((r) => ({ ...r, path: pts(r.path), crossings: r.crossings.map((c) => ({ ...c, x: c.x * K, z: c.z * K })) })),
  regions: d.regions?.map((r) => ({
    ...r,
    poly: r.poly ? pts(r.poly) : undefined,
    circle: r.circle ? { x: r.circle.x * K, z: r.circle.z * K, r: r.circle.r * K } : undefined
  }))
};
