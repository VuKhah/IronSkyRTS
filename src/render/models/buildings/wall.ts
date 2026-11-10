/**
 * Tường Thành, BẢN TẠM (10/11/2026): chỉ để xem trong Xưởng Mô Hình, chưa có luật chơi (xây theo đoạn, chặn đường tạo điểm
 * nghẽn: ý từ bản thiết kế đầu tiên của người dùng, `Docs/reference/REF_ARTOFWAR_GDD_MASTER.md`).
 *
 * Kiểu tường chắn nổ bê tông chữ T của căn cứ quân sự hiện đại, lắp theo lưới 2 m của sim:
 *  - TẤM TƯỜNG: mỗi tấm chiếm đúng 1 ô (dài 2 m theo hướng tường), chân đế bê tông rộng 1,4 m cao 0,5 m, thân dày 0,4 m cao
 *    3,4 m, dải màu phe gần đỉnh, cuộn dây thép gai trên đỉnh, khe nối tối giữa hai tấm.
 *  - CỘT TRỤ ở hai đầu và chỗ rẽ góc: 1,2 × 1,2 m, cao 3,9 m, mũ màu phe, đèn.
 * `buildWall` nhận các đoạn tường (điểm đầu theo ô, hướng, số tấm) nên sau này dùng lại được cho tường do người chơi kéo.
 */
import * as THREE from "three";
import { CELL } from "../../../sim/maps";
import { box, group, part, sphere, type Palette, type Rig } from "../kit";
import { rig, BASE_Y } from "./shared";

const H = 3.4; // chiều cao thân tấm
const FOOT_W = 1.4; // bề rộng chân đế (ngang tường)
const FOOT_H = 0.5;
const SLAB = 0.4; // độ dày thân tấm
const POST = 1.2; // cột trụ
const POST_H = 3.9;

/** Một đoạn tường: bắt đầu ở góc ô (x, z) tính bằng ô, chạy theo hướng (dx, dz) ∈ {(1,0), (0,1)}, gồm `n` tấm. */
export interface WallRun {
  x: number;
  z: number;
  dx: 0 | 1;
  dz: 0 | 1;
  n: number;
}

function panel(p: Palette, wire: THREE.Material): THREE.Group {
  // dựng dọc theo x (dài CELL), sau đó xoay theo hướng đoạn
  const g = group();
  const L = CELL - 0.06; // chừa khe nối
  g.add(part("Chân đế bê tông", box(L, FOOT_H, FOOT_W, p.concreteDark, 0, BASE_Y + FOOT_H / 2, 0)));
  g.add(part("Tấm tường", box(L, H - FOOT_H, SLAB, p.concrete, 0, BASE_Y + (H + FOOT_H) / 2, 0)));
  for (const s of [-1, 1]) {
    g.add(part("Dải màu phe", box(L, 0.32, 0.03, p.team, 0, BASE_Y + H - 0.55, s * (SLAB / 2 + 0.01))));
    g.add(part("Móc cẩu", box(0.12, 0.12, 0.08, p.metal, s * 0.55, BASE_Y + H - 0.12, 0)));
  }
  g.add(part("Mép đỉnh tấm", box(L, 0.08, SLAB + 0.06, p.hullDark, 0, BASE_Y + H + 0.04, 0)));
  // cuộn dây thép gai: một vòng xoắn nằm dọc đỉnh tấm
  const coil = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.025, 4, 10), wire);
  coil.rotation.y = Math.PI / 2;
  for (const x of [-0.6, 0, 0.6]) {
    const c = coil.clone();
    c.position.set(x, BASE_Y + H + 0.3, 0);
    g.add(part("Dây thép gai", c));
  }
  g.add(part("Dây thép gai", box(L, 0.03, 0.03, wire, 0, BASE_Y + H + 0.3, 0)));
  return g;
}

function post(p: Palette, x: number, z: number): THREE.Group {
  return group(
    part("Cột trụ", box(POST, POST_H, POST, p.concrete, x, BASE_Y + POST_H / 2, z)),
    part("Chân cột", box(POST + 0.3, FOOT_H, POST + 0.3, p.concreteDark, x, BASE_Y + FOOT_H / 2, z)),
    part("Mũ cột (màu phe)", box(POST + 0.12, 0.22, POST + 0.12, p.team, x, BASE_Y + POST_H + 0.11, z)),
    part("Đèn cột", sphere(0.14, p.warning, x, BASE_Y + POST_H + 0.32, z, 6))
  );
}

export function buildWall(p: Palette, runs: readonly WallRun[]): Rig {
  const root = group();
  const wire = p.metal;
  const posts = new Set<string>();
  for (const r of runs) {
    for (let i = 0; i < r.n; i++) {
      const g = panel(p, wire);
      // tâm tấm = giữa ô thứ i của đoạn
      g.position.set((r.x + r.dx * i + 0.5 * r.dx) * CELL, 0, (r.z + r.dz * i + 0.5 * r.dz) * CELL);
      if (r.dz) g.rotation.y = Math.PI / 2;
      root.add(g);
    }
    // cột trụ ở hai đầu đoạn (chung cho các đoạn gặp nhau)
    for (const k of [0, r.n]) posts.add(`${r.x + r.dx * k},${r.z + r.dz * k}`);
  }
  for (const key of posts) {
    const [x, z] = key.split(",").map(Number);
    root.add(post(p, x * CELL, z * CELL));
  }
  return rig(root, [], 6, []);
}

/** Bản xem trước: đoạn tường chữ L (5 tấm dọc x, rẽ góc, 3 tấm dọc z), căn giữa gốc tọa độ. */
export function buildWallShowcase(p: Palette): Rig {
  const built = buildWall(p, [
    { x: -3, z: -2, dx: 1, dz: 0, n: 5 },
    { x: 2, z: -2, dx: 0, dz: 1, n: 3 }
  ]);
  return built;
}
