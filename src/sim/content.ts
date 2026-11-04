/**
 * Nội dung game: chỉ số của mọi binh chủng, công trình và luật chơi.
 *
 * Đây là DỮ LIỆU THUẦN: không import Three.js hay DOM. Lõi mô phỏng (sim), AI và giao diện
 * đều đọc chung một nguồn này, nên con số trên Xưởng Mô Hình không bao giờ lệch với trận đấu.
 *
 * ⚠️ Mọi con số hiện là SỐ TẠM cho bản demo MVP (xem Docs/MVP_DESIGN.md). Sẽ bàn kỹ lại sau bản demo.
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

export type UnitId = "commander" | "hauler" | "lynx" | "titan" | "skyguard" | "falcon" | "valkyrie";

export type BuildingId =
  | "hq"
  | "factory"
  | "airfield"
  | "turret"
  | "power-plant"
  | "power-pylon"
  | "radar"
  | "outpost"
  | "oil-extractor"
  | "ammo-depot"
  | "aa-ciws"
  | "aa-sam"
  | "aa-emp";

export type EntityId = UnitId | BuildingId;

/** Kiểu đạn để vẽ hiệu ứng và tính tốc độ bay của đạn. */
export type WeaponVisual = "bullet" | "cannon" | "missile" | "bomb" | "pulse";

