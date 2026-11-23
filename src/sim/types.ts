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
  /** Số tick liền xe muốn đi mà gần như không tiến (`follow`): đủ ngưỡng thì tìm đường lại, rồi bỏ cuộc gần đích. */
  stuck: number;
  /** Tiến độ tới đích đường đi: gần nhất từng tới (m) và tick lần cuối lại gần thêm PROGRESS_STEP. Đang tiến thì không bỏ cuộc. */
  progD: number;
  progT: number;
  moved: boolean;
  /** Đang đuổi theo mục tiêu (đường đi đang trỏ tới mục tiêu, không phải tới đích lệnh). */
  chasing: boolean;
  /** Hướng quay mặt khi tới đích / khi về lại chỗ đứng (0, 0 = giữ hướng đang đi). */
  faceX: number;
  faceZ: number;
  /** Đang đi trong khối nào (`Group.id`, 0 = đi riêng) và ô thứ mấy trong khối. */
  group: number;
  slot: number;
  /**
   * Ưu tiên trong khối (0 = cao nhất): ô nào đang ở TRƯỚC trên đường đi của khối thì ưu tiên hơn (hành quân: theo độ lùi của ô trong
   * mẫu đang dùng; tới đích: theo hàng của ô cuối). Xe ưu tiên hơn đang đi được đẩy dạt đồng đội ưu tiên thấp (`contact.ts`).
   */
  gprio: number;
  /**
   * NÉ XE (`avoid`, lõi mới 20/11/2026): xe đang lách quanh xe nào (mã, 0 = không) và về phía nào (+1 phải, −1 trái). Nhớ phía
   * đã chọn tới khi qua hẳn xe đó, để không lắc qua lại.
   */
  avoidId: number;
  avoidSide: number;
  /** Hướng lái ra của tầng né tick trước (`avoid`) và tick đó: hướng mới trộn với hướng cũ (không lắc theo từng tick). */
  avX: number;
  avZ: number;
  avT: number;
  /** Số tick liền xe đứng (không lệnh) bị đẩy lệch ô quá `HOME_SLACK`: đủ `HOME_DELAY` thì tự lái về ô. */
  homeT: number;
  /** Tick gần nhất xe được lái (`drive`): tick nào không được lái thì xe hãm dần theo quán tính (`coast`). */
  driveT: number;
  /**
   * XE ĐANG ĐI (lõi 23/11/2026, kế hoạch "di chuyển như mọi người" B1): tick này xe được lái và muốn tiến tới (không chỉ đứng
   * đúng ô / quay mặt). `wasGoing` = trạng thái đó ở tick trước (tầng lái đọc số này: không phụ thuộc thứ tự duyệt xe). Xe cùng phe
   * KHÔNG đi (và không hạ bệ) là xe đứng: xe đi không né, không phanh vì nó, chạm thì nó dạt hẳn sang (`contact.ts`).
   */
  going: boolean;
  wasGoing: boolean;
  /** Thuộc sư đoàn nào (`Division.id`, 0 = xe lẻ). Bền hơn `group`: còn giữ sau khi tới nơi. */
  division: number;
  /** Gốc phát của phát đạn trúng xe gần nhất (`lastHit`): tướng sư đoàn biết bị bắn từ đâu. */
  hitX: number;
  hitZ: number;
  /** Mục tiêu tướng sư đoàn giao (D4: ưu tiên kẻ đang bắn sư đoàn, dồn hỏa lực, không bắn quá tay); 0 = tự chọn. */
  divTarget: number;
  /** Phi đội: mã chiếc dẫn đầu của nhóm máy bay nhận chung lệnh bay (0 = bay lẻ). Phi đội đánh chung mục tiêu do `updateWings` giao (`divTarget`). */
  wing: number;
  /** Chỗ trong mũi tên phi đội so với chiếc dẫn đầu (m): ngang (dương = bên phải hướng bay) và lùi sau. */
  wingLat: number;
  wingBack: number;
  /** Điểm đầu đoạn đường đang đi (chỗ đứng lúc tìm đường, rồi điểm vừa qua): xe bám ĐOẠN đường, không chỉ nhắm đỉnh kế tiếp. */
  pathFromX: number;
  pathFromZ: number;
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
  /**
   * Tốc độ hiện tại (m/s). Máy bay: dọc hướng bay. Xe mặt đất (lõi mới 20/11/2026): dọc trục thân, âm = đang lùi; chỉ `drive()`
   * đổi số này, theo gia tốc / hãm của xe (`UnitSpec.accel`, `brake`) nên xe có quán tính.
   */
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
 * Lúc đang đi, phần hành quân do khối (`Group`) lo; sư đoàn nhớ những gì còn lại sau khi khối tới nơi.
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
 * KHỐI (lõi di chuyển mới 20/11/2026, `world/group.ts`, thiết kế `Docs/plans/2026-11-20-loi-di-chuyen-moi-thiet-ke.md`): các xe
 * mặt đất nhận chung một lệnh đi. Một "neo" ảo chạy trên MỘT đường A* chung; mỗi xe giữ một ô (lệch ngang `lat`, lùi `back` so
 * với neo, đo dọc vệt đường nên qua cua các hàng nối nhau như đoàn xe). Cả khối cùng tốc độ, cùng lăn bánh, cùng dừng.
 * Quãng ngắn (`direct`): mỗi xe chạy thẳng tới ô cuối, tốc độ chia để cả khối tới cùng lúc.
 */
