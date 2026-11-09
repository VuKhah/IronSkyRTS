/**
 * Mô hình Tư Lệnh (`commander`): robot tướng quân hình người cao khoảng 5 m, dáng hiên ngang, chắp tay sau lưng, đội mũ
 * quân đội, áo choàng sau lưng (người dùng chốt 09/11/2026: đơn vị đặc biệt nên phải dễ nhận ra nhất).
 * Khoanh tay trước ngực, người hơi ngửa ra sau, không mang vũ khí.
 */
import * as THREE from "three";
import { approach, box, cyl, facets, group, part, sphere, type Palette, type Rig } from "../kit";
import { vehicleRig } from "./ground";

/** Phóng cả mô hình để đỉnh mũ cao khoảng 5 m. */
const SCALE = 1.06;
/** Độ cao của eo (chưa nhân SCALE). */
const WAIST = 2.6;
/** Người hơi ngửa ra sau (radian, âm là ngửa). */
const LEAN = -0.13;
/** Nhịp bước từ tốn (radian/giây): khoảng 0,7 bước đôi mỗi giây. */
const STRIDE = 4.4;
/** Khi Tổng động viên: chỉ bước nhanh hơn chừng này lần, dáng đi giữ nguyên, không chạy. */
const HURRY = 1.3;
/** Biên độ vung đùi và độ gập gối lúc nhấc chân (radian). */
const HIP_SWING = 0.36;
const KNEE_LIFT = 0.55;
const CAPE_SEGMENTS = 5;
const CAPE_SEG_LEN = 0.62;

/** Khối vuốt: mặt trên rộng `wTop × dTop` ở y = 0, mặt dưới `wBot × dBot` ở y = -h. */
function taper(wTop: number, dTop: number, wBot: number, dBot: number, h: number, mat: THREE.Material, zOff = 0): THREE.Mesh {
  const pts: [number, number, number][] = [];
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      pts.push([(sx * wTop) / 2, 0, (sz * dTop) / 2 + zOff]);
      pts.push([(sx * wBot) / 2, -h, (sz * dBot) / 2 + zOff]);
    }
  return facets(pts, mat);
}

/** Đoạn tay nối hai điểm. */
function limb(a: THREE.Vector3, b: THREE.Vector3, rA: number, rB: number, mat: THREE.Material): THREE.Mesh {
  const dir = new THREE.Vector3().subVectors(b, a);
  const m = cyl(rB, rA, dir.length(), mat, 8);
  m.position.copy(a).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return m;
}

function buildLeg(p: Palette, side: number): { hip: THREE.Group; knee: THREE.Group; foot: THREE.Mesh } {
  const hip = group();
  hip.position.set(side * 0.44, 2.25, 0);
  hip.rotation.z = side * 0.07;
  const thigh = part("Đùi giáp", taper(0.56, 0.62, 0.42, 0.48, 1.0, p.hull));
  const thighPlate = part("Giáp đùi (màu phe)", taper(0.3, 0.06, 0.22, 0.06, 0.7, p.team, 0.31));
  thighPlate.position.y = -0.12;
  hip.add(thigh, thighPlate);
  const knee = group();
  knee.position.y = -1.0;
  const shin = part("Ống chân giáp", taper(0.44, 0.5, 0.34, 0.42, 0.98, p.hullDark));
  knee.add(shin, part("Giáp gối", sphere(0.26, p.metal, 0, 0, 0.2, 8)));
  const foot = part("Bàn chân", facets([[0.24, 0, 0.28], [0.24, 0, -0.3], [0.28, -0.26, 0.74], [0.28, -0.26, -0.42], [-0.24, 0, 0.28], [-0.24, 0, -0.3], [-0.28, -0.26, 0.74], [-0.28, -0.26, -0.42]], p.hullDark));
  foot.position.y = -0.98;
  knee.add(foot);
  hip.add(knee);
  return { hip, knee, foot };
}

