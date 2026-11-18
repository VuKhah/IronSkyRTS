/**
 * Ký hiệu công trình trên bàn tác chiến: mỗi loại một hình riêng để nhìn từ xa vẫn biết đâu là xưởng, đâu là điện, đâu là
 * phòng không. Khung to nhỏ theo cỡ thật của công trình (xưởng to, tháp nhỏ, tường chỉ là chấm). Chỉ là phần vẽ.
 */
import type { BuildingId } from "../../sim/content";

/** Nửa cạnh khung ký hiệu (điểm ảnh màn hình) theo loại công trình. */
export function buildingMarkHalf(kind: BuildingId): number {
  switch (kind) {
    case "hq":
      return 11;
    case "factory":
    case "special-factory":
    case "aircraft-factory":
    case "airfield":
      return 9.5;
    case "wall":
      return 2.6;
    case "power-pylon":
      return 4.5;
    default:
      return 6.5;
  }
}

/** Công trình không có khung, chỉ vẽ một khối đặc (tường) để bàn tác chiến không rối. */
export function isSolidMark(kind: BuildingId): boolean {
  return kind === "wall";
}

/**
 * Vẽ hình bên trong khung, tâm (0, 0), trong ô ±5 (đã được thu phóng theo cỡ khung trước khi gọi).
 * `g.strokeStyle` / `g.fillStyle` đã đặt sẵn màu phe.
 */
