/**
 * Ba mũi tên chữ V nằm sát mặt đất trước cửa ra của công trình (người dùng 10/11/2026: "hiệu ứng 3 mũi tên để biết hướng
 * cửa ra"). Hiện trên bóng công trình khi đang chọn chỗ đặt và trước cửa nhà đang được chọn. Ba mũi sáng lần lượt từ
 * cửa đi ra như dòng chảy, nên chỉ nhìn là biết xe sẽ chạy ra phía nào. Chỉ để nhìn, không có trong sim.
 */
import * as THREE from "three";
import type { GameMap } from "../sim/maps";

/** Khoảng cách giữa hai mũi (m) và chu kỳ một lượt sáng (giây). */
const STEP = 1.6;
const PERIOD = 1.2;

/** Hình chữ V phẳng, mũi chỉ về +z, rộng 2,4 m. */
function chevronGeometry(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(-1.2, -0.35);
  s.lineTo(0, 0.55);
  s.lineTo(1.2, -0.35);
  s.lineTo(1.2, -0.85);
  s.lineTo(0, 0.05);
  s.lineTo(-1.2, -0.85);
  s.closePath();
  const g = new THREE.ShapeGeometry(s);
  g.rotateX(Math.PI / 2); // nằm xuống mặt đất; trục y của hình thành +z của thế giới
  return g;
}

const GEO = chevronGeometry();

export class ExitArrows {
  readonly root = new THREE.Group();
  private mats: THREE.MeshBasicMaterial[] = [];

  constructor(
    scene: THREE.Scene,
    private map: GameMap,
    color = 0xffd23f
  ) {
    for (let k = 0; k < 3; k++) {
      // luôn vẽ đè lên trên (không kiểm tra độ sâu): cửa quay ra xa camera thì chính ngôi nhà sẽ che mất mũi tên
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide });
      const m = new THREE.Mesh(GEO, mat);
      m.renderOrder = 10;
      m.scale.setScalar(1.25);
      this.mats.push(mat);
      this.root.add(m);
    }
    this.root.visible = false;
    scene.add(this.root);
  }

  /**
   * Đặt ba mũi bắt đầu từ mép cửa (x, z0) đi ra theo hướng `dir` (+1 / −1 theo trục z), bám độ cao mặt đất, và cho sáng
   * lần lượt theo thời gian `time` (giây).
   */
  show(x: number, z0: number, dir: number, time: number): void {
    this.root.visible = true;
    this.root.children.forEach((m, k) => {
      const z = z0 + dir * (0.9 + k * STEP);
      m.position.set(x, this.map.groundY(x, z) + 0.12, z);
      m.rotation.y = dir < 0 ? Math.PI : 0;
      // pha lệch nhau 1/3 chu kỳ: mũi gần cửa sáng trước, rồi tới mũi ngoài
      const ph = (((time / PERIOD - k / 3) % 1) + 1) % 1;
      this.mats[k].opacity = 0.25 + 0.7 * Math.max(0, 1 - ph * 2.2);
    });
  }

  hide(): void {
    this.root.visible = false;
  }

  dispose(): void {
    this.root.removeFromParent();
    for (const m of this.mats) m.dispose();
  }
}