function buildHead(p: Palette): THREE.Group {
  const head = group();
  head.add(
    part("Đầu", facets([[0.24, 0, 0.22], [0.3, 0.26, 0.26], [0.24, 0.44, 0.2], [0.28, 0.26, -0.26], [0.2, 0, -0.2], [0.2, 0.42, -0.2]], p.hullDark, true)),
    // mặt: tấm mặt sáng màu, gò má cao, cằm vuông nhô ra
    part("Mặt", facets([[0.2, 0.4, 0.2], [0.25, 0.22, 0.28], [0.2, 0.02, 0.27], [0.1, -0.08, 0.34], [0, 0.42, 0.33], [0, -0.1, 0.4], [0.2, 0.02, 0.14], [0.2, 0.4, 0.14]], p.white, true)),
    part("Cằm", facets([[0.12, 0.03, 0.36], [0.13, -0.11, 0.3], [0, 0.03, 0.42], [0, -0.13, 0.4], [0.12, -0.11, 0.2]], p.hull, true)),
    part("Sống mũi", facets([[0.035, 0.27, 0.38], [0.055, 0.13, 0.41], [0, 0.11, 0.47], [0, 0.29, 0.4], [0.05, 0.13, 0.34]], p.hull, true)),
    part("Miệng", box(0.2, 0.022, 0.03, p.metal, 0, 0.05, 0.385))
  );
  // chân mày nặng cau xuống phía giữa và đôi mắt xếch: vẻ thâm sâu, nghiêm nghị
  for (const side of [-1, 1]) {
    head.add(part("Chân mày", facets([[side * 0.03, 0.3, 0.42], [side * 0.26, 0.38, 0.32], [side * 0.26, 0.32, 0.31], [side * 0.03, 0.25, 0.41], [side * 0.03, 0.3, 0.3], [side * 0.26, 0.38, 0.22]], p.metal)));
    const eye = part("Mắt phát sáng", box(0.13, 0.04, 0.03, p.teamGlow, side * 0.135, 0.245, 0.375));
    eye.rotation.z = side * 0.3;
    head.add(eye);
    head.add(part("Rãnh má", box(0.02, 0.15, 0.03, p.metal, side * 0.17, 0.11, 0.335)));
  }
  // mũ quân đội: chóp loe cao phía trước, băng vàng, lưỡi trai, huy hiệu
  const crown = part("Mũ tướng", cyl(0.54, 0.36, 0.28, p.teamDark, 12, 0, 0.58, -0.05));
  crown.rotation.x = -0.14;
  head.add(
    crown,
    part("Băng mũ vàng", cyl(0.375, 0.375, 0.1, p.warning, 12, 0, 0.45, -0.04)),
    part("Lưỡi trai mũ", facets([[0.34, 0.42, 0.2], [0.34, 0.38, 0.2], [0.26, 0.34, 0.6], [0.26, 0.31, 0.6], [0, 0.42, 0.26], [0, 0.31, 0.66]], p.metal, true)),
    part("Huy hiệu mũ", sphere(0.08, p.teamGlow, 0, 0.62, 0.42, 8))
  );
  return head;
}

/** Áo choàng: chuỗi các tấm nối khớp từ vai xuống, mỗi tấm có nếp gấp, gió thổi thì lượn sóng từ trên xuống. */
function buildCape(p: Palette): { root: THREE.Group; joints: THREE.Group[] } {
  const root = group();
  const joints: THREE.Group[] = [];
  let parent: THREE.Group = root;
  for (let i = 0; i < CAPE_SEGMENTS; i++) {
    const joint = group();
    if (i > 0) joint.position.y = -CAPE_SEG_LEN;
    const k = i / (CAPE_SEGMENTS - 1);
    const width = 2.0 + k * 0.7;
    const RIBS = 7;
    const ribW = width / RIBS;
    for (let r = 0; r < RIBS; r++) {
      const x = (r - (RIBS - 1) / 2) * ribW;
      joint.add(part("Áo choàng", box(ribW * 1.04, CAPE_SEG_LEN * 1.03, 0.05, p.team, x, -CAPE_SEG_LEN / 2, r % 2 ? -0.05 : 0)));
    }
    joint.add(part("Lót áo choàng", box(width, CAPE_SEG_LEN * 1.02, 0.03, p.teamDark, 0, -CAPE_SEG_LEN / 2, 0.05)));
    parent.add(joint);
    parent = joint;
    joints.push(joint);
  }
  return { root, joints };
}

