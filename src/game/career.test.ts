import { describe, expect, it } from "vitest";
import type { SideStats } from "../sim/types";
import { award, emptyCareer, RANKS, rankOf, XP } from "./career";

const stats = (o: Partial<SideStats> = {}): SideStats =>
  ({
    unitsBuilt: 0,
    unitsLost: 10,
    kills: 0,
    ironMined: 0,
    oilMined: 0,
    buildingsBuilt: 0,
    salvaged: 0,
    salvos: 0,
    promotions: 0,
    topRank: 0,
    uplinkTime: 0,
    damageDealt: 0,
    ...o
  }) as SideStats;

describe("tiến trình người chơi", () => {
  it("cấp bậc theo điểm cộng dồn, tiến độ tới cấp sau", () => {
    expect(rankOf(0).name).toBe("Binh nhì");
    expect(rankOf(99).name).toBe("Binh nhì");
    expect(rankOf(100).name).toBe("Binh nhất");
    expect(rankOf(175).progress).toBeCloseTo(0.5);
    expect(rankOf(175).toNext).toBe(75);
    const top = rankOf(1e9);
    expect(top.name).toBe(RANKS[RANKS.length - 1].name);
    expect(top.next).toBeNull();
    expect(top.progress).toBe(1);
  });

  it("cộng điểm thắng / thua, quân hạ, huy chương; không sửa bản cũ", () => {
    const c0 = emptyCareer();
    const a = award(c0, { outcome: "win", secs: 400, stats: stats({ kills: 5, unitsLost: 2 }) });
    // thắng + 5 quân hạ + 2 huy chương (Thần tốc dưới 8 phút, Thép mất ≤ 3 quân)
    expect(a.xp).toBe(XP.win + 5 * XP.perKill + 2 * XP.perMedal);
    expect(a.medals.map((m) => m.id).sort()).toEqual(["blitz", "steel"]);
    expect(a.career).toMatchObject({ xp: a.xp, games: 1, wins: 1, losses: 0, bestWin: 400 });
    expect(a.career.medals).toEqual({ blitz: 1, steel: 1 });
    expect(c0.games).toBe(0);
    const b = award(a.career, { outcome: "loss", secs: 900, stats: stats() });
    expect(b.xp).toBe(XP.loss);
    expect(b.career).toMatchObject({ games: 2, wins: 1, losses: 1, bestWin: 400 });
    expect(b.before.name).toBe(rankOf(a.career.xp).name);
  });

  it("báo thăng cấp khi vượt mốc", () => {
    const a = award({ ...emptyCareer(), xp: 90 }, { outcome: "win", secs: 1000, stats: stats() });
    expect(a.before.name).toBe("Binh nhì");
    expect(a.after.name).toBe("Binh nhất");
  });
});
