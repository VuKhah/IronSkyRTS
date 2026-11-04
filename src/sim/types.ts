/**
 * Kiểu dữ liệu của lõi mô phỏng: thực thể, lệnh (Order) và sự kiện (SimEvent).
 *
 * Lệnh là con đường DUY NHẤT để thay đổi trận đấu: người chơi, AI và (sau này) người chơi qua mạng
 * đều gửi cùng một loại lệnh. Nhờ vậy, chỉ cần lưu seed + danh sách lệnh là chiếu lại được cả trận.
 * Sự kiện thì chạy theo chiều ngược lại: sim báo cho phần vẽ / âm thanh biết chuyện gì vừa xảy ra.
 */
import type { BuildingId, Res, Side, UnitId, WeaponVisual } from "./content";

export type UnitOrder = "idle" | "move" | "amove" | "attack";
export type HaulState = "idle" | "toMine" | "mining" | "toDock" | "unloading";
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
  targetId: number;
  cells: number[];
  /** Sân Đáp: id máy bay giữ từng bãi (0 = trống). */
  pads: number[];
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
  | { t: "rtb"; ids: number[] }
  | { t: "build"; kind: BuildingId; x: number; z: number }
  | { t: "produce"; building: number; kind: UnitId }
  | { t: "cancel"; building: number }
  | { t: "rally"; building: number; x: number; z: number }
  | { t: "sell"; building: number };

export interface Command {
  side: Side;
  order: Order;
}

export type AlertKind = "commander" | "base" | "hauler" | "lowfuel" | "nooil" | "mineLost";
export type WinReason = "commander" | "buildings" | "monopoly" | "timeout";

export type SimEvent =
  | { t: "shot"; src: number; side: Side; visual: WeaponVisual; x: number; z: number; alt: number; target: number; tx: number; tz: number; talt: number; ticks: number }
  | { t: "hit"; side: Side; visual: WeaponVisual; x: number; z: number; alt: number; splash: number }
  | { t: "death"; id: number; kind: UnitId | BuildingId; side: Side; x: number; z: number; alt: number; building: boolean; crash: boolean; sold: boolean }
  | { t: "spawn"; id: number; kind: UnitId; side: Side }
  | { t: "placed"; id: number; kind: BuildingId; side: Side }
  | { t: "built"; id: number; kind: BuildingId; side: Side }
  | { t: "captured"; mine: number; res: Res; side: Side | -1; prev: Side | -1 }
  | { t: "alert"; side: Side; what: AlertKind; x: number; z: number }
  | { t: "monopoly"; side: Side; res: Res }
  | { t: "end"; winner: Side | 2; reason: WinReason };

export interface SideStats {
  unitsBuilt: number;
  unitsLost: number;
  kills: number;
  ironMined: number;
  oilMined: number;
  buildingsBuilt: number;
}

export interface SideState {
  iron: number;
  oil: number;
  /** Ô đang thấy (1) — tính lại mỗi tick. */
  vis: Uint8Array;
  /** Ô đã từng thấy. */
  explored: Uint8Array;
  /** Công trình địch đã từng phát hiện. */
  known: Set<number>;
  /** Số tick đang giữ độc quyền liên tục. */
  mono: number;
  monoRes: Res | null;
  alerts: Record<AlertKind, number>;
  stats: SideStats;
}
