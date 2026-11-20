import type { UnitSpec } from "../types";

/** Bộ binh. */
export const INFANTRY_UNITS: Record<"sniper", UnitSpec> = {
  sniper: {
    id: "sniper",
    kind: "unit",
    name: "Tiểu Đội Bắn Tỉa",
    short: "Bắn Tỉa",
    code: "SNP",
    hotkey: "B",
    role: "5 xạ thủ bắn tỉa trên một đế: bắn xa, diệt bộ binh và xe nhẹ, sợ súng máy và pháo.",
    domain: "ground",
    group: "BB",
    batch: 1,
    turnRate: 240,
    mvp: false,
    cost: { iron: 120, oil: 0 },
    buildTime: 6,
    builtAt: "hq",
    hp: 300,
    armorClass: "inf",
    speed: 3.2,
    accel: 8,
    brake: 10,
    mobility: "foot",
    sight: 30,
    radius: 2.2,
    bodyR: 3,
    troops: 5,
    captureWeight: 1,
    weapon: { name: "Súng bắn tỉa 12,7mm", dmgGround: 60, dmgAir: 0, range: 28, cooldown: 3, dmgType: "normal", splash: 0, visual: "bullet", traverse: 180 },
    features: [
      "Bộ binh: 5 người trên một đế Ø 6 m. Máu tụt thì mất dần người (chỉ là hình, sức bắn giữ nguyên).",
      "Tầm bắn 28 m, xa nhất trong quân trực xạ: bắn tỉa từ ngoài tầm súng máy Lynx (15,5 m).",
      "Giáp Bộ binh: súng máy và đạn nổ diệt mạnh, đạn xuyên giáp gần như vô hại.",
      "Chạm mềm với xe: chen được tới nửa đế, lọt qua giữa hai xe đứng sát nhau; đi bộ nên rừng, bùn, bãi cạn chậm ít hơn xe.",
      "Không bắn được máy bay."
    ],
    beats: ["hauler"],
    fears: ["lynx", "artillery", "titan"]
  }
};
