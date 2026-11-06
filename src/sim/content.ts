/**
 * Nội dung game: chỉ số của mọi binh chủng, công trình và luật chơi.
 *
 * Đây là DỮ LIỆU THUẦN: không import Three.js hay DOM. Lõi mô phỏng (sim), AI và giao diện
 * đều đọc chung một nguồn này, nên con số trên Xưởng Mô Hình không bao giờ lệch với trận đấu.
 *
 * ⚠️ Mọi con số hiện là SỐ TẠM cho bản demo MVP (xem Docs/design/MVP_DESIGN.md). Sẽ bàn kỹ lại sau bản demo.
 * Đơn vị: mét, giây, m/s. Bản đồ MVP rộng 160 × 160 m.
 */

export type Faction = "lam" | "do";
/** Phe trong lõi mô phỏng: 0 = Liên Minh Lam, 1 = Tập Đoàn Đỏ. */
export type Side = 0 | 1;
export const FACTION_OF: readonly [Faction, Faction] = ["lam", "do"];
export const SIDE_NAME: readonly [string, string] = ["Liên Minh Lam", "Tập Đoàn Đỏ"];

export type Domain = "ground" | "air";
export type TargetMask = "ground" | "air" | "both" | "none";

export type Res = "iron" | "oil";
export const RES_NAME: Record<Res, string> = { iron: "Sắt", oil: "Dầu" };

export interface Cost {
  iron: number;
  oil: number;
}

export type UnitId = "commander" | "hauler" | "lynx" | "titan" | "skyguard" | "rocket" | "artillery" | "falcon" | "valkyrie";

export type BuildingId =
  | "hq"
  | "factory"
  | "airfield"
  | "turret"
  | "power-plant"
  | "power-pylon"
  | "battery"
  | "radar"
  | "outpost"
  | "oil-extractor"
  | "ammo-depot"
  | "aa-ciws"
  | "aa-sam"
  | "aa-emp";

export type EntityId = UnitId | BuildingId;

/**
 * Lớp giáp (Docs/design/ARMY_DESIGN.md Bước 3). Mỗi thực thể thuộc đúng một lớp; hệ số sát thương nằm ở RULES.damageMatrix.
 * Nhẹ: xe nhẹ, máy bay nhẹ, hạ tầng lộ thiên · Nặng: xe tăng, máy bay ném bom · Công sự: tháp phòng thủ ·
 * Kết cấu: nhà xưởng, căn cứ, công trình lớn.
 */
export type ArmorClass = "light" | "heavy" | "fort" | "struct";
export const ARMOR_NAME: Record<ArmorClass, string> = { light: "Nhẹ", heavy: "Nặng", fort: "Công sự", struct: "Kết cấu" };

/** Loại đạn: Thường (súng máy, pháo nhỏ), Xuyên giáp, Nổ (tên lửa, bom, đạn nổ). */
export type DmgType = "normal" | "ap" | "he";
/** Kiểu di chuyển của xe mặt đất: quyết định hệ số tốc độ trên từng loại địa hình (src/sim/maps/terrain.ts). */
export type Mobility = "wheel" | "track";
export const MOBILITY_NAME: Record<Mobility, string> = { wheel: "Bánh", track: "Xích" };
export const DMG_NAME: Record<DmgType, string> = { normal: "Thường", ap: "Xuyên giáp", he: "Nổ" };

/** Kiểu đạn để vẽ hiệu ứng và tính tốc độ bay của đạn ("rocket": tên lửa loạt bay cầu vồng cao, kéo vệt khói). */
export type WeaponVisual = "bullet" | "cannon" | "missile" | "rocket" | "bomb" | "pulse";

export interface WeaponSpec {
  name: string;
  /** Sát thương mỗi phát lên mục tiêu mặt đất / trên không (0 = không bắn được). */
  dmgGround: number;
  dmgAir: number;
  /** Tầm bắn (m). */
  range: number;
  /** Giây giữa 2 phát. */
  cooldown: number;
  /** Loại đạn: tra hệ số trong RULES.damageMatrix theo lớp giáp của mục tiêu. */
  dmgType: DmgType;
  /** Bán kính nổ lan (m), 0 = trúng đơn mục tiêu. Độc lập với loại đạn. */
  splash: number;
  /** Công phá: cắt được đường ray, phá mìn (khi các thứ đó có trong game). Không ảnh hưởng sát thương. */
  breach?: boolean;
  visual: WeaponVisual;

  // ---- Cơ chế bắn (Docs/design/ARMY_DESIGN.md). Tất cả là tùy chọn và dùng chung: quân nào khai báo thì có. ----
  /** Máy bay: chỉ bắn khi mũi lệch mục tiêu không quá chừng này (độ). Pháo gắn cố định ở mũi cần góc hẹp. Mặc định 37°. */
  fireArc?: number;
  /** Số nòng bắn cùng lúc (súng đôi hai bên cánh): mỗi lần bắn ra chừng này viên song song, mỗi viên đủ sát thương. */
  barrels?: number;
  /** Bắn theo loạt: `shots` viên cách nhau `interval` giây; bắn hết loạt mới nạp lại `cooldown` giây. */
  burst?: { shots: number; interval: number };
  /** Tầm bắn tối thiểu (m): mục tiêu đứng gần hơn thì không bắn được (Pháo). */
  minRange?: number;
  /** Lộ vị trí: bắn xong thì đối phương nhìn thấy xuyên sương mù trong chừng này giây (Pháo). */
  reveal?: number;
  /**
   * Địa lợi tầm cao: nhân phần thưởng tầm bắn do đứng trên cao (`RULES.terrain.rangePerM`, trần `rangeMax`) lên chừng này lần.
   * Bỏ trống = 1 (như mọi quân). Pháo = 2: đứng trên đồi được gấp đôi phần cộng tầm của quân thường.
   */
  heightBonus?: number;
  /** Độ tản (m): điểm rơi lệch ngẫu nhiên trong vòng tròn bán kính này, không bám mục tiêu (Tên Lửa Loạt). */
  scatter?: number;
  /** Vừa chạy vừa bắn: sát thương giảm `dmg` (tỉ lệ) và mỗi viên có xác suất `miss` bắn trượt (SkyGuard). */
  movePenalty?: { dmg: number; miss: number };
  /**
   * Triển khai (Lockdown): đứng yên đủ `time` giây thì tầm bắn +`range`, sát thương +`dmg` (tỉ lệ).
   * `required`: chưa triển khai xong thì không bắn được (dàn phóng phải dựng xong mới xả loạt).
   */
  deploy?: { time: number; range: number; dmg: number; required?: boolean };
  /** Tháp pháo xoay chậm (độ/giây): phải quay nòng về mục tiêu rồi mới bắn được (Titan). */
  traverse?: number;
  /** Ném bom rải thảm: bom rơi theo đường bay thẳng phía trước máy bay, không bám mục tiêu (Valkyrie). */
  carpet?: boolean;
  /** Đạn pháo bay cầu vồng: hệ thống phòng thủ điểm (pointDefense) bắn chặn được. */
  interceptable?: boolean;
}

