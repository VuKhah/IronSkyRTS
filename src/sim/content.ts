/**
 * Nội dung game: chỉ số của mọi binh chủng và công trình.
 *
 * Đây là DỮ LIỆU THUẦN: không import Three.js hay DOM. Lõi mô phỏng (sim), AI và các trang
 * giao diện đều đọc chung một nguồn này, nên con số trên Xưởng Mô Hình không bao giờ lệch với trận đấu.
 * Nguồn số liệu ban đầu: Docs/GAME_CONTENT.md (bản thiết kế Iron Sky), sẽ cân bằng lại khi có sim.
 */

export type Faction = "lam" | "do";
export type Domain = "ground" | "air";
export type TargetMask = "ground" | "air" | "both" | "none";

export interface Cost {
  gold: number;
  oil: number;
  iron: number;
}

export type UnitId = "commander" | "lynx" | "titan" | "skyguard" | "falcon" | "valkyrie";

export type BuildingId =
  | "hq"
  | "outpost"
  | "power-plant"
  | "power-pylon"
  | "oil-extractor"
  | "airfield"
  | "ammo-depot"
  | "aa-ciws"
  | "aa-sam"
  | "aa-emp";

export type EntityId = UnitId | BuildingId;

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
}

export interface UnitSpec {
  id: UnitId;
  kind: "unit";
  name: string;
  code: string;
  hotkey: string;
  role: string;
  domain: Domain;
  /** undefined = không chế tạo được (Xe Tư Lệnh có sẵn từ đầu trận). */
  cost?: Cost;
  buildTime?: number;
  hp: number;
  /** Tỉ lệ giảm sát thương nhận vào (0..1). */
  armor: number;
  /** m/s; máy bay có thêm tốc độ tối thiểu để không rơi. */
  speed: number;
  minSpeed?: number;
  weapon: WeaponSpec;
  fuel?: { tank: number; burn: number };
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
  /** undefined = có sẵn trên bản đồ, không xây được. */
  cost?: Cost;
  buildTime?: number;
  hp: number;
  /** MW: dương = phát điện, âm = tiêu thụ. */
  power: number;
  /** Ngừng hoạt động khi mất điện. */
  strictPower?: boolean;
  weapon?: WeaponSpec;
  /** Băng đạn tại tháp, nạp qua Đường ray. */
  magazine?: number;
  features: string[];
}

export type EntitySpec = UnitSpec | BuildingSpec;

