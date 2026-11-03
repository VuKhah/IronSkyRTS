/**
 * Sân khấu 3D của Xưởng Mô Hình: một renderer WebGL duy nhất, ánh sáng có đổ bóng,
 * nền bãi thử và camera quỹ đạo (OrbitControls). Mô hình được thay qua show().
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
  const grid = new THREE.GridHelper(28, 28, 0x56627a, 0x444d5e);
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = 0.35;
  grid.position.y = 0.005;
  const rim = new THREE.Mesh(new THREE.RingGeometry(13.6, 14, 64), new THREE.MeshBasicMaterial({ color: 0xffb547, transparent: true, opacity: 0.35 }));
  rim.rotation.x = -Math.PI / 2;
  rim.position.y = 0.01;
  g.add(disk, grid, rim);
  scene.add(g);
  return g;
}

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(38, 1, 0.1, 400);
  readonly controls: OrbitControls;
  private rig: Rig | null = null;
  private clock = new THREE.Clock();
  private time = 0;
  active = new Set<string>();

  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.prepend(this.renderer.domElement);

    makeLights(this.scene, 12);
    makeGround(this.scene);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.minDistance = 3;
    this.controls.maxDistance = 60;
    this.controls.autoRotateSpeed = 1.2;

    new ResizeObserver(() => this.resize()).observe(host);
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  set autoRotate(on: boolean) {
    this.controls.autoRotate = on;
  }

  /** Đổi mô hình; keepView = giữ góc camera (khi chỉ đổi màu phe). */
  show(rig: Rig, keepView = false): Rig | null {
    const old = this.rig;
    if (old) this.scene.remove(old.root);
    this.rig = rig;
    this.scene.add(rig.root);
    if (!keepView) this.frameRig(rig);
    return old;
  }

  private frameRig(rig: Rig): void {
    const r = rig.radius;
    const target = new THREE.Vector3(0, r * 0.42, 0);
    const dir = new THREE.Vector3(1.0, 0.62, 1.25).normalize();
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

  private frame(): void {
    const dt = Math.min(0.05, this.clock.getDelta());
    this.time += dt;
    this.rig?.update(dt, this.time, this.active);
    this.controls.update();
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
