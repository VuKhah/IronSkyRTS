/**
 * Chấm các kịch bản thiết kế (src/sim/scenarios.ts) không giao diện: `npm run balance`.
 * In bảng đạt / chưa đạt để biết chỉ số hiện tại còn lệch ý đồ trong Docs/design/ARMY_DESIGN.md bao nhiêu.
 * Lệnh này không làm hỏng `npm test`: chỉ số còn là số tạm, nên kịch bản chưa đạt là chuyện bình thường.
 */
import { runScenario, SCENARIO_MAP, SCENARIOS } from "../sim/scenarios";
import { World } from "../sim/world";

const only = process.argv[2];
let pass = 0;
let total = 0;
for (const id of Object.keys(SCENARIOS)) {
  if (only && id !== only) continue;
  const sc = SCENARIOS[id]();
  const v = runScenario(id, new World(1, { sandbox: true, map: SCENARIO_MAP }));
  total++;
  if (v.ok) pass++;
  console.log(`${v.ok ? "ĐẠT     " : "CHƯA ĐẠT"}  ${sc.name}\n          ý đồ: ${sc.intent}\n          kết quả: ${v.text}\n`);
}
console.log(`${pass}/${total} kịch bản đạt.`);
