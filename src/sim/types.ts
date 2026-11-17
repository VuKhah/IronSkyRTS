/**
 * Kiểu dữ liệu của lõi mô phỏng: thực thể, lệnh (Order) và sự kiện (SimEvent).
 *
 * Lệnh là con đường DUY NHẤT để thay đổi trận đấu: người chơi, AI và (sau này) người chơi qua mạng
 * đều gửi cùng một loại lệnh. Nhờ vậy, chỉ cần lưu seed + danh sách lệnh là chiếu lại được cả trận.
 * Sự kiện thì chạy theo chiều ngược lại: sim báo cho phần vẽ / âm thanh biết chuyện gì vừa xảy ra.
 */
import type { BuildingId, DmgType, FormationId, Res, Side, UnitId, WeaponVisual } from "./content";

/** "strike": rải thảm vào điểm (tx, tz): chạy tới tầm, dựng dàn, xả hết loạt rồi về "idle" (Xe Tên Lửa Loạt). */
export type UnitOrder = "idle" | "move" | "amove" | "attack" | "strike";
/** Xe Vận Tải: khai thác mỏ (toMine → mining → toDock → unloading) hoặc trục vớt xác (toWreck → salvaging → toDock → unloading). */
export type HaulState = "idle" | "toMine" | "mining" | "toDock" | "unloading" | "toWreck" | "salvaging";
/** `launch`: phóng thẳng đứng từ giếng Nhà Máy Máy Bay (airT < 0 = còn chờ dưới giếng, được che chắn). */
export type AirState = "none" | "parked" | "takeoff" | "launch" | "flying" | "returning" | "landing";
/** "hunt": mục tiêu tấn công vừa mất, tìm mục tiêu mới quanh đó tới `Unit.huntUntil` rồi về sân. */
export type AirMission = "none" | "move" | "attack" | "hunt";

