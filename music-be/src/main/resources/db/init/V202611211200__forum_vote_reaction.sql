-- Diễn đàn: phiếu bình chọn một chiều thành thích / không thích. Mỗi người vẫn một phiếu cho mỗi chủ đề / bài trả lời,
-- cột reaction cho biết là LIKE hay DISLIKE. Phiếu cũ (và dữ liệu mẫu chèn không có cột này) đều là LIKE.
ALTER TABLE forum_votes
    ADD COLUMN reaction VARCHAR(10) NOT NULL DEFAULT 'LIKE' AFTER post_id;
