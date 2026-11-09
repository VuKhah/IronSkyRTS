/**
 * Nhà Máy Đào Dầu, bản 2 (09/11/2026), theo phong cách của Tổng Hành Dinh.
 * Cần bơm dầu thật sự chạy: đòn gánh màu phe gật, đầu ngựa kéo cần bơm, tay quay có đối trọng, 2 thanh truyền.
 * Quanh đó: đầu giếng, 2 bồn chứa nắp màu phe, nhà điều khiển, ống dẫn. Cần bơm dựng dọc trục x để tận dụng chân đế dài.
 * Bộ phận động: đòn gánh, tay quay, 2 thanh truyền, cần bơm.
 */
import * as THREE from "three";
import { BUILDINGS } from "../../../sim/content";
import { box, cyl, facets, group, part, type Palette, type Rig } from "../kit";
import { WORK, rig, foundation, strut, BASE_Y, type P3 } from "./shared";

const PIVOT_Y = 3.35;
const TAIL_Z = -1.8;
const CRANK_Y = 1.4;
const CRANK_R = 0.8;
const WELL_Z = 2.68;

export function buildOilExtractor(p: Palette): Rig {
  const [HX, HZ] = BUILDINGS["oil-extractor"].half;
  const root = group(foundation(p, HX * 2, HZ * 2));
  const add = (...o: THREE.Object3D[]) => root.add(...o);

  // ================================================================ 1. CẦN BƠM: dựng trong khung riêng, trục dọc là +z cục bộ
  const jack = group();
  jack.rotation.y = Math.PI / 2; // +z cục bộ thành +x của công trình
  jack.position.set(0.2, 0, -0.75);
  add(jack);
  jack.add(part("Đế cần bơm", box(1.4, 0.2, 4.6, p.hullDark, 0, BASE_Y + 0.1, 0.25)));
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) jack.add(part("Khung chữ A", strut([sx * 0.55, BASE_Y + 0.2, sz * 0.8], [sx * 0.14, PIVOT_Y - 0.1, 0], 0.07, p.hull)));
  jack.add(part("Ổ trục đòn gánh", box(0.5, 0.26, 0.5, p.metal, 0, PIVOT_Y - 0.14, 0)));

  const beam = part("Đòn gánh (màu phe)", group(box(0.34, 0.34, 4.2, p.team, 0, 0, 0.2)));
  const headPts: P3[] = [];
  for (const [y, z] of [[0.72, 2.1], [0.76, 2.46], [0.24, 2.76], [-0.5, 2.68], [-1.0, 2.3], [-1.0, 2.1]] as const)
    for (const x of [-0.28, 0.28]) headPts.push([x, y, z]);
  beam.add(part("Đầu ngựa", facets(headPts, p.hull)));
  beam.add(part("Đối trọng đuôi", box(0.5, 0.42, 0.4, p.hullDark, 0, 0, TAIL_Z)));
  beam.position.y = PIVOT_Y;
  jack.add(beam);

  // hộp số + mô-tơ + tay quay 2 bên có đối trọng
  jack.add(part("Hộp số", box(0.72, 1.0, 1.0, p.hullDark, 0, BASE_Y + 0.7, TAIL_Z)));
  jack.add(part("Mô-tơ", group(cyl(0.26, 0.26, 0.7, p.hull, 10, 0, BASE_Y + 0.5, TAIL_Z - 0.9).rotateX(Math.PI / 2), box(0.2, 0.1, 0.5, p.team, 0, BASE_Y + 0.78, TAIL_Z - 0.9))));
  const crank = part("Tay quay", group());
  for (const sx of [-1, 1]) crank.add(part("Tay quay có đối trọng", group(box(0.1, CRANK_R + 0.1, 0.26, p.hullDark, sx * 0.5, -CRANK_R / 2, 0), box(0.14, 0.42, 0.56, p.metal, sx * 0.5, -CRANK_R, 0))));
  crank.position.set(0, CRANK_Y, TAIL_Z);
  jack.add(crank);
  const rods: THREE.Mesh[] = [];
  for (const sx of [-1, 1]) {
    const rod = part("Thanh truyền", box(0.07, 1, 0.07, p.metal, sx * 0.5, 0, TAIL_Z));
    rods.push(rod);
    jack.add(rod);
  }
  jack.add(part("Xà nối thanh truyền", box(1.16, 0.08, 0.1, p.metal, 0, PIVOT_Y - 0.26, TAIL_Z)));

  // đầu giếng + cần bơm
  jack.add(part("Đầu giếng", group(cyl(0.2, 0.3, 0.8, p.metal, 10, 0, BASE_Y + 0.4, WELL_Z), box(0.72, 0.12, 0.14, p.hullDark, 0, BASE_Y + 0.45, WELL_Z), cyl(0.09, 0.09, 0.4, p.warning, 8, 0, BASE_Y + 0.98, WELL_Z))));
  const polish = part("Cần bơm", box(0.05, 1, 0.05, p.metal, 0, 0, WELL_Z));
  jack.add(polish);

  // ================================================================ 2. BỒN CHỨA
  const tanks: [number, number][] = [[-2.28, -1.15], [-2.28, 0.62]];
  for (const [x, z] of tanks) {
    add(part("Bồn chứa Dầu", cyl(0.72, 0.72, 2.4, p.hull, 16, x, BASE_Y + 1.2, z)));
    add(part("Nắp bồn (màu phe)", cyl(0.74, 0.62, 0.16, p.team, 16, x, BASE_Y + 2.48, z)));
    add(part("Đai bồn", cyl(0.74, 0.74, 0.1, p.hullDark, 16, x, BASE_Y + 1.55, z)));
    add(part("Thang bồn", box(0.26, 2.2, 0.04, p.metal, x + 0.76, BASE_Y + 1.15, z)));
  }

  // ================================================================ 3. NHÀ ĐIỀU KHIỂN + ỐNG DẪN
  const H_X = 1.15;
  const H_Z = 1.2;
  add(part("Nhà điều khiển", box(2.0, 1.7, 1.2, p.hull, H_X, BASE_Y + 0.85, H_Z)));
  add(part("Mái nhà điều khiển (màu phe)", box(2.14, 0.14, 1.34, p.team, H_X, BASE_Y + 1.77, H_Z)));
  add(part("Cửa sổ nhà điều khiển", box(1.3, 0.4, 0.04, p.glass, H_X + 0.1, BASE_Y + 1.2, H_Z + 0.61)));
  add(part("Cửa nhà điều khiển", box(0.5, 1.2, 0.05, p.hullDark, H_X - 0.65, BASE_Y + 0.6, H_Z + 0.62)));
  add(part("Ăng-ten", cyl(0.02, 0.04, 2.2, p.metal, 5, H_X + 0.7, BASE_Y + 2.9, H_Z)));
  add(part("Máy lạnh", box(0.56, 0.3, 0.46, p.metal, H_X - 0.4, BASE_Y + 2.0, H_Z)));
  // ống từ đầu giếng dọc mép sau về bồn chứa, nối 2 bồn với nhau
  const pipeY = BASE_Y + 0.35;
  add(part("Ống dẫn Dầu", strut([2.88, pipeY, -0.45], [2.88, pipeY, 0.2], 0.07, p.metal)));
  add(part("Ống dẫn Dầu", strut([2.88, pipeY, 0.2], [-1.56, pipeY, 0.2], 0.07, p.metal)));
  add(part("Ống dẫn Dầu", strut([-1.56, pipeY, -1.15], [-1.56, pipeY, 0.62], 0.07, p.metal)));
  for (const x of [1.8, 0.4, -0.9]) add(part("Giá ống", box(0.1, 0.3, 0.14, p.hullDark, x, BASE_Y + 0.15, 0.2)));
  add(part("Van ống", box(0.2, 0.3, 0.2, p.warning, -0.25, pipeY, 0.2)));

  let ang = 0;
  const setSpan = (m: THREE.Mesh, low: number, high: number) => {
    m.position.y = (low + high) / 2;
    m.scale.y = Math.max(0.05, high - low);
  };
  return rig(root, [WORK], Math.max(HX, HZ) + 2.6, [
    (dt, _t, a) => {
      if (a.has("work")) ang += dt * 2.2;
      const tilt = Math.sin(ang) * 0.26;
      beam.rotation.x = tilt;
      crank.rotation.x = ang;
      // xoay quanh trục X góc θ: điểm (y = 0, z) tới y' = −z·sinθ
      const tailY = PIVOT_Y - TAIL_Z * Math.sin(tilt) - 0.17;
      const pinY = CRANK_Y - CRANK_R * Math.cos(ang);
      for (const r of rods) setSpan(r, pinY, tailY);
      // đầu ngựa ở z ≈ WELL_Z: đáy đầu ngựa kéo cần bơm lên xuống
      const lipY = PIVOT_Y - 1.0 - WELL_Z * Math.sin(tilt);
      setSpan(polish, BASE_Y + 1.1, lipY);
    }
  ]);
}
