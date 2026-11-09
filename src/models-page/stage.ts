/**
 * Sân khấu 3D của Xưởng Mô Hình: một renderer WebGL duy nhất, ánh sáng có đổ bóng,
 * nền bãi thử và camera quỹ đạo (OrbitControls). Mô hình được thay qua show().
 *
 * Hai công cụ để bàn thiết kế mô hình:
 * - Rê chuột (hoặc chạm) vào một bộ phận: khung sáng bao bộ phận + tên (đặt bằng `part()` trong kit.ts) + kích thước.
 * - Thước: lưới 1 m (vạch đậm mỗi 5 m), 3 đường đo rộng / dài / cao của cả mô hình, người cao 1,8 m để so tỉ lệ.
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { Rig } from "../render/models";

export function makeLights(scene: THREE.Scene, radius = 10): THREE.DirectionalLight {
  scene.add(new THREE.HemisphereLight(0xcfe3ff, 0x2a2f38, 1.25));
  const sun = new THREE.DirectionalLight(0xfff2dd, 2.4);
  sun.position.set(radius * 0.8, radius * 1.6, radius * 0.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const c = sun.shadow.camera;
  c.left = c.bottom = -radius;
  c.right = c.top = radius;
  c.near = 0.5;
  c.far = radius * 5;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);
  return sun;
}

/** Bãi thử: đĩa bê tông có vạch lưới, nhận bóng đổ. */
export function makeGround(scene: THREE.Scene): THREE.Group {
  const g = new THREE.Group();
  const disk = new THREE.Mesh(new THREE.CircleGeometry(14, 64), new THREE.MeshStandardMaterial({ color: 0x3a4250, roughness: 0.95 }));
  disk.rotation.x = -Math.PI / 2;
  disk.receiveShadow = true;
  // lưới 1 m (mỗi ô = 1 m) và lưới đậm 5 m để ước lượng kích thước bằng mắt
  const grid = new THREE.GridHelper(28, 28, 0x56627a, 0x444d5e);
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = 0.35;
  grid.position.y = 0.005;
  const major = new THREE.GridHelper(30, 6, 0x8a97b0, 0x8a97b0);
  (major.material as THREE.Material).transparent = true;
  (major.material as THREE.Material).opacity = 0.45;
  major.position.y = 0.007;
  g.add(major);
  const rim = new THREE.Mesh(new THREE.RingGeometry(13.6, 14, 64), new THREE.MeshBasicMaterial({ color: 0xffb547, transparent: true, opacity: 0.35 }));
  rim.rotation.x = -Math.PI / 2;
  rim.position.y = 0.01;
  g.add(disk, grid, rim);
  scene.add(g);
  return g;
}

/** Có hiện trên màn hình không: chính nó và mọi nhóm cha cho tới `root` đều đang hiện. */
export function shownIn(o: THREE.Object3D, root: THREE.Object3D): boolean {
  for (let x: THREE.Object3D | null = o; x; x = x.parent) {
    if (!x.visible) return false;
    if (x === root) return true;
  }
  return true;
}

/** Khối hiệu ứng (vòng hào quang, chớp lửa, vùng phủ…): vật liệu trong suốt không ghi chiều sâu. Không tính vào kích thước. */
export function isEffect(m: THREE.Mesh): boolean {
  const mats = Array.isArray(m.material) ? m.material : [m.material];
  return mats.some((x) => x.transparent && !x.depthWrite);
}

const TMP_M = new THREE.Matrix4();
const TMP_B = new THREE.Box3();

/**
 * Hộp bao của `obj` tính trong hệ tọa độ của `root` (trục theo thân mô hình: x = rộng, y = cao, z = dài),
 * chỉ gồm khối đang hiện và không phải hiệu ứng. Hộp rỗng nếu không có khối nào.
 * `ownOnly`: bỏ các bộ phận con đã có tên riêng (kích thước "Tháp pháo" không tính "Nòng pháo" gắn trên nó).
 */
export function localBox(obj: THREE.Object3D, root: THREE.Object3D, ownOnly = false): THREE.Box3 {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const out = new THREE.Box3();
  const walk = (o: THREE.Object3D): void => {
    if (ownOnly && o !== obj && o.userData.part) return;
    if (o instanceof THREE.Mesh && !isEffect(o) && shownIn(o, root)) {
      const g = o.geometry;
      if (!g.boundingBox) g.computeBoundingBox();
      out.union(TMP_B.copy(g.boundingBox!).applyMatrix4(TMP_M.multiplyMatrices(inv, o.matrixWorld)));
    }
    for (const c of o.children) walk(c);
  };
  walk(obj);
  return out;
}