export function drawBuildingGlyph(g: CanvasRenderingContext2D, kind: BuildingId): void {
  g.lineWidth = 1.3;
  g.lineJoin = "round";
  g.lineCap = "round";
  g.beginPath();
  switch (kind) {
    case "hq": // sao: đầu não
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const r = i % 2 ? 2.2 : 5;
        if (i) g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        else g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      g.closePath();
      g.fill();
      break;
    case "factory": // mái răng cưa + bầu dục xích: xưởng xe tăng
      sawRoof(g);
      g.stroke();
      g.beginPath();
      g.ellipse(0, 2, 3.6, 1.8, 0, 0, Math.PI * 2);
      g.stroke();
      break;
    case "special-factory": // mái răng cưa + dấu X cánh quạt: xưởng drone, xe chuyên dụng
      sawRoof(g);
      g.stroke();
      g.beginPath();
      g.moveTo(-3, -0.2);
      g.lineTo(3, 4.2);
      g.moveTo(3, -0.2);
      g.lineTo(-3, 4.2);
      g.stroke();
      break;
    case "aircraft-factory": // mái răng cưa + cánh: nhà máy máy bay
      sawRoof(g);
      g.stroke();
      g.beginPath();
      g.moveTo(-4, 3.6);
      g.lineTo(0, 0.4);
      g.lineTo(4, 3.6);
      g.stroke();
      break;
    case "airfield": // đường băng: hai vạch dọc + vạch giữa đứt
      g.moveTo(-2.6, -5);
      g.lineTo(-2.6, 5);
      g.moveTo(2.6, -5);
      g.lineTo(2.6, 5);
      g.stroke();
      g.beginPath();
      for (const y of [-4, -1, 2]) {
        g.moveTo(0, y);
        g.lineTo(0, y + 1.6);
      }
      g.stroke();
      break;
    case "turret": // tròn có nòng: tháp phòng thủ
      g.arc(0, 1, 2.6, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.moveTo(0, 1);
      g.lineTo(0, -4.8);
      g.lineWidth = 1.8;
      g.stroke();
      break;
    case "outpost": // cờ đuôi nheo: tiền đồn
      g.moveTo(-2.6, 4.5);
      g.lineTo(-2.6, -4.5);
      g.stroke();
      g.beginPath();
      g.moveTo(-2.6, -4.5);
      g.lineTo(3.8, -2.4);
      g.lineTo(-2.6, -0.3);
      g.closePath();
      g.fill();
      break;
    case "power-plant": // tia sét: nhà máy điện
      g.moveTo(1.2, -5);
      g.lineTo(-2.8, 0.6);
      g.lineTo(0, 0.6);
      g.lineTo(-1.2, 5);
      g.lineTo(2.8, -0.8);
      g.lineTo(0, -0.8);
      g.closePath();
      g.fill();
      break;
    case "power-pylon": // cột điện: thân dọc, hai xà ngang
      g.moveTo(0, -4.5);
      g.lineTo(0, 4.5);
      g.moveTo(-3.5, -2.5);
      g.lineTo(3.5, -2.5);
      g.moveTo(-2.4, 0.5);
      g.lineTo(2.4, 0.5);
      g.stroke();
      break;
    case "battery": // cục pin có núm, hai vạch nạp
      g.rect(-2.8, -3.4, 5.6, 8);
      g.moveTo(-1.2, -4.6);
      g.lineTo(1.2, -4.6);
      g.stroke();
      g.fillRect(-1.6, 0.8, 3.2, 1.2);
      g.fillRect(-1.6, 2.6, 3.2, 1.2);
      break;
    case "radar": // chảo + sóng: trạm radar
      g.arc(-1.5, 2, 3.2, Math.PI * 0.75, Math.PI * 1.75);
      g.closePath();
      g.fill();
      g.beginPath();
      g.arc(-1.5, 2, 5.4, -Math.PI * 0.5, -Math.PI * 0.05);
      g.stroke();
      g.beginPath();
      g.arc(-1.5, 2, 7.4, -Math.PI * 0.45, -Math.PI * 0.12);
      g.stroke();
      break;
    case "oil-extractor": // giọt dầu
      g.moveTo(0, -5);
      g.quadraticCurveTo(4, 0.5, 3.4, 2.2);
      g.arc(0, 2.2, 3.4, 0, Math.PI);
      g.quadraticCurveTo(-4, 0.5, 0, -5);
      g.fill();
      break;
    case "ammo-depot": // ba viên đạn
      for (const x of [-3, 0, 3]) {
        g.moveTo(x - 1, 4);
        g.lineTo(x - 1, -1.5);
        g.quadraticCurveTo(x, -4.5, x + 1, -1.5);
        g.lineTo(x + 1, 4);
        g.closePath();
      }
      g.fill();
      break;
    case "aa-ciws": // vòm phòng không + ba vạch: bắn nhanh
      aaDome(g);
      g.beginPath();
      for (const x of [-2, 0, 2]) {
        g.moveTo(x, -0.5);
        g.lineTo(x * 1.6, -4.5);
      }
      g.stroke();
      break;
    case "aa-sam": // vòm phòng không + mũi tên: tên lửa tầm xa
      aaDome(g);
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(0, -5);
      g.moveTo(-2.2, -2.8);
      g.lineTo(0, -5);
      g.lineTo(2.2, -2.8);
      g.stroke();
      break;
    case "aa-emp": // vòm phòng không + sóng gấp: xung điện từ
      aaDome(g);
      g.beginPath();
      g.moveTo(-3.6, -2.4);
      g.lineTo(-1.8, -4.4);
      g.lineTo(0, -2.4);
      g.lineTo(1.8, -4.4);
      g.lineTo(3.6, -2.4);
      g.stroke();
      break;
    case "wall":
      break;
  }
}

/** Mái răng cưa chung của các xưởng (nửa trên khung). */
function sawRoof(g: CanvasRenderingContext2D): void {
  g.moveTo(-4.5, -1.5);
  g.lineTo(-4.5, -3);
  g.lineTo(-1.5, -5);
  g.lineTo(-1.5, -3);
  g.lineTo(1.5, -5);
  g.lineTo(1.5, -3);
  g.lineTo(4.5, -5);
  g.lineTo(4.5, -1.5);
}

/** Vòm phòng không chung (nửa dưới khung). */
function aaDome(g: CanvasRenderingContext2D): void {
  g.beginPath();
  g.arc(0, 4.5, 4.2, Math.PI, 0);
  g.closePath();
  g.fill();
}
