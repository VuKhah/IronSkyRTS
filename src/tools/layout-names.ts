/** Tên ô lớn (A1…) theo thước căn giữa 30 m của Bản Đồ Chuẩn, dùng cho công cụ đọc bản vẽ. */
export function cellLabelOf(w: number, h: number, x: number, z: number): string {
  const edges = (half: number): number[] => {
    const out = [-half, half];
    for (let v = 15; v < half; v += 30) out.push(v, -v);
    return out.sort((a, b) => a - b);
  };
  const idx = (e: number[], v: number): number => {
    let i = 0;
    while (i < e.length - 2 && v >= e[i + 1]) i++;
    return i;
  };
  return `${String.fromCharCode(65 + idx(edges(w / 2), x))}${idx(edges(h / 2), z) + 1}`;
}