export interface UnitSpec {
  id: UnitId;
  kind: "unit";
  name: string;
  /** Tên ngắn cho HUD. */
  short: string;
  code: string;
  hotkey: string;
  role: string;
  domain: Domain;
  /** Có trong bản MVP không. */
  mvp: boolean;
  /** undefined = không chế tạo được (Xe Tư Lệnh có sẵn từ đầu trận). */
  cost?: Cost;
  buildTime?: number;
  builtAt?: BuildingId;
  hp: number;
  armorClass: ArmorClass;
  /** m/s trên cỏ, đất bằng; máy bay có thêm tốc độ tối thiểu. */
  speed: number;
  /** Xe mặt đất: bánh hay xích (hệ số tốc độ theo loại địa hình, terrain.ts). Máy bay bỏ trống. */
  mobility?: Mobility;
  /** Kháng làm chậm: bỏ qua phần làm chậm của bùn, cát, tuyết, rừng, bãi cạn (Xe Tư Lệnh). Độ dốc vẫn làm chậm. */
  slowResist?: boolean;
  minSpeed?: number;
  /** Tầm nhìn (m) cho sương mù chiến tranh. */
  sight: number;
  /** Bán kính va chạm / chọn (m). */
  radius: number;
  /** Sức chiếm mỏ (0 = không chiếm được). */
  captureWeight: number;
  weapon?: WeaponSpec;
  /**
   * Vũ khí phụ có cơ số đạn hạn chế mỗi lần xuất kích (`ammo` viên), hạ cánh xuống bãi đậu thì nạp lại đầy.
   * Bắn độc lập với vũ khí chính (nhịp nạp riêng), nhắm cùng mục tiêu (Falcon: 2 tên lửa nổ).
   */
  secondary?: WeaponSpec & { ammo: number };
  /** Nhiên liệu máy bay: dung tích (L), đốt (L/s), tốc độ ngoặt (độ/s). */
  fuel?: { tank: number; burn: number; turnRate: number };
  /** Sức chở của Xe Vận Tải. */
  cargo?: number;
  /** Hào quang chỉ huy: bán kính và hệ số tốc bắn cho quân đồng minh. */
  aura?: { radius: number; fireRate: number };
  /** Giáp mặt trước: đạn tới từ phía trước thân xe (trong góc ±`arc` độ) giảm `reduce` sát thương (Titan). */
  frontArmor?: { reduce: number; arc: number };
  /** Máy bay bổ nhào: lao xuống độ cao này (m) khi vào lượt bắn mục tiêu mặt đất, bắn xong kéo lên lại (Falcon). */
  diveAlt?: number;
  /** Phòng thủ điểm: chặn `charges` viên đạn pháo (interceptable); mỗi `recharge` giây hồi 1 lượt (Xe Tư Lệnh). */
  pointDefense?: { charges: number; recharge: number };
  features: string[];
  beats: EntityId[];
  fears: EntityId[];
}

export interface BuildingSpec {
  id: BuildingId;
  kind: "building";
  name: string;
  label: string;
  role: string;
  mvp: boolean;
  /** undefined = có sẵn trên bản đồ, không xây được. */
  cost?: Cost;
  buildTime?: number;
  hp: number;
  armorClass: ArmorClass;
  sight: number;
  /** Nửa kích thước nền móng theo X và Z (m): ô lưới bị chiếm, không đi xuyên được. */
  half: readonly [number, number];
  produces?: UnitId[];
  /** MW: dương = phát điện, âm = tiêu thụ. */
  power: number;
  /** Nhà Máy Điện: Dầu đốt mỗi giây để phát điện (hết Dầu thì không phát). */
  oilBurn?: number;
  /** Mở vùng xây dựng bán kính này (m) quanh công trình. Chỉ HQ, Nhà Máy Điện và Cột Điện có. */
  zone?: number;
  /** Trạm Radar: tầm nhìn xuyên sương mù khi đủ điện (m). */
  radarSight?: number;
  /** Công trình tiêu thụ điện: thứ tự được cấp điện khi thiếu (1 = trước nhất). Hậu cần tự phân. */
  priority?: 1 | 2 | 3;
  /** Trạm Tích Điện: dung lượng (MJ = MW × giây), nạp và xả tối đa (MW). */
  storage?: number;
  chargeMax?: number;
  dischargeMax?: number;
  strictPower?: boolean;
  weapon?: WeaponSpec;
  magazine?: number;
  features: string[];
}

export type EntitySpec = UnitSpec | BuildingSpec;

