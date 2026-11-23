/**
 * BÀN ĐO DI CHUYỂN không giao diện (`src/sim/bench.ts`): chạy từng cảnh cho phe Lam và phe Đỏ (soi gương), in bảng số.
 *
 *   npm run bench                 mọi cảnh
 *   npm run bench -- mv-s4        các cảnh có mã chứa "mv-s4"
 */
import { BENCH, BENCH_MAP, formatMetrics, runBench } from "../sim/bench";
import { World } from "../sim/world";

const filter = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "";
/** `--luot N`: thêm N lượt lệch nhẹ chỗ thả quân, in trung bình tổng S4–S12 (bàn đo rất nhạy: một lượt là chưa đủ để so hai bản). */
const li = process.argv.indexOf("--luot");
const extra = li >= 0 ? Number(process.argv[li + 1] ?? 3) : 0;
const ids = Object.keys(BENCH).filter((id) => id.includes(filter));
// tổng S4–S12 (mốc so sánh của kế hoạch 20/11/2026): thời gian xong, giật quay, giật tốc
let sumT = 0;
let sumTurn = 0;
let sumSpeed = 0;
let sumN = 0;
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
  const k = Number(/^mv-s(\d+)/.exec(id)?.[1] ?? 0);
  if (k >= 4) {
    sumT += a.time;
    sumTurn += a.turnJitter;
    sumSpeed += a.speedJitter;
    sumN++;
  }
}
if (sumN > 1) console.log(`TỔNG S4–S12 (${sumN} cảnh): xong ${sumT.toFixed(1)} s · giật quay ${sumTurn.toFixed(1)} · giật tốc ${sumSpeed.toFixed(1)}`);
if (extra > 0) {
  let T = sumT;
  let Q = sumTurn;
  let V = sumSpeed;
  let unfinished = 0;
  for (let k = 1; k <= extra; k++) {
    let t = 0;
    let q = 0;
    let v = 0;
    for (const id of ids) {
      if (Number(/^mv-s(\d+)/.exec(id)?.[1] ?? 0) < 4) continue;
      const m = runBench(id, 0, () => new World(1, { sandbox: true, map: BENCH_MAP }), k);
      if (m.time === Infinity) unfinished++;
      t += m.time === Infinity ? 150 : m.time;
      q += m.turnJitter;
      v += m.speedJitter;
    }
    console.log(`  lượt lệch ${k}: xong ${t.toFixed(1)} s · giật quay ${q.toFixed(1)} · giật tốc ${v.toFixed(1)}`);
    T += t;
    Q += q;
    V += v;
  }
  const n = extra + 1;
  console.log(`TRUNG BÌNH ${n} lượt: xong ${(T / n).toFixed(1)} s · giật quay ${(Q / n).toFixed(1)} · giật tốc ${(V / n).toFixed(1)}${unfinished ? ` · ${unfinished} cảnh không xong (tính 150 s)` : ""}`);
}
