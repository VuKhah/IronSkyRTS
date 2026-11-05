/**
 * Đo hiệu năng lõi sim: thời gian mỗi tick trong trận AI đấu AI, theo từng bản đồ (`npm run perf`,
 * hoặc `npm run perf -- <mã bản đồ> …`). Bỏ 50 tick đầu mỗi trận (khởi động: biên dịch JIT, tạo bảng địa hình).
 * In trung bình, phân vị 99 / 99,9 và đỉnh. Ngân sách: một tick là 100 ms thời gian thật (10 Hz), nhưng
 * điện thoại chậm hơn máy bàn vài lần, nên đỉnh nên giữ dưới ~10 ms trên máy bàn.
 */
import { Ai } from "../sim/ai";
import { DEV_MAP_DEFS, MAP_DEFS } from "../sim/maps";
import { sec, World } from "../sim/world";

const args = process.argv.slice(2);
const maps = args.length ? args : [...MAP_DEFS, ...DEV_MAP_DEFS].map((d) => d.id);
for (const map of maps) {
  const all: number[] = [];
  for (const seed of [2, 5, 9]) {
    const w = new World(seed, { maxTicks: sec(15 * 60), map });
    const ais = [new Ai(0, seed), new Ai(1, seed)];
    while (w.winner === -1) {
      const cmds = ais.flatMap((a) => a.think(w).map((order) => ({ side: a.side, order })));
      const t0 = performance.now();
      w.step(cmds);
      if (w.tick > 50) all.push(performance.now() - t0);
    }
  }
  all.sort((a, b) => a - b);
  const avg = all.reduce((a, b) => a + b, 0) / all.length;
  const q = (p: number): string => all[Math.floor(all.length * p)].toFixed(2);
  console.log(`${map}: ${all.length} tick · trung bình ${avg.toFixed(3)} ms · p99 ${q(0.99)} ms · p99,9 ${q(0.999)} ms · đỉnh ${all[all.length - 1].toFixed(1)} ms`);
}