/** Luật chơi MVP (số tạm). */
export const RULES = {
  tickRate: 10,
  startIron: 500,
  startOil: 100,
  /** Thu nhập gốc của Tổng Hành Dinh (Sắt/giây). */
  hqTrickle: 2,
  unitCap: 40,
  /** Điện: hiệu suất = phát / tiêu thụ. Radar cần ít nhất mức này để chạy. */
  power: {
    radarMin: 0.5,
    turretMin: 0.1,
    /** Hậu cần chỉ đốt Dầu để nạp pin khi kho Dầu còn trên mức này. */
    chargeOilReserve: 250,
    /** Báo trước khi Dầu cho Nhà Máy Điện / pin dự trữ chỉ còn đủ chừng này giây. */
    warnOilSeconds: 45,
    warnBatterySeconds: 25
  },
  /**
   * Ma trận Giáp × Đạn: hệ số nhân sát thương [lớp giáp][loại đạn]. Docs/design/ARMY_DESIGN.md Bước 3 mục 2.
   * Hàng Công sự lúc đầu gần giống hàng Nặng, nhưng cố ý tách để chỉnh riêng.
   */
  damageMatrix: {
    light: { normal: 1, ap: 0.6, he: 1.25 },
    heavy: { normal: 0.5, ap: 1.5, he: 0.6 },
    fort: { normal: 0.25, ap: 1.5, he: 0.6 },
    struct: { normal: 0.25, ap: 1, he: 1.5 }
  } as Record<ArmorClass, Record<DmgType, number>>,
  /**
   * Địa hình 3D chiến thuật (AGENTS.md "Nghĩa của 3D"): độ cao tính từ mặt thung lũng (0 m).
   * Đứng cao được cộng tầm nhìn / tầm bắn theo mỗi mét, có trần. Đồi và đá che tầm nhìn của quân mặt đất.
   */
  terrain: {
    /** Mắt quân mặt đất / công trình cao hơn mặt đất (m); điểm nhìn thấy được của mục tiêu (m). */
    eyeUnit: 1.6,
    eyeBuilding: 3,
    targetHeight: 1,
    sightPerM: 0.06,
    sightMax: 0.3,
    rangePerM: 0.05,
    rangeMax: 0.2,
    /** Lên dốc chậm dần: hệ số = max(slopeMin, 1 − slopeSlow × độ dốc), độ dốc đo dọc hướng đi. Xuống dốc không nhanh hơn. */
    slopeSlow: 0.7,
    slopeMin: 0.4,
    /** Đo độ dốc giữa chỗ xe đứng và điểm phía trước cách chừng này (m). */
    slopeProbe: 2,
    /**
     * Che chắn (rừng: TERRAIN.cover) có tác dụng với loại đạn nào: 1 = giảm đủ, 0 = không che được.
     * Đạn Nổ (pháo, bom) không bị che: pháo là khắc tinh của quân nấp rừng.
     */
    coverBy: { normal: 1, ap: 1, he: 0 }
  },
  /**
   * Cựu binh (Bản cập nhật vui): quân nhận kinh nghiệm theo GIÁ TRỊ phần sát thương đã gây cho địch
   * (hạ trọn một chiếc Titan 350 Sắt = 350 kinh nghiệm, chia cho mọi xe cùng bắn theo phần sát thương).
   * Lên cấp khi kinh nghiệm đạt `ranks[i]` × giá trị của chính mình (quân rẻ lên cấp nhanh hơn).
   * Mỗi cấp +`dmgPerRank` sát thương; từ cấp `regenRank` tự hồi máu khi đã `regenDelay` giây không trúng đạn.
   */
  veterancy: {
    ranks: [1, 3, 6],
    dmgPerRank: 0.15,
    regenRank: 3,
    regenPerSec: 0.015,
    regenDelay: 5,
    /** Giá trị = Sắt + Dầu × oilWeight; thứ không có giá (Xe Tư Lệnh, Tổng Hành Dinh) tính bằng noCostValue. */
    oilWeight: 2,
    noCostValue: 500
  },
  /**
   * Xác quân (Bản cập nhật vui): xe / máy bay bị hạ để lại xác chứa Sắt = `share` × giá trị, nằm lại `seconds` giây.
   * Chỉ XE VẬN TẢI trục vớt được (việc của hậu cần, không phải "chạm là có"): tới cách xác `reach` m, cẩu lên xe
   * mất `load` giây, mỗi chuyến kéo một xác, chở về Tổng Hành Dinh, dỡ hàng xong mới cộng Sắt. Xác của phe nào cũng kéo được.
   * Hậu cần TỰ điều tối đa `autoMax` xe rảnh mỗi phe tới kéo xác nằm trong vùng hậu cần (vùng xây dựng + quanh mỏ
   * phe mình `mineArea` m) khi không thấy quân địch có vũ khí trong `threat` m quanh xác. Xác ở xa: Tư lệnh chỉ định.
   */
  salvage: { share: 0.3, seconds: 90, load: 3, reach: 3.2, autoMax: 2, mineArea: 18, threat: 22 },
  /** Đài Liên Lạc (điểm chiếm, Bản cập nhật vui): chiếm như mỏ; phe giữ đài nhìn xa quanh đài (cột ăng-ten cao, không bị đồi che). */
  uplink: { sight: 24 },
  /**
   * Kỹ năng: MỌI kỹ năng thuộc về một binh chủng có thật, phải đúc ra và có hình thù (quyết định 05/11/2026):
   * không có "điểm chỉ huy" để gọi đòn từ trên trời như game tham chiếu. Rải thảm là của Xe Tên Lửa Loạt (vũ khí
   * trong UNITS.rocket), Tổng động viên là của Xe Tư Lệnh.
   */
  abilities: {
    /** Tổng động viên (Xe Tư Lệnh): quân trong bán kính hào quang chạy nhanh hơn `speed`, bắn nhanh hơn `fireRate`. */
    mobilize: { cooldown: 60, duration: 10, speed: 0.3, fireRate: 0.2 }
  },
  sellRefund: 0.5,
  queueMax: 5,
  captureRadius: 8,
  captureSeconds: 10,
  captureMaxWeight: 3,
  monopolySeconds: 30,
  mineAmount: { iron: 6000, oil: 3000 } as Record<Res, number>,
  haulerMineRate: 20,
  haulerUnload: 1.5,
  mineSlots: 3,
  air: {
    cruiseAlt: 12,
    /** Tốc độ lên / xuống độ cao (m/s) khi bổ nhào và kéo lên. */
    climbRate: 5,
    /** Tỉ lệ dầu tối thiểu để cất cánh. */
    takeoffMin: 0.35,
    /** Mức Bingo: tự bay về Sân Đáp. */
    bingo: 0.24,
    /** Lít/giây khi nạp ở bãi đậu. */
    refuelRate: 10,
    repairRate: 25,
    /** 1 Dầu trong kho = 1 lít nhiên liệu. */
    oilPerLiter: 1,
    /** Số bãi đậu mỗi Sân Đáp (vị trí: `PAD_OFFSETS` cuối file này). */
    pads: 6
  }
} as const;

