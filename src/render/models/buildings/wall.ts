/**
 * Tường Thành (10/11/2026; người dùng: "tường cứ làm theo cỡ 1 ô lưới, đơn giản như Clash of Clans").
 *
 * Mỗi công trình tường đúng 1 ô 2 × 2 m: KHỐI TRỤ bê tông ở giữa ô (mũ màu phe), và một NHÁNH TƯỜNG vươn ra tới mép ô về phía
 * mỗi ô tường cùng phe ngay bên cạnh; hai ô kề nhau có hai nhánh gặp nhau ở ranh giới ô nên thành một bức tường liền. Ô đứng
 * một mình chỉ là khối trụ. Chiến trường báo các ô bên cạnh qua `setLinks(mask)` (bit 1 = +x, 2 = −x, 4 = +z, 8 = −z, theo
 * khung mô hình).
 *
 * Hiệu năng: các ô bên cạnh hiếm khi đổi, nên mỗi lần đổi thì dựng lại hình và GỘP theo vật liệu (3 lưới / ô), thay vì để 4
 * nhánh làm bộ phận ẩn / hiện riêng (khoảng 12 lệnh vẽ / ô). Nhóm chứa hình được đánh dấu động để `bakeStatic` không gộp mất.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { CELL } from "../../../sim/maps";
import { group, part, type Palette, type Rig } from "../kit";
import { rig, BASE_Y } from "./shared";

const HALF = CELL / 2;
const POST = 1.3; // khối trụ giữa ô
const POST_H = 2.9;
const ARM_T = 0.95; // độ dày nhánh tường
const ARM_H = 2.4;
const FOOT_T = 1.35; // chân đế nhánh
const FOOT_H = 0.35;

/** Bit hướng theo khung mô hình. */
export const LINK = { px: 1, nx: 2, pz: 4, nz: 8 } as const;
const DIRS: readonly [number, number, number][] = [
  [LINK.px, 1, 0],
  [LINK.nx, -1, 0],
  [LINK.pz, 0, 1],
  [LINK.nz, 0, -1]
];

function boxGeo(w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

/** Các khối của một ô tường theo vật liệu, cho tổ hợp nhánh `mask`. */
function pieces(mask: number): { concrete: THREE.BufferGeometry[]; dark: THREE.BufferGeometry[]; team: THREE.BufferGeometry[] } {
  const concrete: THREE.BufferGeometry[] = [];
  const dark: THREE.BufferGeometry[] = [];
  const team: THREE.BufferGeometry[] = [];
  // khối trụ giữa ô + chân + mũ màu phe
  dark.push(boxGeo(POST + 0.2, FOOT_H, POST + 0.2, 0, BASE_Y + FOOT_H / 2, 0));
  concrete.push(boxGeo(POST, POST_H, POST, 0, BASE_Y + POST_H / 2, 0));
  team.push(boxGeo(POST + 0.1, 0.22, POST + 0.1, 0, BASE_Y + POST_H + 0.11, 0));
  dark.push(boxGeo(0.5, 0.12, 0.5, 0, BASE_Y + POST_H + 0.28, 0));
  for (const [bit, dx, dz] of DIRS) {
    if (!(mask & bit)) continue;
    // nhánh từ mép khối trụ tới mép ô (dài HALF − POST/2 + một chút chồng vào trụ)
    const len = HALF - POST / 2 + 0.05;
    const c = POST / 2 - 0.05 + len / 2;
    const [w, d] = dx !== 0 ? [len, ARM_T] : [ARM_T, len];
    const [fw, fd] = dx !== 0 ? [len, FOOT_T] : [FOOT_T, len];
    dark.push(boxGeo(fw, FOOT_H, fd, dx * c, BASE_Y + FOOT_H / 2, dz * c));
    concrete.push(boxGeo(w, ARM_H, d, dx * c, BASE_Y + ARM_H / 2, dz * c));
    // dải màu phe hai mặt gần đỉnh, gờ tối trên đỉnh
    const [sw, sd] = dx !== 0 ? [len, ARM_T + 0.04] : [ARM_T + 0.04, len];
    team.push(boxGeo(sw, 0.28, sd, dx * c, BASE_Y + ARM_H - 0.45, dz * c));
    const [tw, td] = dx !== 0 ? [len, ARM_T + 0.1] : [ARM_T + 0.1, len];
    dark.push(boxGeo(tw, 0.1, td, dx * c, BASE_Y + ARM_H + 0.05, dz * c));
  }
  return { concrete, dark, team };
}

/** Một ô tường; `mask` ban đầu là hình hiện khi chưa có ai gọi `setLinks` (Xưởng Mô Hình: một đoạn thẳng dọc x). */
export function buildWall(p: Palette, mask = LINK.px | LINK.nx): Rig {
  const root = group();
  const body = part("Tường", group());
  body.userData.animated = true; // hình dựng lại khi các ô bên cạnh đổi
  root.add(body);
  let cur = -1;
  const apply = (m: number): void => {
    if (m === cur) return;
    cur = m;
    for (const c of [...body.children]) {
      body.remove(c);
      (c as THREE.Mesh).geometry.dispose();
    }
    const parts = pieces(m);
    const add = (name: string, geos: THREE.BufferGeometry[], mat: THREE.Material): void => {
      const merged = mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
      if (!merged) return;
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      body.add(part(name, mesh));
    };
    add("Thân tường bê tông", parts.concrete, p.concrete);
    add("Chân đế, gờ đỉnh", parts.dark, p.concreteDark);
    add("Dải màu phe", parts.team, p.team);
  };
  apply(mask);
  const built = rig(root, [], 2, []);
  built.setLinks = apply;
  return built;
}
