/**
 * Kiểu dữ liệu của lõi mô phỏng: thực thể, lệnh (Order) và sự kiện (SimEvent).
 *
 * Lệnh là con đường DUY NHẤT để thay đổi trận đấu: người chơi, AI và (sau này) người chơi qua mạng
 * đều gửi cùng một loại lệnh. Nhờ vậy, chỉ cần lưu seed + danh sách lệnh là chiếu lại được cả trận.
 * Sự kiện thì chạy theo chiều ngược lại: sim báo cho phần vẽ / âm thanh biết chuyện gì vừa xảy ra.
 */
import type { BuildingId, DmgType, Res, Side, UnitId, WeaponVisual } from "./content";

/** "strike": rải thảm vào điểm (tx, tz): chạy tới tầm, dựng dàn, xả hết loạt rồi về "idle" (Xe Tên Lửa Loạt). */
export type UnitOrder = "idle" | "move" | "amove" | "attack" | "strike";
/** Xe Vận Tải: khai thác mỏ (toMine → mining → toDock → unloading) hoặc trục vớt xác (toWreck → salvaging → toDock → unloading). */
export type HaulState = "idle" | "toMine" | "mining" | "toDock" | "unloading" | "toWreck" | "salvaging";
export type AirState = "none" | "parked" | "takeoff" | "flying" | "returning" | "landing";
export type AirMission = "none" | "move" | "attack";

export interface Unit {
  id: number;
  cat: "unit";
  kind: UnitId;
  side: Side;
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
  stuck: number;
  moved: boolean;
  /** Đang đuổi theo mục tiêu (đường đi đang trỏ tới mục tiêu, không phải tới đích lệnh). */
  chasing: boolean;
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
  /** Id các Xe Vận Tải đang được giao mỏ này (tối đa RULES.mineSlots). */
  slots: number[];
  cells: number[];
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
  | { t: "move"; ids: number[]; x: number; z: number }
  | { t: "amove"; ids: number[]; x: number; z: number }
  | { t: "attack"; ids: number[]; target: number }
  | { t: "stop"; ids: number[] }
  | { t: "harvest"; ids: number[]; mine: number }
  /** Xe Vận Tải đi kéo xác quân về (mỗi xe một xác: xác được chạm trước, rồi các xác gần đó). */
  | { t: "salvage"; ids: number[]; wreck: number }
  | { t: "rtb"; ids: number[] }
  | { t: "build"; kind: BuildingId; x: number; z: number }
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
  | { t: "sbSpawn"; kind: UnitId | BuildingId; side: Side; x: number; z: number; gx?: number; gz?: number; go?: "move" | "amove" }
  | { t: "sbRemove"; ids: number[] }
  /** Hồi đầy máu (và dầu máy bay). */
  | { t: "sbHeal"; ids: number[] }
  /** Dọn sạch quân và công trình (trừ Tổng Hành Dinh), đặt lại số đo sát thương. */
  | { t: "sbClear" }
  /** Phe `side` ngừng bắn (làm bia tập). */
  | { t: "sbHold"; side: Side; on: boolean }
  /** Máy bay không tốn nhiên liệu. */
  | { t: "sbFuel"; on: boolean };

export interface Command {
  side: Side;
  order: Order;
}

export type AlertKind = "commander" | "base" | "hauler" | "lowfuel" | "nooil" | "mineLost" | "powerShort" | "powerForecast" | "oilLow" | "batteryLow" | "uplinkLost";
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
  /** Ô đang thấy (1) — tính lại mỗi tick. */
  vis: Uint8Array;
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
