/**
 * Tiến trình người chơi (FEATURE_FRAMEWORK A16): huy chương mỗi trận, điểm kinh nghiệm và cấp bậc quân hàm cộng dồn qua
 * các trận, lưu trong localStorage (không có tài khoản). Chỉ trận "Chơi với AI" được tính; xem AI đấu AI và Phòng Thử
 * Nghiệm không tính. Mọi số là số tạm (11/11/2026).
 *
 * Phần tính toán là hàm thuần (kiểm thử trong career.test.ts); chỉ `loadCareer` / `saveCareer` đụng tới bộ nhớ trình duyệt.
 */
import type { SideStats } from "../sim/types";

/** Huy chương sau trận: thành tích đáng nhớ (cho người chơi lý do chơi lại theo cách khác). */
export const MEDALS: { id: string; icon: string; name: string; why: string; got: (s: SideStats, won: boolean, secs: number) => boolean }[] = [
  { id: "veteran", icon: "🎖️", name: "Lão tướng", why: "Có quân lên cựu binh cấp 3", got: (s) => s.topRank >= 3 },
  { id: "salvo", icon: "🚀", name: "Mưa thép", why: "Xe Tên Lửa Loạt xả từ 5 loạt", got: (s) => s.salvos >= 5 },
  { id: "salvage", icon: "🔧", name: "Thợ trục vớt", why: "Kéo về từ 300 Sắt trong xác quân", got: (s) => s.salvaged >= 300 },
  { id: "uplink", icon: "📡", name: "Người giữ cầu", why: "Giữ Đài Liên Lạc tổng cộng từ 3 phút", got: (s) => s.uplinkTime >= 180 },
  { id: "blitz", icon: "⚡", name: "Thần tốc", why: "Thắng trong vòng 8 phút", got: (_s, won, secs) => won && secs < 480 },
  { id: "steel", icon: "🛡️", name: "Thép", why: "Thắng mà chỉ mất tối đa 3 quân", got: (s, won) => won && s.unitsLost <= 3 }
];

/** Quân hàm và số điểm kinh nghiệm cộng dồn cần có. */
export const RANKS: readonly { name: string; xp: number }[] = [
  { name: "Binh nhì", xp: 0 },
  { name: "Binh nhất", xp: 100 },
  { name: "Hạ sĩ", xp: 250 },
  { name: "Trung sĩ", xp: 450 },
  { name: "Thượng sĩ", xp: 700 },
  { name: "Thiếu úy", xp: 1000 },
  { name: "Trung úy", xp: 1400 },
  { name: "Thượng úy", xp: 1900 },
  { name: "Đại úy", xp: 2500 },
  { name: "Thiếu tá", xp: 3200 },
  { name: "Trung tá", xp: 4000 },
  { name: "Thượng tá", xp: 5000 },
  { name: "Đại tá", xp: 6200 },
  { name: "Thiếu tướng", xp: 7600 },
  { name: "Trung tướng", xp: 9200 },
  { name: "Thượng tướng", xp: 11000 },
  { name: "Đại tướng", xp: 13000 }
];

/** Điểm mỗi trận: thắng / thua / hòa, mỗi quân địch hạ được, mỗi huy chương. Thua vẫn có điểm để còn muốn chơi tiếp. */
export const XP = { win: 100, loss: 30, draw: 50, perKill: 2, perMedal: 25 };

export interface Career {
  xp: number;
  games: number;
  wins: number;
  losses: number;
  /** Số lần nhận mỗi huy chương (theo `id`). */
  medals: Record<string, number>;
  /** Trận thắng nhanh nhất (giây), -1 = chưa thắng. */
  bestWin: number;
}

export const emptyCareer = (): Career => ({ xp: 0, games: 0, wins: 0, losses: 0, medals: {}, bestWin: -1 });

export interface RankInfo {
  index: number;
  name: string;
  /** Tên cấp sau, null nếu đã là cấp cao nhất. */
  next: string | null;
  /** Tiến độ tới cấp sau, 0..1 (1 nếu đã cao nhất). */
  progress: number;
  /** Còn thiếu bao nhiêu điểm tới cấp sau. */
  toNext: number;
}

export function rankOf(xp: number): RankInfo {
  let i = 0;
  while (i + 1 < RANKS.length && xp >= RANKS[i + 1].xp) i++;
  const cur = RANKS[i];
  const nxt = RANKS[i + 1];
  if (!nxt) return { index: i, name: cur.name, next: null, progress: 1, toNext: 0 };
  return { index: i, name: cur.name, next: nxt.name, progress: (xp - cur.xp) / (nxt.xp - cur.xp), toNext: nxt.xp - xp };
}

export interface MatchResult {
  outcome: "win" | "loss" | "draw";
  secs: number;
  stats: SideStats;
}

export interface Award {
  xp: number;
  medals: typeof MEDALS;
  before: RankInfo;
  after: RankInfo;
  career: Career;
}

/** Cộng một trận vào tiến trình (không sửa `c`, trả về bản mới). */
export function award(c: Career, r: MatchResult): Award {
  const won = r.outcome === "win";
  const medals = MEDALS.filter((m) => m.got(r.stats, won, r.secs));
  const xp = XP[r.outcome] + r.stats.kills * XP.perKill + medals.length * XP.perMedal;
  const next: Career = {
    xp: c.xp + xp,
    games: c.games + 1,
    wins: c.wins + (won ? 1 : 0),
    losses: c.losses + (r.outcome === "loss" ? 1 : 0),
    medals: { ...c.medals },
    bestWin: won && (c.bestWin < 0 || r.secs < c.bestWin) ? r.secs : c.bestWin
  };
  for (const m of medals) next.medals[m.id] = (next.medals[m.id] ?? 0) + 1;
  return { xp, medals, before: rankOf(c.xp), after: rankOf(next.xp), career: next };
}

const KEY = "ironsky.career";

/** Đọc tiến trình; bộ nhớ bị chặn hoặc dữ liệu hỏng thì coi như mới bắt đầu. */
export function loadCareer(): Career {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Career> | null;
    if (!raw || typeof raw.xp !== "number") return emptyCareer();
    return { ...emptyCareer(), ...raw, medals: { ...(raw.medals ?? {}) } };
  } catch {
    return emptyCareer();
  }
}

export function saveCareer(c: Career): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(c));
  } catch {
    /* không lưu được (chế độ ẩn danh, bộ nhớ đầy): chơi tiếp bình thường */
  }
}
