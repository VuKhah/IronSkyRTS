import type { GroupCode } from "./formations";
/** Kiểu dữ liệu chung của nội dung game: phe, tài nguyên, giáp, đạn, vũ khí, thông số quân và công trình. */

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

export type UnitId = "commander" | "hauler" | "lynx" | "titan" | "skyguard" | "rocket" | "artillery" | "falcon" | "valkyrie" | "scout" | "shield" | "repair" | "sniper";

export type BuildingId =
  | "hq"
  | "factory"
  | "special-factory"
  | "aircraft-factory"
  | "wall"
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
export type ArmorClass = "light" | "heavy" | "fort" | "struct" | "inf";
export const ARMOR_NAME: Record<ArmorClass, string> = { light: "Nhẹ", heavy: "Nặng", fort: "Công sự", struct: "Kết cấu", inf: "Bộ binh" };

/** Loại đạn: Thường (súng máy, pháo nhỏ), Xuyên giáp, Nổ (tên lửa, bom, đạn nổ). */
export type DmgType = "normal" | "ap" | "he";
/** Kiểu di chuyển của xe mặt đất: quyết định hệ số tốc độ trên từng loại địa hình (src/sim/maps/terrain.ts). */
export type Mobility = "wheel" | "track" | "foot";
export const MOBILITY_NAME: Record<Mobility, string> = { wheel: "Bánh", track: "Xích", foot: "Đi bộ" };
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
  burst?: { shots: number; interval: number; even?: boolean };
  /** Tốc độ bay của đạn (m/s) nếu khác mặc định của loại đạn. */
  shotSpeed?: number;
  /** Tầm bắn tối thiểu (m): mục tiêu đứng gần hơn thì không bắn được (Pháo). */
  minRange?: number;
  /** Lộ vị trí: bắn xong thì đối phương nhìn thấy xuyên sương mù trong chừng này giây (Pháo). */
  reveal?: number;
  /**
   * Địa lợi tầm cao: nhân phần thưởng tầm bắn do đứng trên tầng cao (`RULES.terrain.rangePerTier`, trần `rangeMax`) lên chừng này
   * lần. Bỏ trống = 1 (như mọi quân). Pháo = 2: đứng trên tầng cao được gấp đôi phần cộng tầm của quân thường.
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
  /**
   * Tốc độ mâm xoay (độ/giây): phải quay nòng về mục tiêu rồi mới bắn được. BẮT BUỘC với mọi vũ khí của quân mặt đất và
   * công trình (người dùng chốt 06/11/2026: mọi mâm xoay đều mất thời gian; content.test kiểm). Máy bay không có: ngắm bằng cả thân (fireArc).
   */
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
  /**
   * Mã phân nhóm, BẮT BUỘC (content.test kiểm). Đội hình chỉ đọc mã này, không đọc tên quân, nên quân mới
   * (hải quân, trực thăng, đạn đạo, laser…) chỉ cần khai báo mã là tự vào đúng chỗ.
   */
  group: GroupCode;
  /**
   * Cỡ lô, BẮT BUỘC: mỗi lần đúc ra chừng này chiếc và điều chung (người dùng chốt 09/11/2026: thiên về phòng thủ cứng
   * cáp 2, trinh sát quấy rối 3, đạn đạo loại lớn 1). `cost` và `buildTime` vẫn tính cho một chiếc, xem `lotCost`, `lotTime`.
   */
  batch: number;
  /**
   * Tốc độ quay thân xe (độ/giây), mọi xe mặt đất BẮT BUỘC có (người dùng chốt 06/11/2026: mọi xe xoay tại chỗ; quay
   * đầu cũng mất thời gian). Lệch hướng quá 30° thì xe đứng lại xoay tại chỗ rồi mới chạy. Máy bay bỏ trống.
   */
  turnRate?: number;
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
  /**
   * QUÁN TÍNH xe mặt đất (lõi di chuyển mới 20/11/2026): gia tốc và hãm (m/s²). Xe nặng tăng tốc chậm, hãm cũng mất một quãng,
   * nên nhìn thấy được sức nặng của cơ giới. Bỏ trống thì tính theo kiểu xe (`accelOf` / `brakeOf` trong world/shared.ts).
   */
  accel?: number;
  brake?: number;
  /** Xe mặt đất: bánh hay xích (hệ số tốc độ theo loại địa hình, terrain.ts). Máy bay bỏ trống. */
  mobility?: Mobility;
  /** Kháng làm chậm: bỏ qua phần làm chậm của bùn, cát, tuyết, rừng, bãi cạn (Xe Tư Lệnh). Độ dốc vẫn làm chậm. */
  slowResist?: boolean;
  minSpeed?: number;
  /** Tầm nhìn (m) cho sương mù chiến tranh. */
  sight: number;
  /** Bán kính va chạm / chọn (m). */
  radius: number;
  /**
   * Nửa chiều dài thân xe mặt đất (m), đo theo mô hình (`npm run model-report`). Thân xe dài hơn bán kính va chạm nhiều (Titan
   * rộng 3,6 m nhưng dài 6,5 m). Từ 16/11/2026 va chạm và dò vách theo đế tròn `bodyR`; số này chỉ còn cho phần vẽ / thân cũ.
   * Bỏ trống = bằng `radius`.
   */
  halfLen?: number;
  /**
   * Bán kính đế thân (m): mô hình nằm gọn trong vòng này ở mọi góc xoay tháp, kể cả nòng (Docs/design/UNIT_BASES_PLAN.md).
   * Kiểm bằng `npm run model-report` và `src/render/models/bases.test.ts`. Sim dùng cho dò vách và tìm đường của quân mặt đất
   * (`bodyRadius` trong world/shared.ts, từ 16/11/2026).
   */
  bodyR?: number;
  /**
   * Bán kính vùng giãn (m): khoảng tối thiểu với quân cùng lớp; mặt đất = bodyR + 0,2; trên không = 1,5 × bodyR (người dùng
   * 15/11). Sim dùng cho va chạm xe–xe và ORCA mặt đất (`spaceRadius`, từ 16/11/2026); trên không chưa dùng.
   */
  spaceR?: number;
  /**
   * TIỂU ĐỘI BỘ BINH (16/11/2026): số người trên một đế (đế tiểu đội Ø 6 m, UNIT_BASES_PLAN.md). Có trường này thì quân theo luật
   * bộ binh: chạm MỀM với xe (chồng tới nửa đế, lính nhường xe), đứng là vật cản mềm với xe (xe đi qua được nhưng tốn hơn), lọt
   * giữa hai xe đứng sát nhau, dò vách ở nửa bán kính đế (người túm lại qua lối hẹp). Phần vẽ: số người còn theo máu.
   */
  troops?: number;
  /** Độ cao đặt thanh máu trên quân (m), chỉ dùng cho phần vẽ. Bỏ trống = theo cỡ thường. */
  barHeight?: number;
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
  /**
   * Drone bay lơ lửng (khác máy bay phản lực `fuel`): không cất / hạ cánh, không cần Sân Đáp, không đốt Dầu, bay không giới
   * hạn (người dùng chốt 11/11/2026). `alt`: độ cao bay (m). `draw`: điện (MW) khi đang nạp năng lượng trong vùng lưới điện.
   */
  hover?: { alt: number; draw: number };
  /**
   * Kho năng lượng của drone hỗ trợ (Khiên, Sửa Chữa…), giữ trong `Unit.fuel`: dùng cho khả năng của nó, bay thì không tốn.
   * Nạp `charge` mỗi giây khi ở trong vùng lưới điện (sau này: đơn vị tiếp năng lượng chở tới tiền tuyến). Drone không tự
   * bay về nạp (phải ở lại tiền tuyến); còn dưới `low` (tỉ lệ) thì hậu cần báo trước cho Tư lệnh.
   */
  energy?: { max: number; charge: number; low: number };
  /**
   * Cảm tử: chỉ khi được lệnh tấn công một mục tiêu mặt đất. Lao vào mục tiêu rồi nổ: `dmg` sát thương loại `dmgType`, lan
   * bán kính `splash` m.
   */
  kamikaze?: { dmg: number; splash: number; dmgType: DmgType };
  /**
   * Vòm khiên (Drone Khiên): khó bị câu (người dùng 11/11/2026). Khi tắt, drone cộng dồn sát thương danh nghĩa mà quân / công
   * trình phe mình trong `radius` m phải nhận (phai một nửa sau mỗi `fade` giây); vượt `trigger` và còn ít nhất `minStart`
   * năng lượng thì bật. Đang bật: hứng trước mọi sát thương vào phe mình trong vùng, tốn `perDmg` năng lượng mỗi điểm sát
   * thương hứng được và `drain` mỗi giây; không hứng phát nào trong `idleOff` giây thì tự tắt, giữ phần năng lượng còn lại.
   */
  shield?: { radius: number; trigger: number; fade: number; minStart: number; drain: number; perDmg: number; idleOff: number };
  /**
   * Hàn sửa (Drone Sửa Chữa): mỗi lúc sửa một mục tiêu phe mình trong `radius` m (Xe Tư Lệnh trước, rồi xe / máy bay hỏng
   * nặng nhất theo tỉ lệ, cuối cùng mới tới công trình), `rate` máu mỗi giây, tốn `perHp` năng lượng mỗi điểm máu.
   */
  repair?: { radius: number; rate: number; perHp: number };
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
  /** Công sự (tháp, tường…): công trình phòng thủ, không có đường trong căn cứ. (Từ 10/11/2026 mọi nhà được đặt sát nhau, miễn không vây kín cửa ra.) */
  fort?: boolean;
  /**
   * Công trình lát theo ô (Tường Thành, người dùng 10/11/2026 "1 ô lưới, đơn giản như Clash of Clans"): không có viền trong mô
   * hình (`clearCells` 0), không cần ô cấm xây với nhà khác (đặt sát nhau thành dải, sát mép nền móng nhà khác), đặt xong vẫn
   * ở chế độ đặt để rải tiếp, và hình tự nối với ô cùng loại cùng phe ngay bên cạnh (`Rig.setLinks`).
   */
  tile?: boolean;
  produces?: UnitId[];
  /** MW: dương = phát điện, âm = tiêu thụ. */
  power: number;
  /** Nhà Máy Điện: Dầu đốt mỗi giây để phát điện (hết Dầu thì không phát). */
  oilBurn?: number;
  /** Mở vùng xây dựng bán kính này (m) quanh công trình. Chỉ HQ, Nhà Máy Điện và Cột Điện có. */
  zone?: number;
  /**
   * Viền riêng (số ô lưới 2 m) thay cho `RULES.buildMarginCells`: Tổng Hành Dinh rộng hơn (2 ô) để xe vận tải ra vào quanh nó.
   */
  clearCells?: number;
  /**
   * Lối ra nằm TRONG nền móng (khung mô hình, m: [x0, z0, x1, z1], cửa ở phía +z): các ô này không bị nhà chặn, xe đúc xong
   * đứng ở đây rồi chạy ra. Người dùng 10/11/2026: xưởng 9 × 9 ô, góc trước bên phải là `doors` cửa, mỗi cửa 2 × 3 ô.
   */
  bay?: readonly [number, number, number, number];
  /** Số ô ráp xe chia đều theo bề rộng `bay` (mỗi xe trong lô đứng một ô, rồi chạy ra). */
  doors?: number;
  /** Chiều sâu ô ráp xe (m), tính từ cạnh sau của `bay`; phần còn lại phía trước là dải đường cho xe chạy ra. */
  stall?: number;
  /**
   * Bệ ráp khai báo thẳng (khung mô hình, m: [x0, z0, x1, z1] mỗi bệ, bệ đầu tiên là bệ gần cửa nhất), thay cho cách chia đều
   * `bay` theo `doors` / `stall`. Dùng khi các bệ không nằm hàng ngang trước cửa (Xưởng Xe Chuyên Dụng: 2 bệ nối nhau từ
   * trước ra sau, xe đứng ngang, lăn sang hầm kiểm chuẩn rồi chạy ra).
   */
  pads?: readonly (readonly [number, number, number, number])[];
  /** Hướng đầu xe đứng trên bệ, theo khung mô hình (nấc như `rot`: 0 = +z, 1 = +x, 2 = −z, 3 = −x). Mặc định 0 (nhìn ra cửa). */
  padFace?: number;
  /**
   * Nhà Máy Máy Bay: `pads` là các GIẾNG PHÓNG trên sàn nóc, máy bay cất cánh thẳng đứng (trạng thái `launch`). Cả lô ra đời cùng
   * một tick (giữ đủ bãi đậu như cũ); chiếc thứ k dùng giếng k mod số giếng, chiếc dùng chung giếng chờ dưới giếng tới lượt.
   * `deck`: độ cao mặt sàn phóng (m), `shaft`: độ sâu giếng (m).
   */
  launch?: { deck: number; shaft: number };
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
