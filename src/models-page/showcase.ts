/**
 * Mô hình chỉ để xem trong Xưởng Mô Hình: chưa có trong luật chơi, nên không nằm trong UNITS và không lọt vào trận
 * hay Phòng Thử Nghiệm. Khi bản cập nhật tới, đưa quân vào content.ts rồi bỏ khỏi danh sách này.
 */
import type { Faction } from "../sim/content";
import type { Rig } from "../render/models";
import { partIfUnnamed } from "../render/models/kit";
import { buildCarrier } from "../render/models/units/carrier";

export interface ShowcaseItem {
  name: string;
  sub: string;
  role: string;
  notes: string[];
  build(faction: Faction): Rig;
}

export const SHOWCASE = {
  carrier: {
    name: "Siêu Tàu Sân Bay",
    sub: "Bản cập nhật Hải quân",
    role: "Sân bay nổi của hạm đội: chở cả một phi đoàn, tự bảo vệ bằng các đài pháo quanh mạn.",
    notes: [
      "Chỉ xem trước trong Xưởng Mô Hình, chưa có trong trận đấu.",
      "Dài khoảng 107 m, boong rộng khoảng 26 m, phình ở mạn trái, đài chỉ huy nhỏ phía sau mạn phải.",
      "Máy bay đậu thành hàng dọc hai mép boong, đang để cỡ thật để so tỉ lệ.",
      "Đường phóng ở mũi và đường băng xiên đều có máy phóng đàn hồi, 6 đài pháo phòng thủ trên sàn ngoài mạn."
    ],
    build(faction: Faction): Rig {
      const rig = buildCarrier(faction);
      partIfUnnamed("Siêu Tàu Sân Bay", rig.root);
      return rig;
    }
  }
} satisfies Record<string, ShowcaseItem>;

export type ShowcaseId = keyof typeof SHOWCASE;
export const SHOWCASE_IDS = Object.keys(SHOWCASE) as ShowcaseId[];
export const isShowcase = (id: string): id is ShowcaseId => id in SHOWCASE;
