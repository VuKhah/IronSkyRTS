/**
 * "CAO NGUYÊN BA BẬC" (mã "standard", Bản Đồ Chuẩn): bản đồ chính thức thứ nhất, người dùng và Claude dựng cùng nhau
 * 11/11/2026 trên Bản Vẽ Địa Hình + Sa Bàn 3D (map-editor.html, map-3d.html). Chữ nhật 436 × 270 m (tỉ lệ vàng, cạnh ngắn
 * 270 = 9 × 30), đối xứng xoay 180°, Lam ở Tây, Đỏ ở Đông.
 *
 * Địa hình bậc thang 3 tầng (5 / 10 / 15 m), mọi dốc là khối 10 × 10 m lên đúng một bậc, có chiếu nghỉ, không lộ thiên
 * (Docs/design/MAPS_PLAN.md). Bố cục: nền HQ tầng 1 với 3 cửa (Bắc, Nam 4 làn đứt đoạn, Đông 4 làn liền); cao nguyên giữa
 * tầng 1 là chiến trường chính, hai thềm tầng 2 chéo nhau; mỗi phe một khối núi chữ L (tầng 2 ôm tầng 3) làm trận địa pháo
 * nhìn vào sân giữa; vùng Sắt (mesa A1:C2) và vùng Dầu (hồ A8:C9) sát căn cứ; Dầu ở vùng trũng, Sắt ở vùng cao; viền bản đồ
 * chặn kín bằng đá, rừng, nước.
 *
 * Dữ liệu ô là bản vẽ đã "nướng" (`npx tsx src/tools/bake-layout.ts standard src/sim/maps/data/cao-nguyen-ba-bac.json`):
 * sửa bản đồ thì sửa bản vẽ (Docs/maps/standard/layout.json) rồi nướng lại, đừng sửa tay file JSON.
 */
import data from "./data/cao-nguyen-ba-bac.json";
import type { MapDef, MineDef, RampDef } from "./types";

export const STANDARD: MapDef = {
  id: "standard",
  name: "Cao Nguyên Ba Bậc",
  blurb: "Cao nguyên giữa là chiến trường chính, hai núi chữ L làm trận địa pháo ở hai bên; Sắt trên vùng cao, Dầu dưới vùng trũng.",
  size: { w: data.w, h: data.h },
  roundTop: 12,
  ruler: { cell: 30, minor: 10, guideX: [-52, 52] },
  symmetric: true,
  bases: [[-180, 0]],
  mines: data.mines as MineDef[],
  ramps: data.ramps as RampDef[],
  cells: { rows: data.rows, surf: data.surf },
  rocks: [],
  rivers: [],
  biome: "temperate"
};