export interface Unit {
  id: number;
  cat: "unit";
  kind: UnitId;
  side: Side;
  /**
   * Đội hình Tư lệnh đã chọn cho xe này. Nằm trên xe vì đội hành quân (`Squad`) tan ra khi tới nơi: lệnh sau không chọn
   * gì thì đi tiếp theo kiểu đã chọn. null = chưa từng chọn, dùng DEFAULT_FORMATION.
   */
  formation: FormationId | null;
  /** Lô: các xe đúc cùng một lần có cùng số này và được điều chung. 0 = không thuộc lô (quân có sẵn, thả trong sandbox). */
  lot: number;
  x: number;
  z: number;
  /** Vị trí ở tick trước, để phần vẽ nội suy mượt giữa 2 tick. */
  px: number;
  pz: number;
  /** Hướng (vector đơn vị) — sim không dùng góc. */
  hx: number;
  hz: number;
  phx: number;
  phz: number;
  alt: number;
  palt: number;
  hp: number;
  maxHp: number;
  /** Số tick còn lại trước khi được bắn tiếp. */
  cooldown: number;
  lastShot: number;
  /** Số viên còn lại của loạt đang bắn (0 = loạt mới). */
  burst: number;
  /**
   * Số tick đã đứng yên liên tục (Lockdown). Quân có `deploy` muốn chạy thì phải THU BỆ trước: mỗi tick trừ 1 (tối đa
   * từ `deploy.time`), về 0 mới lăn bánh. Hạ bệ bao lâu thì thu bệ bấy lâu, khớp hoạt ảnh.
   */
  still: number;
  /** Tick này đang thu bệ (không chạy, không được tính là đã cố định). Phần vẽ dùng để thu chân chống đúng lúc. */
  packing: boolean;
  /** Hướng nòng tháp pháo (vector đơn vị). Quân không có `traverse` thì luôn trùng hướng thân. */
  aimX: number;
  aimZ: number;
  /** Phòng thủ điểm: số lượt chặn còn lại và bộ đếm hồi lượt (tick). */
  pd: number;
  pdT: number;
  order: UnitOrder;
  /** Đích của lệnh, hoặc "điểm neo" khi đứng yên. */
  tx: number;
  tz: number;
  targetId: number;
  autoTarget: number;
  path: number[];
  pathI: number;
  repathAt: number;
  /** Tick tìm lại đường định kỳ tiếp theo khi đi đường dài (`follow`, bước 2 kế hoạch đế: xe đứng chắn đường thay đổi). */
  replanAt: number;
  stuck: number;
  moved: boolean;
  /**
   * Né xe (ORCA, 12/11/2026): độ lệch hướng (vector đơn vị hướng ORCA chọn − hướng muốn đi, cộng vào hướng muốn đi) và hệ số
   * tốc độ (1 = không phanh) tính ở cuối tick trước (`separate` → `orcaPass`), dùng ở tick này khi xe đi theo đường / tới ô.
   */
  avX: number;
  avZ: number;
  brake: number;
  /** Vận tốc muốn đi trong tick này (m/s, trước khi né), ghi khi xe đi theo đường / tới ô xa từ 3 m; 0 = không tự đi. */
  prefX: number;
  prefZ: number;
  /** Xe trong đội hình: cách ô của mình bao xa (m) ở tick này; 0 khi không trong đội. Xe cùng đội: xe đúng ô nhường xe lệch ô. */
  slotOff: number;
  /** Số tick liền ORCA giữ xe gần như đứng (phanh < 25%); đủ ORCA_HOLD_MAX thì thôi né xe đứng yên, để luật chạm lách qua. */
  orcaHeld: number;
  /** Đang đuổi theo mục tiêu (đường đi đang trỏ tới mục tiêu, không phải tới đích lệnh). */
  chasing: boolean;
  /** Hướng quay mặt khi tới đích / khi về lại chỗ đứng (0, 0 = giữ hướng đang đi). */
  faceX: number;
  faceZ: number;
  /**
   * NHƯỜNG ĐƯỜNG (T2, 16/11/2026, `yieldPass`): xe đứng dạt tới (yieldX, yieldZ) cho xe cùng phe đi qua, giữ tới tick `yieldUntil`;
   * `yieldAway` = đang ở ngoài ô nhà (tx, tz), hết hạn nhường thì chạy theo xích về ô.
   */
  yieldX: number;
  yieldZ: number;
  yieldUntil: number;
  yieldAway: boolean;
  /** Tới tick này xe không nhường được (đã chờ dọn lối quá lâu mà kẹt): là vật cản cứng, xe khác tìm đường vòng. */
  yieldBlock: number;
  /** Xe đang đi đứng chờ xe phía trước dạt nhường xong (số tick liền); quá lâu thì coi xe chắn là vật cản và tìm đường vòng. */
  laneWait: number;
  /** Đang hành quân trong đội hình nào (`Squad.id`, 0 = đi riêng). */
  squad: number;
  /** Thuộc sư đoàn nào (`Division.id`, 0 = xe lẻ). Bền hơn `squad`: còn giữ sau khi tới nơi. */
  division: number;
  /** Gốc phát của phát đạn trúng xe gần nhất (`lastHit`): tướng sư đoàn biết bị bắn từ đâu. */
  hitX: number;
  hitZ: number;
  /** Mục tiêu tướng sư đoàn giao (D4: ưu tiên kẻ đang bắn sư đoàn, dồn hỏa lực, không bắn quá tay); 0 = tự chọn. */
  divTarget: number;
  /** Tới tick này đồng đội đã vào ô dạt nhường cho xe (ô của nó bị đồng đội vây kín, không còn đường vòng). */
  squeezeUntil: number;
  /** Điểm đầu đoạn đường đang đi (chỗ đứng lúc tìm đường, rồi điểm vừa qua): xe xích bám ĐOẠN đường, không chỉ nhắm đỉnh kế tiếp. */
  pathFromX: number;
  pathFromZ: number;
  /** Chiều xe muốn chạy dọc thân ở lần gần nhất (+1 tiến, −1 lùi) và tick đó: luật hai xe chặn lẫn nhau xét đúng chiều xe kia muốn đi. */
  driveDir: number;
  driveTick: number;
  // Xe Vận Tải
  hState: HaulState;
  mineId: number;
  manual: boolean;
  cargo: number;
  cargoRes: Res;
  hTimer: number;
  /** Trục vớt: xác đang được giao kéo (0 = không), Sắt từ xác đang chở trên xe (tính riêng với quặng). */
  wreckId: number;
  scrap: number;
  // Máy bay
  air: AirState;
  fuel: number;
  padB: number;
  padI: number;
  speed: number;
  airT: number;
  mission: AirMission;
  /** Nhiệm vụ "hunt": tới tick này mà không có mục tiêu mới thì bay về sân. */
  huntUntil: number;
  mx: number;
  mz: number;
  rtb: boolean;
  ax: number;
  az: number;
  crashed: boolean;
  /** Máy bay vừa bổ nhào qua mục tiêu: đang giữ thẳng hướng lấy khoảng cách trước khi quay lại lượt sau. */
  ext: boolean;
  /** Máy bay: tốc độ ngoặt hiện tại (radian mỗi tick, dấu = chiều ngoặt). Tăng giảm dần cho đường bay mượt. */
  yawRate: number;
  /** Máy bay: tốc độ lên / xuống (m/s, + = lên), đổi dần theo `RULES.air.climbAcc`. */
  vy: number;
  /** Drone Khiên: vòm đang bật (1/0), số tick liền không hứng phát nào, mức nguy hiểm đang đo (sát thương danh nghĩa, phai dần). */
  shieldOn: number;
  shieldIdle: number;
  threat: number;
  /** Vũ khí phụ: số tick chờ bắn tiếp và số viên còn lại của lần xuất kích này. */
  cd2: number;
  ammo2: number;
  /** Cựu binh: kinh nghiệm (theo giá trị sát thương gây ra), cấp 0..3, tick trúng đạn gần nhất (để tự hồi máu). */
  xp: number;
  rank: number;
  lastHit: number;
}

