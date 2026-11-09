/**
 * Mô hình chỉ để xem trong Xưởng Mô Hình: chưa có trong luật chơi, nên không nằm trong UNITS và không lọt vào trận
 * hay Phòng Thử Nghiệm. Khi bản cập nhật tới, đưa quân vào content.ts rồi bỏ khỏi danh sách này.
 */
import type { Faction } from "../sim/content";
import type { Rig } from "../render/models";
import { palette, partIfUnnamed } from "../render/models/kit";
import { buildCarrier } from "../render/models/units/carrier";
import { buildScoutDrone } from "../render/models/units/scout-drone";
import { buildShieldDrone } from "../render/models/units/shield-drone";

/** Nhóm trong tab Quân đội. */
export type ShowcaseCat = "navy" | "drone";

export interface ShowcaseItem {
  cat: ShowcaseCat;
  name: string;
  sub: string;
  role: string;
  notes: string[];
  build(faction: Faction): Rig;
}

export const SHOWCASE = {
  carrier: {
    cat: "navy",
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
  },
  "scout-drone": {
    cat: "drone",
    name: "Drone Trinh Sát",
    sub: "Chưa có luật chơi",
    role: "Mắt thần tiền duyên, rẻ và nhanh; có thể lao cảm tử vào mục tiêu mặt đất.",
    notes: [
      "Chỉ xem trước trong Xưởng Mô Hình, chưa có trong trận đấu.",
      "4 cánh quạt, sải khoảng 2,6 m, nhìn từ trên là chữ X nóc màu phe.",
      "Camera dưới mũi và đầu nổ cảm tử dưới bụng; bấm Lao cảm tử để xem chúi mũi, đầu nổ chớp đỏ."
    ],
    build(faction: Faction): Rig {
      const rig = buildScoutDrone(palette(faction));
      partIfUnnamed("Drone Trinh Sát", rig.root);
      return rig;
    }
  },
  "shield-drone": {
    cat: "drone",
    name: "Drone Khiên/Khói",
    sub: "Chưa có luật chơi",
    role: "Tạo vùng khiên chặn sát thương hoặc vùng khói che quân; chọn loại lúc đúc.",
    notes: [
      "Chỉ xem trước trong Xưởng Mô Hình, chưa có trong trận đấu.",
      "Thân vòng benzen bọc giáp: vành lục giác dày liền khối, 6 quạt trong vỏ bọc ở 6 đỉnh, 3 tấm màu phe xen kẽ, vòng tròn sáng quanh lõi giáp.",
      "Phạm vi 12 m. Bật khiên: vòm lục giác trùm quân bên dưới. Bật khói: khói lan ra trong cùng phạm vi."
    ],
    build(faction: Faction): Rig {
      const rig = buildShieldDrone(palette(faction));
      partIfUnnamed("Drone Khiên/Khói", rig.root);
      return rig;
    }
  }
} satisfies Record<string, ShowcaseItem>;

export type ShowcaseId = keyof typeof SHOWCASE;
export const SHOWCASE_IDS = Object.keys(SHOWCASE) as ShowcaseId[];
export const isShowcase = (id: string): id is ShowcaseId => id in SHOWCASE;
