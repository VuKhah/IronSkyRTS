/**
 * BÀN ĐO DI CHUYỂN không giao diện (`src/sim/bench.ts`): chạy từng cảnh cho phe Lam và phe Đỏ (soi gương), in bảng số.
 *
 *   npm run bench                 mọi cảnh
 *   npm run bench -- mv-s4        các cảnh có mã chứa "mv-s4"
 */
import { BENCH, BENCH_MAP, formatMetrics, runBench } from "../sim/bench";
import { World } from "../sim/world";

const filter = process.argv[2] ?? "";
const ids = Object.keys(BENCH).filter((id) => id.includes(filter));
for (const id of ids) {
  const t0 = performance.now();
  const a = runBench(id, 0, () => new World(1, { sandbox: true, map: BENCH_MAP }));
  const ms = performance.now() - t0;
  const b = runBench(id, 1, () => new World(1, { sandbox: true, map: BENCH_MAP }));
  let mirror = 0;
  const n = Math.min(a.trace.length, b.trace.length);
  for (let i = 0; i < n; i++) mirror = Math.max(mirror, Math.abs(a.trace[i] - b.trace[i]));
  if (a.trace.length !== b.trace.length) mirror = Infinity;
  for (const wn of a.warnings) console.log(`  ⚠ ${id}: ${wn}`);
  console.log(`${id.padEnd(18)} ${formatMetrics(a)} · gương ${mirror === Infinity ? "LỆCH SỐ MẪU" : mirror.toExponential(1)} · ${ms.toFixed(0)} ms`);
}