export interface WeaponSpec {
  name: string;
  /** Sát thương mỗi phát lên mục tiêu mặt đất / trên không (0 = không bắn được). */
  dmgGround: number;
  dmgAir: number;
  /** Tầm bắn (m). */
  range: number;
  /** Giây giữa 2 phát. */
  cooldown: number;
  /** Bán kính nổ lan (m), 0 = trúng đơn mục tiêu. */
  splash: number;
  visual: WeaponVisual;
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
  /** Tỉ lệ giảm sát thương nhận vào (0..1). */
  armor: number;
  /** m/s; máy bay có thêm tốc độ tối thiểu. */
  speed: number;
  minSpeed?: number;
  /** Tầm nhìn (m) cho sương mù chiến tranh. */
  sight: number;
  /** Bán kính va chạm / chọn (m). */
  radius: number;
  /** Sức chiếm mỏ (0 = không chiếm được). */
  captureWeight: number;
  weapon?: WeaponSpec;
  /** Nhiên liệu máy bay: dung tích (L), đốt (L/s), tốc độ ngoặt (độ/s). */
  fuel?: { tank: number; burn: number; turnRate: number };
  /** Sức chở của Xe Vận Tải. */
  cargo?: number;
  /** Hào quang chỉ huy: bán kính và hệ số tốc bắn cho quân đồng minh. */
  aura?: { radius: number; fireRate: number };
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
  armor: number;
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
  power: { radarMin: 0.5, turretMin: 0.1 },
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
    /** Tỉ lệ dầu tối thiểu để cất cánh. */
    takeoffMin: 0.35,
    /** Mức Bingo: tự bay về Sân Đáp. */
    bingo: 0.24,
    /** Lít/giây khi nạp ở bãi đậu. */
    refuelRate: 10,
    repairRate: 25,
    /** 1 Dầu trong kho = 1 lít nhiên liệu. */
    oilPerLiter: 1,
    pads: 4
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
    hp: 1350,
    armor: 0.25,
    speed: 5,
    sight: 26,
    radius: 1.9,
    captureWeight: 2.2,
    weapon: { name: "Pháo kép 40mm", dmgGround: 44, dmgAir: 32, range: 20, cooldown: 1.05, splash: 2, visual: "cannon" },
    aura: { radius: 13.5, fireRate: 1.18 },
    features: [
      "Hào quang chỉ huy (13.5m): quân đồng minh xung quanh bắn nhanh hơn 18%.",
      "Chiếm mỏ nhanh gấp 2.2 lần một xe thường.",
      "Có từ đầu trận, không chế tạo thêm được. Bị diệt là thua ngay.",
      "Kỹ năng [Q][E][R] sẽ có sau bản MVP."
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
    hp: 300,
    armor: 0.1,
    speed: 4.6,
    sight: 16,
    radius: 1.7,
    captureWeight: 0,
    cargo: 100,
    features: [
      "Tự động chạy ra mỏ phe mình gần nhất, đào đầy 100 rồi chở về Tổng Hành Dinh.",
      "Đang chọn xe mà chạm vào một mỏ thì xe sẽ khai thác đúng mỏ đó.",
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
    hp: 340,
    armor: 0.08,
    speed: 7.2,
    sight: 28,
    radius: 1.4,
    captureWeight: 1,
    weapon: { name: "Súng máy 20mm", dmgGround: 24, dmgAir: 0, range: 15.5, cooldown: 0.65, splash: 0, visual: "bullet" },
    features: [
      "Nhanh nhất trên mặt đất và nhìn xa: đến mỏ trung lập trước mọi đối thủ.",
      "Săn Xe Vận Tải địch để cắt kinh tế.",
      "Giáp mỏng: tránh đối đầu trực diện với Titan."
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
    hp: 720,
    armor: 0.24,
    speed: 4.4,
    sight: 22,
    radius: 1.9,
    captureWeight: 1,
    weapon: { name: "Pháo chính 120mm", dmgGround: 72, dmgAir: 0, range: 19.5, cooldown: 1.55, splash: 2.8, visual: "cannon" },
    features: [
      "Đạn 120mm nổ lan 2.8m: nghiền nát đội hình xe và công trình.",
      "Giáp giảm 24% sát thương: là lá chắn đi đầu đội hình.",
      "Không bắn được máy bay: cần SkyGuard đi kèm."
    ],
    beats: ["lynx", "skyguard", "turret", "hq"],
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
    hp: 430,
    armor: 0.12,
    speed: 5.2,
    sight: 28,
    radius: 1.6,
    captureWeight: 1,
    weapon: { name: "Tên lửa tầm nhiệt", dmgGround: 16, dmgAir: 56, range: 26.5, cooldown: 0.9, splash: 1.5, visual: "missile" },
    features: [
      "Câu trả lời cho không quân: tầm bắn 26.5m, xa hơn mọi pháo mặt đất.",
      "Không cần lưới điện hay đường ray: phòng không mang theo được ra tiền tuyến.",
      "Yếu khi bị xe tăng áp sát."
    ],
    beats: ["falcon"],
    fears: ["titan", "lynx"]
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
    hp: 360,
    armor: 0.08,
    speed: 18,
    minSpeed: 12,
    sight: 30,
    radius: 1.8,
    captureWeight: 0,
    weapon: { name: "Tên lửa không đối không / đất", dmgGround: 55, dmgAir: 70, range: 22, cooldown: 0.5, splash: 1.8, visual: "missile" },
    fuel: { tank: 40, burn: 1.2, turnRate: 110 },
    features: [
      "Sát thương rất cao lên cả mặt đất lẫn trên không.",
      "Bình dầu 40L, đốt 1.2L/s: khoảng 33 giây bay mỗi lần xuất kích.",
      "Chỉ cất cánh khi còn ít nhất 35% dầu; xuống 24% (hoặc vừa đủ dầu bay về nếu đang ở xa) thì tự bay về Sân Đáp.",
      "Nạp dầu khoảng 4 giây tại bãi đậu, trừ vào kho Dầu. Kho cạn thì máy bay nằm sân.",
      "Luôn giữ dầu dự trữ đủ bay về; chỉ rơi khi không còn Sân Đáp nào của phe mình."
    ],
    beats: ["titan", "hauler", "lynx"],
    fears: ["skyguard", "turret"]
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
    hp: 580,
    armor: 0.16,
    speed: 14,
    minSpeed: 10,
    sight: 26,
    radius: 2.4,
    captureWeight: 0,
    weapon: { name: "Chuỗi 3 bom quán tính", dmgGround: 98, dmgAir: 0, range: 23, cooldown: 0.42, splash: 4.6, visual: "bomb" },
    fuel: { tank: 60, burn: 1.4, turnRate: 76 },
    features: [
      "Rải chuỗi 3 quả bom rơi theo quỹ đạo parabol, nổ lan 4.6m.",
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
    armor: 0.2,
    sight: 28,
    half: [3.4, 3.4],
    produces: ["hauler"],
    power: 20,
    zone: 24,
    weapon: { name: "Pháo kép tự vệ", dmgGround: 40, dmgAir: 28, range: 22, cooldown: 1.2, splash: 1.5, visual: "cannon" },
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
    role: "Đúc quân mặt đất: Lynx, Titan, SkyGuard.",
    mvp: true,
    cost: { iron: 300, oil: 0 },
    buildTime: 10,
    hp: 1000,
    armor: 0.15,
    sight: 16,
    half: [3.4, 3],
    produces: ["lynx", "titan", "skyguard"],
    power: -10,
    features: ["Hàng chờ tối đa 5 xe.", "Đặt điểm tập kết để xe mới tự chạy ra tiền tuyến.", "Xây thêm xưởng để đúc quân nhanh hơn."]
  },
  airfield: {
    id: "airfield",
    kind: "building",
    name: "Sân Đáp Không Quân",
    label: "4 BÃI ĐÁP",
    role: "Đúc Falcon; nơi máy bay cất, hạ cánh, nạp Dầu và sửa chữa.",
    mvp: true,
    cost: { iron: 400, oil: 0 },
    buildTime: 12,
    hp: 1150,
    armor: 0.15,
    sight: 18,
    half: [5.5, 4.3],
    produces: ["falcon"],
    power: -15,
    features: [
      "4 bãi đậu: mỗi sân nuôi được tối đa 4 máy bay.",
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
    armor: 0.2,
    sight: 24,
    half: [1.5, 1.5],
    power: -5,
    weapon: { name: "Pháo kép tự động 30mm", dmgGround: 30, dmgAir: 30, range: 20, cooldown: 0.6, splash: 0, visual: "bullet" },
    features: ["Bắn cả xe lẫn máy bay trong tầm 20m.", "Rẻ và chắc: giữ mỏ và cửa ngõ căn cứ. Dùng Cột Điện để xây được tháp ở xa căn cứ.", "Thiếu điện thì bắn chậm, mất hẳn điện thì ngừng bắn."]
  },
  outpost: {
    id: "outpost",
    kind: "building",
    name: "Tiền Đồn",
    label: "OUTPOST",
    role: "Căn cứ trung lập để chiếm. (Sau MVP)",
    mvp: false,
    hp: 1150,
    armor: 0.2,
    sight: 20,
    half: [2.6, 2.6],
    power: 0,
    weapon: { name: "Tháp pháo tự động", dmgGround: 26, dmgAir: 18, range: 18, cooldown: 0.9, splash: 0, visual: "bullet" },
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
    armor: 0.15,
    sight: 14,
    half: [3, 2.3],
    power: 40,
    oilBurn: 0.4,
    zone: 18,
    features: [
      "Phát +40 MW, đốt 0.4 Dầu mỗi giây. Kho Dầu cạn thì ngừng phát.",
      "Có thể tắt máy để tiết kiệm Dầu khi chưa cần điện.",
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
    armor: 0.1,
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
    armor: 0.1,
    sight: 12,
    half: [1.6, 1.6],
    power: -15,
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
    armor: 0.15,
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
    armor: 0.15,
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
    armor: 0.15,
    sight: 22,
    half: [1.4, 1.4],
    power: -6,
    weapon: { name: "Pháo 6 nòng Vulcan", dmgGround: 0, dmgAir: 19, range: 22.5, cooldown: 0.24, splash: 0, visual: "bullet" },
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
    armor: 0.15,
    sight: 30,
    half: [1.8, 1.8],
    power: -14,
    strictPower: true,
    weapon: { name: "Tên lửa Patriot", dmgGround: 0, dmgAir: 112, range: 38.5, cooldown: 1.65, splash: 2.6, visual: "missile" },
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
    armor: 0.15,
    sight: 24,
    half: [1.8, 1.8],
    power: -16,
    strictPower: true,
    weapon: { name: "Xung điện từ", dmgGround: 0, dmgAir: 48, range: 30, cooldown: 1.25, splash: 5.2, visual: "pulse" },
    magazine: 16,
    features: ["Nổ xung bán kính 5.2m trên không.", "Máy bay trúng xung: -35% tốc bay và tốc ngoặt trong 3.8 giây.", "Bắt buộc có điện."]
  }
};

/** Công trình người chơi được xây trong bản MVP, theo thứ tự trên thanh xây. */
export const MVP_BUILDABLE: readonly BuildingId[] = ["factory", "airfield", "power-plant", "power-pylon", "turret", "radar"];

export function isUnitId(id: string): id is UnitId {
  return id in UNITS;
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