/** Đài Liên Lạc (điểm chiếm): đứng gần để chiếm như mỏ; phe giữ được nhìn xa quanh đài. */
export interface Uplink {
  id: number;
  x: number;
  z: number;
  owner: Side | -1;
  /** Tiến độ chiếm (0..1) và phe đang chiếm dở. */
  cap: number;
  capSide: Side | -1;
}

/**
 * Xác quân trên chiến trường: chứa Sắt. Chỉ Xe Vận Tải lấy được: tới nơi, cẩu lên xe, chở về Tổng Hành Dinh,
 * dỡ hàng xong mới cộng Sắt. Xe chiến đấu chạy qua thì không có gì.
 */
export interface Wreck {
  id: number;
  /** Loại quân đã bị hạ (để vẽ đúng hình xác) và phe của nó. */
  kind: UnitId;
  side: Side;
  x: number;
  z: number;
  /** Hướng thân lúc bị hạ (vector đơn vị). */
  hx: number;
  hz: number;
  /** Lượng Sắt nhặt được. */
  value: number;
  /** Tick xác biến mất (xác đang có xe tới kéo thì không biến mất). */
  until: number;
  /**
   * Id Xe Vận Tải mỗi phe đang được giao kéo xác này (0 = chưa ai): hậu cần không điều hai xe cùng phe tới một xác.
   * Hai phe giữ chỗ riêng: xe hai bên vẫn tranh nhau được, xe nào cẩu xong trước thì được.
   */
  claim: [number, number];
}

