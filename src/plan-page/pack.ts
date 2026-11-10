/**
 * Xếp hình chữ nhật vào hộp cho Bản Vẽ Mặt Bằng (không dính trình duyệt, chạy được bằng Node để thử).
 *
 * Mỗi nhà = hình chữ nhật cỡ nền móng (ô) cộng `pad` ô cấm xây ở cạnh phải và cạnh dưới, nên hai nhà sát nhau cách đúng `pad`
 * ô (ô cấm xây dùng chung). Đặt theo "đường chân trời": lần lượt từng nhà, thử hai hướng xoay, vào chỗ có đáy thấp nhất rồi
 * trái nhất. Tìm kiếm: với mỗi bề rộng hộp, nhiều thứ tự khởi đầu (lớn trước có xáo), rồi leo đồi bằng cách đổi chỗ hai nhà /
 * lật hướng một nhà trong thứ tự, giữ thay đổi nào không làm hình bao to ra. Bộ số ngẫu nhiên có seed nên kết quả tất định.
 */
export interface PackItem {
  kind: string;
  /** Cỡ nền móng (ô) khi chưa xoay. */
  fw: number;
  fh: number;
}

export interface Spot {
  kind: string;
  /** 0 = giữ nguyên, 1 = xoay 90° (đổi rộng / sâu). */
  rot: number;
  /** Góc trên-trái nền móng (ô) và cỡ nền móng sau khi xoay (ô). */
  cx: number;
  cz: number;
  w: number;
  h: number;
}

export interface Plan {
  spots: Spot[];
  W: number;
  H: number;
  area: number;
}

/** Bộ số ngẫu nhiên có seed (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Gene {
  i: number;
  flip: boolean;
}

/** Đặt theo đường chân trời trong hộp rộng `W` ô; trả về phương án (hình bao tính theo nền móng, bỏ ô cấm xây ngoài cùng). */
export function skyline(items: readonly PackItem[], genes: readonly Gene[], W: number, pad: number): Plan | null {
  const sky = new Array<number>(W).fill(0);
  const spots: Spot[] = [];
  for (const g of genes) {
    const it = items[g.i];
    let bx = -1;
    let by = 0;
    let bw = 0;
    let bh = 0;
    let br = 0;
    const opts = it.fw === it.fh ? [0] : g.flip ? [1, 0] : [0, 1];
    for (const r of opts) {
      const w = (r ? it.fh : it.fw) + pad;
      const h = (r ? it.fw : it.fh) + pad;
      if (w > W) continue;
      for (let x = 0; x + w <= W; x++) {
        let y = 0;
        for (let k = x; k < x + w; k++) if (sky[k] > y) y = sky[k];
        if (bx < 0 || y + h < by + bh || (y + h === by + bh && (y < by || (y === by && x < bx)))) {
          bx = x;
          by = y;
          bw = w;
          bh = h;
          br = r;
        }
      }
    }
    if (bx < 0) return null;
    for (let k = bx; k < bx + bw; k++) sky[k] = by + bh;
    spots.push({ kind: it.kind, rot: br, cx: bx, cz: by, w: bw - pad, h: bh - pad });
  }
  let W2 = 0;
  let H2 = 0;
  for (const s of spots) {
    W2 = Math.max(W2, s.cx + s.w);
    H2 = Math.max(H2, s.cz + s.h);
  }
  return { spots, W: W2, H: H2, area: W2 * H2 };
}

/** Các phương án tốt nhất tìm được, hình bao từ nhỏ tới lớn (cùng diện tích thì gần vuông trước). */
export function search(items: readonly PackItem[], pad: number, seed = 20261110, starts = 24, climb = 400): Plan[] {
  const rand = rng(seed);
  const total = items.reduce((s, it) => s + (it.fw + pad) * (it.fh + pad), 0);
  const widest = Math.max(...items.map((it) => Math.min(it.fw, it.fh) + pad), ...items.map((it) => Math.max(it.fw, it.fh) + pad));
  const found = new Map<string, Plan>();
  const keep = (p: Plan): void => {
    const key = p.spots.map((s) => `${s.kind}${s.cx},${s.cz},${s.rot}`).join("|");
    if (!found.has(key)) found.set(key, p);
  };
  const lo = Math.max(widest, Math.floor(Math.sqrt(total) * 0.8));
  const hi = Math.ceil(Math.sqrt(total) * 1.4);
  for (let W = lo; W <= hi; W++) {
    for (let s = 0; s < starts; s++) {
      const noise = s === 0 ? 0 : 0.6;
      let genes: Gene[] = items
        .map((it, i) => ({ i, flip: rand() < 0.5, key: -(it.fw + pad) * (it.fh + pad) * (1 + noise * (rand() - 0.5)) }))
        .sort((a, b) => a.key - b.key)
        .map(({ i, flip }) => ({ i, flip }));
      let cur = skyline(items, genes, W, pad);
      if (!cur) continue;
      keep(cur);
      // leo đồi: đổi chỗ hai nhà hoặc lật hướng một nhà; nhận nếu hình bao không to hơn
      for (let t = 0; t < climb; t++) {
        const next = genes.slice();
        if (rand() < 0.7) {
          const a = Math.floor(rand() * next.length);
          const b = Math.floor(rand() * next.length);
          [next[a], next[b]] = [next[b], next[a]];
        } else {
          const a = Math.floor(rand() * next.length);
          next[a] = { i: next[a].i, flip: !next[a].flip };
        }
        const p = skyline(items, next, W, pad);
        if (p && p.area <= cur.area) {
          genes = next;
          cur = p;
          keep(p);
        }
      }
    }
  }
  return [...found.values()].sort((a, b) => a.area - b.area || Math.abs(a.W - a.H) - Math.abs(b.W - b.H));
}
