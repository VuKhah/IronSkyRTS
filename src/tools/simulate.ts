/**
 * Chạy nhiều trận AI đấu AI KHÔNG GIAO DIỆN để đo cân bằng (cách tác giả game tham chiếu đã làm).
 *   npm run simulate            (mặc định 6 trận)
 *   npm run simulate -- 20      (20 trận)
 */
import { Ai } from "../sim/ai";
import { SIDE_NAME } from "../sim/content";
import type { Command } from "../sim/types";
import { sec, World } from "../sim/world";

const REASON: Record<string, string> = { commander: "diệt Tư Lệnh", buildings: "phá hết công trình", monopoly: "độc quyền tài nguyên", timeout: "hết giờ" };
const n = Number(process.argv[2] ?? 6);
const wins = [0, 0, 0];
const t0 = Date.now();
for (let seed = 1; seed <= n; seed++) {
  const w = new World(seed, { maxTicks: sec(30 * 60) });
  const ais = [new Ai(0, seed), new Ai(1, seed)];
  while (w.winner === -1) {
    const cmds: Command[] = [];
    for (const ai of ais) for (const order of ai.think(w)) cmds.push({ side: ai.side, order });
    w.step(cmds);
  }
  wins[w.winner === 2 ? 2 : w.winner]++;
  const s = w.sides;
  const who = w.winner === 2 ? "HÒA" : `${SIDE_NAME[w.winner]} thắng`;
  console.log(
    `#${seed}: ${who} (${REASON[w.winReason ?? ""]}) sau ${(w.tick / 600).toFixed(1)} phút | ` +
      `đúc ${s[0].stats.unitsBuilt}/${s[1].stats.unitsBuilt} | hạ ${s[0].stats.kills}/${s[1].stats.kills} | ` +
      `Sắt đào ${Math.round(s[0].stats.ironMined)}/${Math.round(s[1].stats.ironMined)} | Dầu đào ${Math.round(s[0].stats.oilMined)}/${Math.round(s[1].stats.oilMined)}`
  );
}
console.log(`\nLam ${wins[0]} – Đỏ ${wins[1]} – Hòa ${wins[2]}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