export interface Building {
  id: number;
  cat: "building";
  kind: BuildingId;
  side: Side;
  x: number;
  z: number;
  /** Nấc xoay 0..3 = hướng cửa (+z, +x, −z, −x); xem `doorDir`, `rotHalf` trong content.ts. */
  rot: number;
  hp: number;
  maxHp: number;
  /** Tiến độ xây (0..1). */
  progress: number;
  built: boolean;
  queue: UnitId[];
  /** Số tick đã đúc của món đầu hàng chờ. */
  prog: number;
  rallyX: number;
  rallyZ: number;
  rallySet: boolean;
  /** Hướng tháp (vector đơn vị, theo thế giới): công trình có vũ khí xoay tháp trong `traverse` độ/giây mới bắn được. */
  aimX: number;
  aimZ: number;
  cooldown: number;
  lastShot: number;
  burst: number;
  targetId: number;
  cells: number[];
  /** Sân Đáp: id máy bay giữ từng bãi (0 = trống). */
  pads: number[];
  /** Đang hoạt động: nhà máy đang phát / pin đang nạp hoặc xả / công trình tiêu thụ đang có điện / radar đang chạy. */
  active: boolean;
  /** Công trình tiêu thụ: phần điện được cấp (0..1), do hậu cần phân theo ưu tiên. */
  powerFrac: number;
  /** Nhà Máy Điện: công suất đang phát (MW). Trạm Tích Điện: dòng điện (MW, dương = nạp, âm = xả). */
  load: number;
  /** Trạm Tích Điện: điện đang chứa (MJ). */
  charge: number;
}

export interface Mine {
  id: number;
  cat: "mine";
  res: Res;
  x: number;
  z: number;
  amount: number;
  max: number;
  owner: Side | -1;
  /** Với mỏ đã có chủ: độ "giữ" (1 = vững). Với mỏ trung lập: tiến độ chiếm của capSide. */
  cap: number;
  capSide: Side | -1;
  /**
   * Chỗ khai thác thứ i giữ Xe Vận Tải nào (id, 0 = trống); cùng độ dài với `spots`. Mỗi xe giữ cố định chỗ của mình (trước
   * 12/11/2026 chỗ đánh theo thứ tự trong danh sách nên một xe rời đi là xe khác bị đổi chỗ giữa đường).
   */
  slots: number[];
  /** Các khối quặng / giếng và chỗ đỗ của bãi (tính một lần lúc tạo trận, xem RULES.field). */
  spots: MineSpot[];
  /** Ô bị chặn bởi các khối của bãi. */
  cells: number[];
  /** Bán kính ngoài của bãi (m, tới đuôi xe đỗ xa nhất): vùng cấm xây, vòng chiếm, vòng vẽ. */
  radius: number;
}

/** Một điểm khai thác của bãi tài nguyên: khối quặng / giếng (1 ô) và chỗ đỗ của Xe Vận Tải ngay phía ngoài nó. */
export interface MineSpot {
  /** Tâm khối quặng / giếng (m). */
  x: number;
  z: number;
  /** Tâm chỗ đỗ (m). */
  px: number;
  pz: number;
  /** Hướng xe đỗ (vector đơn vị, mũi vào khối). */
  fx: number;
  fz: number;
}

export type Entity = Unit | Building | Mine;
export type Target = Unit | Building;

export interface Shot {
  side: Side;
  src: number;
  target: number;
  tx: number;
  tz: number;
  dmg: number;
  dmgType: DmgType;
  /** Điểm khai hỏa (giáp mặt trước tính hướng đạn tới từ đây). */
  sx: number;
  sz: number;
  /** Độ cao điểm rơi (đạn trượt / bom không bám mục tiêu dùng số này để vẽ tiếng nổ). */
  talt: number;
  interceptable: boolean;
  splash: number;
  hitAir: boolean;
  impact: number;
  visual: WeaponVisual;
}