export const UNITS: Record<UnitId, UnitSpec> = {
  commander: {
    id: "commander",
    kind: "unit",
    name: "Xe Tư Lệnh Chiến Thuật",
    short: "Tư Lệnh",
    code: "CMD",
    hotkey: "F1",
    role: "Trái tim của binh đoàn. Mất Xe Tư Lệnh là thua trận.",
    domain: "ground",
    mvp: true,
    hp: 2025,
    armorClass: "heavy",
    speed: 5,
    mobility: "wheel",
    slowResist: true,
    sight: 26,
    radius: 1.9,
    captureWeight: 2.2,
    weapon: { name: "Pháo kép 40mm", dmgGround: 44, dmgAir: 32, range: 20, cooldown: 1.05, dmgType: "normal", splash: 2, visual: "cannon" },
    aura: { radius: 13.5, fireRate: 1.18 },
    pointDefense: { charges: 2, recharge: 20 },
    features: [
      "Hào quang chỉ huy (13.5m): quân đồng minh xung quanh bắn nhanh hơn 18%.",
      "Chiếm mỏ nhanh gấp 2.2 lần một xe thường.",
      "Phòng thủ điểm: bắn chặn 2 viên đạn pháo đầu tiên, mỗi 20 giây hồi 1 lượt.",
      "Có từ đầu trận, không chế tạo thêm được. Bị diệt là thua ngay.",
      "Tổng động viên [R]: quân trong vòng hào quang chạy nhanh hơn 30%, bắn nhanh hơn 20% trong 10 giây; 60 giây dùng lại được."
    ],
    beats: ["lynx"],
    fears: ["titan", "falcon"]
  },
  hauler: {
    id: "hauler",
    kind: "unit",
    name: "Xe Vận Tải",
    short: "Xe Vận Tải",
    code: "HAUL",
    hotkey: "V",
    role: "Đào Sắt hoặc Dầu ở mỏ phe mình rồi chở về Tổng Hành Dinh.",
    domain: "ground",
    mvp: true,
    cost: { iron: 150, oil: 0 },
    buildTime: 6,
    builtAt: "hq",
    hp: 450,
    armorClass: "light",
    speed: 4.6,
    mobility: "wheel",
    sight: 16,
    radius: 1.7,
    captureWeight: 0,
    cargo: 100,
    features: [
      "Tự động chạy ra mỏ phe mình gần nhất, đào đầy 100 rồi chở về Tổng Hành Dinh.",
      "Đang chọn xe mà chạm vào một mỏ thì xe sẽ khai thác đúng mỏ đó.",
      "Trục vớt: kéo xác quân (của cả hai phe) về Tổng Hành Dinh để lấy Sắt, mỗi chuyến một xác. Xác trong vùng căn cứ và quanh mỏ thì hậu cần tự điều xe rảnh đi kéo; xác ở xa thì chọn xe rồi chạm vào xác.",
      "Không vũ khí và chậm: Lynx và Falcon địch luôn săn nó."
    ],
    beats: [],
    fears: ["lynx", "falcon"]
  },
  lynx: {
    id: "lynx",
    kind: "unit",
    name: "Thiết Giáp Trinh Sát Lynx",
    short: "Lynx",
    code: "LYNX",
    hotkey: "Z",
    role: "Xe nhanh nhất mặt đất. Trinh sát, chiếm mỏ, săn xe vận tải.",
    domain: "ground",
    mvp: true,
    cost: { iron: 150, oil: 0 },
    buildTime: 4.5,
    builtAt: "factory",
    hp: 510,
    armorClass: "light",
    speed: 7.2,
    mobility: "wheel",
    sight: 28,
    radius: 1.4,
    captureWeight: 1,
    weapon: { name: "Súng máy 20mm", dmgGround: 32, dmgAir: 14, range: 15.5, cooldown: 0.65, dmgType: "normal", splash: 0, visual: "bullet" },
    features: [
      "Nhanh nhất trên mặt đất và nhìn xa: đến mỏ trung lập trước mọi đối thủ.",
      "Săn Xe Vận Tải địch để cắt kinh tế.",
      "Giáp mỏng: tránh đối đầu trực diện với Titan.",
      "Súng máy bắn được máy bay nhưng yếu: 2–3 chiếc mới hạ được một Falcon."
    ],
    beats: ["skyguard", "hauler"],
    fears: ["titan", "falcon"]
  },
  titan: {
    id: "titan",
    kind: "unit",
    name: "Xe Tăng Chủ Lực Titan",
    short: "Titan",
    code: "MBT",
    hotkey: "X",
    role: "Giáp dày, pháo 120mm nổ lan. Mũi nhọn công phá.",
    domain: "ground",
    mvp: true,
    cost: { iron: 350, oil: 0 },
    buildTime: 7.5,
    builtAt: "factory",
    hp: 960,
    armorClass: "heavy",
    speed: 4.4,
    mobility: "track",
    sight: 22,
    radius: 1.9,
    captureWeight: 1,
    weapon: { name: "Pháo chính 120mm", dmgGround: 136, dmgAir: 0, range: 19.5, cooldown: 3, dmgType: "he", splash: 1, visual: "cannon", traverse: 60 },
    frontArmor: { reduce: 0.25, arc: 60 },
    features: [
      "Đạn nổ 120mm: diệt xe nhẹ, san nhà xưởng; nổ lan nhỏ (1m) nên chỉ trúng cả cụm khi địch dồn sát.",
      "Giáp Nặng: súng máy chỉ gây một nửa sát thương. Là lá chắn đi đầu đội hình.",
      "Giáp góc nghiêng: đạn tới từ mặt trước (±60°) giảm thêm 25%. Bị đánh vào sườn và đuôi thì không.",
      "Tháp pháo xoay chậm (60°/giây): phải quay nòng về mục tiêu rồi mới bắn.",
      "Không bắn được máy bay: cần SkyGuard đi kèm."
    ],
    beats: ["lynx", "skyguard", "hq", "factory"],
    fears: ["falcon"]
  },
  skyguard: {
    id: "skyguard",
    kind: "unit",
    name: "Phòng Không Cơ Động SkyGuard",
    short: "SkyGuard",
    code: "AA-MOB",
    hotkey: "C",
    role: "Tên lửa phòng không tự hành, hộ tống đoàn xe tăng.",
    domain: "ground",
    mvp: true,
    cost: { iron: 250, oil: 0 },
    buildTime: 6,
    builtAt: "factory",
    hp: 645,
    armorClass: "light",
    speed: 5.2,
    mobility: "track",
    sight: 28,
    radius: 1.6,
    captureWeight: 1,
    weapon: {
      name: "Loạt 5 tên lửa tầm nhiệt",
      dmgGround: 0,
      dmgAir: 30,
      range: 26.5,
      cooldown: 2.4,
      dmgType: "he",
      splash: 1.5,
      visual: "missile",
      burst: { shots: 5, interval: 0.15 },
      movePenalty: { dmg: 0.25, miss: 0.3 },
      deploy: { time: 1.2, range: 0.25, dmg: 0.33 }
    },
    features: [
      "Câu trả lời cho không quân: tầm bắn 26.5m, xa hơn mọi pháo mặt đất.",
      "Bắn theo loạt 5 tên lửa rồi nạp lại 2.4 giây.",
      "Lockdown: đứng yên 1.2 giây thì hạ chân chống, tầm +25% và sát thương +33%.",
      "Vừa chạy vừa bắn: sát thương -25% và 30% tên lửa bắn trượt.",
      "Không cần lưới điện hay đường ray: phòng không mang theo được ra tiền tuyến.",
      "Chỉ bắn máy bay: bị xe tăng áp sát thì vô phương chống đỡ."
    ],
    beats: ["falcon"],
    fears: ["titan", "lynx"]
  },
  rocket: {
    id: "rocket",
    kind: "unit",
    name: "Xe Tên Lửa Loạt",
    short: "Tên Lửa Loạt",
    code: "MLRS",
    hotkey: "G",
    role: "Dàn phóng tên lửa loạt: chọn một vùng, xe dựng dàn rồi xả cả loạt 12 quả. San phẳng cụm xe giáp mỏng và nhà xưởng.",
    domain: "ground",
    mvp: true,
    cost: { iron: 300, oil: 40 },
    buildTime: 9,
    builtAt: "factory",
    hp: 480,
    armorClass: "light",
    speed: 4.3,
    mobility: "wheel",
    sight: 20,
    radius: 1.8,
    captureWeight: 1,
    weapon: {
      name: "Dàn 12 tên lửa 122mm",
      dmgGround: 50,
      dmgAir: 0,
      range: 24,
      cooldown: 15,
      dmgType: "he",
      splash: 2.8,
      breach: true,
      visual: "rocket",
      burst: { shots: 12, interval: 0.2 },
      minRange: 8,
      scatter: 5,
      deploy: { time: 1.5, range: 0, dmg: 0, required: true },
      interceptable: true
    },
    features: [
      "Rải thảm [T]: chọn một vùng tròn; xe tự chạy tới tầm, dựng dàn phóng 1.5 giây rồi xả hết 12 quả trong khoảng 2 giây, sau đó nạp lại 15 giây.",
      "Tên lửa rơi tản trong vòng 5 m, nổ lan 2.8 m, đạn Nổ công phá: mạnh với cụm xe giáp mỏng và nhà xưởng, yếu với Titan và tháp phòng thủ.",
      "Rải thảm không cần nhìn thấy điểm bắn: bắn được vào sương mù, ví dụ công trình địch đã phát hiện.",
      "Tầm 24 m, xa hơn tháp phòng thủ một chút; không bắn được mục tiêu gần hơn 8 m.",
      "Lúc dựng dàn và nạp đạn là lúc đứng im: bị Lynx áp sát hay Falcon lao xuống thì bất lực. Không bắn được máy bay.",
      "Tên lửa bay cầu vồng: phòng thủ điểm của Xe Tư Lệnh chặn được."
    ],
    beats: ["skyguard", "hauler", "factory"],
    fears: ["lynx", "falcon"]
  },
  falcon: {
    id: "falcon",
    kind: "unit",
    name: "Tiêm Kích Đa Nhiệm Falcon",
    short: "Falcon",
    code: "JET",
    hotkey: "N",
    role: "Đòn đánh mạnh nhất trận, nhưng chỉ bay được ít giây rồi phải về nạp Dầu.",
    domain: "air",
    mvp: true,
    cost: { iron: 300, oil: 50 },
    buildTime: 6.5,
    builtAt: "airfield",
    hp: 540,
    armorClass: "light",
    speed: 22,
    minSpeed: 12,
    sight: 30,
    radius: 1.8,
    captureWeight: 0,
    weapon: {
      name: "Pháo đôi 30mm",
      dmgGround: 22,
      dmgAir: 26,
      range: 22,
      cooldown: 0.8,
      dmgType: "ap",
      splash: 0,
      visual: "bullet",
      barrels: 2,
      fireArc: 8,
      burst: { shots: 8, interval: 0.1 }
    },
    secondary: {
      name: "Tên lửa nổ",
      dmgGround: 90,
      dmgAir: 110,
      range: 26,
      cooldown: 1,
      dmgType: "he",
      splash: 2,
      visual: "missile",
      fireArc: 30,
      ammo: 2
    },
    fuel: { tank: 40, burn: 1.2, turnRate: 200 },
    diveAlt: 9,
    features: [
      "Pháo 30mm xuyên giáp: diệt xe tăng và máy bay ném bom; bắn xe nhẹ kém hiệu quả.",
      "Pháo đôi hai bên cánh: bổ nhào xả một loạt 8 cặp đạn, kéo ra lấy khoảng cách rồi quay lại lượt sau (nạp 0.8 giây).",
      "2 tên lửa nổ mỗi lần xuất kích (diệt xe nhẹ, máy bay, công trình); hạ cánh là nạp lại.",
      "Nhanh (22 m/s) và ngoặt gấp nhất game (200°/giây). Bổ nhào xuống thấp khi bắn mục tiêu mặt đất, rồi kéo lên lại độ cao bay.",
      "Bình dầu 40L, đốt 1.2L/s: khoảng 33 giây bay mỗi lần xuất kích.",
      "Chỉ cất cánh khi còn ít nhất 35% dầu; xuống 24% (hoặc vừa đủ dầu bay về nếu đang ở xa) thì tự bay về Sân Đáp.",
      "Nạp dầu khoảng 4 giây tại bãi đậu, trừ vào kho Dầu. Kho cạn thì máy bay nằm sân.",
      "Luôn giữ dầu dự trữ đủ bay về; chỉ rơi khi không còn Sân Đáp nào của phe mình."
    ],
    beats: ["titan", "hauler", "lynx"],
    fears: ["skyguard", "turret"]
  },
  artillery: {
    id: "artillery",
    kind: "unit",
    name: "Pháo Tự Hành",
    short: "Pháo",
    code: "SPG",
    hotkey: "F",
    role: "Pháo nòng lớn tầm cực xa: hạ bệ chữ X, duỗi nòng rồi mới bắn. Một viên xuyên giáp phá công sự.",
    domain: "ground",
    mvp: true,
    // MỌI SỐ LÀ SỐ TẠM (Docs/design/ARMY_DESIGN.md mục 8), chờ buổi cân bằng
    cost: { iron: 350, oil: 30 },
    buildTime: 9,
    builtAt: "factory",
    hp: 480,
    armorClass: "light",
    speed: 3.4,
    mobility: "track",
    sight: 18,
    radius: 2.7, // mô hình phóng to ×1,5 (06/11/2026)
    captureWeight: 1,
    weapon: {
      name: "Pháo 155mm nòng dài",
      dmgGround: 150,
      dmgAir: 0,
      range: 38,
      cooldown: 5,
      dmgType: "ap",
      splash: 1.5,
      breach: true,
      visual: "cannon",
      minRange: 10,
      reveal: 2,
      heightBonus: 2,
      deploy: { time: 2, range: 0, dmg: 0, required: true }
    },
    features: [
      "Tầm bắn 38m, xa nhất trên mặt đất; cần quân khác nhìn thấy mục tiêu hộ.",
      "Phải hạ bệ chữ X và duỗi nòng 2 giây mới bắn được; không bắn được mục tiêu gần hơn 10m.",
      "Mỗi phát bắn lộ vị trí 2 giây xuyên sương mù.",
      "Địa lợi tầm cao: đứng trên đồi được gấp đôi phần cộng tầm bắn của quân thường (tối đa +40%).",
      "Một viên xuyên giáp, công phá: khắc Titan và tháp phòng thủ."
    ],
    beats: ["titan", "turret"],
    fears: ["lynx", "falcon"]
  },
  valkyrie: {
    id: "valkyrie",
    kind: "unit",
    name: "Cường Kích Ném Bom Valkyrie",
    short: "Valkyrie",
    code: "BOMB",
    hotkey: "M",
    role: "Pháo đài bay. Rải chuỗi bom phá hủy căn cứ. (Sau MVP)",
    domain: "air",
    mvp: false,
    cost: { iron: 230, oil: 90 },
    buildTime: 9,
    builtAt: "airfield",
    hp: 870,
    armorClass: "heavy",
    speed: 14,
    minSpeed: 10,
    sight: 26,
    radius: 2.4,
    captureWeight: 0,
    weapon: {
      name: "Chuỗi 6 bom rải thảm",
      dmgGround: 98,
      dmgAir: 0,
      range: 23,
      cooldown: 6,
      dmgType: "he",
      splash: 4.6,
      breach: true,
      visual: "bomb",
      burst: { shots: 6, interval: 0.25 },
      carpet: true
    },
    fuel: { tank: 60, burn: 1.4, turnRate: 76 },
    features: [
      "Rải thảm: thả chuỗi 6 quả bom nổ liên hoàn dọc đường bay thẳng, nổ lan 4.6m. Bom công phá: san phẳng nhà xưởng.",
      "Mỗi lượt ném xong phải vòng lại nạp 6 giây.",
      "Mục tiêu lý tưởng: Xưởng Xe, Sân Đáp và cụm xe tăng Titan.",
      "Ngoặt chậm: cần tiêm kích hộ tống."
    ],
    beats: ["titan", "factory"],
    fears: ["falcon", "skyguard", "turret"]
  }
};