export const UNITS: Record<UnitId, UnitSpec> = {
  commander: {
    id: "commander",
    kind: "unit",
    name: "Xe Tư Lệnh Chiến Thuật",
    code: "CMD",
    hotkey: "F1",
    role: "Trái tim của binh đoàn. Mất Xe Tư Lệnh là thua trận.",
    domain: "ground",
    hp: 1350,
    armor: 0.25,
    speed: 8.4,
    weapon: { name: "Pháo kép 40mm", dmgGround: 44, dmgAir: 32, range: 20, cooldown: 1.05, splash: 2 },
    features: [
      "Hào quang chỉ huy (13.5m): quân đồng minh +18% tốc bắn và hồi máu nhẹ.",
      "Chiếm mỏ và tiền đồn nhanh gấp 2.2 lần, mở vùng xây dựng 26m quanh xe.",
      "3 tuyệt kỹ: [Q] Quét Radar khóa mục tiêu, [E] Sửa chữa và Khiên xung kích, [R] Pháo kích tọa độ.",
      "Có từ đầu trận, không chế tạo thêm được: phải giữ nó sống bằng mọi giá."
    ],
    beats: ["lynx"],
    fears: ["titan", "valkyrie"]
  },
  lynx: {
    id: "lynx",
    kind: "unit",
    name: "Thiết Giáp Trinh Sát Lynx",
    code: "LYNX",
    hotkey: "Z",
    role: "Xe bánh lốp nhanh nhất mặt đất. Cướp mỏ, cắt hậu cần.",
    domain: "ground",
    cost: { gold: 50, oil: 20, iron: 75 },
    buildTime: 4.5,
    hp: 340,
    armor: 0.08,
    speed: 12.2,
    weapon: { name: "Súng máy 20mm", dmgGround: 24, dmgAir: 0, range: 15.5, cooldown: 0.65, splash: 0 },
    features: [
      "Nhanh nhất trên mặt đất: đến mỏ trung lập trước mọi đối thủ.",
      "Chuyên tập kích Cột điện và Đường ray tiếp đạn: cắt một mắt xích là cả cụm phòng không địch tê liệt.",
      "Giáp mỏng: tránh đối đầu trực diện với Titan."
    ],
    beats: ["skyguard", "power-pylon", "ammo-depot"],
    fears: ["titan", "commander", "falcon"]
  },
  titan: {
    id: "titan",
    kind: "unit",
    name: "Xe Tăng Chủ Lực Titan",
    code: "MBT",
    hotkey: "X",
    role: "Giáp dày, pháo 120mm nổ lan. Mũi nhọn công phá.",
    domain: "ground",
    cost: { gold: 90, oil: 65, iron: 140 },
    buildTime: 7.5,
    hp: 720,
    armor: 0.24,
    speed: 7.5,
    weapon: { name: "Pháo chính 120mm", dmgGround: 72, dmgAir: 0, range: 19.5, cooldown: 1.55, splash: 2.8 },
    features: [
      "Đạn 120mm nổ lan 2.8m: nghiền nát đội hình xe tăng và tháp phòng không.",
      "Giáp giảm 24% sát thương: là lá chắn đi đầu đội hình.",
      "Không bắn được máy bay: cần SkyGuard đi kèm."
    ],
    beats: ["lynx", "skyguard", "aa-ciws", "hq"],
    fears: ["valkyrie", "falcon"]
  },
  skyguard: {
    id: "skyguard",
    kind: "unit",
    name: "Phòng Không Cơ Động SkyGuard",
    code: "AA-MOB",
    hotkey: "C",
    role: "Tên lửa phòng không tự hành, hộ tống đoàn xe tăng.",
    domain: "ground",
    cost: { gold: 75, oil: 45, iron: 110 },
    buildTime: 6,
    hp: 430,
    armor: 0.12,
    speed: 8.8,
    weapon: { name: "Tên lửa tầm nhiệt", dmgGround: 16, dmgAir: 56, range: 26.5, cooldown: 0.9, splash: 1.5 },
    features: [
      "Không cần lưới điện hay đường ray: phòng không mang theo được ra tiền tuyến.",
      "Tầm bắn 26.5m, xa hơn mọi pháo mặt đất.",
      "Yếu khi bị xe tăng áp sát."
    ],
    beats: ["falcon", "valkyrie"],
    fears: ["titan", "lynx"]
  },
  falcon: {
    id: "falcon",
    kind: "unit",
    name: "Tiêm Kích Đa Nhiệm Falcon",
    code: "JET",
    hotkey: "N",
    role: "Không chiến và bổ nhào bắn tên lửa xuống mặt đất.",
    domain: "air",
    cost: { gold: 110, oil: 65, iron: 45 },
    buildTime: 6.5,
    hp: 360,
    armor: 0.08,
    speed: 22.5,
    minSpeed: 14.5,
    weapon: { name: "Tên lửa không đối không / đất", dmgGround: 38, dmgAir: 68, range: 27, cooldown: 0.55, splash: 1.8 },
    fuel: { tank: 65, burn: 1.05 },
    features: [
      "Khắc chế cường kích địch trên không, bổ nhào bắn tên lửa xuống đất.",
      "Bình dầu 65L, đốt 1.05L/s: cần Sân Đáp để nạp dầu, sửa chữa và nạp đạn.",
      "Chỉ cất cánh khi còn ít nhất 35% dầu; về Sân Đáp khi xuống 24%.",
      "Bay vòng sườn để né tâm hỏa lực phòng không địch."
    ],
    beats: ["valkyrie", "lynx"],
    fears: ["skyguard", "aa-sam", "aa-ciws"]
  },
  valkyrie: {
    id: "valkyrie",
    kind: "unit",
    name: "Cường Kích Ném Bom Valkyrie",
    code: "BOMB",
    hotkey: "M",
    role: "Pháo đài bay. Rải chuỗi bom phá hủy căn cứ.",
    domain: "air",
    cost: { gold: 150, oil: 90, iron: 80 },
    buildTime: 9,
    hp: 580,
    armor: 0.16,
    speed: 16.8,
    minSpeed: 11.5,
    weapon: { name: "Chuỗi 3 bom quán tính", dmgGround: 98, dmgAir: 0, range: 23, cooldown: 0.42, splash: 4.6 },
    fuel: { tank: 95, burn: 1.4 },
    features: [
      "Rải chuỗi 3 quả bom rơi theo quỹ đạo parabol, nổ lan 4.6m.",
      "Mục tiêu lý tưởng: Nhà máy Điện, Kho đạn và cụm xe tăng Titan.",
      "Bình dầu 95L, ngoặt chậm (76°/s): cần tiêm kích hộ tống."
    ],
    beats: ["titan", "power-plant", "ammo-depot"],
    fears: ["falcon", "skyguard", "aa-sam", "aa-emp"]
  }
};