export type Order =
  | { t: "move"; ids: number[]; x: number; z: number; formation?: FormationId }
  | { t: "amove"; ids: number[]; x: number; z: number; formation?: FormationId }
  | { t: "attack"; ids: number[]; target: number }
  | { t: "stop"; ids: number[] }
  | { t: "harvest"; ids: number[]; mine: number }
  /** Xe Vận Tải đi kéo xác quân về (mỗi xe một xác: xác được chạm trước, rồi các xác gần đó). */
  | { t: "salvage"; ids: number[]; wreck: number }
  | { t: "rtb"; ids: number[] }
  /** Chế độ sư đoàn (A2 D5): "direct" = Tư lệnh nắm trực tiếp (tướng thôi tự quyết chiến thuật, vẫn lo giao thông nội bộ). */
  | { t: "divMode"; ids: number[]; mode: "auto" | "direct" }
  | { t: "build"; kind: BuildingId; x: number; z: number; rot?: number }
  | { t: "produce"; building: number; kind: UnitId }
  | { t: "cancel"; building: number }
  | { t: "rally"; building: number; x: number; z: number }
  | { t: "sell"; building: number }
  /** Rải thảm: các xe có vũ khí rải thảm (Xe Tên Lửa Loạt) trong `ids` chạy tới tầm và xả hết loạt vào vùng quanh (x, z). */
  | { t: "barrage"; ids: number[]; x: number; z: number }
  /** Kỹ năng Xe Tư Lệnh: tổng động viên quân quanh xe (có thời gian hồi). */
  | { t: "mobilize" }
  // ---- Phòng Thử Nghiệm: chỉ có tác dụng khi World tạo với { sandbox: true }, trận thường bỏ qua
  /** Thả quân / công trình (đã xây xong) cho phe `side`. Có (gx, gz) thì quân tự đi tới đó: mặc định tấn công-di chuyển, `go: "move"` thì chỉ đi (máy bay bay ngang). */
  | { t: "sbSpawn"; kind: UnitId | BuildingId; side: Side; x: number; z: number; gx?: number; gz?: number; go?: "move" | "amove"; rot?: number }
  | { t: "sbRemove"; ids: number[] }
  /** Hồi đầy máu (và dầu máy bay). */
  | { t: "sbHeal"; ids: number[] }
  /** Dọn sạch quân và công trình (trừ Tổng Hành Dinh), đặt lại số đo sát thương. */
  | { t: "sbClear" }
  /** Phe `side` ngừng bắn (làm bia tập). */
  | { t: "sbHold"; side: Side; on: boolean }
  /** Cả phe (quân mặt đất) đi-và-đánh tới (x, z) như MỘT nhóm: dàn đội hình (trận đấu thử). */
  | { t: "sbGo"; side: Side; x: number; z: number }
  /** Máy bay không tốn nhiên liệu. */
  | { t: "sbFuel"; on: boolean };

export interface Command {
  side: Side;
  order: Order;
}

export type AlertKind = "commander" | "base" | "hauler" | "lowfuel" | "nooil" | "mineLost" | "powerShort" | "powerForecast" | "oilLow" | "batteryLow" | "uplinkLost" | "droneLow";
export type WinReason = "commander" | "buildings" | "monopoly" | "timeout";

export type SimEvent =
  | { t: "shot"; src: number; side: Side; visual: WeaponVisual; x: number; z: number; alt: number; target: number; tx: number; tz: number; talt: number; ticks: number; ox: number; oz: number }
  | { t: "hit"; side: Side; visual: WeaponVisual; x: number; z: number; alt: number; splash: number }
  | { t: "death"; id: number; kind: UnitId | BuildingId; side: Side; x: number; z: number; alt: number; building: boolean; crash: boolean; sold: boolean }
  | { t: "spawn"; id: number; kind: UnitId; side: Side }
  | { t: "placed"; id: number; kind: BuildingId; side: Side }
  | { t: "built"; id: number; kind: BuildingId; side: Side }
  | { t: "captured"; mine: number; res: Res; side: Side | -1; prev: Side | -1 }
  | { t: "alert"; side: Side; what: AlertKind; x: number; z: number; n?: number }
  | { t: "monopoly"; side: Side; res: Res }
  | { t: "rank"; id: number; kind: UnitId; side: Side; rank: number; x: number; z: number }
  /** Xe Vận Tải dỡ Sắt trục vớt ở Tổng Hành Dinh (x, z = chỗ dỡ hàng). */
  | { t: "salvage"; side: Side; value: number; x: number; z: number }
  /** Đài Liên Lạc đổi chủ (side = -1: vừa bị giành mất, thành trung lập). */
  | { t: "uplink"; id: number; side: Side | -1; prev: Side | -1; x: number; z: number }
  /** Một xe rải thảm bắt đầu xả loạt mới từ (x, z) nhắm vào vùng quanh (tx, tz) (cho tiếng rít báo động, số liệu). */
  | { t: "salvo"; id: number; side: Side; x: number; z: number; tx: number; tz: number }
  | { t: "mobilize"; side: Side; x: number; z: number; r: number }
  /** Xe Tư Lệnh máu thấp đang bị bắn: tự rút về (x, z). */
  | { t: "retreat"; side: Side; x: number; z: number }
  /** Vòm khiên bật (on) hoặc vỡ / hết giờ (off) quanh drone `id`. */
  | { t: "shield"; id: number; side: Side; on: boolean; x: number; z: number }
  | { t: "end"; winner: Side | 2; reason: WinReason };

