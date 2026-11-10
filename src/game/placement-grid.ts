/**
 * Lưới ô vuông khi đang đặt công trình: chỉ vẽ một vùng nhỏ quanh chỗ đặt, mờ dần ra ngoài để không rối mắt.
 * Khối ô công trình sẽ chiếm được tô màu: xanh = đặt được, đỏ = không. Các ô xung quanh mà không nhà nào được đặt lên
 * (ngoài vùng xây, sông, đá, nhà, mỏ, ô cửa ra, đệm quanh Tổng Hành Dinh; `World.cellForbidden`) tô đỏ mờ dần ra ngoài,
 * để Tư lệnh thấy trước đất nào bị cấm (người dùng 10/11/2026). Chỉ là phần vẽ, sim không biết tới.
 */
import * as THREE from "three";
import { CELL, type GameMap } from "../sim/maps";

/** Lưới lan ra quanh khối ô bao nhiêu ô, ô ngoài cùng mờ hẳn. */
const MARGIN = 8;
const LIFT = 0.14;
const LINE_ALPHA = 0.8;
const OK = 0x6fdc8c;
const BAD = 0xff5a4a;
/** Độ đậm của ô bị cấm xây sát chỗ đặt (mờ dần ra ngoài). */
const DENY_ALPHA = 0.5;

export class PlacementGrid {
  private key = "";
  private readonly lineMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false });
  private readonly fillMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide });
  private readonly lines = new THREE.LineSegments(new THREE.BufferGeometry(), this.lineMat);
  private readonly fill = new THREE.Mesh(new THREE.BufferGeometry(), this.fillMat);
  private readonly denyMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  private readonly deny = new THREE.Mesh(new THREE.BufferGeometry(), this.denyMat);

  constructor(
    scene: THREE.Scene,
    private readonly map: GameMap
  ) {
    for (const o of [this.lines, this.fill, this.deny]) {
      o.frustumCulled = false; // hình dựng lại liên tục theo chuột, khỏi tính khối bao
      o.renderOrder = 6;
      o.visible = false;
      scene.add(o);
    }
  }

  /**
   * (cx, cz): tâm công trình đã bám lưới; nx × nz: số ô nó chiếm. `forbidden(x, z)`: ô có tâm (x, z) bị cấm xây;
   * `rev` đổi khi trạng thái thế giới liên quan đổi (thêm / mất nhà) để dựng lại lớp ô đỏ.
   */
  show(cx: number, cz: number, nx: number, nz: number, valid: boolean, forbidden?: (x: number, z: number) => boolean, rev = ""): void {
    this.lines.visible = this.fill.visible = this.deny.visible = true;
    const key = `${cx},${cz},${nx},${nz},${rev}`;
    this.fillMat.color.setHex(valid ? OK : BAD);
    if (key === this.key) return;
    this.key = key;
    this.rebuild(cx, cz, nx, nz, forbidden);
  }

  hide(): void {
    this.lines.visible = this.fill.visible = this.deny.visible = false;
    this.key = "";
  }

  private rebuild(cx: number, cz: number, nx: number, nz: number, forbidden?: (x: number, z: number) => boolean): void {
    const x0 = cx - (nx * CELL) / 2;
    const z0 = cz - (nz * CELL) / 2;
    const x1 = x0 + nx * CELL;
    const z1 = z0 + nz * CELL;
    const y = (x: number, z: number): number => this.map.groundY(x, z) + LIFT;
    /** Độ đậm của nét: trong khối ô là đậm nhất, ra xa mờ dần theo số ô. */
    const alpha = (x: number, z: number): number => {
      const d = Math.max(x0 - x, x - x1, z0 - z, z - z1, 0) / CELL;
      return LINE_ALPHA * Math.max(0, 1 - d / MARGIN);
    };
    const pos: number[] = [];
    const col: number[] = [];
    const vertex = (x: number, z: number): void => {
      pos.push(x, y(x, z), z);
      col.push(0.92, 0.97, 1, alpha(x, z));
    };
    const segment = (ax: number, az: number, bx: number, bz: number): void => {
      vertex(ax, az);
      vertex(bx, bz);
    };
    const left = x0 - MARGIN * CELL;
    const back = z0 - MARGIN * CELL;
    const cols = nx + MARGIN * 2;
    const rows = nz + MARGIN * 2;
    // vẽ từng đoạn một ô để nét bám theo độ cao mặt đất
    for (let i = 0; i <= cols; i++) for (let j = 0; j < rows; j++) segment(left + i * CELL, back + j * CELL, left + i * CELL, back + (j + 1) * CELL);
    for (let j = 0; j <= rows; j++) for (let i = 0; i < cols; i++) segment(left + i * CELL, back + j * CELL, left + (i + 1) * CELL, back + j * CELL);
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    lineGeo.setAttribute("color", new THREE.Float32BufferAttribute(col, 4));
    this.lines.geometry.dispose();
    this.lines.geometry = lineGeo;

    const quad: number[] = [];
    const corner = (x: number, z: number): void => {
      quad.push(x, y(x, z) + 0.02, z);
    };
    for (let i = 0; i < nx; i++)
      for (let j = 0; j < nz; j++) {
        const a = x0 + i * CELL;
        const b = z0 + j * CELL;
        const c = a + CELL;
        const d = b + CELL;
        corner(a, b);
        corner(a, d);
        corner(c, b);
        corner(c, b);
        corner(a, d);
        corner(c, d);
      }
    const fillGeo = new THREE.BufferGeometry();
    fillGeo.setAttribute("position", new THREE.Float32BufferAttribute(quad, 3));
    this.fill.geometry.dispose();
    this.fill.geometry = fillGeo;

    // ô bị cấm xây quanh chỗ đặt (trừ khối ô công trình, đã tô xanh / đỏ): đỏ mờ dần ra ngoài như nét lưới
    const dpos: number[] = [];
    const dcol: number[] = [];
    if (forbidden)
      for (let i = 0; i < cols; i++)
        for (let j = 0; j < rows; j++) {
          const a = left + i * CELL;
          const b = back + j * CELL;
          const mx = a + CELL / 2;
          const mz = b + CELL / 2;
          if (mx > x0 && mx < x1 && mz > z0 && mz < z1) continue;
          const k = alpha(mx, mz) / LINE_ALPHA;
          if (k <= 0.02 || !forbidden(mx, mz)) continue;
          const c = a + CELL;
          const d = b + CELL;
          for (const [px, pz] of [[a, b], [a, d], [c, b], [c, d], [a, d], [c, b]] as const) {
            dpos.push(px, y(px, pz) + 0.015, pz);
            dcol.push(1, 0.22, 0.18, DENY_ALPHA * (0.35 + 0.65 * k));
          }
        }
    const denyGeo = new THREE.BufferGeometry();
    denyGeo.setAttribute("position", new THREE.Float32BufferAttribute(dpos, 3));
    denyGeo.setAttribute("color", new THREE.Float32BufferAttribute(dcol, 4));
    this.deny.geometry.dispose();
    this.deny.geometry = denyGeo;
  }
}