export const BUILDINGS: Record<BuildingId, BuildingSpec> = {
  hq: {
    id: "hq",
    kind: "building",
    name: "Tổng Hành Dinh",
    label: "HQ",
    role: "Đầu não căn cứ. Mất Tổng Hành Dinh là thua trận.",
    hp: 3600,
    power: 40,
    weapon: { name: "Pháo kép tự vệ", dmgGround: 40, dmgAir: 28, range: 22, cooldown: 1.2, splash: 1.5 },
    features: [
      "Phát điện gốc +40 MW, phủ lưới bán kính 34m.",
      "Thu nhập gốc: +4 Vàng, +2 Dầu, +4 Sắt mỗi giây.",
      "Tự hồi 8 HP/s khi không còn quân địch xung quanh."
    ]
  },
  outpost: {
    id: "outpost",
    kind: "building",
    name: "Tiền Đồn",
    label: "OUTPOST",
    role: "Căn cứ trung lập để chiếm. Mở vùng xây dựng và xuất quân ra tiền tuyến.",
    hp: 1150,
    power: 0,
    weapon: { name: "Tháp pháo tự động", dmgGround: 26, dmgAir: 18, range: 18, cooldown: 0.9, splash: 0 },
    features: [
      "Chiếm được: đứng trong vùng chiếm đóng đủ lâu để cắm cờ phe mình.",
      "Cộng +2 Vàng, +1 Dầu, +2 Sắt mỗi giây và mở vùng xây dựng 44m.",
      "Bản đồ có 3 tiền đồn: Alpha ở giữa, Tây Bắc và Đông Nam."
    ]
  },
  "power-plant": {
    id: "power-plant",
    kind: "building",
    name: "Nhà Máy Phát Điện",
    label: "ĐIỆN +45MW",
    role: "Nguồn điện chính của lưới.",
    cost: { gold: 60, oil: 0, iron: 85 },
    buildTime: 5,
    hp: 850,
    power: 45,
    features: ["Phát +45 MW, phủ lưới điện bán kính 30m.", "Mục tiêu số một của máy bay ném bom địch: nên đặt phòng không bảo vệ."]
  },
  "power-pylon": {
    id: "power-pylon",
    kind: "building",
    name: "Trạm Truyền Tải Điện",
    label: "DẪN ĐIỆN +8MW",
    role: "Cột cáp cao thế kéo lưới điện ra tiền tuyến.",
    cost: { gold: 25, oil: 0, iron: 35 },
    buildTime: 2.5,
    hp: 380,
    power: 8,
    features: ["Nối lưới xa thêm 30m, kèm tụ bù +8 MW.", "Rẻ và mỏng: là mắt xích yếu mà Lynx địch luôn nhắm tới."]
  },
  "oil-extractor": {
    id: "oil-extractor",
    kind: "building",
    name: "Nhà Máy Đào Dầu",
    label: "KHAI THÁC DẦU",
    role: "Bơm dầu liên tục cho kinh tế và nhiên liệu máy bay.",
    cost: { gold: 65, oil: 0, iron: 95 },
    buildTime: 5.5,
    hp: 780,
    power: -10,
    features: ["Bơm +7 Dầu/s, đạt +12 Dầu/s khi đặt trong vòng 21m quanh Giàn Dầu.", "Mất điện chỉ còn 28% công suất."]
  },
  airfield: {
    id: "airfield",
    kind: "building",
    name: "Sân Đáp Không Quân",
    label: "4 BÃI ĐÁP",
    role: "Nơi cất, hạ cánh, sửa chữa và nạp dầu cho máy bay.",
    cost: { gold: 90, oil: 30, iron: 125 },
    buildTime: 6.5,
    hp: 1150,
    power: -12,
    features: [
      "4 bãi đáp: mỗi sân nuôi được tối đa 4 máy bay.",
      "Máy bay đậu được sửa vỏ 55 HP/s, nạp bom và hút dầu từ kho (1 Dầu kho = 2.5L).",
      "Cần ít nhất 1 Sân Đáp để chế tạo máy bay."
    ]
  },
  "ammo-depot": {
    id: "ammo-depot",
    kind: "building",
    name: "Kho Đạn & Trạm Đường Ray",
    label: "RAY CẤP ĐẠN",
    role: "Sản xuất đạn phòng không và chở tới tháp bằng xe goòng.",
    cost: { gold: 70, oil: 20, iron: 110 },
    buildTime: 5.5,
    hp: 950,
    power: -10,
    features: [
      "Chế tạo 4.2 viên/s khi đủ điện, trữ tối đa 160 đạn.",
      "Đường ray nối tới tháp phòng không trong vòng 46m, và giữa các tháp trong vòng 26m.",
      "Xe goòng chở 4–16 viên mỗi chuyến chạy dọc đường ray."
    ]
  },
  "aa-ciws": {
    id: "aa-ciws",
    kind: "building",
    name: "Pháo Phòng Không CIWS Vulcan",
    label: "AA TỐC BẮN CAO",
    role: "Pháo xoay 6 nòng tầm gần, bắn siêu tốc.",
    cost: { gold: 55, oil: 15, iron: 85 },
    buildTime: 4,
    hp: 620,
    power: -6,
    weapon: { name: "Pháo 6 nòng Vulcan", dmgGround: 0, dmgAir: 19, range: 22.5, cooldown: 0.24, splash: 0 },
    magazine: 28,
    features: ["Bắn 0.24 giây/viên: lưới đạn dày đặc tầm gần.", "Yếu điện vẫn quay chậm được, nhưng hết đạn từ đường ray thì ngừng bắn."]
  },
  "aa-sam": {
    id: "aa-sam",
    kind: "building",
    name: "Tên Lửa Tầm Xa Patriot SAM",
    label: "AA TẦM XA",
    role: "Tên lửa phòng không tầm xa, sát thương lớn.",
    cost: { gold: 95, oil: 35, iron: 115 },
    buildTime: 5.5,
    hp: 700,
    power: -14,
    strictPower: true,
    weapon: { name: "Tên lửa Patriot", dmgGround: 0, dmgAir: 112, range: 38.5, cooldown: 1.65, splash: 2.6 },
    magazine: 14,
    features: ["Tầm bắn cực xa 38.5m, 2 đạn mỗi phát.", "Bắt buộc có điện: mất điện hoặc cạn đạn là ngừng hoạt động hoàn toàn."]
  },
  "aa-emp": {
    id: "aa-emp",
    kind: "building",
    name: "Tháp Xung Điện Từ SkyShield",
    label: "AA LÀM CHẬM BAY",
    role: "Xung EMP diện rộng làm nhiễu động cơ máy bay.",
    cost: { gold: 105, oil: 40, iron: 95 },
    buildTime: 5,
    hp: 680,
    power: -16,
    strictPower: true,
    weapon: { name: "Xung điện từ", dmgGround: 0, dmgAir: 48, range: 30, cooldown: 1.25, splash: 5.2 },
    magazine: 16,
    features: ["Nổ xung bán kính 5.2m trên không.", "Máy bay trúng xung: -35% tốc bay và tốc ngoặt trong 3.8 giây.", "Bắt buộc có điện."]
  }
};

export function getSpec(id: EntityId): EntitySpec {
  return id in UNITS ? UNITS[id as UnitId] : BUILDINGS[id as BuildingId];
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
  { name: "Xe Khai Thác", group: "Mặt đất" },
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

export const PLANNED_BUILDINGS: string[] = ["Xưởng Xe", "Trại Bộ Binh", "Trung Tâm Nghiên Cứu", "Trạm Radar"];