export function buildCommander(p: Palette): Rig {
  const body = group();
  const left = buildLeg(p, -1);
  const right = buildLeg(p, 1);
  body.add(
    left.hip,
    right.hip,
    part("Hông", taper(1.5, 0.82, 1.2, 0.7, 0.42, p.hullDark)),
    part("Vạt giáp hông (màu phe)", taper(0.7, 0.1, 0.5, 0.1, 0.62, p.team, 0.42))
  );
  (body.children[2] as THREE.Mesh).position.y = 2.58;
  (body.children[3] as THREE.Mesh).position.y = 2.5;

  // thân trên: quay quanh eo để ngắm (y tính từ eo)
  const upper = part("Thân trên", group());
  upper.position.y = WAIST;
  upper.add(
    part("Eo", cyl(0.56, 0.62, 0.26, p.metal, 10, 0, 0.1, 0)),
    part("Ngực giáp", facets([[0.58, 0.2, 0.36], [0.58, 0.2, -0.34], [1.02, 1.12, 0.42], [1.02, 1.12, -0.42], [0.86, 1.3, 0.3], [0.86, 1.3, -0.32], [0, 0.72, 0.58], [0, 1.3, 0.36]], p.hull, true)),
    part("Lõi năng lượng", cyl(0.2, 0.2, 0.06, p.teamGlow, 10, 0, 0.92, 0.5)),
    part("Huân chương", group(box(0.13, 0.08, 0.04, p.warning, 0.42, 1.0, 0.49), box(0.13, 0.08, 0.04, p.team, 0.58, 1.0, 0.47), box(0.13, 0.08, 0.04, p.warning, 0.5, 0.88, 0.48))),
    part("Cổ", cyl(0.18, 0.22, 0.2, p.metal, 8, 0, 1.36, 0))
  );
  (upper.children[2] as THREE.Mesh).rotation.x = Math.PI / 2 - 0.3;

  // hai tay khoanh trước ngực: mỗi cẳng tay vắt ngang sang phía bên kia, tay trái nằm ngoài tay phải
  for (const side of [-1, 1]) {
    const outer = side === -1;
    const shoulder = new THREE.Vector3(side * 1.12, 1.12, -0.02);
    const elbow = new THREE.Vector3(side * 1.16, outer ? 0.4 : 0.46, outer ? 0.68 : 0.6);
    const wrist = new THREE.Vector3(-side * 0.56, outer ? 0.52 : 0.62, outer ? 1.0 : 0.84);
    const pad = part("Giáp vai (màu phe)", box(0.78, 0.36, 0.92, p.team, side * 1.16, 1.24, 0));
    pad.rotation.z = -side * 0.24;
    const epaulet = part("Cầu vai vàng", box(0.8, 0.06, 0.94, p.warning, side * 1.14, 1.44, 0));
    epaulet.rotation.z = -side * 0.24;
    upper.add(
      pad,
      epaulet,
      part("Bắp tay", limb(shoulder, elbow, 0.26, 0.2, p.hullDark)),
      part("Khớp khuỷu", sphere(0.22, p.metal, elbow.x, elbow.y, elbow.z, 8)),
      part("Cẳng tay", limb(elbow, wrist, 0.21, 0.18, p.hull)),
      part("Bàn tay", sphere(0.19, p.metal, wrist.x, wrist.y, wrist.z, 8))
    );
  }
  upper.rotation.x = LEAN;

  const head = part("Đầu robot", buildHead(p));
  head.position.set(0, 1.44, 0.02);
  upper.add(head);

  const cape = buildCape(p);
  cape.root.position.set(0, 1.26, -0.5);
  part("Áo choàng", cape.root);
  upper.add(cape.root, part("Móc áo choàng", group(sphere(0.12, p.warning, -0.72, 1.3, -0.42, 8), sphere(0.12, p.warning, 0.72, 1.3, -0.42, 8))));

  body.add(upper);

  // vòng hào quang chỉ huy
  const aura = new THREE.Mesh(
    new THREE.RingGeometry(3.6, 3.85, 48),
    new THREE.MeshBasicMaterial({ color: (p.team.color as THREE.Color).getHex(), transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false })
  );
  aura.rotation.x = -Math.PI / 2;
  aura.position.y = 0.03;
  aura.visible = false;
  part("Vòng hào quang chỉ huy", aura);

  body.scale.setScalar(SCALE);
  let gait = 0;
  let phase = 0;
  let pace = 1;
  const rig = vehicleRig("commander", p, { body, wheels: [], turret: group(), gun: group(), barrels: [], muzzles: [group()], flashes: [], spinners: [], aimPitch: 0, recoil: 0 }, 3.8, [{ id: "aura", label: "Hào quang" }, { id: "hurry", label: "Bước nhanh" }], (dt, t, a) => {
    gait = approach(gait, a.has("move") ? 1 : 0, 3.5, dt);
    pace = approach(pace, a.has("hurry") ? HURRY : 1, 4, dt);
    phase += dt * STRIDE * pace;
    // Mỗi chân: nửa chu kỳ trụ (gối thẳng, đỡ cả thân) và nửa chu kỳ nhấc lên đưa tới. Bàn chân luôn song song mặt đất nên đặt xuống phẳng và chắc.
    const stride = (leg: typeof left, ph: number): void => {
      const hip = -Math.sin(ph) * HIP_SWING * gait;
      const swing = Math.max(0, Math.cos(ph));
      const knee = swing * swing * KNEE_LIFT * gait;
      leg.hip.rotation.x = hip;
      leg.knee.rotation.x = knee;
      leg.foot.rotation.x = -(hip + knee);
    };
    stride(left, phase);
    stride(right, phase + Math.PI);
    // Trọng tâm: cao nhất khi đứng trên một chân, thấp nhất lúc hai chân chạm đất; dồn sang chân trụ; vai xoay nhẹ ngược chiều bước.
    // Hạ thân đúng bằng phần chân duỗi chéo bị nhấc lên, để bàn chân trụ luôn nằm trên mặt đất.
    body.position.y = -(1 - Math.cos(phase * 2)) * 0.07 * gait;
    body.rotation.x = 0;
    upper.position.x = Math.cos(phase) * 0.07 * gait;
    upper.rotation.z = -Math.cos(phase) * 0.018 * gait;
    upper.rotation.y = Math.sin(phase) * 0.05 * gait;
    // đầu ngước lên, thỉnh thoảng chậm rãi đảo nhìn
    head.rotation.x = -0.16;
    head.rotation.y = Math.sin(t * 0.45) * 0.2;
    // áo choàng: đứng yên thì phất nhẹ, đi thì bay ra sau
    cape.joints.forEach((j, i) => {
      const wave = Math.sin(t * (1.5 + gait * 1.1) - i * 0.8) * (0.035 + i * 0.012 + gait * 0.02);
      // tấm trên cùng bù lại phần người ngửa ra sau, để áo vẫn rủ xuống chứ không áp vào chân
      j.rotation.x = (i === 0 ? 0.1 - LEAN + gait * 0.14 : 0.03 + gait * 0.03) + wave;
    });
    aura.visible = a.has("aura");
    if (aura.visible) {
      const k = (t * 0.6) % 1;
      aura.scale.setScalar(0.85 + k * 0.25);
      (aura.material as THREE.MeshBasicMaterial).opacity = 0.6 * (1 - k);
    }
  }, [{ id: "move", label: "Di chuyển" }]);
  rig.root.add(aura);
  rig.defaultOn = ["aura"];
  return rig;
}
