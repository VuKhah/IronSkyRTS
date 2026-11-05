/**
 * Kiểm thử "nhà soạn nhạc" của nhạc thích ứng (phần thuần, không cần loa / AudioContext).
 */
import { describe, expect, it } from "vitest";
import { chordAt, composeStep, LAYERS, layerWeight, STEPS_PER_BAR, type Voice } from "./music";

/** Các giọng xuất hiện trong trọn một vòng 4 ô nhịp ở độ căng `k`. */
function voicesAt(k: number): Set<Voice> {
  const s = new Set<Voice>();
  for (let step = 0; step < STEPS_PER_BAR * 4; step++) for (const n of composeStep(step, k)) s.add(n.voice);
  return s;
}

describe("Nhạc thích ứng: nhà soạn nhạc", () => {
  it("lúc yên chỉ có hợp âm nền; các lớp bật dần theo độ căng thẳng", () => {
    expect([...voicesAt(0)]).toEqual(["pad"]);
    expect(voicesAt(LAYERS.bass + 0.1).has("bass")).toBe(true);
    expect(voicesAt(LAYERS.bass + 0.1).has("kick")).toBe(false);
    const hot = voicesAt(LAYERS.arp + 0.1);
    expect(hot.has("arp") && hot.has("hat")).toBe(true);
    const battle = voicesAt(1);
    for (const v of ["pad", "bass", "arp", "hat", "kick", "snare", "brass"] as Voice[]) expect(battle.has(v), v).toBe(true);
  });

  it("lớp mới mờ dần vào (không bật đột ngột)", () => {
    expect(layerWeight(LAYERS.drums - 0.01, LAYERS.drums)).toBe(0);
    const mid = layerWeight(LAYERS.drums + 0.07, LAYERS.drums);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    expect(layerWeight(LAYERS.drums + 0.2, LAYERS.drums)).toBe(1);
  });

  it("hợp âm đổi mỗi ô nhịp, vòng 4 ô; đánh lớn thì đổi sang vòng kịch tính", () => {
    const bars = [0, 1, 2, 3].map((b) => chordAt(b * STEPS_PER_BAR, 0).join(","));
    expect(new Set(bars).size).toBe(4);
    expect(chordAt(4 * STEPS_PER_BAR, 0)).toEqual(chordAt(0, 0));
    expect(chordAt(3 * STEPS_PER_BAR, 1)).not.toEqual(chordAt(3 * STEPS_PER_BAR, 0));
  });

  it("tất định và âm lượng hợp lý (không nốt nào quá to)", () => {
    for (let step = 0; step < 64; step++) {
      expect(composeStep(step, 0.7)).toEqual(composeStep(step, 0.7));
      for (const n of composeStep(step, 1)) {
        expect(n.gain).toBeGreaterThan(0);
        expect(n.gain).toBeLessThanOrEqual(0.35);
        expect(n.dur).toBeGreaterThan(0);
      }
    }
  });
});
