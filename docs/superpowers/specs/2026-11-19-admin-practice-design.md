# Quản lý luyện tập trong khu admin (thiết kế ngắn)

## Mục đích
Admin xem được mọi buổi luyện của mọi thành viên, thấy thống kê toàn hệ thống, xử lý dữ liệu bất thường. Hiện admin chỉ thấy tổng số buổi (dashboard) và số buổi / số phút của từng thành viên (chi tiết thành viên).

## Mục tiêu
- Trang `/admin/practice`: danh sách buổi luyện, phân trang, lọc theo thành viên, bản nhạc, chế độ, trạng thái, khoảng ngày, cờ "bất thường".
- Thẻ tổng quan và biểu đồ theo ngày cho toàn hệ thống: số buổi, tổng phút, độ chính xác trung bình, tỷ lệ hoàn thành.
- Xóa buổi luyện (xóa hẳn).
- Đóng thủ công buổi đang chạy bị treo (chuyển sang ABANDONED), không chờ job 30 phút.

## Không làm
- Không thêm bảng hay cột nào (không lưu thống kê, không lưu cờ bất thường, không thêm cột xóa mềm). Mọi số liệu tính lúc đọc từ `practice_sessions`.
- Không sửa nội dung buổi luyện (điểm, số nốt).
- Không ghi vào trang "Nhật ký": nhật ký tính từ bảng nguồn, buổi bị xóa không còn dòng nào để dựng ra. Việc xóa buổi luyện vì vậy không có dấu vết trong nhật ký.

## Ràng buộc
- Schema chỉ nằm ở V1, không thêm migration.
- Quyền mới: `PRACTICE_VIEW` (xem, thống kê) và `PRACTICE_MANAGE` (xóa, đóng phiên treo; cần kèm quyền xem). Nhóm menu "users". Thêm vào `AdminPermission`, `RoleServiceImpl` (nếu có danh sách mặc định) và locale `admin.json` vi/en như các quyền khác.
- "Bất thường" tính bằng code, không lưu. Quy tắc ban đầu: thời lượng dưới 10 giây hoặc trên 6 giờ, hoặc có nốt mà độ chính xác bằng 0, hoặc đang chạy quá 6 giờ (treo).
- Lỗi mới dùng enum `LibraryErrorCode` (nhóm luyện tập 30xx).
- UI theo khung các trang admin hiện có và skill ui-ux-pro-max; chuỗi có đủ vi/en.

## Các cách đã cân nhắc
1. Chỉ xem: đơn giản nhưng không xử lý được dữ liệu xấu.
2. Xem + xóa buổi bất thường: đủ dùng, job tự dọn phiên treo.
3. Xem + xóa + đóng phiên treo thủ công: **được chọn**, vì cần dọn ngay mà không chờ job.

## Để người làm quyết định
Tên cột và thứ tự trong bảng, ngưỡng "bất thường" (chỉnh được hằng số trong code), cách vẽ biểu đồ (theo trang `AdminDashboard` hiện có), cách phân trang (theo các trang danh sách admin khác).