/** Bộ phận có tên gần nhất chứa khối `o` (đi ngược lên các nhóm cha tới `root`). */
export function partOf(o: THREE.Object3D, root: THREE.Object3D): THREE.Object3D | null {
  for (let x: THREE.Object3D | null = o; x; x = x.parent) {
    if (x.userData.part) return x;
    if (x === root) break;
  }
  return null;
}

const m1 = (n: number): string => n.toLocaleString("vi-VN", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Hình người cao 1,8 m bằng khối xám (đứng cạnh mô hình để so tỉ lệ). */
function makePerson(): THREE.Group {
  const mat = new THREE.MeshStandardMaterial({ color: 0xc9ced8, roughness: 0.7 });
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.75, 4, 10), mat);
  body.position.y = 0.55 + 0.375;
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.55, 0.2), mat);
  legs.position.y = 0.275;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), mat);
  head.position.y = 1.8 - 0.13;
  for (const m of [body, legs, head]) m.castShadow = true;
  g.add(legs, body, head);
  return g;
}

export type ViewName = "three" | "front" | "side" | "top" | "back";
/** Hướng camera nhìn về mô hình cho từng góc chuẩn (mặt trước mô hình là +Z). "top" hơi nghiêng để OrbitControls không khóa trục. */
const VIEW_DIRS: Record<ViewName, THREE.Vector3> = {
  three: new THREE.Vector3(1.0, 0.62, 1.25),
  front: new THREE.Vector3(0, 0.18, 1),
  side: new THREE.Vector3(1, 0.18, 0),
  top: new THREE.Vector3(0, 1, 0.02),
  // sau-thấp: thấy đuôi, ống xả; khi bật "bay" thì thấy cả gầm máy bay
  back: new THREE.Vector3(-1.0, 0.16, -1.25)
};

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(38, 1, 0.1, 400);
  readonly controls: OrbitControls;
  private rig: Rig | null = null;
  private clock = new THREE.Clock();
  private time = 0;
  active = new Set<string>();

  // rê chuột vào bộ phận
  private ray = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private pointerPx = { x: 0, y: 0 };
  private pickPending = false;
  private hovered: THREE.Object3D | null = null;
  private hoverBox = new THREE.Box3();
  private hoverHelper: THREE.Box3Helper;
  private tip: HTMLDivElement;
  private downAt: { x: number; y: number } | null = null;

  // thước đo
  private measureOn = true;
  private measureT = 0;
  private dims = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffb547, depthTest: false, transparent: true }));
  private person = makePerson();
  private labels: { el: HTMLDivElement; at: THREE.Vector3 }[] = [];

  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.prepend(this.renderer.domElement);

    makeLights(this.scene, 12);
    makeGround(this.scene);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.minPolarAngle = 0;
    this.controls.minDistance = 3;
    this.controls.maxDistance = 60;
    this.controls.autoRotateSpeed = 1.2;

    this.hoverHelper = new THREE.Box3Helper(this.hoverBox, 0x6fe3ff);
    (this.hoverHelper.material as THREE.LineBasicMaterial).depthTest = false;
    this.hoverHelper.renderOrder = 10;
    this.hoverHelper.visible = false;
    this.tip = document.createElement("div");
    this.tip.className = "part-tip";
    this.tip.hidden = true;
    host.appendChild(this.tip);

    this.dims.renderOrder = 9;
    this.scene.add(this.dims, this.person);
    for (let i = 0; i < 4; i++) {
      const el = document.createElement("div");
      el.className = "dim-label";
      host.appendChild(el);
      this.labels.push({ el, at: new THREE.Vector3() });
    }

    const canvas = this.renderer.domElement;
    canvas.addEventListener("pointermove", (e) => {
      // đang kéo xoay camera thì không dò bộ phận
      if (e.buttons) return this.setHover(null);
      if (e.pointerType === "mouse") this.queuePick(e);
    });
    canvas.addEventListener("pointerleave", () => this.setHover(null));
    // điện thoại không có rê chuột: chạm nhẹ (không kéo) để xem tên bộ phận
    canvas.addEventListener("pointerdown", (e) => (this.downAt = { x: e.clientX, y: e.clientY }));
    canvas.addEventListener("pointerup", (e) => {
      if (this.downAt && Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y) < 6) this.queuePick(e);
      this.downAt = null;
    });

    new ResizeObserver(() => this.resize()).observe(host);
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  set autoRotate(on: boolean) {
    this.controls.autoRotate = on;
  }

  get measure(): boolean {
    return this.measureOn;
  }

  /** Bật / tắt thước đo (đường đo kích thước + người 1,8 m). */
  set measure(on: boolean) {
    this.measureOn = on;
    this.dims.visible = on;
    this.person.visible = on;
    for (const l of this.labels) l.el.hidden = !on;
    this.measureT = 0;
  }

  /** Đổi mô hình; keepView = giữ góc camera (khi chỉ đổi màu phe). */
  show(rig: Rig, keepView = false): Rig | null {
    const old = this.rig;
    if (old) {
      old.root.remove(this.hoverHelper);
      this.scene.remove(old.root);
    }
    this.setHover(null);
    this.rig = rig;
    this.scene.add(rig.root);
    rig.root.add(this.hoverHelper);
    this.measureT = 0;
    if (!keepView) this.frameRig(rig);
    return old;
  }

  private frameRig(rig: Rig): void {
    this.view(this.viewName, rig);
  }

  /** Góc nhìn đang dùng (giữ khi đổi mô hình để so các mô hình cùng một góc). */
  viewName: ViewName = "three";

  /**
   * Đặt camera theo góc nhìn chuẩn, để người thiết kế và Claude nói về cùng một góc:
   * "three" ba phần tư (mặc định) · "front" chính diện trước · "side" chính diện bên phải · "top" từ trên xuống.
   */
  view(name: ViewName, rig: Rig | null = this.rig): void {
    this.viewName = name;
    if (!rig) return;
    const r = rig.radius;
    const target = new THREE.Vector3(0, r * 0.42, 0);
    const dir = VIEW_DIRS[name].clone().normalize();
    this.camera.position.copy(target).addScaledVector(dir, r * 3.1);
    this.controls.target.copy(target);
    this.controls.update();
  }

  private resize(): void {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private queuePick(e: PointerEvent): void {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.pointerPx = { x: e.clientX - r.left, y: e.clientY - r.top };
    this.pointer.set((this.pointerPx.x / r.width) * 2 - 1, -(this.pointerPx.y / r.height) * 2 + 1);
    this.pickPending = true;
  }

  /** Dò tia từ con trỏ: khối gần nhất đang hiện (không phải hiệu ứng), rồi lấy bộ phận có tên chứa nó. */
  private pick(): void {
    this.pickPending = false;
    const rig = this.rig;
    if (!rig) return;
    this.ray.setFromCamera(this.pointer, this.camera);
    for (const hit of this.ray.intersectObject(rig.root, true)) {
      const o = hit.object;
      if (!(o instanceof THREE.Mesh) || isEffect(o) || !shownIn(o, rig.root)) continue;
      this.setHover(partOf(o, rig.root));
      return;
    }
    this.setHover(null);
  }

  private setHover(p: THREE.Object3D | null): void {
    this.hovered = p;
    this.hoverHelper.visible = !!p;
    this.tip.hidden = !p;
  }

  /** Khung sáng + bảng tên theo bộ phận đang rê (bộ phận có thể đang chuyển động: tính lại mỗi khung hình). */
  private updateHover(): void {
    const rig = this.rig;
    const p = this.hovered;
    if (!rig || !p) return;
    this.hoverBox.copy(localBox(p, rig.root, true));
    if (this.hoverBox.isEmpty()) return this.setHover(null);
    const size = this.hoverBox.getSize(new THREE.Vector3());
    const html = `<b>${String(p.userData.part)}</b><small>rộng ${m1(size.x)} · dài ${m1(size.z)} · cao ${m1(size.y)} m</small>`;
    if (this.tip.innerHTML !== html) this.tip.innerHTML = html;
    const w = this.host.clientWidth;
    const x = Math.min(this.pointerPx.x + 14, w - this.tip.offsetWidth - 6);
    const y = Math.max(6, this.pointerPx.y - this.tip.offsetHeight - 10);
    this.tip.style.transform = `translate(${x}px, ${y}px)`;
  }

  /**
   * Thước đo theo hộp bao của cả mô hình: đường "rộng" chạy dọc mép trước, "dài" dọc mép bên phải, "cao" dựng ở góc
   * trước bên phải; hai đầu mỗi đường có vạch chặn. Tính lại vài lần mỗi giây (mô hình có hoạt ảnh đổi dáng).
   */
  private updateMeasure(dt: number): void {
    const rig = this.rig;
    if (!rig || !this.measureOn) return;
    this.measureT -= dt;
    if (this.measureT <= 0) {
      this.measureT = 0.3;
      const b = localBox(rig.root, rig.root);
      if (b.isEmpty()) return;
      const g = 0.6;
      const fx = b.max.x + g;
      const fz = b.max.z + g;
      const y0 = 0.03;
      const t = 0.18;
      const pts = [
        // rộng (trục x) ở mép trước
        [b.min.x, y0, fz, b.max.x, y0, fz],
        [b.min.x, y0, fz - t, b.min.x, y0, fz + t],
        [b.max.x, y0, fz - t, b.max.x, y0, fz + t],
        // dài (trục z) ở mép phải
        [fx, y0, b.min.z, fx, y0, b.max.z],
        [fx - t, y0, b.min.z, fx + t, y0, b.min.z],
        [fx - t, y0, b.max.z, fx + t, y0, b.max.z],
        // cao (trục y) ở góc trước phải
        [fx, 0, fz, fx, b.max.y, fz],
        [fx - t, b.max.y, fz, fx + t, b.max.y, fz]
      ].flat();
      const geo = this.dims.geometry;
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
      geo.computeBoundingSphere();
      const size = b.getSize(new THREE.Vector3());
      const L = this.labels;
      L[0].el.textContent = `Rộng ${m1(size.x)} m`;
      L[0].at.set((b.min.x + b.max.x) / 2, y0, fz + 0.35);
      L[1].el.textContent = `Dài ${m1(size.z)} m`;
      L[1].at.set(fx + 0.35, y0, (b.min.z + b.max.z) / 2);
      L[2].el.textContent = `Cao ${m1(size.y)} m`;
      L[2].at.set(fx, b.max.y / 2, fz);
      // người 1,8 m đứng bên trái mô hình, ngang tâm
      this.person.position.set(b.min.x - 1.1, 0, (b.min.z + b.max.z) / 2);
      L[3].el.textContent = "Người 1,8 m";
      L[3].at.set(this.person.position.x, 2.05, this.person.position.z);
    }
    // nhãn chữ là HTML: chiếu điểm 3D ra màn hình mỗi khung hình (camera đang xoay)
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    const v = new THREE.Vector3();
    for (const l of this.labels) {
      v.copy(l.at).project(this.camera);
      const off = v.z > 1;
      l.el.hidden = off;
      if (off) continue;
      l.el.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, -50%)`;
    }
  }

  /** `?sheet=1`: vẽ 4 góc nhìn trong một khung (trên: 3/4, Trước; dưới: Cạnh, Trên) để một ảnh chụp thay cho bốn ảnh. */
  sheet = false;
  private sheetCam = new THREE.PerspectiveCamera(38, 1, 0.1, 400);

  private renderSheet(): void {
    const rig = this.rig;
    if (!rig) return;
    const r = this.renderer;
    const size = r.getSize(new THREE.Vector2());
    const w = size.x / 2;
    const h = size.y / 2;
    const target = new THREE.Vector3(0, rig.radius * 0.42, 0);
    this.sheetCam.aspect = w / h;
    this.sheetCam.updateProjectionMatrix();
    r.setScissorTest(true);
    (["three", "front", "side", "top"] as const).forEach((name, i) => {
      const x = (i % 2) * w;
      const y = i < 2 ? h : 0;
      r.setViewport(x, y, w, h);
      r.setScissor(x, y, w, h);
      r.shadowMap.autoUpdate = i === 0; // bóng đổ chỉ cần tính một lần cho cả 4 góc
      this.sheetCam.position.copy(target).addScaledVector(VIEW_DIRS[name].clone().normalize(), rig.radius * 3.1);
      this.sheetCam.lookAt(target);
      r.render(this.scene, this.sheetCam);
    });
    r.shadowMap.autoUpdate = true;
    r.setScissorTest(false);
  }

  private frame(): void {
    const dt = Math.min(0.05, this.clock.getDelta());
    this.time += dt;
    this.rig?.update(dt, this.time, this.active);
    this.controls.update();
    if (this.pickPending) this.pick();
    this.updateHover();
    this.updateMeasure(dt);
    if (this.sheet) return this.renderSheet();
    this.renderer.render(this.scene, this.camera);
  }
}

/** Chụp ảnh đại diện cho danh sách bằng một renderer nhỏ riêng (tạo một lần, dùng cho mọi mô hình). */
export class Thumbnailer {
  private renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(34, 4 / 3, 0.1, 200);

  constructor() {
    this.renderer.setSize(224, 168, false);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    makeLights(this.scene, 12);
  }

  shoot(rig: Rig): string {
    this.scene.add(rig.root);
    rig.update(0.016, 0, new Set(rig.defaultOn.filter((a) => a !== "power" && a !== "capture" && a !== "aura")));
    const r = rig.radius;
    const target = new THREE.Vector3(0, r * 0.38, 0);
    this.camera.position.copy(target).addScaledVector(new THREE.Vector3(1, 0.55, 1.2).normalize(), r * 1.85);
    this.camera.lookAt(target);
    this.renderer.render(this.scene, this.camera);
    const url = this.renderer.domElement.toDataURL("image/png");
    this.scene.remove(rig.root);
    return url;
  }

  dispose(): void {
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