export const BUILDINGS: Record<BuildingId, BuildingSpec> = {
  hq: {
    id: "hq",
    kind: "building",
    name: "Tổng Hành Dinh",
    label: "HQ",
    role: "Đầu não căn cứ: đúc Xe Vận Tải và nhận Sắt, Dầu chở về.",
    mvp: true,
    hp: 3600,
    armorClass: "struct",
    sight: 28,
    half: [3.4, 3.4],
    produces: ["hauler"],
    power: 20,
    zone: 24,
    weapon: { name: "Pháo kép tự vệ", dmgGround: 40, dmgAir: 28, range: 22, cooldown: 1.2, dmgType: "normal", splash: 1.5, visual: "cannon" },
    features: [
      "Nơi Xe Vận Tải dỡ hàng: Sắt và Dầu chỉ vào kho khi được chở về đây.",
      "Thu nhập gốc +2 Sắt mỗi giây, để bên mất hết mỏ vẫn còn đường gỡ.",
      "Phát điện nền +20 MW và mở vùng xây dựng 24m.",
      "Có pháo kép tự vệ bắn cả mặt đất lẫn trên không."
    ]
  },
  factory: {
    id: "factory",
    kind: "building",
    name: "Xưởng Xe",
    label: "XƯỞNG XE",
    role: "Đúc quân mặt đất: Lynx, Titan, SkyGuard, Xe Tên Lửa Loạt.",
    mvp: true,
    cost: { iron: 300, oil: 0 },
    buildTime: 10,
    hp: 1000,
    armorClass: "struct",
    sight: 16,
    half: [3.4, 3],
    produces: ["lynx", "titan", "skyguard", "rocket", "artillery"],
    power: -10,
    priority: 3,
    features: ["Hàng chờ tối đa 5 xe.", "Đặt điểm tập kết để xe mới tự chạy ra tiền tuyến.", "Xây thêm xưởng để đúc quân nhanh hơn."]
  },
  airfield: {
    id: "airfield",
    kind: "building",
    name: "Sân Đáp Không Quân",
    label: "6 BÃI ĐÁP",
    role: "Đúc Falcon; nơi máy bay cất, hạ cánh, nạp Dầu và sửa chữa.",
    mvp: true,
    cost: { iron: 400, oil: 0 },
    buildTime: 12,
    hp: 1150,
    armorClass: "struct",
    sight: 18,
    half: [7.6, 8.6],
    produces: ["falcon"],
    power: -15,
    priority: 2,
    features: [
      "6 bãi đậu hai bên đường băng: mỗi sân nuôi được tối đa 6 máy bay.",
      "Máy bay đậu được nạp 10L dầu mỗi giây (trừ vào kho Dầu) và sửa 25 HP mỗi giây.",
      "Sân bị phá thì máy bay của nó phải tìm bãi trống ở sân khác."
    ]
  },
  turret: {
    id: "turret",
    kind: "building",
    name: "Tháp Phòng Thủ",
    label: "PHÒNG THỦ",
    role: "Pháo tự động bắn cả mặt đất lẫn trên không.",
    mvp: true,
    cost: { iron: 250, oil: 0 },
    buildTime: 8,
    hp: 700,
    armorClass: "fort",
    sight: 24,
    half: [1.5, 1.5],
    power: -5,
    priority: 1,
    weapon: { name: "Pháo kép tự động 30mm", dmgGround: 30, dmgAir: 30, range: 20, cooldown: 0.6, dmgType: "normal", splash: 0, visual: "bullet" },
    features: ["Bắn cả xe lẫn máy bay trong tầm 20m.", "Giáp Công sự: chỉ đạn xuyên giáp (Pháo) phá nhanh. Giữ mỏ và cửa ngõ căn cứ. Dùng Cột Điện để xây được tháp ở xa căn cứ.", "Thiếu điện thì bắn chậm, mất hẳn điện thì ngừng bắn."]
  },
  outpost: {
    id: "outpost",
    kind: "building",
    name: "Tiền Đồn",
    label: "OUTPOST",
    role: "Căn cứ trung lập để chiếm. (Sau MVP)",
    mvp: false,
    hp: 1150,
    armorClass: "fort",
    sight: 20,
    half: [2.6, 2.6],
    power: 0,
    weapon: { name: "Tháp pháo tự động", dmgGround: 26, dmgAir: 18, range: 18, cooldown: 0.9, dmgType: "normal", splash: 0, visual: "bullet" },
    features: ["Chiếm được: đứng trong vùng chiếm đóng đủ lâu để cắm cờ phe mình.", "Mở rộng vùng xây dựng ra tiền tuyến."]
  },
  "power-plant": {
    id: "power-plant",
    kind: "building",
    name: "Nhà Máy Điện",
    label: "ĐIỆN +40MW",
    role: "Đốt Dầu để phát điện cho cả căn cứ.",
    mvp: true,
    cost: { iron: 200, oil: 0 },
    buildTime: 8,
    hp: 850,
    armorClass: "struct",
    sight: 14,
    half: [3, 2.3],
    power: 40,
    oilBurn: 0.4,
    zone: 18,
    features: [
      "Công suất 40 MW. Hậu cần tự điều độ: chỉ đốt Dầu theo lượng điện thực dùng (tối đa 0.4 Dầu/s); không có tải thì chờ dự phòng, không đốt.",
      "Kho Dầu cạn thì ngừng phát — sẽ có cảnh báo trước khoảng 45 giây.",
      "Mở vùng xây dựng 18m. Mục tiêu béo bở của Falcon địch."
    ]
  },
  "power-pylon": {
    id: "power-pylon",
    kind: "building",
    name: "Cột Điện",
    label: "MỞ VÙNG XÂY",
    role: "Cột cao thế kéo vùng xây dựng ra xa căn cứ.",
    mvp: true,
    cost: { iron: 60, oil: 0 },
    buildTime: 3,
    hp: 380,
    armorClass: "light",
    sight: 12,
    half: [0.9, 0.9],
    power: 0,
    zone: 16,
    features: [
      "Mở vùng xây dựng 16m quanh cột: nối nhiều cột để xây Tháp Phòng Thủ cạnh mỏ xa.",
      "Rẻ và mỏng: mắt xích yếu mà Lynx địch luôn nhắm tới.",
      "Mất cột thì công trình đã xây vẫn chạy, nhưng không xây thêm được ở đó."
    ]
  },
  battery: {
    id: "battery",
    kind: "building",
    name: "Trạm Tích Điện",
    label: "PIN 1.200 MJ",
    role: "Tích điện thừa, tự xả khi thiếu để căn cứ không sụp ngay.",
    mvp: true,
    cost: { iron: 150, oil: 0 },
    buildTime: 6,
    hp: 500,
    armorClass: "struct",
    sight: 10,
    half: [1.6, 1.4],
    power: 0,
    storage: 1200,
    chargeMax: 15,
    dischargeMax: 30,
    features: [
      "Chứa 1.200 MJ (đủ cấp 30 MW trong 40 giây). Nạp tối đa 15 MW, xả tối đa 30 MW.",
      "Hậu cần tự nạp bằng điện thừa của Tổng Hành Dinh; chỉ đốt Dầu để nạp khi kho Dầu còn dư.",
      "Tự xả khi nhà máy bị phá hoặc hết Dầu: cho Tư lệnh thời gian phản ứng. Bị phá thì mất hết điện đang chứa."
    ]
  },
  radar: {
    id: "radar",
    kind: "building",
    name: "Trạm Radar",
    label: "RADAR 55M",
    role: "Nhìn xuyên sương mù chiến tranh trên vùng rộng.",
    mvp: true,
    cost: { iron: 200, oil: 0 },
    buildTime: 8,
    hp: 450,
    armorClass: "light",
    sight: 12,
    half: [1.6, 1.6],
    power: -15,
    priority: 1,
    radarSight: 55,
    features: ["Nhìn thấy mọi thứ trong bán kính 55m, xuyên sương mù.", "Tốn 15 MW; hiệu suất điện dưới 50% thì radar tắt."]
  },
  "oil-extractor": {
    id: "oil-extractor",
    kind: "building",
    name: "Nhà Máy Đào Dầu",
    label: "KHAI THÁC DẦU",
    role: "Bơm dầu liên tục. (Sau MVP)",
    mvp: false,
    cost: { iron: 160, oil: 0 },
    buildTime: 5.5,
    hp: 780,
    armorClass: "struct",
    sight: 12,
    half: [3, 2],
    power: -10,
    features: ["Bơm Dầu liên tục, mạnh hơn khi đặt gần giàn Dầu.", "Mất điện chỉ còn 28% công suất."]
  },
  "ammo-depot": {
    id: "ammo-depot",
    kind: "building",
    name: "Kho Đạn & Trạm Đường Ray",
    label: "RAY CẤP ĐẠN",
    role: "Sản xuất đạn phòng không và chở tới tháp bằng xe goòng. (Sau MVP)",
    mvp: false,
    cost: { iron: 180, oil: 20 },
    buildTime: 5.5,
    hp: 950,
    armorClass: "struct",
    sight: 12,
    half: [2.7, 2.2],
    power: -10,
    features: ["Trữ tối đa 160 đạn phòng không.", "Xe goòng chở đạn chạy dọc đường ray tới các tháp."]
  },
  "aa-ciws": {
    id: "aa-ciws",
    kind: "building",
    name: "Pháo Phòng Không CIWS Vulcan",
    label: "AA TỐC BẮN CAO",
    role: "Pháo xoay 6 nòng tầm gần, bắn siêu tốc. (Sau MVP)",
    mvp: false,
    cost: { iron: 140, oil: 15 },
    buildTime: 4,
    hp: 620,
    armorClass: "struct",
    sight: 22,
    half: [1.4, 1.4],
    power: -6,
    weapon: { name: "Pháo 6 nòng Vulcan", dmgGround: 0, dmgAir: 19, range: 22.5, cooldown: 0.24, dmgType: "he", splash: 0, visual: "bullet" },
    magazine: 28,
    features: ["Bắn 0.24 giây/viên: lưới đạn dày đặc tầm gần.", "Hết đạn từ đường ray thì ngừng bắn."]
  },
  "aa-sam": {
    id: "aa-sam",
    kind: "building",
    name: "Tên Lửa Tầm Xa Patriot SAM",
    label: "AA TẦM XA",
    role: "Tên lửa phòng không tầm xa, sát thương lớn. (Sau MVP)",
    mvp: false,
    cost: { iron: 210, oil: 35 },
    buildTime: 5.5,
    hp: 700,
    armorClass: "struct",
    sight: 30,
    half: [1.8, 1.8],
    power: -14,
    strictPower: true,
    weapon: { name: "Tên lửa Patriot", dmgGround: 0, dmgAir: 112, range: 38.5, cooldown: 1.65, dmgType: "he", splash: 2.6, visual: "missile" },
    magazine: 14,
    features: ["Tầm bắn cực xa 38.5m, 2 đạn mỗi phát.", "Bắt buộc có điện."]
  },
  "aa-emp": {
    id: "aa-emp",
    kind: "building",
    name: "Tháp Xung Điện Từ SkyShield",
    label: "AA LÀM CHẬM BAY",
    role: "Xung EMP diện rộng làm nhiễu động cơ máy bay. (Sau MVP)",
    mvp: false,
    cost: { iron: 200, oil: 40 },
    buildTime: 5,
    hp: 680,
    armorClass: "struct",
    sight: 24,
    half: [1.8, 1.8],
    power: -16,
    strictPower: true,
    weapon: { name: "Xung điện từ", dmgGround: 0, dmgAir: 48, range: 30, cooldown: 1.25, dmgType: "he", splash: 5.2, visual: "pulse" },
    magazine: 16,
    features: ["Nổ xung bán kính 5.2m trên không.", "Máy bay trúng xung: -35% tốc bay và tốc ngoặt trong 3.8 giây.", "Bắt buộc có điện."]
  }
};