export interface SideStats {
  unitsBuilt: number;
  unitsLost: number;
  kills: number;
  ironMined: number;
  oilMined: number;
  buildingsBuilt: number;
  /** Tổng sát thương thực gây ra (sau giáp, không tính phần dư khi mục tiêu đã hết máu). */
  damageDealt: number;
  /** Sắt nhặt được từ xác quân. */
  salvaged: number;
  /** Số loạt tên lửa đã xả; số lần quân lên cấp cựu binh, cấp cao nhất đạt được; số giây giữ Đài Liên Lạc (cộng mọi đài). */
  salvos: number;
  promotions: number;
  topRank: number;
  uplinkTime: number;
}

export interface SideState {
  iron: number;
  oil: number;
  /** Tổng động viên (kỹ năng của Xe Tư Lệnh): còn hiệu lực tới tick nào, dùng lại được từ tick nào. */
  mobilizeUntil: number;
  mobilizeReady: number;
  /** Tỉ lệ điện cấp cho việc sạc drone tick trước (mức ưu tiên thấp nhất), 0..1. */
  droneFrac: number;
  /** Số mốc máu Xe Tư Lệnh đã tự rút (`RULES.commanderRetreat.at`): 0 = chưa rút lần nào. */
  retreatLevel: number;
  /** Ô đang thấy (1) — tính lại mỗi tick. Quân mặt đất chỉ thấy ô ở tầng không cao hơn tầng mình đứng. */
  vis: Uint8Array;
  /** Ô có máy bay trong đó thì thấy được (1): mọi vùng trong tầm nhìn, không bị tầng hay rừng che — tính lại mỗi tick. */
  visAir: Uint8Array;
  /** Ô đã từng thấy. */
  explored: Uint8Array;
  /** Công trình địch đã từng phát hiện. */
  known: Set<number>;
  /** Số tick đang giữ độc quyền liên tục. */
  mono: number;
  monoRes: Res | null;
  /** Điện (hậu cần tự điều độ): khả năng phát (HQ + nhà máy còn Dầu), tiêu thụ, tiêu thụ của công trình đang xây (MW). */
  powerCap: number;
  powerUse: number;
  powerPending: number;
  /** Phần tiêu thụ được đáp ứng (0..1). */
  eff: number;
  /** Pin: đang chứa / tối đa (MJ), dòng (MW, dương = nạp). */
  battery: number;
  batteryMax: number;
  batteryFlow: number;
  /** Dầu Nhà Máy Điện đang đốt (Dầu/giây). */
  oilBurn: number;
  alerts: Record<AlertKind, number>;
  stats: SideStats;
}

/**
 * SƯ ĐOÀN (A2, người dùng duyệt 17/11/2026, `Docs/plans/2026-11-17-A2-tuong-su-doan-thiet-ke.md`): nhóm quân bền vững có
 * "tướng dưới trướng". Sinh ra từ lệnh đi / tấn công-di chuyển cho từ 3 xe mặt đất; không tan khi tới nơi mà đóng quân.
 * Lúc đang đi, phần hành quân vẫn do `Squad` lo; sư đoàn nhớ những gì còn lại sau khi đội hình hành quân xong việc.
 */
