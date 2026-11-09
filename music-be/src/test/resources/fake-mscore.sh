#!/bin/bash
# MuseScore giả dùng cho test. Hành vi chọn theo nội dung file đầu vào (đối số cuối cùng):
#   ok    -> ghi file ra có nội dung
#   slow  -> ngủ 1 giây rồi ghi file ra
#   hang  -> ngủ 5 giây (để thử timeout)
#   fail  -> thoát mã 1
#   empty -> tạo file ra rỗng
#   svg   -> ghi tên-1.svg và tên-2.svg (MuseScore tách SVG nhiều trang)
out=""
args=("$@")
for ((i = 0; i < ${#args[@]}; i++)); do
  if [ "${args[$i]}" = "-o" ]; then out="${args[$((i + 1))]}"; fi
done
in="${args[$((${#args[@]} - 1))]}"
mode="$(cat "$in")"
case "$mode" in
  ok) echo "data" > "$out" ;;
  slow) sleep 1; echo "data" > "$out" ;;
  hang) sleep 5; echo "data" > "$out" ;;
  fail) echo "boom" >&2; exit 1 ;;
  empty) : > "$out" ;;
  svg) base="${out%.svg}"; echo "<svg/>" > "${base}-1.svg"; echo "<svg/>" > "${base}-2.svg" ;;
esac
