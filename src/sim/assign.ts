/**
 * Bài toán phân công (thuật toán Hungary, Kuhn–Munkres): n việc cho n người, tổng chi phí nhỏ nhất. O(n³), n ≤ 40 là tức thì.
 *
 * Dùng để chia ô đội hình: chi phí = quãng đường thẳng từ xe tới ô. Tổng quãng đường nhỏ nhất thì KHÔNG có hai đường đi nào
 * cắt nhau (nếu hai đường cắt nhau, đổi đích cho nhau luôn ngắn hơn: bất đẳng thức tam giác), nên xe không chạy chéo qua nhau.
 * Tất định: chỉ + − so sánh, duyệt theo thứ tự chỉ số cố định.
 */
export function assignMin(cost: readonly (readonly number[])[]): number[] {
  const n = cost.length;
  const u = new Float64Array(n + 1);
  const v = new Float64Array(n + 1);
  const p = new Int32Array(n + 1); // p[j] = hàng (1..n) đang giữ cột j
  const way = new Int32Array(n + 1);
  const minv = new Float64Array(n + 1);
  const used = new Uint8Array(n + 1);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    minv.fill(Infinity);
    used.fill(0);
    do {
      used[j0] = 1;
      const i0 = p[j0];
      let delta = Infinity;
      let j1 = 0;
      for (let j = 1; j <= n; j++) {
        if (used[j]) continue;
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) {
          minv[j] = cur;
          way[j] = j0;
        }
        if (minv[j] < delta) {
          delta = minv[j];
          j1 = j;
        }
      }
      for (let j = 0; j <= n; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else minv[j] -= delta;
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0 !== 0);
  }
  // kết quả: hàng i nhận cột out[i]
  const out = new Array<number>(n);
  for (let j = 1; j <= n; j++) out[p[j] - 1] = j - 1;
  return out;
}