export interface Group {
  id: number;
  side: Side;
  kind: "move" | "amove";
  formation: FormationId;
  mode: "direct" | "march";
  /** Xe của từng ô (ô thứ i là của ids[i]); thứ tự đọc của mẫu đầy đủ: tuyến trước → sau, trái → phải. */
  ids: number[];
  /** Mẫu đang dùng: lệch ngang (m, + = bên phải) và lùi sau neo (m, + = phía sau) của từng ô. */
  lat: number[];
  back: number[];
  /** Lệch ngang / lùi ĐANG ÁP của từng ô: đổi dần tới `lat` / `back` (khối biến hình êm khi co / giãn cột). */
  latS: number[];
  backS: number[];
  /** Mẫu đầy đủ (rộng rãi, xếp theo vai lúc lập khối): lệch ngang và lùi của từng ô. */
  lat0: number[];
  back0: number[];
  /** Số cột khi rộng rãi / đang dùng (co qua lối hẹp). */
  colsMax: number;
  cols: number;
  /** Nửa bề ngang (tới mép thân xe ngoài cùng) của mẫu đang dùng (m), và của mẫu c cột (chỉ số c − 1). */
  halfW: number;
  halfWFor: number[];
  /** Đường chung của neo [x, z, …], điểm đầu là chỗ neo xuất phát; quãng cộng dồn tới từng điểm (m). */
  path: number[];
  cum: number[];
  /** Neo: quãng đã đi trên đường (m) và tốc độ (m/s). */
  s: number;
  v: number;
  /** Tốc độ khối tối đa (m/s); gia tốc / hãm của neo (m/s², theo xe ì nhất). */
  speed: number;
  accel: number;
  brake: number;
  /** Hình cuối: tâm, hướng mặt chung; ô cuối của từng ô. */
  goalX: number;
  goalZ: number;
  faceX: number;
  faceZ: number;
  endX: number[];
  endZ: number[];
  /** Ô tick này của từng ô, và chỗ ô đó ở tick trước theo đúng mẫu đang dùng (để đo tốc độ và hướng ô). */
  sx: number[];
  sz: number[];
  psx: number[];
  psz: number[];
  /**
   * Hàng chưa tới lượt vào đường (lùi sau hàng đầu, vệt kéo dài ra sau chỗ xuất phát): `wait` = xe đứng chờ tại chỗ xuất phát của nó
   * (wx0, wz0) tới lượt mới vào đường (sau lưng vướng vách / nhà); false = bám vệt kéo dài. Quyết định một lần lúc lập khối.
   */
  wait: boolean[];
  wx0: number[];
  wz0: number[];
  /** Số tick liền xe của từng ô tụt khỏi ô quá LAG_OK (quá lâu thì neo thôi chờ xe đó); hệ số chậm của neo vì xe tụt (làm mượt). */
  lagT: number[];
  lagK: number;
  /** Mẫu đang dùng là mẫu theo vai (true) hay theo thứ tự xe đang đi (đã qua lối hẹp); đã dựng lại hình cuối chưa. */
  role: boolean;
  endFit: boolean;
  /** Tốc độ (m/s) và hướng chạy của từng ô, làm mượt: xe bám ô theo số này. */
  vs: number[];
  dx: number[];
  dz: number[];
  /** Thẳng tới ô: tốc độ riêng từng xe (m/s) để cả khối tới cùng lúc; lùi tối đa bao xa (m). */
  pace: number[];
  revMax: number;
  /** Tấn công-di chuyển: cả khối đang dừng đánh; tick cuối cùng còn xe có địch trong tầm. */
  hold: boolean;
  holdT: number;
  /** Tick bắt đầu đợt dừng đánh hiện tại; dừng mà không bắn được thì tới tick `noHold` mới được dừng lại (đi tiếp, vừa đi vừa bắn). */
  holdFrom: number;
  noHold: number;
  /** Số tick từ lúc lập khối; tick neo tới cuối đường (−1 = chưa tới). */
  t: number;
  doneT: number;
  /** Số lần đo liền thấy lối phía trước đủ rộng để giãn thêm cột (giãn phải chờ ổn định, co thì co ngay). */
  wideFor: number;
  /** Tick lần đổi số cột gần nhất (giãn phải cách lần đổi trước ít nhất COLS_DWELL). */
  colsT: number;
}
