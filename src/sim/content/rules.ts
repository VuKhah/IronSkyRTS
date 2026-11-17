import type { ArmorClass, DmgType, Res } from "./types";
/**
 * Thu / phóng đồng bộ mọi binh chủng (người dùng 16/11/2026): nhân kích thước thân (`radius`, `halfLen`), đế (`bodyR`, `spaceR`)
 * khi nạp bảng UNITS (units/index.ts) và nhân mô hình 3D cùng số đó (render/models/units/index.ts). Số trong file quân và file
 * mô hình là số TRƯỚC khi nhân. Không nhân: tầm bắn, tầm nhìn, tốc độ, độ cao bay, công trình, bản đồ (đó là luật, không phải cỡ).
 */
export const UNIT_SCALE: number = 0.8;
/** Luật chơi MVP (số tạm). */
export const RULES = {
  tickRate: 10,
  startIron: 500,
  startOil: 100,
  /** Thu nhập gốc của Tổng Hành Dinh (Sắt/giây). */
  hqTrickle: 2,
  /**
   * Bố trí căn cứ (người dùng 10/11/2026, bản vẽ xưởng): mọi công trình có VIỀN `buildMarginCells` ô nằm trong mô hình (đất
   * trống, xe đi được, không chặn lưới; nhà có `clearCells` thì dùng số đó), cộng `buildPadCells` ô CẤM XÂY bên ngoài mà hai
   * nhà dùng chung được. Hai thân nhà gần nhất cách nhau viền A + cấm xây + viền B (mặc định 1 + 1 + 1 = 3 ô).
   */
  buildMarginCells: 1,
  buildPadCells: 1,
  unitCap: 80,
  /** Cả khối đi cùng tốc độ = min(tốc độ trung bình, xe chậm nhất × hệ số này): xe chậm được hộ tống thì đi nhanh hơn. Số tạm. */
  escortBoost: 1.3,
  /** Thời gian đúc một lô = thời gian một chiếc × (1 + hệ số × (cỡ lô − 1)). Số tạm. */
  lotTimeExtra: 0.5,
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
    struct: { normal: 0.25, ap: 1, he: 1.5 },
    /** Bộ binh (16/11/2026, số tạm): súng máy và đạn nổ diệt mạnh, đạn xuyên giáp gần như xuyên qua người. */
    inf: { normal: 1.25, ap: 0.4, he: 1.5 }
  } as Record<ArmorClass, Record<DmgType, number>>,
  /**
   * Địa hình bậc thang (11/11/2026): mặt đất có tầng 0, 1, 2 (GameMap). Đứng trên tầng cao được cộng tầm nhìn / tầm bắn theo mỗi
   * tầng, có trần. Quân mặt đất KHÔNG nhìn thấy ô ở tầng cao hơn tầng mình đứng; tầng cao chặn tia nhìn phía sau nó.
   */
  terrain: {
    sightPerTier: 0.15,
    sightMax: 0.3,
    rangePerTier: 0.1,
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
  /** Khoảng trống tối thiểu giữa hai công trình (số ô lưới 2 m): 2 ô = 4 m, vừa Titan rộng 3,58 m đi qua. */
  /**
   * Kỹ năng: MỌI kỹ năng thuộc về một binh chủng có thật, phải đúc ra và có hình thù (quyết định 05/11/2026):
   * không có "điểm chỉ huy" để gọi đòn từ trên trời như game tham chiếu. Rải thảm là của Xe Tên Lửa Loạt (vũ khí
   * trong UNITS.rocket), Tổng động viên là của Xe Tư Lệnh.
   */
  abilities: {
    /** Tổng động viên (Xe Tư Lệnh): quân trong bán kính hào quang chạy nhanh hơn `speed`, bắn nhanh hơn `fireRate`. */
    mobilize: { cooldown: 60, duration: 10, speed: 0.3, fireRate: 0.2 }
  },
  /**
   * Xe Tư Lệnh tự rút (hậu cần tự lo, người chơi không phải canh): đang bị bắn (trúng trong `hitWithin` giây) mà máu tụt
   * qua một mốc trong `at` (tỉ lệ máu) thì tự chạy về sau Tổng Hành Dinh. Mỗi mốc kích một lần; hồi máu qua mốc + `rearm`
   * thì mốc dùng lại được. Số tạm (11/11/2026).
   */
  commanderRetreat: { at: [0.5, 0.25] as readonly number[], hitWithin: 1, rearm: 0.15, home: 15, back: 8 },
  sellRefund: 0.5,
  queueMax: 5,
  captureRadius: 8,
  captureSeconds: 10,
  captureMaxWeight: 3,
  monopolySeconds: 30,
  mineAmount: { iron: 6000, oil: 3000 } as Record<Res, number>,
  haulerMineRate: 20,
  haulerUnload: 1.5,
  /**
   * BÃI TÀI NGUYÊN (người dùng 12/11/2026: mỏ không còn là một khối mà là một bãi, nhiều điểm tiếp xúc hơn). Mỗi bãi tối đa
   * `deposits` khối quặng / giếng Dầu (1 ô 2 × 2 m, chặn đường) rải trong bán kính `spread` m quanh tâm, cách nhau ít nhất
   * `minGap` m; mỗi khối một chỗ đỗ, Xe Vận Tải đỗ mũi vào khối, đầu xe cách khối `gap` m, thân hai xe đỗ cách nhau ít nhất
   * 2 × `parkPad` m. Bãi phải có ít nhất `minDeposits` khối (kiểm thử bản đồ; 3 = bằng mỏ khối cũ, chỉ ở bậc núi hẹp). Bố trí: world/field.ts. Số tạm.
   */
  field: { deposits: 6, spread: 6, minGap: 3.9, gap: 0.5, parkPad: 0.3, minDeposits: 3 },
  /** Số Xe Vận Tải tối đa cùng khai thác một bãi = số khối của bãi (tối đa field.deposits). */
  mineSlots: 6,
  air: {
    cruiseAlt: 12,
    /** Tốc độ lên / xuống độ cao (m/s) khi bổ nhào và kéo lên. */
    climbRate: 5,
    /** Tỉ lệ dầu tối thiểu để cất cánh. */
    takeoffMin: 0.35,
    /** Mức Bingo: tự bay về Sân Đáp. */
    bingo: 0.24,
    /** Mục tiêu tấn công mất (bị hạ / khuất): tìm mục tiêu mới quanh đó chừng này giây, không thấy thì bay về sân (lỗi 7, 17/11/2026). */
    huntTime: 3,
    /** Lít/giây khi nạp ở bãi đậu. */
    refuelRate: 10,
    repairRate: 25,
    /** 1 Dầu trong kho = 1 lít nhiên liệu. */
    oilPerLiter: 1,
    /** Số bãi đậu mỗi Sân Đáp (vị trí: `PAD_OFFSETS` cuối file này). */
    pads: 5,
    /**
     * Phóng thẳng đứng từ giếng Nhà Máy Máy Bay (giây / mét): chờ `hatch` cho cửa cuốn mở, chiếc dùng chung giếng chờ thêm
     * `gap` mỗi lượt; bay thẳng lên trong `rise` tới cao hơn sàn `clear`, rồi tăng tốc ra trước và lên độ bay trong `climbOut`.
     */
    launch: { hatch: 1, gap: 2.5, rise: 1.6, clear: 2.5, climbOut: 1.6 },
    /**
     * Cất / hạ cánh đứng ở Sân Đáp (giây / mét, 16/11/2026, theo hoạt ảnh của mô hình Sân Đáp bản 3). Cất cánh: bốc thẳng lên
     * `hoverAlt` trong `rise` (vừa lên vừa xoay mũi về hướng bay), rồi lao ra trước và lên độ bay trong `climbOut`.
     * Hạ cánh: lượn tới lơ lửng trên ô trong `glide`, rồi hạ thẳng trong `descend` (vừa hạ vừa xoay mũi theo ô đáp).
     */
    vtol: { hoverAlt: 4.5, rise: 1.2, climbOut: 1.6, glide: 1.6, descend: 1.2 }
  }
} as const;