/** Công trình người chơi được xây trong bản MVP, theo thứ tự trên thanh xây. */
/**
 * Vị trí 6 bãi đậu so với tâm Sân Đáp (dùng chung cho sim và mô hình `buildAirfield`): 2 dãy × 3 ô kẹp đường băng dọc trục z
 * ở giữa; máy bay đậu quay mũi về +z (hướng cất cánh). Số phần tử = `RULES.air.pads`.
 */
export const PAD_OFFSETS: readonly (readonly [number, number])[] = [
  [-4.45, -5.6],
  [4.45, -5.6],
  [-4.45, 0],
  [4.45, 0],
  [-4.45, 5.6],
  [4.45, 5.6]
];

export const MVP_BUILDABLE: readonly BuildingId[] = ["factory", "airfield", "power-plant", "battery", "power-pylon", "turret", "radar"];

export function isUnitId(id: string): id is UnitId {
  return id in UNITS;
}

/**
 * Rải thảm được không: xe mặt đất có vũ khí bắn đất có độ tản (Xe Tên Lửa Loạt). Đọc từ dữ liệu vũ khí, không theo tên quân,
 * để sau này quân khác có vũ khí tản (pháo phản lực, dàn mìn…) tự có kỹ năng này.
 */
export function canStrike(id: UnitId): boolean {
  const u = UNITS[id];
  return u.domain === "ground" && !!u.weapon && !!u.weapon.scatter && u.weapon.dmgGround > 0;
}

