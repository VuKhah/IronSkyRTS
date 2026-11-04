/**
 * "Nướng" mô hình cho chiến trường: gộp các khối hình ĐỨNG YÊN thành ít khối hơn để giảm số lệnh vẽ (draw call).
 *
 * Vì sao? Mỗi khối hình (Mesh) là một lệnh vẽ, cộng thêm một lệnh nữa cho bóng đổ. Mô hình bản nhẹ
 * ghép từ 25–60 khối, nên 80 quân có thể thành vài nghìn lệnh vẽ mỗi khung hình → điện thoại giật.
 *
 * Cách làm (không phải sửa từng mô hình):
 *   1. Chụp lại vị trí / góc / tỉ lệ / hiển thị của mọi bộ phận.
 *   2. Cho mô hình chạy thử mọi hoạt ảnh (trừ "fire" để khỏi bắn đạn thật ra), xem bộ phận nào thay đổi → đó là bộ phận ĐỘNG.
 *   3. Các khối đứng yên, đang hiện, không có con, cùng KHUNG CHA và cùng VẬT LIỆU → gộp thành 1 khối con của khung cha đó.
 *      Khung cha vẫn có thể chuyển động (tháp pháo xoay, thân xe nhún), nên hoạt ảnh vẫn đúng.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Rig } from "./kit";

interface Snap {
  p: THREE.Vector3;
  q: THREE.Quaternion;
  s: THREE.Vector3;
  v: boolean;
}

const EPS = 1e-5;

export function bakeStatic(rig: Rig): { before: number; after: number } {
  const all = new Set(rig.actions.map((a) => a.id).filter((id) => id !== "fire"));
  const none = new Set<string>();
  let t = 0;
  return bakeObject(rig.root, (check) => {
    rig.setAim?.(0.8);
    rig.setFlight?.(true, 0.5);
    rig.setLevel?.(0.9);
    for (let i = 0; i < 40; i++) {
      rig.update(0.05, (t += 0.05), all);
      check();
    }
    rig.setAim?.(null);
    rig.setFlight?.(false, 0);
    rig.setLevel?.(0.2);
    for (let i = 0; i < 40; i++) {
      rig.update(0.05, (t += 0.05), none);
      check();
    }
  });
}

/**
 * Gộp khối đứng yên của một cây đối tượng bất kỳ. `probe` chạy thử hoạt ảnh và gọi `check()` sau mỗi bước.
 * Mỗi khối đứng yên được gộp vào TỔ TIÊN ĐỘNG gần nhất (hoặc gốc), xuyên qua các khung đứng yên ở giữa.
 * Đối tượng có userData.cosmetic (ví dụ bánh xe quay) được coi là đứng yên.
 */
export function bakeObject(root: THREE.Object3D, probe: (check: () => void) => void): { before: number; after: number } {
  const snaps = new Map<THREE.Object3D, Snap>();
  let before = 0;
  root.traverse((o) => {
    snaps.set(o, { p: o.position.clone(), q: o.quaternion.clone(), s: o.scale.clone(), v: o.visible });
    if ((o as THREE.Mesh).isMesh) before++;
  });
  const moving = new Set<THREE.Object3D>();
  probe(() => {
    for (const [o, s] of snaps) {
      if (moving.has(o) || o.userData.cosmetic) continue;
      if (o.visible !== s.v || o.position.distanceToSquared(s.p) > EPS || Math.abs(o.quaternion.dot(s.q)) < 1 - EPS || o.scale.distanceToSquared(s.s) > EPS) moving.add(o);
    }
  });
  // khôi phục bộ phận trang trí về tư thế ban đầu rồi mới gộp
  for (const [o, s] of snaps)
    if (o.userData.cosmetic) {
      o.position.copy(s.p);
      o.quaternion.copy(s.q);
      o.scale.copy(s.s);
    }

  const groups = new Map<string, { anchor: THREE.Object3D; meshes: THREE.Mesh[]; rel: THREE.Matrix4[] }>();
  const anchorIds = new Map<THREE.Object3D, number>();
  const matIds = new Map<THREE.Material, number>();
  for (const [o, s] of snaps) {
    const m = o as THREE.Mesh;
    if (!m.isMesh || moving.has(m) || !s.v || m.children.length > 0 || !m.parent || Array.isArray(m.material)) continue;
    if ((m as THREE.InstancedMesh).isInstancedMesh) continue;
    // đi lên tới tổ tiên động gần nhất; các khung ở giữa phải đứng yên và đang hiện
    m.updateMatrix();
    const rel = m.matrix.clone();
    let p: THREE.Object3D | null = m.parent;
    let ok = true;
    while (p && p !== root && !moving.has(p)) {
      if (!p.visible) {
        ok = false;
        break;
      }
      p.updateMatrix();
      rel.premultiply(p.matrix);
      p = p.parent;
    }
    if (!ok || !p) continue;
    const anchor = p;
    if (!anchorIds.has(anchor)) anchorIds.set(anchor, anchorIds.size);
    const mat = m.material as THREE.Material;
    if (!matIds.has(mat)) matIds.set(mat, matIds.size);
    const key = `${anchorIds.get(anchor)}|${matIds.get(mat)}|${m.castShadow ? 1 : 0}${m.receiveShadow ? 1 : 0}|${m.renderOrder}`;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { anchor, meshes: [], rel: [] }));
    g.meshes.push(m);
    g.rel.push(rel);
  }

  const emptied = new Set<THREE.Object3D>();
  for (const { anchor, meshes, rel } of groups.values()) {
    if (meshes.length < 2 && meshes[0].parent === anchor) continue;
    const geos: THREE.BufferGeometry[] = [];
    meshes.forEach((m, i) => {
      let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      for (const name of Object.keys(g.attributes)) if (name !== "position" && name !== "normal" && name !== "uv") g.deleteAttribute(name);
      if (!g.getAttribute("uv")) g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(g.getAttribute("position").count * 2), 2));
      if (!g.getAttribute("normal")) g.computeVertexNormals();
      g.applyMatrix4(rel[i]);
      // khối bị lật (tỉ lệ âm, ví dụ cánh máy bay đối xứng) phải đảo thứ tự đỉnh để mặt không bị quay ngược
      if (rel[i].determinant() < 0) g = flipWinding(g);
      geos.push(g);
    });
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) continue;
    const first = meshes[0];
    const mesh = new THREE.Mesh(merged, first.material);
    mesh.castShadow = first.castShadow;
    mesh.receiveShadow = first.receiveShadow;
    mesh.renderOrder = first.renderOrder;
    for (const m of meshes) {
      if (m.parent) emptied.add(m.parent);
      m.parent?.remove(m);
      m.geometry.dispose();
    }
    anchor.add(mesh);
  }
  // dọn các khung rỗng còn sót (ví dụ khung bánh xe đã gộp hết)
  for (const g of emptied) if (g !== root && g.children.length === 0 && !moving.has(g)) g.parent?.remove(g);
  let after = 0;
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) after++;
  });
  return { before, after };
}

function flipWinding(g: THREE.BufferGeometry): THREE.BufferGeometry {
  for (const name of Object.keys(g.attributes)) {
    const a = g.getAttribute(name) as THREE.BufferAttribute;
    const n = a.itemSize;
    const arr = a.array as Float32Array;
    for (let i = 0; i + 2 < a.count; i += 3)
      for (let k = 0; k < n; k++) {
        const t = arr[(i + 1) * n + k];
        arr[(i + 1) * n + k] = arr[(i + 2) * n + k];
        arr[(i + 2) * n + k] = t;
      }
    a.needsUpdate = true;
  }
  return g;
}