export interface Division {
  id: number;
  side: Side;
  /** Xe mặt đất và Drone Khiên của sư đoàn, theo mã tăng dần. */
  ids: number[];
  /** `auto` = tướng tự quyết chiến thuật; `direct` = Tư lệnh nắm trực tiếp, tướng chỉ lo giao thông nội bộ. */
  mode: "auto" | "direct";
  /** Chỉ thị đang làm: đang đi (thường / tấn công-di chuyển) hay đã tới nơi đóng quân. */
  directive: "move" | "amove" | "station";
  /** Chỗ đóng quân: tâm, hướng mặt (vectơ đơn vị), và ô của từng xe (chỗ đứng lúc tới nơi). */
  cx: number;
  cz: number;
  hx: number;
  hz: number;
  homeX: Record<number, number>;
  homeZ: Record<number, number>;
  /**
   * BÁO ĐỘNG (D3): "near" = địch trong tầm với của sư đoàn (`reach`: vùng phản công + tầm bắn trực tiếp xa nhất), cả sư đoàn phản
   * ứng; "far" = chỉ bị bắn / thấy địch ở xa (Pháo, Tên Lửa Loạt tự bắn, quân khác đứng yên). Hết hạn `alarmUntil` thì thôi.
   */
  alarm: "none" | "far" | "near";
  alarmUntil: number;
  /** Nguồn đe dọa (trọng tâm các địch gần đã thấy, nghiêng về kẻ vừa bắn). */
  threatX: number;
  threatZ: number;
  /** Hướng mặt hiện tại của sư đoàn (đã xoay về phía địch thì khác `hx/hz`, hướng lúc đóng quân). */
  fx: number;
  fz: number;
  /** Tick sớm nhất được xoay lần nữa; xe đi về ô mới tới tick `reformUntil` (bỏ qua mục tiêu, vừa đi vừa bắn). */
  pivotAt: number;
  reformUntil: number;
  /** Tầm với (m) tính từ tâm khi đóng quân. */
  reach: number;
}

/**
 * Đội hình hành quân (người dùng 06/11/2026: giữ đội hình khi di chuyển, qua cầu / chỗ hẹp, quay hướng như cánh cửa).
 * Một "người dẫn đầu ảo" (giữa hàng đầu) đi theo đường A*; mỗi xe giữ một ô phía sau nó. Đi thẳng thì cả đội là một khối;
 * qua khúc cua thì các hàng nối nhau đi theo đúng vệt của người dẫn đầu (như đoàn tàu); chỗ hẹp thì co bớt số xe mỗi hàng.
 */