/** Giá trị của một loại quân / công trình (cho kinh nghiệm cựu binh, xác quân, AI chọn chỗ bắn): Sắt + Dầu × trọng số. */
export function valueOf(id: EntityId): number {
  const spec = getSpec(id);
  const V = RULES.veterancy;
  return spec.cost ? spec.cost.iron + spec.cost.oil * V.oilWeight : V.noCostValue;
}

export function getSpec(id: EntityId): EntitySpec {
  return isUnitId(id) ? UNITS[id] : BUILDINGS[id as BuildingId];
}

export function targetsOf(w: WeaponSpec | undefined): TargetMask {
  if (!w) return "none";
  if (w.dmgGround > 0 && w.dmgAir > 0) return "both";
  if (w.dmgGround > 0) return "ground";
  if (w.dmgAir > 0) return "air";
  return "none";
}

/** Binh chủng đã có trong Khung Tính Năng nhưng chưa thiết kế mô hình. */
export const PLANNED_UNITS: { name: string; group: string }[] = [
  { name: "Pháo Tự Hành", group: "Mặt đất" },
  { name: "Xe Công Binh", group: "Mặt đất" },
  { name: "Drone Trinh Sát", group: "Trên không" },
  { name: "Trực Thăng Tấn Công", group: "Trên không" },
  { name: "Trực Thăng Vận Tải", group: "Trên không" },
  { name: "Drone Sửa Chữa", group: "Trên không" },
  { name: "Tiểu Đội Súng Trường", group: "Bộ binh" },
  { name: "Tiểu Đội Tên Lửa", group: "Bộ binh" },
  { name: "Tổ Bắn Tỉa", group: "Bộ binh" },
  { name: "Pháo Đài Di Động", group: "Siêu cỗ máy" }
];

export const PLANNED_BUILDINGS: string[] = ["Trại Bộ Binh", "Trung Tâm Nghiên Cứu"];
