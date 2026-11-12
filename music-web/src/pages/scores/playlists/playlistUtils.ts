/** Màu bìa playlist (góc màu 0-359) suy ra từ tên: cùng một tên luôn ra cùng một màu, không cần lưu thêm cột nào. */
export function coverHue(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) % 360;
  return hash;
}
