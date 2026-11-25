-- OMR-04 (review 24/11): hệ thống chỉ nhận tối đa 20 trang cho một lần số hóa (app.omr.max-pdf-pages, app.omr.max-images),
-- nhưng V9 hứa gói Pro 50 trang/lần và Premium, Ultimate, Team không giới hạn. Đưa mọi gói về tối đa 20 trang/lần để
-- bảng giá không hứa quá trần thật (câu hỏi Q2: chọn sửa seed thay vì nâng trần). Gói đang ít hơn 20 giữ nguyên.
-- Không dùng CAST trong WHERE: MySQL strict mode biến cảnh báo ép kiểu trong UPDATE thành lỗi. JSON null so với số luôn
-- nhỏ hơn nên cần điều kiện riêng.
UPDATE plans
SET limits = JSON_SET(limits, '$.omrMaxPagesPerJob', 20)
WHERE JSON_EXTRACT(limits, '$.omrMaxPagesPerJob') IS NULL
   OR JSON_TYPE(JSON_EXTRACT(limits, '$.omrMaxPagesPerJob')) = 'NULL'
   OR JSON_EXTRACT(limits, '$.omrMaxPagesPerJob') > 20;
