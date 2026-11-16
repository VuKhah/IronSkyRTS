/**
 * Luật LÁCH MỀM (A1a, người dùng 16/11/2026; Docs/plans/2026-11-16-A1-doi-hinh-dich-lach-mem.md): quân ĐANG CHẠY được lách qua
 * khe giữa quân ĐANG ĐỨNG cùng phe nếu khe đủ rộng theo đế (vòng thân quân đứng + SOFT_PASS × đế người lách); quân đứng không
 * bao giờ bị đẩy; không quân nào dừng ở chỗ chồng đế. Chỉ kiểm HÀNH VI.
 */
import { describe, expect, it } from "vitest";
import { SOFT_PASS, UNITS, type UnitId } from "./content";
import { arenaPoint } from "./scenarios";
import type { Unit } from "./types";
import { bodyRadius, passGap, sec, spaceRadius, World } from "./world";

function spawn(w: World, kind: UnitId, x: number, z: number, side: 0 | 1 = 0): Unit {
  w.step([{ side, order: { t: "sbSpawn", kind, side, x, z } }]);
  return w.units.filter((u) => u.side === side && u.kind === kind).pop()!;
}
const dist = (a: Unit, x: number, z: number): number => Math.sqrt((a.x - x) ** 2 + (a.z - z) ** 2);
const gap = (a: Unit, b: Unit): number => dist(a, b.x, b.z);

interface Gate {
  w: World;
  posts: Unit[];
  at: [number, number][];
  cx: number;
  cz: number;
  g: number;
}

/** Hai quân `post` đứng thành khe theo trục x quanh tâm bãi thử, đứng đủ lâu để thành "xe đứng" (và hạ bệ nếu có). */
function gate(post: UnitId, mover: UnitId, side: 0 | 1 = 0, tilt = true, wait = 3): Gate {
  const w = new World(1, { sandbox: true });
  const [cx, cz] = arenaPoint(0);
  const g = passGap(post, post, mover);
  const posts = [spawn(w, post, cx - g / 2, cz, side), spawn(w, post, cx + g / 2, cz, side)];
  if (tilt) {
    // một chiếc đứng nghiêng 30° (người dùng: quân đứng nghiêng vẫn cho lách, không ràng buộc quân đứng)
    posts[1].hx = 0.5;
    posts[1].hz = 0.8660254037844386;
  }
  for (let t = 0; t < sec(wait); t++) w.step([]);
  return { w, posts, at: posts.map((u) => [u.x, u.z]), cx, cz, g };
}

/** Cho `u` đi tới (x, z); trả về hoành độ x lúc u cắt đường z = zc (NaN nếu không cắt) và khoảng gần nhất tới các quân đứng. */
function drive(G: Gate, u: Unit, x: number, z: number, seconds = 25): { crossX: number; closest: number } {
  const { w } = G;
  w.step([{ side: u.side, order: { t: "move", ids: [u.id], x, z } }]);
  let crossX = NaN;
  let closest = Infinity;
  let pz = u.z;
  for (let t = 0; t < sec(seconds); t++) {
    w.step([]);
    if ((pz - G.cz) * (u.z - G.cz) <= 0 && pz !== u.z && Number.isNaN(crossX)) crossX = u.x;
    pz = u.z;
    for (const p of G.posts) closest = Math.min(closest, gap(u, p));
  }
  return { crossX, closest };
}

const moved = (G: Gate): number => Math.max(...G.posts.map((p, i) => dist(p, G.at[i][0], G.at[i][1])));

