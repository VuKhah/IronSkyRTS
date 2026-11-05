/** Mô hình Xe Tăng Chủ Lực Titan (`titan`). */
import { box, cyl, group, muzzleFlash, part, type Palette, type Rig } from "../kit";
import { vehicleRig, barrel, tracks } from "./ground";

export function buildTitan(p: Palette): Rig {
  const body = group();

  const TURRET_Z = -0.15;
  const TURRET_Y = 1.32;

  // 1. CỤM XÍCH & BÁNH TÌ (Gầm đầm chắc, bánh dẫn hướng & chủ động có trục nổi)
  const tr = tracks(p, 1.48, 4.7, 0.4, 6);
  body.add(tr.g);

  // Bánh dẫn hướng trước & bánh chủ động sau kèm nắp trục cơ khí
  const idlerFL = cyl(0.32, 0.32, 0.42, p.metal, 14, -1.48, 0.64, 2.2).rotateZ(Math.PI / 2);
  const idlerFR = cyl(0.32, 0.32, 0.42, p.metal, 14, 1.48, 0.64, 2.2).rotateZ(Math.PI / 2);
  const idlerHubFL = cyl(0.16, 0.16, 0.46, p.hullDark, 10, -1.48, 0.64, 2.2).rotateZ(Math.PI / 2);
  const idlerHubFR = cyl(0.16, 0.16, 0.46, p.hullDark, 10, 1.48, 0.64, 2.2).rotateZ(Math.PI / 2);

  const sprocketRL = cyl(0.32, 0.32, 0.42, p.metal, 14, -1.48, 0.64, -2.2).rotateZ(Math.PI / 2);
  const sprocketRR = cyl(0.32, 0.32, 0.42, p.metal, 14, 1.48, 0.64, -2.2).rotateZ(Math.PI / 2);
  const sprocketHubRL = cyl(0.18, 0.18, 0.46, p.hullDark, 10, -1.48, 0.64, -2.2).rotateZ(Math.PI / 2);
  const sprocketHubRR = cyl(0.18, 0.18, 0.46, p.hullDark, 10, 1.48, 0.64, -2.2).rotateZ(Math.PI / 2);

  // 2. VAI XE & GIÁP HÔNG MODULAR (Tiết chế màu phe thành viền kẻ chiến thuật sắc sảo)
  // Khối vai xe (Sponsons) giữ màu thép xám chủ đạo, chỉ kẻ nẹp màu phe chạy dọc mép ngoài
  const sponsonL = box(0.42, 0.22, 3.8, p.hull, -1.32, 1.04, -0.05);
  const sponsonR = box(0.42, 0.22, 3.8, p.hull, 1.32, 1.04, -0.05);
  const sponsonTrimL = box(0.08, 0.08, 3.6, p.team, -1.5, 1.12, -0.05);
  const sponsonTrimR = box(0.08, 0.08, 3.6, p.team, 1.5, 1.12, -0.05);

  // Tấm giáp hông (Side Skirts) chia 4 phiến giáp composite xám đen, điểm suyết 1 phiến màu phe ở mũi
  const skirtBaseL = part("Giáp hông trái", box(0.18, 0.56, 3.6, p.hullDark, -1.62, 0.72, -0.05));
  const skirtBaseR = part("Giáp hông phải", box(0.18, 0.56, 3.6, p.hullDark, 1.62, 0.72, -0.05));

  // Các tấm ERA hông xe: tấm đầu tiên sơn màu phe làm điểm nhấn, 2 tấm sau màu thép
  const skirtPlateL1 = box(0.08, 0.34, 0.95, p.team, -1.72, 0.76, 1.18);
  const skirtPlateL2 = box(0.08, 0.34, 0.95, p.hull, -1.72, 0.76, 0.05);
  const skirtPlateL3 = box(0.08, 0.34, 0.95, p.hull, -1.72, 0.76, -1.08);

  const skirtPlateR1 = box(0.08, 0.34, 0.95, p.team, 1.72, 0.76, 1.18);
  const skirtPlateR2 = box(0.08, 0.34, 0.95, p.hull, 1.72, 0.76, 0.05);
  const skirtPlateR3 = box(0.08, 0.34, 0.95, p.hull, 1.72, 0.76, -1.08);

  // Vè chắn bùn trước màu thân xe + vạch kẻ màu phe ở mép
  const fenderL = box(0.52, 0.16, 0.85, p.hull, -1.42, 0.94, 2.22).rotateX(0.42);
  const fenderR = box(0.52, 0.16, 0.85, p.hull, 1.42, 0.94, 2.22).rotateX(0.42);
  const fenderAccentL = box(0.14, 0.06, 0.75, p.team, -1.58, 1.0, 2.22).rotateX(0.42);
  const fenderAccentR = box(0.14, 0.06, 0.75, p.team, 1.58, 1.0, 2.22).rotateX(0.42);

  const fenderRearL = box(0.48, 0.16, 0.7, p.hullDark, -1.42, 0.88, -2.15).rotateX(-0.38);
  const fenderRearR = box(0.48, 0.16, 0.7, p.hullDark, 1.42, 0.88, -2.15).rotateX(-0.38);

  // Cụm đèn pha bọc khung thép bảo vệ
  const lightGuardL = box(0.28, 0.16, 0.14, p.hullDark, -1.42, 1.05, 2.46);
  const lightGuardR = box(0.28, 0.16, 0.14, p.hullDark, 1.42, 1.05, 2.46);
  const headlampL = box(0.2, 0.1, 0.06, p.flash, -1.42, 1.05, 2.52);
  const headlampR = box(0.2, 0.1, 0.06, p.flash, 1.42, 1.05, 2.52);

  // 3. THÂN XE CHÍNH & GIÁP NGHIÊNG MẶT TRƯỚC (Cơ bắp, gồ ghề, chuẩn quân sự)
  const mainHull = box(2.35, 0.72, 4.2, p.hull, 0, 0.76, -0.05);

  // Cổ tháp pháo nâng cao kèm gờ chắn đạn (Ballistic Collar)
  const collar = cyl(1.2, 1.3, 0.16, p.hullDark, 24, 0, 1.18, TURRET_Z);

  // Giáp nghiêng mặt trước (Glacis) vát sâu
  const frontGlacis = part("Giáp nghiêng mặt trước", box(2.3, 0.45, 1.4, p.hull, 0, 0.86, 1.85));
  frontGlacis.rotation.x = 0.55;

  // Thay mảng xanh to ở mũi bằng họa tiết Chevron chữ V sắc gọn và tấm giáp trung tâm màu thép tối
  const centerArmorPlate = box(1.05, 0.08, 1.15, p.hullDark, 0, 1.03, 1.88).rotateX(0.55);
  const noseChevronL = box(0.42, 0.05, 0.16, p.team, -0.22, 1.08, 1.95).rotateX(0.55).rotateY(0.35);
  const noseChevronR = box(0.42, 0.05, 0.16, p.team, 0.22, 1.08, 1.95).rotateX(0.55).rotateY(-0.35);

  // Nắp khoang lái & kính tiềm vọng của lái xe ở đỉnh giáp nghiêng
  const driverHatch = box(0.55, 0.08, 0.4, p.hullDark, 0, 1.14, 1.25);
  const driverScope = box(0.32, 0.08, 0.1, p.flash, 0, 1.17, 1.42);

  // Các phiến giáp ERA xếp lớp hai bên mũi xe
  const eraF1L = box(0.52, 0.1, 0.45, p.hullDark, -0.82, 1.06, 1.72).rotateX(0.55);
  const eraF2L = box(0.52, 0.1, 0.45, p.hull, -0.82, 0.90, 2.15).rotateX(0.55);
  const eraF1R = box(0.52, 0.1, 0.45, p.hullDark, 0.82, 1.06, 1.72).rotateX(0.55);
  const eraF2R = box(0.52, 0.1, 0.45, p.hull, 0.82, 0.90, 2.15).rotateX(0.55);

  // Giáp gầm trước & móc kéo cứu hộ kim loại
  const lowerGlacis = box(2.3, 0.4, 0.75, p.hullDark, 0, 0.45, 2.2).rotateX(-0.52);
  const towHookL = box(0.1, 0.14, 0.18, p.metal, -0.75, 0.52, 2.52);
  const towHookR = box(0.1, 0.14, 0.18, p.metal, 0.75, 0.52, 2.52);

  // Khoang động cơ sau + lưới tản nhiệt kép + thùng nhiên liệu màu thép tối điểm vòng đai màu phe
  const engineDeck = part("Khoang động cơ", box(2.2, 0.28, 1.35, p.hullDark, 0, 1.02, -1.55));
  const grilleL = box(0.78, 0.06, 0.85, p.metal, -0.58, 1.17, -1.55);
  const grilleR = box(0.78, 0.06, 0.85, p.metal, 0.58, 1.17, -1.55);
  const engineSpine = box(0.18, 0.08, 1.1, p.hull, 0, 1.17, -1.55);

  const fuelDrumL = cyl(0.24, 0.24, 0.75, p.hullDark, 14, -0.82, 1.08, -2.32).rotateZ(Math.PI / 2);
  const fuelDrumR = cyl(0.24, 0.24, 0.75, p.hullDark, 14, 0.82, 1.08, -2.32).rotateZ(Math.PI / 2);
  const drumBandL = cyl(0.25, 0.25, 0.12, p.team, 14, -0.82, 1.08, -2.32).rotateZ(Math.PI / 2);
  const drumBandR = cyl(0.25, 0.25, 0.12, p.team, 14, 0.82, 1.08, -2.32).rotateZ(Math.PI / 2);

  body.add(
    idlerFL, idlerFR, idlerHubFL, idlerHubFR,
    sprocketRL, sprocketRR, sprocketHubRL, sprocketHubRR,
    sponsonL, sponsonR, sponsonTrimL, sponsonTrimR,
    skirtBaseL, skirtBaseR,
    skirtPlateL1, skirtPlateL2, skirtPlateL3,
    skirtPlateR1, skirtPlateR2, skirtPlateR3,
    fenderL, fenderR, fenderAccentL, fenderAccentR,
    fenderRearL, fenderRearR, lightGuardL, lightGuardR, headlampL, headlampR,
    mainHull, collar, frontGlacis, centerArmorPlate, noseChevronL, noseChevronR,
    driverHatch, driverScope,
    eraF1L, eraF2L, eraF1R, eraF2R, lowerGlacis, towHookL, towHookR,
    engineDeck, grilleL, grilleR, engineSpine,
    fuelDrumL, fuelDrumR, drumBandL, drumBandR
  );

  // 4. THÁP PHÁO ĐA DIỆN PHÂN LỚP (Phối màu thép quân sự chủ đạo + mảng màu phe tinh tế)
  const turretGroup = group();

  // Khối lõi tháp pháo
  const turretCore = box(1.85, 0.62, 2.25, p.hull, 0, 0.32, -0.15);

  // Hai cánh giáp rỗng bên hông tháp (Spaced Armor Wings) dùng màu thép, chỉ viền sọc màu phe
  const turretWingL = box(0.26, 0.48, 1.75, p.hullDark, -1.08, 0.36, -0.1).rotateZ(0.18);
  const turretWingR = box(0.26, 0.48, 1.75, p.hullDark, 1.08, 0.36, -0.1).rotateZ(-0.18);
  const wingStripeL = box(0.08, 0.14, 1.55, p.team, -1.2, 0.4, -0.1).rotateZ(0.18);
  const wingStripeR = box(0.08, 0.14, 1.55, p.team, 1.2, 0.4, -0.1).rotateZ(-0.18);

  // Giáp má trước vát nêm nhọn (Cheek Wedges) màu thân xe kèm tấm chắn composite ngoài
  const cheekL = part("Giáp má trái", box(0.82, 0.56, 1.4, p.hull, -0.78, 0.32, 0.52));
  cheekL.rotation.y = -0.44;
  cheekL.rotation.x = -0.06;

  const cheekR = part("Giáp má phải", box(0.82, 0.56, 1.4, p.hull, 0.78, 0.32, 0.52));
  cheekR.rotation.y = 0.44;
  cheekR.rotation.x = -0.06;

  // Tấm giáp composite đắp nổi ngoài má tháp + viền chỉ màu phe trên đỉnh má
  const cheekArmorL = box(0.7, 0.4, 0.12, p.hullDark, -0.92, 0.32, 0.58).rotateY(-0.44);
  const cheekArmorR = box(0.7, 0.4, 0.12, p.hullDark, 0.92, 0.32, 0.58).rotateY(0.44);
  const cheekTrimL = box(0.22, 0.08, 1.15, p.team, -0.95, 0.61, 0.48).rotateY(-0.44).rotateX(-0.06);
  const cheekTrimR = box(0.22, 0.08, 1.15, p.team, 0.95, 0.61, 0.48).rotateY(0.44).rotateX(-0.06);

  // Nóc tháp pháo: chia khung viền xám bao quanh bảng nhận diện màu phe ở trung tâm
  const turretRoofFrame = box(1.72, 0.12, 1.85, p.hull, 0, 0.65, -0.18);
  const turretRoof = part("Nóc tháp (màu phe)", box(1.28, 0.06, 1.45, p.team, 0, 0.72, -0.18));
  const roofRib1 = box(1.1, 0.04, 0.12, p.hullDark, 0, 0.76, 0.2);
  const roofRib2 = box(1.1, 0.04, 0.12, p.hullDark, 0, 0.76, -0.55);

  // Khoang chứa đạn đuôi tháp (Bustle Rack) + Tấm ốp xả áp (Blowout Panels) kim loại
  const bustleBox = box(1.95, 0.46, 0.85, p.hullDark, 0, 0.45, -1.35);
  const blowoutPanelL = box(0.72, 0.06, 0.65, p.metal, -0.48, 0.7, -1.35);
  const blowoutPanelR = box(0.72, 0.06, 0.65, p.metal, 0.48, 0.7, -1.35);
  const bustleCenterStripe = box(0.2, 0.07, 0.7, p.team, 0, 0.7, -1.35);
  const bustleBars = box(2.05, 0.1, 0.92, p.metal, 0, 0.5, -1.35);

  // Hệ thống phòng vệ chủ động APS (Active Protection Launcher) hai bên sườn tháp
  const apsBaseL = box(0.22, 0.22, 0.38, p.metal, -1.12, 0.62, -0.55);
  const apsBaseR = box(0.22, 0.22, 0.38, p.metal, 1.12, 0.62, -0.55);
  const apsTubesL = box(0.26, 0.14, 0.28, p.hullDark, -1.16, 0.66, -0.5).rotateY(0.25);
  const apsTubesR = box(0.26, 0.14, 0.28, p.hullDark, 1.16, 0.66, -0.5).rotateY(-0.25);

  // Vòm chỉ huy (Cupola) & Trạm kính ngắm quang học CITV xoay độc lập
  const cupola = part("Nắp xe trưởng", cyl(0.35, 0.35, 0.22, p.hullDark, 14, 0.52, 0.82, -0.25));
  const hatch = cyl(0.3, 0.3, 0.08, p.metal, 14, 0.52, 0.94, -0.25);

  const citvBase = cyl(0.16, 0.18, 0.22, p.hullDark, 12, -0.52, 0.82, 0.25);
  const citvHead = box(0.3, 0.24, 0.3, p.metal, -0.52, 0.98, 0.25);
  const citvCap = box(0.28, 0.05, 0.28, p.team, -0.52, 1.11, 0.25);
  const citvLens = box(0.2, 0.12, 0.05, p.flash, -0.52, 0.98, 0.41);

  // Cụm ống phóng lựu đạn khói 3 nòng
  const smokeL = group(
    cyl(0.055, 0.055, 0.32, p.metal, 8, -1.22, 0.52, 0.35).rotateZ(0.35).rotateX(0.2),
    cyl(0.055, 0.055, 0.32, p.metal, 8, -1.26, 0.45, 0.18).rotateZ(0.35).rotateX(0.15),
    cyl(0.055, 0.055, 0.32, p.metal, 8, -1.26, 0.38, 0.02).rotateZ(0.35).rotateX(0.1)
  );
  const smokeR = group(
    cyl(0.055, 0.055, 0.32, p.metal, 8, 1.22, 0.52, 0.35).rotateZ(-0.35).rotateX(0.2),
    cyl(0.055, 0.055, 0.32, p.metal, 8, 1.26, 0.45, 0.18).rotateZ(-0.35).rotateX(0.15),
    cyl(0.055, 0.055, 0.32, p.metal, 8, 1.26, 0.38, 0.02).rotateZ(-0.35).rotateX(0.1)
  );

  // Cặp ăng-ten liên lạc chiến thuật
  const antennaL = cyl(0.02, 0.02, 1.35, p.metal, 6, -0.82, 1.35, -1.65);
  const antennaR = cyl(0.02, 0.02, 1.35, p.metal, 6, 0.82, 1.35, -1.65);

  turretGroup.add(
    turretCore, turretWingL, turretWingR, wingStripeL, wingStripeR,
    cheekL, cheekR, cheekArmorL, cheekArmorR, cheekTrimL, cheekTrimR,
    turretRoofFrame, turretRoof, roofRib1, roofRib2,
    bustleBox, blowoutPanelL, blowoutPanelR, bustleCenterStripe, bustleBars,
    apsBaseL, apsBaseR, apsTubesL, apsTubesR,
    cupola, hatch, citvBase, citvHead, citvCap, citvLens,
    smokeL, smokeR, antennaL, antennaR
  );

  const turret = part("Tháp pháo", turretGroup);
  turret.position.set(0, TURRET_Y, TURRET_Z);

  // 5. ĐẠI PHÁO 120MM (Áo bọc giáp thép kết hợp vạch nhắm màu phe tinh tế)
  const gun = group();
  gun.position.set(0, 0.36, 1.08);

  // Khiên chắn gốc pháo (Mantlet) + Hộp đo xa laser bọc thép có viền màu phe
  const mantlet = box(0.84, 0.52, 0.58, p.hullDark, 0, 0, 0.2);
  const laserBox = box(0.48, 0.16, 0.45, p.hull, 0, 0.32, 0.28);
  const laserStripe = box(0.32, 0.04, 0.42, p.team, 0, 0.41, 0.28);
  const laserLens = box(0.28, 0.08, 0.04, p.flash, 0, 0.32, 0.51);

  // Nòng pháo chính 120mm
  const b = part("Pháo chính 120mm", barrel(2.75, 0.18, p.metal));

  // Áo bọc cách nhiệt đa giác màu thân xe + Đai khóa màu phe ở bầu hút khói
  const thermalShroud = box(0.42, 0.36, 1.25, p.hull, 0, 0, 1.15);
  const shroudSpine = box(0.18, 0.08, 1.2, p.hullDark, 0, 0.2, 1.15);
  const fumeCollar = box(0.46, 0.4, 0.38, p.hullDark, 0, 0, 1.55);
  const fumeBand = box(0.48, 0.42, 0.12, p.team, 0, 0, 1.55);

  // Đầu hãm nòng kép (Muzzle Brake) xẻ rãnh kim loại
  const muzzleBrake = part("Đầu hãm nòng", box(0.54, 0.38, 0.62, p.hullDark, 0, 0, 2.72));
  const brakeTopPlate = box(0.38, 0.05, 0.5, p.hull, 0, 0.2, 2.72);
  const brakeVentL = box(0.08, 0.22, 0.38, p.metal, -0.25, 0, 2.72);
  const brakeVentR = box(0.08, 0.22, 0.38, p.metal, 0.25, 0, 2.72);

  const f = muzzleFlash(1.25, p.flash);
  f.position.z = 3.18;

  b.add(
    mantlet, laserBox, laserStripe, laserLens,
    thermalShroud, shroudSpine, fumeCollar, fumeBand,
    muzzleBrake, brakeTopPlate, brakeVentL, brakeVentR, f
  );
  gun.add(b);
  turret.add(gun);
  body.add(turret);

  return vehicleRig(
    "titan",
    p,
    {
      body,
      wheels: tr.wheels,
      turret,
      gun,
      barrels: [b],
      muzzles: [b],
      flashes: [f],
      spinners: [],
      aimPitch: 0.08,
      recoil: 0.36
    },
    4.3
  );
}
