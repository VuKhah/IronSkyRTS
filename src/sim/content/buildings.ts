import type { BuildingId, BuildingSpec } from "./types";
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
    half: [4, 4],
    produces: ["hauler", "sniper"],
    power: 20,
    zone: 72, // tạm ×3 (người dùng 10/11/2026; trước là 24)
    clearCells: 2,
    weapon: { name: "Pháo kép tự vệ", dmgGround: 40, dmgAir: 28, range: 22, cooldown: 1.2, dmgType: "normal", splash: 1.5, visual: "cannon", traverse: 60 },
    features: [
      "Nơi Xe Vận Tải dỡ hàng: Sắt và Dầu chỉ vào kho khi được chở về đây.",
      "Thu nhập gốc +2 Sắt mỗi giây, để bên mất hết mỏ vẫn còn đường gỡ.",
      "Phát điện nền +20 MW và mở vùng xây dựng 72m.",
      "Có pháo kép tự vệ bắn cả mặt đất lẫn trên không."
    ]
  },
  factory: {
    id: "factory",
    kind: "building",
    name: "Xưởng Xe Tăng",
    label: "XE TĂNG",
    role: "Đúc xe chiến đấu: Lynx, Titan, SkyGuard.",
    mvp: true,
    cost: { iron: 300, oil: 0 },
    buildTime: 10,
    hp: 1000,
    armorClass: "struct",
    sight: 16,
    half: [9, 9], // thân 9 × 9 ô (người dùng 10/11/2026, bản vẽ xưởng): + viền 1 ô trong mô hình = nền móng 11 × 11 ô
    bay: [-9, 1, 3, 9], // góc trước bên phải nhìn theo bản vẽ (cửa ở trên): 3 ô ráp xe 2 × 3 + dải đường 1 × 6 trước chúng
    doors: 3,
    stall: 6,
    produces: ["lynx", "titan", "skyguard"],
    power: -10,
    priority: 3,
    features: ["Hàng chờ tối đa 5 xe.", "Đặt điểm tập kết để xe mới tự chạy ra tiền tuyến.", "Xây thêm xưởng để đúc quân nhanh hơn."]
  },
  "special-factory": {
    id: "special-factory",
    kind: "building",
    name: "Xưởng Xe Chuyên Dụng",
    label: "CHUYÊN DỤNG",
    role: "Đúc xe chuyên dụng tầm xa: Xe Tên Lửa Loạt, Pháo Tự Hành.",
    mvp: true,
    // số tạm (06/11/2026), chờ buổi cân bằng
    cost: { iron: 350, oil: 0 },
    buildTime: 12,
    hp: 1000,
    armorClass: "struct",
    sight: 16,
    half: [9, 9], // thân 9 × 9 ô (người dùng 10/11/2026, bản vẽ xưởng): + viền 1 ô trong mô hình = nền móng 11 × 11 ô
    // bản vẽ của người dùng 10/11/2026 (xoay +90°): góc trước bên phải 6 × 6 ô gồm 2 bệ ráp 5 × 3 ô nối nhau từ trước ra sau
    // và hầm kiểm chuẩn 1 × 6 ô dọc mép ngoài (phía −x) chạy tới cạnh cửa; xe đứng ngang trên bệ, đầu quay về phía hầm
    bay: [-9, -3, 3, 9],
    doors: 2,
    pads: [
      [-7, 3, 3, 9],
      [-7, -3, 3, 3]
    ],
    padFace: 3,
    produces: ["rocket", "artillery", "scout", "shield", "repair"],
    power: -10,
    priority: 3,
    features: [
      "Nhà xưởng dài, cửa cao, cầu trục lớn: đủ chỗ cho xe phóng tên lửa và pháo nòng dài.",
      "Hàng chờ tối đa 5 xe; đặt điểm tập kết như Xưởng Xe Tăng.",
      "Tách khỏi Xưởng Xe Tăng: muốn có hỏa lực tầm xa phải đầu tư riêng."
    ]
  },
  "aircraft-factory": {
    id: "aircraft-factory",
    kind: "building",
    name: "Nhà Máy Máy Bay",
    label: "MÁY BAY",
    role: "Đúc máy bay. Máy bay đúc xong cất cánh ngay tại xưởng rồi bay về đậu ở Sân Đáp.",
    mvp: true,
    // số tạm (06/11/2026), chờ buổi cân bằng
    cost: { iron: 300, oil: 0 },
    buildTime: 12,
    hp: 1000,
    armorClass: "struct",
    sight: 16,
    half: [9, 9], // thân 9 × 9 ô (người dùng 10/11/2026, bản vẽ xưởng): + viền 1 ô trong mô hình = nền móng 11 × 11 ô
    // 10/11/2026: nhà chứa có sàn phóng trên nóc, 2 giếng cửa cuốn; không có lối ra mặt đất, máy bay cất cánh thẳng đứng.
    // Giếng đầu tiên là giếng lớn. 15/11 (người dùng: cửa xưởng to ra): giếng = thân Ø + 0,4 m, máy bay phóng ở nguyên mẫu
    // (lớn 8,4 m cho Valkyrie Ø 8, nhỏ 6,4 m cho Falcon Ø 6).
    pads: [
      [-6.7, -0.4, 1.7, 8],
      [-5.7, -8.4, 0.7, -2]
    ],
    launch: { deck: 7.5, shaft: 5 },
    produces: ["falcon", "valkyrie"],
    power: -10,
    priority: 3,
    features: [
      "Cần ít nhất một Sân Đáp còn bãi trống: máy bay mới cần chỗ đậu, hết bãi thì xưởng tạm dừng.",
      "Hai giếng phóng cửa cuốn trên nóc: máy bay cất cánh thẳng đứng rồi tự bay về bãi trống gần nhất (đầy dầu).",
      "Xưởng bị phá thì không đúc thêm được, máy bay đang có vẫn bay từ Sân Đáp."
    ]
  },
  airfield: {
    id: "airfield",
    kind: "building",
    name: "Sân Đáp Không Quân",
    label: "5 BÃI ĐÁP",
    role: "Nơi máy bay cất, hạ cánh, nạp Dầu và sửa chữa (máy bay đúc ở Nhà Máy Máy Bay).",
    mvp: true,
    cost: { iron: 250, oil: 0 },
    buildTime: 12,
    hp: 1150,
    armorClass: "struct",
    sight: 18,
    half: [6, 10],
    power: -15,
    priority: 2,
    features: [
      "5 bãi đậu và 1 trạm điều khiển: mỗi sân nuôi được tối đa 5 máy bay.",
      "Máy bay đậu được nạp 10L dầu mỗi giây (trừ vào kho Dầu) và sửa 25 HP mỗi giây.",
      "Sân bị phá thì máy bay của nó phải tìm bãi trống ở sân khác."
    ]
  },
  turret: {
    id: "turret",
    fort: true,
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
    half: [2, 2],
    power: -5,
    priority: 1,
    weapon: { name: "Pháo kép tự động 30mm", dmgGround: 30, dmgAir: 30, range: 20, cooldown: 0.6, dmgType: "normal", splash: 0, visual: "bullet", traverse: 90 },
    features: ["Bắn cả xe lẫn máy bay trong tầm 20m.", "Giáp Công sự: chỉ đạn xuyên giáp (Pháo) phá nhanh. Giữ mỏ và cửa ngõ căn cứ. Dùng Cột Điện để xây được tháp ở xa căn cứ.", "Thiếu điện thì bắn chậm, mất hẳn điện thì ngừng bắn."]
  },
  wall: {
    id: "wall",
    fort: true,
    tile: true,
    kind: "building",
    name: "Tường Thành",
    label: "TƯỜNG",
    role: "Chặn đường từng ô, ép địch vào điểm nghẽn trước họng tháp phòng thủ.",
    mvp: true,
    // số tạm (10/11/2026), chờ buổi cân bằng
    cost: { iron: 10, oil: 0 },
    buildTime: 1,
    hp: 400,
    armorClass: "fort",
    sight: 4,
    half: [1, 1], // đúng 1 ô lưới 2 m
    clearCells: 0,
    power: 0,
    features: [
      "Mỗi đoạn đúng 1 ô lưới; đặt liên tiếp các ô cạnh nhau thành dải, tường tự nối liền.",
      "Đặt sát nhau và sát nhà khác được, nhưng không được chắn hay vây kín cửa ra.",
      "Giáp Công sự: đạn thường gần như vô dụng, Pháo phá nhanh."
    ]
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
    half: [2.4, 3.2],
    power: 0,
    weapon: { name: "Tháp pháo tự động", dmgGround: 26, dmgAir: 18, range: 18, cooldown: 0.9, dmgType: "normal", splash: 0, visual: "bullet", traverse: 90 },
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
    half: [2.4, 3.2],
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
    half: [2, 2],
    power: 0,
    zone: 48, // tạm ×3 (người dùng 10/11/2026; trước là 16)
    features: [
      "Mở vùng xây dựng 48m quanh cột: nối nhiều cột để xây Tháp Phòng Thủ cạnh mỏ xa.",
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
    half: [2, 2],
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
    half: [2, 2],
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
    half: [2.4, 3.2],
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
    half: [2.4, 3.2],
    power: -10,
    features: ["Trữ tối đa 160 đạn phòng không.", "Xe goòng chở đạn chạy dọc đường ray tới các tháp."]
  },
  "aa-ciws": {
    id: "aa-ciws",
    fort: true,
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
    half: [2, 2],
    power: -6,
    weapon: { name: "Pháo 6 nòng Vulcan", dmgGround: 0, dmgAir: 19, range: 22.5, cooldown: 0.24, dmgType: "he", splash: 0, visual: "bullet", traverse: 150 },
    magazine: 28,
    features: ["Bắn 0.24 giây/viên: lưới đạn dày đặc tầm gần.", "Hết đạn từ đường ray thì ngừng bắn."]
  },
  "aa-sam": {
    id: "aa-sam",
    fort: true,
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
    half: [2, 2],
    power: -14,
    strictPower: true,
    weapon: { name: "Tên lửa Patriot", dmgGround: 0, dmgAir: 112, range: 38.5, cooldown: 1.65, dmgType: "he", splash: 2.6, visual: "missile", traverse: 60 },
    magazine: 14,
    features: ["Tầm bắn cực xa 38.5m, 2 đạn mỗi phát.", "Bắt buộc có điện."]
  },
  "aa-emp": {
    id: "aa-emp",
    fort: true,
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
    half: [2, 2],
    power: -16,
    strictPower: true,
    weapon: { name: "Xung điện từ", dmgGround: 0, dmgAir: 48, range: 30, cooldown: 1.25, dmgType: "he", splash: 5.2, visual: "pulse", traverse: 60 },
    magazine: 16,
    features: ["Nổ xung bán kính 5.2m trên không.", "Máy bay trúng xung: -35% tốc bay và tốc ngoặt trong 3.8 giây.", "Bắt buộc có điện."]
  }
};