describe("tìm đường thấy khe lách", () => {
  /** Hai Titan đứng thành khe có tâm khe đúng ranh giới ô lưới 2 m (tâm ô là số lẻ, ranh giới là số chẵn). */
  function gridGate(mover: UnitId): { w: World; u: Unit; x0: number; cz: number } {
    const w = new World(1, { sandbox: true });
    const [ax, cz] = arenaPoint(0);
    const x0 = Math.round(ax / 2) * 2;
    const g = passGap("titan", "titan", "lynx");
    spawn(w, "titan", x0 - g / 2, cz);
    spawn(w, "titan", x0 + g / 2, cz);
    const u = spawn(w, mover, x0, cz - 10);
    for (let t = 0; t < sec(3); t++) w.step([]);
    return { w, u, x0, cz };
  }
  const path = (w: World, u: Unit, x: number, z: number): number[] | null => {
    const f = w.grid.field(UNITS[u.kind].mobility ?? "wheel", false);
    return w.grid.findPath(u.x, u.z, x, z, f, bodyRadius(u.kind) * 0.95, w.standFor(u)!);
  };

  it("Lynx: đường đi thẳng qua khe nằm đúng ranh giới ô", () => {
    const { w, u, x0, cz } = gridGate("lynx");
    expect(path(w, u, x0, cz + 10)).toEqual([x0, cz + 10]);
  });

  it("Titan: khe đó không lọt, đường phải đi vòng", () => {
    const { w, u, x0, cz } = gridGate("titan");
    const p = path(w, u, x0, cz + 10);
    expect(p).not.toBeNull();
    expect(p!.length).toBeGreaterThan(2);
  });
});

describe("luật lách mềm", () => {
  it("Lynx lách qua khe giữa 2 Titan (một chiếc đứng nghiêng 30°), Titan không xê dịch", () => {
    const G = gate("titan", "lynx");
    const lx = spawn(G.w, "lynx", G.cx, G.cz - 10);
    const r = drive(G, lx, G.cx, G.cz + 10);
    expect(dist(lx, G.cx, G.cz + 10)).toBeLessThan(1.5);
    expect(moved(G)).toBeLessThan(1e-6);
    expect(Math.abs(r.crossX - G.cx)).toBeLessThan(0.8);
  });

  it("Titan không lọt khe đó: đi vòng, không xô Titan đứng", () => {
    const G = gate("titan", "lynx");
    const tt = spawn(G.w, "titan", G.cx, G.cz - 10);
    const r = drive(G, tt, G.cx, G.cz + 10, 35);
    expect(dist(tt, G.cx, G.cz + 10)).toBeLessThan(2);
    expect(moved(G)).toBeLessThan(1e-6);
    expect(Math.abs(r.crossX - G.cx)).toBeGreaterThan(G.g / 2);
  });

  it("xe địch đứng làm khe: không lách, giữ đúng vòng giãn", () => {
    const G = gate("titan", "lynx", 1, false);
    G.w.step([{ side: 1, order: { t: "sbHold", side: 1, on: true } }]);
    const lx = spawn(G.w, "lynx", G.cx, G.cz - 10, 0);
    G.w.step([{ side: 0, order: { t: "sbHold", side: 0, on: true } }]);
    const r = drive(G, lx, G.cx, G.cz + 10);
    // luật cứng cũ cho lồng tạm rồi đẩy ra trong tick sau, nên khoảng gần nhất dưới tổng hai vòng giãn; nhưng không được sát tới
    // khoảng lách mềm (chỉ dành cho quân cùng phe)
    expect(r.closest).toBeGreaterThan(bodyRadius("titan") + SOFT_PASS * bodyRadius("lynx") + 0.2);
    expect(r.closest).toBeLessThan(spaceRadius("lynx") + spaceRadius("titan"));
  });

  it("SkyGuard hạ bệ làm khe: Lynx lách qua, SkyGuard đứng yên", () => {
    const G = gate("skyguard", "lynx", 0, true, 5);
    expect(G.posts.every((p) => G.w.anchored(p))).toBe(true);
    const lx = spawn(G.w, "lynx", G.cx, G.cz - 10);
    const r = drive(G, lx, G.cx, G.cz + 10);
    expect(dist(lx, G.cx, G.cz + 10)).toBeLessThan(1.5);
    expect(moved(G)).toBeLessThan(1e-6);
    expect(Math.abs(r.crossX - G.cx)).toBeLessThan(0.8);
  });
});
