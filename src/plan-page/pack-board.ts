/** Tấm "xếp cho hình bao nhỏ nhất": mỗi loại công trình một nhà, không tính quân (`?pack=1`). */
import { BUILDINGS, RULES, type BuildingId } from "../sim/content";
import { CELL } from "../sim/maps";
import { World } from "../sim/world";
import { figure, renderSite, scaleBar } from "./common";
import { search, type Spot } from "./pack";

/** Đặt một phương án vào World Phòng Thử Nghiệm bằng luật thật; trả về World nếu mọi nhà đều hợp lệ. */
function realize(spots: Spot[], ox: number, oz: number): World | null {
  const w = new World(1, { sandbox: true, map: "big-test" });
  for (const s of spots) {
    const kind = s.kind as BuildingId;
    // tâm nhà = tâm nền móng (thân nằm chính giữa); nấc xoay 1 = nằm ngang (đổi rộng / sâu)
    const x = ox + (s.cx + s.w / 2) * CELL;
    const z = oz + (s.cz + s.h / 2) * CELL;
    const rot = s.rot ? 1 : 0;
    if (w.sandboxPlaceError(kind, x, z, rot) !== null) return null;
    const n = w.buildings.length;
    w.step([{ side: 0, order: { t: "sbSpawn", kind, side: 0, x, z, rot } } as never]);
    if (w.buildings.length === n) return null;
  }
  return w;
}

export function drawPackBoard(host: HTMLElement): void {
  const probe = new World(1, { sandbox: true, map: "big-test" });
  // góc bản vẽ: một đường lưới trên bãi trống của bản đồ thử 960 m (lưới sim: −halfW + k·2)
  const ox = -60;
  const oz = 40;
  const plans = search((Object.keys(BUILDINGS) as BuildingId[]).map((kind) => {
    const [fw, fh] = probe.footCells(kind, 0);
    return { kind, fw, fh };
  }), RULES.buildPadCells);
  let pick: { spots: Spot[]; W: number; H: number; area: number } | null = null;
  let w: World | null = null;
  let tried = 0;
  for (const p of plans) {
    tried++;
    w = realize(p.spots, ox, oz);
    if (w) {
      pick = p;
      break;
    }
  }
  if (!pick || !w) {
    host.textContent = "Không tìm được cách xếp nào hợp lệ theo luật hiện tại.";
    return;
  }
  const pad = RULES.buildPadCells;
  const lower = (Object.keys(BUILDINGS) as BuildingId[]).reduce((s, k) => {
    const [a, b] = probe.footCells(k, 0);
    return s + a * b;
  }, 0);
  const blds = w.buildings.filter((b) => b.side === 0 && b.x >= ox - 1 && b.z >= oz - 1 && b.x <= ox + pick!.W * CELL + 1 && b.z <= oz + pick!.H * CELL + 1);

  const LS = 16; // px / m
  const M = (pad + 1) * CELL; // lề giấy quanh hình bao: đủ thấy ô cấm xây ngoài cùng
  const { cv, g, px, pz } = renderSite(w, blds, ox - M, oz - M, ox + pick.W * CELL + M, oz + pick.H * CELL + M, LS);
  // khung hình bao (theo nền móng) + kích thước
  g.strokeStyle = "#2b2b2b";
  g.lineWidth = 2;
  g.setLineDash([10, 5]);
  g.strokeRect(px(ox), pz(oz), pick.W * CELL * LS, pick.H * CELL * LS);
  g.setLineDash([]);
  g.font = "700 13px 'Be Vietnam Pro', sans-serif";
  g.fillStyle = "#2b2b2b";
  g.fillText(`${pick.W} ô (${pick.W * CELL} m)`, px(ox) + 4, pz(oz) - 8);
  g.save();
  g.translate(px(ox) - 8, pz(oz + pick.H * CELL) - 4);
  g.rotate(-Math.PI / 2);
  g.fillText(`${pick.H} ô (${pick.H * CELL} m)`, 0, 0);
  g.restore();
  scaleBar(g, cv.height, LS);

  const fill = Math.round((lower / pick.area) * 100);
  figure(
    host,
    cv,
    `<b>${blds.length} công trình</b> trong hình bao <b>${pick.W} × ${pick.H} ô = ${pick.area} ô</b> (${pick.W * CELL} × ${pick.H * CELL} m). ` +
      `Riêng các nền móng chiếm ${lower} ô (${fill}% hình bao); phần còn lại là ô cấm xây dùng chung giữa các nhà và chỗ trống không lấp được. ` +
      `Mọi nhà đặt hợp lệ theo luật hiện tại của sim (đã thử ${tried} phương án từ nhỏ tới lớn).`
  );
}