export interface Squad {
  id: number;
  side: Side;
  kind: "move" | "amove";
  /** Kiểu đội hình đang dùng (bảng FORMATIONS trong content.ts). */
  formation: FormationId;
  /** Tuyến của từng xe theo id, tính lúc dựng đội hình (đoạn hậu là tuyến riêng). */
  rankOf: Record<number, number>;
  /** Tốc độ chung của cả khối (m/s), xem `RULES.escortBoost`. */
  speed: number;
  /** Đội đã vào hàng dịch nguyên khối quãng ngắn: mọi xe chờ nhau thu bệ, xoay thân xong rồi mới cùng lăn bánh, cùng một tốc độ. */
  rigid: boolean;
  /** Đội `rigid` đã bắt đầu lăn bánh. */
  rolling: boolean;
  /** Thứ tự xe trong đội hình (vai trò → hàng → trái sang phải), giữ nguyên suốt lệnh: co / giãn hàng vẫn theo thứ tự này. */
  ids: number[];
  /** Ô của từng xe (cùng chỉ số với `ids`): lệch ngang (m, + = bên phải) và lùi sau người dẫn đầu (m). */
  offLat: number[];
  offBack: number[];
  /** Số xe mỗi hàng đang dùng / khi rộng rãi. */
  cols: number;
  colsMax: number;
  width: number;
  depth: number;
  /** Bán kính xe lớn nhất trong đội (m). */
  rMax: number;
  /** Người dẫn đầu ảo: vị trí, hướng đội hình. */
  x: number;
  z: number;
  hx: number;
  hz: number;
  /** Hướng muốn đi (lúc ra lệnh) và đích (tâm khối khi tới nơi). */
  wantX: number;
  wantZ: number;
  goalX: number;
  goalZ: number;
  path: number[];
  pathI: number;
  /** Vệt người dẫn đầu: mỗi điểm 6 số (x, z, hx, hz, quãng đường, độ cong 1/m). */
  trail: number[];
  /** Quãng đường người dẫn đầu đã đi (m). */
  s: number;
  phase: "form" | "direct" | "pivot" | "march" | "settle";
  phaseT: number;
  /**
   * Xếp hàng theo vai trò (đầu / giữa / sau). Sau khi cả đội xoay tại chỗ thì tắt: giữ nguyên chỗ đứng, không ai đổi chỗ
   * (người dùng chốt 06/11/2026: quay đầu 180° thì hàng sau thành hàng đầu).
   */
  byRank: boolean;
  /** Có xe đang bắn mục tiêu trong tầm (đi-và-đánh): cả khối dừng lại. Xe đặt trong tick, khối đọc ở tick sau. */
  hold: boolean;
  /** Đang dừng bắn (giá trị `hold` của tick trước): xe trong pha "đi thẳng tới ô" cũng đứng lại. */
  holding: boolean;
  /** Cả khối dạt ngang khỏi đường của người dẫn đầu (m, + = phải) để né vật cản một bên; dạt dần tới `shiftWant`. */
  shift: number;
  shiftWant: number;
  /** Số lần đo liên tiếp thấy đủ rộng để giãn thêm hàng (giãn phải chờ ổn định, co thì co ngay). */
  wideFor: number;
  /** Ổn định chỗ khi tới nơi tối đa bao nhiêu tick (theo độ dài cột lúc tới). */
  settleMax: number;
  /** GỠ KẸT Ở ĐÍCH (`squadUnjam`): khoảng cách tới ô ở lần đo trước, theo mã xe. */
  prog: Record<number, number>;
  /** Số lần đo liền xe không tiến gần ô được (kẹt), theo mã xe. */
  stuck: Record<number, number>;
  /** Tick sớm nhất được đổi ô lần nữa (chống đổi qua lại). */
  swapAt: number;
  /** XE LẠC (A2 D2): số tick liền xe tụt khỏi ô quá `SQUAD_LAG`, theo mã xe. Quá `STRAY_AFTER` thì khối thôi chờ nó. */
  lagT: Record<number, number>;
  /** Số tick liền xe đứng cách ô dưới SETTLE_NEAR (pha `settle`): đủ SETTLE_NEAR_T thì coi là đã tới ("tới gần là tới"). */
  nearT: Record<number, number>;
  /** Tốc độ thật của người dẫn đầu ở tick vừa rồi (m/s, 0 khi đứng / không hành quân): xe bám ô chỉnh tốc độ theo nó. */
  v: number;
  /** Phía làn ngoài (+1 phải, −1 trái) xe đang dùng để vượt / chờ, giữ nguyên tới khi về ngang hàng (không đổi phía giữa chừng). */
  laneSide: Record<number, number>;
  /** Chỗ và tick xe bắt đầu đứng quanh quẩn (chưa đi xa quá 0,5 m), theo mã xe: đo "không tới được" ở đích (`squadGaveUp`). */
  moveRef: Record<number, [number, number, number]>;
  /** Ở đích: độ lùi (`offBack`) của tuyến trước nhất còn xe chưa vào ô; tuyến sau nó chưa tới lượt (xe biết nhường). */
  admitBack: number;
}
