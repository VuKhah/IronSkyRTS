/** Tạo thực thể: sinh quân, dựng công trình. */
import { BUILDINGS, defaultRot, normRot, RULES, UNITS, type BuildingId, type Side, type UnitId } from "../content";
import type { Building, Unit } from "../types";
import { dirToCenter } from "./shared";
import { World } from "./core";


// ------------------------------------------------------------------ tạo thực thể

function spawnUnit(this: World, kind: UnitId, side: Side, x: number, z: number): Unit {
  const spec = UNITS[kind];
  let px = x;
  let pz = z;
  if (spec.domain === "ground") {
    const f = this.grid.nearestFree(x, z, 12);
    if (f) [px, pz] = f;
  }
  const [hx, hz] = dirToCenter(px, pz);
  const u: Unit = {
    id: this.nextId++,
    cat: "unit",
    kind,
    side,
    formation: null,
    lot: 0,
    x: px,
    z: pz,
    px,
    pz,
    hx,
    hz,
    phx: hx,
    phz: hz,
    alt: 0,
    palt: 0,
    hp: spec.hp,
    maxHp: spec.hp,
    cooldown: 0,
    lastShot: -1000,
    burst: 0,
    still: 0,
    aimX: hx,
    aimZ: hz,
    pd: spec.pointDefense?.charges ?? 0,
    pdT: 0,
    order: "idle",
    tx: px,
    tz: pz,
    targetId: 0,
    autoTarget: 0,
    path: [],
    pathI: 0,
    repathAt: 0,
    stuck: 0,
    progD: 1e9,
    progT: 0,
    moved: false,
    packing: false,
    chasing: false,
    faceX: 0,
    faceZ: 0,
    group: 0,
    slot: 0,
    gprio: 0,
    avoidId: 0,
    avoidSide: 0,
    avX: 0,
    avZ: 0,
    avT: -1000,
    homeT: 0,
    driveT: -1,
    going: false,
    wasGoing: false,
    division: 0,
    hitX: 0,
    hitZ: 0,
    divTarget: 0,
    wing: 0,
    wingLat: 0,
    wingBack: 0,
    pathFromX: 0,
    pathFromZ: 0,
    hState: "idle",
    mineId: 0,
    manual: false,
    cargo: 0,
    cargoRes: "iron",
    hTimer: 0,
    wreckId: 0,
    scrap: 0,
    air: spec.domain === "air" ? "parked" : "none",
    fuel: spec.fuel?.tank ?? spec.energy?.max ?? 0,
    padB: 0,
    padI: -1,
    speed: 0,
    airT: 0,
    mission: "none",
    huntUntil: 0,
    mx: px,
    mz: pz,
    rtb: false,
    ax: 0,
    az: 0,
    crashed: false,
    ext: false,
    yawRate: 0,
    vy: 0,
    cd2: 0,
    ammo2: spec.secondary?.ammo ?? 0,
    xp: 0,
    rank: 0,
    lastHit: -1000,
    shieldOn: 0,
    shieldIdle: 0,
    threat: 0
  };
  this.units.push(u);
  this.byId.set(u.id, u);
  if (kind === "commander") this.commanders[side] = u;
  this.events.push({ t: "spawn", id: u.id, kind, side });
  return u;
}

function addBuilding(this: World, kind: BuildingId, side: Side, x: number, z: number, built: boolean, rotIn?: number): Building {
  const spec = BUILDINGS[kind];
  const rot = normRot(rotIn) ?? defaultRot(kind, z);
  [x, z] = this.snapBuilding(kind, x, z, rot);
  const [blockW, blockD] = this.blockHalf(kind, rot);
  // lối ra trong nền móng (bay) không bị chặn: xe đúc xong đứng ở đó rồi chạy ra
  const bayCells = this.bayCells(kind, x, z, rot);
  const cells = this.grid.cellsInRect(x, z, blockW, blockD).filter((i) => !bayCells.has(i));
  this.grid.block(cells, 1);
  const [dx, dz] = dirToCenter(x, z);
  const reach = Math.max(spec.half[0], spec.half[1]) + 6;
  const b: Building = {
    id: this.nextId++,
    cat: "building",
    kind,
    side,
    x,
    z,
    rot,
    hp: built ? spec.hp : spec.hp * 0.1,
    maxHp: spec.hp,
    progress: built ? 1 : 0,
    built,
    queue: [],
    prog: 0,
    rallyX: x + dx * reach,
    rallyZ: z + dz * reach,
    rallySet: false,
    aimX: dx,
    aimZ: dz,
    cooldown: 0,
    lastShot: -1000,
    burst: 0,
    targetId: 0,
    cells,
    pads: kind === "airfield" ? new Array<number>(RULES.air.pads).fill(0) : [],
    active: false,
    powerFrac: 1,
    load: 0,
    charge: 0
  };
  this.buildings.push(b);
  this.byId.set(b.id, b);
  return b;
}

const methods = { spawnUnit, addBuilding };
type Methods = typeof methods;
declare module "./core" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface World extends Methods {}
}
Object.assign(World.prototype, methods);
