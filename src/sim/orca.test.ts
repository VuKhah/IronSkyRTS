/** Kiểm thử phần toán ORCA (src/sim/orca.ts) trên xe điểm tự do: không va nhau và vẫn tới đích. */
import { describe, expect, it } from "vitest";
import { orcaLine, orcaSolve, type OrcaLine } from "./orca";

interface Agent {
  x: number;
  z: number;
  vx: number;
  vz: number;
  gx: number;
  gz: number;
  r: number;
  still?: boolean;
}

/** Chạy `ticks` tick 0,1 s, tốc độ tối đa 4 m/s; trả về khoảng cách mép-mép nhỏ nhất giữa hai xe bất kỳ. */
function run(agents: Agent[], ticks: number): number {
  const dt = 0.1;
  let gap = Infinity;
  for (let t = 0; t < ticks; t++) {
    const next = agents.map((a) => {
      if (a.still) return [0, 0];
      const dx = a.gx - a.x;
      const dz = a.gz - a.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      const s = Math.min(4, d / dt);
      const px = d > 1e-9 ? (dx / d) * s : 0;
      const pz = d > 1e-9 ? (dz / d) * s : 0;
      const lines: OrcaLine[] = [];
      for (const b of agents) {
        if (b === a) continue;
        const L = { px: 0, pz: 0, dx: 0, dz: 0 };
        orcaLine(b.x - a.x, b.z - a.z, a.vx, a.vz, b.vx, b.vz, a.r + b.r, 2, b.still ? 1 : 0.5, dt, L);
        lines.push(L);
      }
      const res = { x: 0, z: 0 };
      orcaSolve(lines, 0, 4, px, pz, res);
      return [res.x, res.z];
    });
    agents.forEach((a, i) => {
      a.vx = next[i][0];
      a.vz = next[i][1];
      a.x += a.vx * dt;
      a.z += a.vz * dt;
    });
    for (let i = 0; i < agents.length; i++)
      for (let j = i + 1; j < agents.length; j++) {
        const a = agents[i];
        const b = agents[j];
        gap = Math.min(gap, Math.sqrt((a.x - b.x) ** 2 + (a.z - b.z) ** 2) - a.r - b.r);
      }
  }
  return gap;
}

describe("ORCA (toán)", () => {
  it("hai xe đối đầu thẳng hàng: lách nhau, không chạm, cả hai tới đích", () => {
    const a: Agent = { x: -20, z: 0, vx: 0, vz: 0, gx: 20, gz: 0, r: 1.5 };
    const b: Agent = { x: 20, z: 0, vx: 0, vz: 0, gx: -20, gz: 0, r: 1.5 };
    expect(run([a, b], 200)).toBeGreaterThan(-0.05);
    expect(Math.hypot(a.x - 20, a.z)).toBeLessThan(0.5);
    expect(Math.hypot(b.x + 20, b.z)).toBeLessThan(0.5);
  });

  it("bốn xe đổi chỗ chéo qua tâm: không chạm, tất cả tới đích", () => {
    const ag: Agent[] = [
      [-15, -15],
      [15, -15],
      [15, 15],
      [-15, 15]
    ].map(([x, z]) => ({ x, z, vx: 0, vz: 0, gx: -x, gz: -z, r: 1.5 }));
    expect(run(ag, 300)).toBeGreaterThan(-0.05);
    for (const a of ag) expect(Math.hypot(a.x - a.gx, a.z - a.gz)).toBeLessThan(0.5);
  });

  it("xe đi qua một xe đứng yên giữa đường: gánh trọn phần né, không chạm", () => {
    const a: Agent = { x: -20, z: 0.3, vx: 0, vz: 0, gx: 20, gz: 0.3, r: 1.5 };
    const s: Agent = { x: 0, z: 0, vx: 0, vz: 0, gx: 0, gz: 0, r: 1.5, still: true };
    expect(run([a, s], 200)).toBeGreaterThan(-0.05);
    expect(Math.hypot(a.x - 20, a.z - 0.3)).toBeLessThan(0.5);
  });
});
