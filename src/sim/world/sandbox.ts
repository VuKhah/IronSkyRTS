/** Phòng Thử Nghiệm: lệnh sb* (chỉ khi World tạo với { sandbox: true }). */
import { BUILDINGS, defaultRot, normRot, UNITS, type BuildingId, type UnitId } from "../content";
import { clamp } from "../fmath";
import type { Order } from "../types";
import type { SandboxState } from "./shared";
import { World } from "./core";


// ------------------------------------------------------------------ Phòng Thử Nghiệm

/** null = thả được công trình ở đây (Phòng Thử Nghiệm bỏ qua luật vùng xây và giá tiền). */
function sandboxPlaceError(this: World, kind: BuildingId, x: number, z: number, rotIn?: number): string | null {
  const rot = normRot(rotIn) ?? defaultRot(kind, z);
  [x, z] = this.snapBuilding(kind, x, z, rot);
  const [hw, hd] = this.blockHalf(kind, rot);
  if (!this.insideMap(kind, x, z, hw, hd)) return "Ngoài bản đồ";
  for (const i of this.grid.cellsInRect(x, z, hw, hd)) if (this.grid.blockedIdx(i)) return "Vướng sông, đá, vách, mỏ hoặc công trình";
  const flat = this.flatError(x, z, hw, hd);
  if (flat) return flat;
  const lay = this.layoutError(kind, x, z, rot);
  if (lay) return lay;
  return null;
}

function applySandbox(this: World, sb: SandboxState, o: Order): void {
  switch (o.t) {
    case "sbSpawn": {
      if (o.kind in BUILDINGS) {
        const kind = o.kind as BuildingId;
        const x = Math.round(o.x);
        const z = Math.round(o.z);
        if (this.sandboxPlaceError(kind, x, z, o.rot) === null) this.addBuilding(kind, o.side, x, z, true, o.rot);
        break;
      }
      const kind = o.kind as UnitId;
      if (!(kind in UNITS)) break;
      const x = clamp(o.x, -this.map.edgeX + 2, this.map.edgeX - 2);
      const z = clamp(o.z, -this.map.edgeZ + 2, this.map.edgeZ - 2);
      const u = this.spawnUnit(kind, o.side, x, z);
      const spec = UNITS[kind];
      if (spec.domain === "air") {
        // không có Sân Đáp thì không cất cánh được: thả thẳng lên trời, bay vòng chờ tại chỗ
        u.air = "flying";
        // drone lơ lửng theo mặt đất dưới thân; máy bay ở tầng bay cố định tính từ nền
        u.alt = u.palt = spec.hover ? spec.hover.alt : this.cruiseAltAt(x, z);
        u.speed = spec.hover ? 0 : spec.speed;
        u.mission = "move";
        u.mx = clamp(x, -this.map.airX, this.map.airX);
        u.mz = clamp(z, -this.map.airZ, this.map.airZ);
      }
      if (o.gx !== undefined && o.gz !== undefined) {
        if (spec.domain === "air") {
          // máy bay thả ra đã hướng mũi về đích, để đường bay thẳng
          const dx = o.gx - u.x;
          const dz = o.gz - u.z;
          const l = Math.sqrt(dx * dx + dz * dz);
          if (l > 1e-6) {
            u.hx = u.phx = dx / l;
            u.hz = u.phz = dz / l;
          }
        }
        this.orderMove(o.side, [u.id], o.gx, o.gz, o.go ?? "amove");
      }
      break;
    }
    case "sbRemove":
      for (const id of o.ids) {
        const e = this.target(id);
        if (!e) continue;
        e.hp = 0;
        // xóa bằng công cụ: công trình không nổ to, quân không để lại xác
        this.sold.add(e.id);
      }
      break;
    case "sbHeal":
      for (const id of o.ids) {
        const e = this.target(id);
        if (!e) continue;
        e.hp = e.maxHp;
        if (e.cat === "unit") e.fuel = UNITS[e.kind].fuel?.tank ?? UNITS[e.kind].energy?.max ?? 0;
      }
      break;
    case "sbClear":
      for (const u of this.units) {
        u.hp = 0;
        this.sold.add(u.id);
      }
      this.wrecks = [];
      for (const b of this.buildings)
        if (b.kind !== "hq") {
          b.hp = 0;
          this.sold.add(b.id);
        }
      this.shots = [];
      for (const st of this.sides) {
        st.stats.damageDealt = 0;
        st.stats.kills = 0;
        st.stats.unitsLost = 0;
      }
      break;
    case "sbHold":
      sb.hold[o.side] = o.on;
      break;
    case "sbGo": {
      const ids = this.units.filter((u) => u.side === o.side && u.air === "none" && u.hp > 0).map((u) => u.id);
      if (ids.length) this.orderMove(o.side, ids, o.x, o.z, "amove");
      break;
    }
    case "sbFuel":
      sb.infiniteFuel = o.on;
      break;
    default:
      break;
  }
}

const methods = { sandboxPlaceError, applySandbox };
type Methods = typeof methods;
declare module "./core" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface World extends Methods {}
}
Object.assign(World.prototype, methods);
