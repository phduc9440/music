-- V6: bản nhạc mẫu (~40 bản) cho mọi trạng thái: công khai, chờ duyệt, bị từ chối, riêng tư, đang xử lý OMR, lỗi OMR,
-- kho score mẫu (gồm bản sao từ bản của người dùng), thùng rác. Nhiều tác giả khớp bảng nhạc sĩ (V5).
-- Seed chưa kèm file (MusicXML, ảnh trang...): danh sách, Khám phá, thống kê chạy bình thường; muốn mở Editor/Player
-- thì tải một bản lên qua web. current_version = 0 nghĩa là chưa có MusicXML.
INSERT INTO scores
    (id, member_id, title, composer, difficulty, study_notes, processing_status, visibility, is_official, reject_reason,
     arranger_name, tempo_bpm, measure_count, key_signature, time_signature, staff_count, page_count, source_type,
     current_version, view_count, allow_download, created_at, updated_at, deleted_at, delete_reason)
SELECT UUID(), m.id, t.title, t.composer, t.difficulty, t.study_notes, t.processing_status, t.visibility, t.is_official,
       t.reject_reason, t.arranger_name, t.tempo_bpm, t.measure_count, t.key_signature, t.time_signature, t.staff_count,
       t.page_count, t.source_type, 0, t.view_count, t.allow_download, t.created_at, t.updated_at, t.deleted_at,
       t.delete_reason
FROM (
    SELECT 'lan.nguyen@music.com' AS owner_email, 'Für Elise' AS title, 'Ludwig van Beethoven' AS composer, 'MEDIUM' AS difficulty, 'Chú ý đoạn B ở ô 23-38: giữ chặt tay trái, đừng vội.' AS study_notes, 'COMPLETED' AS processing_status, 'PUBLIC' AS visibility, 0 AS is_official, NULL AS reject_reason, NULL AS arranger_name, 125 AS tempo_bpm, 124 AS measure_count, 'Am' AS key_signature, '3/8' AS time_signature, 2 AS staff_count, 3 AS page_count, 'OMR' AS source_type, 1840 AS view_count, 1 AS allow_download, NOW(6) - INTERVAL 45 DAY - INTERVAL 7 HOUR - INTERVAL 15 MINUTE AS created_at, NOW(6) - INTERVAL 45 DAY - INTERVAL 7 HOUR - INTERVAL 5 MINUTE AS updated_at, NULL AS deleted_at, NULL AS delete_reason
    UNION ALL SELECT 'minh.tran@music.com', 'Moonlight Sonata (Mvt. 1)', 'Beethoven', 'HARD', NULL, 'COMPLETED', 'PUBLIC', 0, NULL, NULL, 54, 69, 'C#m', '4/4', 2, 4, 'OMR', 1260, 0, NOW(6) - INTERVAL 41 DAY - INTERVAL 10 HOUR - INTERVAL 15 MINUTE, NOW(6) - INTERVAL 40 DAY - INTERVAL 10 HOUR - INTERVAL 5 MINUTE, NULL, NULL
    UNION ALL SELECT 'huong.le@music.com', 'Clair de Lune', 'Claude Debussy', 'HARD', NULL, 'COMPLETED', 'PUBLIC', 0, NULL, NULL, 66, 72, 'Db', '9/8', 2, NULL, 'IMPORT', 980, 0, NOW(6) - INTERVAL 38 DAY - INTERVAL 13 HOUR - INTERVAL 15 MINUTE, NOW(6) - INTERVAL 36 DAY - INTERVAL 13 HOUR - INTERVAL 5 MINUTE, NULL, NULL
    UNION ALL SELECT 'an.vo@music.com', 'Gymnopédie No. 1', 'Erik Satie', 'EASY', 'Rất hợp để tập chậm và nghe âm sắc.', 'COMPLETED', 'PUBLIC', 0, NULL, NULL, 72, 40, 'D', '3/4', 2, NULL, 'IMPORT', 1530, 0, NOW(6) - INTERVAL 35 DAY - INTERVAL 16 HOUR - INTERVAL 15 MINUTE, NOW(6) - INTERVAL 32 DAY - INTERVAL 16 HOUR - INTERVAL 5 MINUTE, NULL, NULL
    UNION ALL SELECT 'lan.nguyen@music.com', 'Nocturne Op. 9 No. 2', 'Frédéric Chopin', 'HARD', NULL, 'COMPLETED', 'PUBLIC', 0, NULL, NULL, 60, 34, 'Eb', '12/8', 2, 2, 'OMR', 1100, 0, NOW(6) - INTERVAL 33 DAY - INTERVAL 19 HOUR - INTERVAL 15 MINUTE, NOW(6) - INTERVAL 29 DAY - INTERVAL 19 HOUR - INTERVAL 5 MINUTE, NULL, NULL
    UNION ALL SELECT 'duy.pham@music.com', 'Prelude in C major (BWV 846)', 'J.S. Bach', 'MEDIUM', NULL, 'COMPLETED', 'PUBLIC', 0, NULL, NULL, 70, 35, 'C', '4/4', 2, NULL, 'IMPORT', 870, 0, NOW(6) - INTERVAL 31 DAY - INTERVAL 22 HOUR - INTERVAL 15 MINUTE, NOW(6) - INTERVAL 31 DAY - INTERVAL 22 HOUR - INTERVAL 5 MINUTE, NULL, NULL
    UNION ALL SELECT 'bao.hoang@music.com', 'Minuet in G major', 'J. S. Bach', 'EASY', NULL, 'COMPLETED', 'PUBLIC', 0, NULL, NULL, 110, 32, 'G', '3/4', 2, 1, 'OMR', 640, 0, NOW(6) - INTERVAL 29 DAY - INTERVAL 1 HOUR - INTERVAL 15 MINUTE, NOW(6) - INTERVAL 28 DAY - INTERVAL 1 HOUR - INTERVAL 5 MINUTE, NULL, NULL
    UNION ALL SELECT 'trang.dang@music.com', 'Eine kleine Nachtmusik (K. 525)', 'W.A. Mozart', 'MEDIUM', NULL, 'COMPLETED', 'PUBLIC', 0, NULL, NULL, 132, 120, 'G', '4/4', 2, NULL, 'IMPORT', 720, 0, NOW(6) - INTERVAL 27 DAY - INTERVAL 4 HOUR - INTERVAL 15 MINUTE, NOW(6) - INTERVAL 25 DAY - INTERVAL 4 HOUR - INTERVAL 5 MINUTE, NULL, NULL
    UNION ALL SELECT 'minh.tran@music.com', 'Turkish March', 'Mozart', 'HARD', NULL, 'COMPLETED', 'PUBLIC', 0, NULL, NULL, 120, 90, 'Am', '2/4', 2, 3, 'OMR', 905, 0, NOW(6) - INTERVAL 25 DAY - INTERVAL 7 HOUR - INTERVAL 15 MINUTE, NOW(6) - INTERVAL 22 DAY - INTERVAL 7 HOUR - INTERVAL 5 MINUTE, NULL, NULL
    UNION ALL SELECT 'user@music.com', 'Ode to Joy', 'Ludwig van Beethoven', 'EASY', 'Bản đầu tiên mình số hóa. Tay phải giai điệu, tay trái hợp âm đơn giản.', 'COMPLETED', 'PUBLIC', 0, NULL, NULL, 108, 24, 'D', '4/4', 2, 1, 'OMR', 2100, 1, NOW(6) - INTERVAL 24 DAY - INTERVAL 10 HOUR - INTERVAL 15 MINUTE, NOW(6) - INTERVAL 20 DAY - INTERVAL 10 HOUR - INTERVAL 5 MINUTE, NULL, NULL
    UNION ALL SELECT 'huong.le@music.com', 'Canon in D', 'Johann Pachelbel', 'MEDIUM', NULL, 'COMPLETED', 'PUBLIC', 0, NULL, NULL, 50, 56, 'D', '4/4', 2, NULL, 'IMPORT', 1730, 0, NOW(6) - INTERVAL 23 DAY - INTERVAL 13 HOUR - INTERVAL 15 MINUTE, NOW(6) - INTERVAL 23 DAY - INTERVAL 13 HOUR - INTERVAL 5 MINUTE, NULL, NULL
    UNION ALL SELECT 'huong.le@music.com', 'Swan Lake - Theme', 'Pyotr Ilyich Tchaikovsky', 'MEDIUM', NULL, 'COMPLETED', 'PUBLIC', 0, NULL, NULL, 76, 48, 'Bm', '4/4', 2, 2, 'OMR', 540, 0, NOW(6) - INTERVAL 22 DAY - INTERVAL 16 HOUR - INTERVAL 15 MINUTE, NOW(6) - INTERVAL 21 DAY - INTERVAL 16 HOUR - INTERVAL 5 MINUTE, NULL, NULL
    UNION ALL SELECT 'duy.pham@music.com', 'Tình ca', 'Hoàng Việt', 'EASY', NULL, 'COMPLETED', 'PUBLIC', 0, NULL, NULL, 84, 40, 'F', '4/4', 1, 1, 'OMR', 610, 0, NOW(6) - INTERVAL 21 DAY - INTERVAL 19 HOUR - INTERVAL 15 MINUTE, NOW(6) - INTERVAL 19 DAY - INTERVAL 19 HOUR - INTERVAL 5 MINUTE, NULL, NULL
    UNION ALL SELECT 'an.vo@music.com', 'Diễm xưa', 'Trịnh Công Sơn', 'EASY', NULL, 'COMPLETED', 'PUBLIC', 0, NULL, NULL, 76, 44, 'Am', '4/4', 1, NULL, 'IMPORT', 1390, 0, NOW(6) - INTERVAL 20 DAY - INTERVAL 22 HOUR - INTERVAL 15 MINUTE, NOW(6) - INTERVAL 17 DAY - INTERVAL 22 HOUR - INTERVAL 5 MINUTE, NULL, NULL
    UNION ALL SELECT 'bao.hoang@music.com', 'Tiến quân ca', 'Văn Cao', 'EASY', NULL, 'COMPLETED', 'PUBLIC', 0, NULL, NULL, 100, 24, 'C', '2/4', 2, 1, 'OMR', 1580, 0, NOW(6) - INTERVAL 19 DAY - INTERVAL 1 HOUR - INTERVAL 15 MINUTE, NOW(6) - INTERVAL 15 DAY - INTERVAL 1 HOUR - INTERVAL 5 MINUTE, NULL, NULL
    UNION ALL SELECT 'huong.le@music.com', 'Thiên Thai', 'Văn Cao', 'MEDIUM', NULL, 'COMPLETED', 'PUBLIC', 0, NULL, NULL, 66, 64, 'Dm', '4/4', 1, NULL, 'IMPORT', 470, 0, NOW(6) - INTERVAL 18 DAY - INTERVAL 4 HOUR - INTERVAL 15 MINUTE, NOW(6) - INTERVAL 18 DAY - INTERVAL 4 HOUR - INTERVAL 5 MINUTE, NULL, NULL
    UNION ALL SELECT 'trang.dang@music.com', 'Nghìn trùng xa cách', 'Phạm Duy', 'MEDIUM', NULL, 'COMPLETED', 'PUBLIC', 0, NULL, NULL, 70, 52, 'Gm', '4/4', 1, 2, 'OMR', 520, 0, NOW(6) - INTERVAL 17 DAY - INTERVAL 7 HOUR - INTERVAL 15 MINUTE, NOW(6) - INTERVAL 16 DAY - INTERVAL 7 HOUR - INTERVAL 5 MINUTE, NULL, NULL
    UNION ALL SELECT 'minh.tran@music.com', 'Spring (Four Seasons)', 'Antonio Vivaldi', 'HARD', NULL, 'COMPLETED', 'PUBLIC', 0, NULL, NULL, 140, 110, 'E', '4/4', 3, NULL, 'IMPORT', 830, 0, NOW(6) - INTERVAL 16 DAY - INTERVAL 10 HOUR - INTERVAL 15 MINUTE, NOW(6) - INTERVAL 14 DAY - INTERVAL 10 HOUR - INTERVAL 5 MINUTE, NULL, NULL
    UNION ALL SELECT 'trang.dang@music.com', 'Hallelujah (Messiah)', 'Handel', 'HARD', NULL, 'COMPLETED', 'PUBLIC', 0, NULL, NULL, 136, 98, 'D', '4/4', 4, NULL, 'IMPORT', 760, 0, NOW(6) - INTERVAL 14 DAY - INTERVAL 13 HOUR - INTERVAL 15 MINUTE, NOW(6) - INTERVAL 11 DAY - INTERVAL 13 HOUR - INTERVAL 5 MINUTE, NULL, NULL
    UNION ALL SELECT 'lan.nguyen@music.com', 'Ave Maria', 'Franz Schubert', 'MEDIUM', NULL, 'COMPLETED', 'PUBLIC', 0, NULL, NULL, 56, 60, 'Bb', '4/4', 2, 2, 'OMR', 680, 0, NOW(6) - INTERVAL 12 DAY - INTERVAL 16 HOUR - INTERVAL 15 MINUTE, NOW(6) - INTERVAL 8 DAY - INTERVAL 16 HOUR - INTERVAL 5 MINUTE, NULL, NULL
    UNION ALL SELECT 'mai.ngo@music.com', 'Hà Nội mùa vắng những cơn mưa', 'Trịnh Công Sơn', 'EASY', NULL, 'COMPLETED', 'PUBLIC', 0, NULL, NULL, 82, 48, 'Dm', '4/4', 1, NULL, 'IMPORT', 350, 0, NOW(6) - INTERVAL 8 DAY - INTERVAL 19 HOUR - INTERVAL 15 MINUTE, NOW(6) - INTERVAL 8 DAY - INTERVAL 19 HOUR - INTERVAL 5 MINUTE, NULL, NULL
    UNION ALL SELECT 'nam.do@music.com', 'Mùa xuân đầu tiên', 'Văn Cao', 'EASY', NULL, 'COMPLETED', 'PUBLIC', 0, NULL, NULL, 90, 36, 'C', '4/4', 2, NULL, 'IMPORT', 120, 0, NOW(6) - INTERVAL 3 DAY - INTERVAL 22 HOUR - INTERVAL 15 MINUTE, NOW(6) - INTERVAL 2 DAY - INTERVAL 22 HOUR - INTERVAL 5 MINUTE, NULL, NULL
    UNION ALL SELECT 'duy.pham@music.com', 'Như có Bác trong ngày vui đại thắng', 'Phạm Tuyên', 'EASY', NULL, 'COMPLETED', 'PENDING', 0, NULL, NULL, 120, 32, 'C', '2/4', 2, 2, 'OMR', 0, 0, NOW(6) - INTERVAL 2 DAY - INTERVAL 1 HOUR - INTERVAL 15 MINUTE, NOW(6) - INTERVAL 0 DAY - INTERVAL 1 HOUR - INTERVAL 5 MINUTE, NULL, NULL
    UNION ALL SELECT 'an.vo@music.com', 'Hungarian Rhapsody No. 2', 'Franz Liszt', 'EXPERT', NULL, 'COMPLETED', 'PENDING', 0, NULL, NULL, 96, 200, 'C#m', '2/4', 2, NULL, 'IMPORT', 0, 0, NOW(6) - INTERVAL 1 DAY - INTERVAL 4 HOUR - INTERVAL 15 MINUTE, NOW(6) - INTERVAL 0 DAY - INTERVAL 4 HOUR - INTERVAL 5 MINUTE, NULL, NULL
    UNION ALL SELECT 'bao.hoang@music.com', 'Sao Mai (hợp xướng)', NULL, 'MEDIUM', NULL, 'COMPLETED', 'PENDING', 0, NULL, NULL, 80, 40, 'G', '4/4', 4, NULL, 'IMPORT', 0, 0, NOW(6) - INTERVAL 1 DAY - INTERVAL 7 HOUR - INTERVAL 15 MINUTE, NOW(6) - INTERVAL 0 DAY - INTERVAL 7 HOUR - INTERVAL 5 MINUTE, NULL, NULL
    UNION ALL SELECT 'khoa.bui@music.com', 'Bản phối lại nhạc phim (chưa xin phép)', NULL, 'MEDIUM', NULL, 'COMPLETED', 'PRIVATE', 0, 'Bản có nội dung từ tác phẩm còn bản quyền, chưa thể công khai.', NULL, 100, 64, 'F', '4/4', 2, NULL, 'IMPORT', 0, 0, NOW(6) - INTERVAL 15 DAY - INTERVAL 10 HOUR - INTERVAL 15 MINUTE, NOW(6) - INTERVAL 15 DAY - INTERVAL 10 HOUR - INTERVAL 5 MINUTE, NULL, NULL
    UNION ALL SELECT 'user@music.com', 'Bài tập gam Đô trưởng', NULL, 'EASY', 'Tập mỗi sáng 10 phút, tăng dần tempo 80 -> 120.', 'COMPLETED', 'PRIVATE', 0, NULL, NULL, 80, 16, 'C', '4/4', 2, NULL, 'IMPORT', 0, 0, NOW(6) - INTERVAL 40 DAY - INTERVAL 13 HOUR - INTERVAL 15 MINUTE, NOW(6) - INTERVAL 39 DAY - INTERVAL 13 HOUR - INTERVAL 5 MINUTE, NULL, NULL
    UNION ALL SELECT 'user@music.com', 'Happy Birthday (bản phối đơn giản)', NULL, 'EASY', NULL, 'COMPLETED', 'PRIVATE', 0, NULL, NULL, 100, 16, 'F', '3/4', 2, 1, 'OMR', 0, 0, NOW(6) - INTERVAL 30 DAY - INTERVAL 16 HOUR - INTERVAL 15 MINUTE, NOW(6) - INTERVAL 28 DAY - INTERVAL 16 HOUR - INTERVAL 5 MINUTE, NULL, NULL
    UNION ALL SELECT 'user@music.com', 'Jingle Bells (nháp)', NULL, 'EASY', NULL, 'PROCESSING', 'PRIVATE', 0, NULL, NULL, NULL, NULL, NULL, NULL, 2, 2, 'OMR', 0, 0, NOW(6) - INTERVAL 0 DAY - INTERVAL 19 HOUR - INTERVAL 15 MINUTE, NOW(6) - INTERVAL 0 DAY - INTERVAL 19 HOUR - INTERVAL 5 MINUTE, NULL, NULL
    UNION ALL SELECT 'lan.nguyen@music.com', 'Giáo án piano cơ bản - Bài 1', NULL, 'EASY', 'Dành cho học viên mới: bàn tay, thế ngón, đọc nốt Đô trung.', 'COMPLETED', 'PRIVATE', 0, NULL, NULL, 90, 20, 'C', '4/4', 2, NULL, 'IMPORT', 0, 0, NOW(6) - INTERVAL 50 DAY - INTERVAL 22 HOUR - INTERVAL 15 MINUTE, NOW(6) - INTERVAL 46 DAY - INTERVAL 22 HOUR - INTERVAL 5 MINUTE, NULL, NULL
    UNION ALL SELECT 'lan.nguyen@music.com', 'Czerny Op. 599 No. 1', 'Carl Czerny', 'MEDIUM', NULL, 'COMPLETED', 'PRIVATE', 0, NULL, NULL, 100, 30, 'C', '4/4', 2, 1, 'OMR', 0, 0, NOW(6) - INTERVAL 36 DAY - INTERVAL 1 HOUR - INTERVAL 15 MINUTE, NOW(6) - INTERVAL 36 DAY - INTERVAL 1 HOUR - INTERVAL 5 MINUTE, NULL, NULL
    UNION ALL SELECT 'minh.tran@music.com', 'Jazz Standard - Autumn Leaves (lead sheet)', 'Joseph Kosma', 'MEDIUM', NULL, 'COMPLETED', 'PRIVATE', 0, NULL, NULL, 120, 32, 'Gm', '4/4', 1, NULL, 'IMPORT', 0, 0, NOW(6) - INTERVAL 28 DAY - INTERVAL 4 HOUR - INTERVAL 15 MINUTE, NOW(6) - INTERVAL 27 DAY - INTERVAL 4 HOUR - INTERVAL 5 MINUTE, NULL, NULL
    UNION ALL SELECT 'duy.pham@music.com', 'Ảnh chụp mờ - thử lần 1', NULL, 'EASY', NULL, 'FAILED', 'PRIVATE', 0, NULL, NULL, NULL, NULL, NULL, NULL, 2, 1, 'OMR', 0, 0, NOW(6) - INTERVAL 6 DAY - INTERVAL 7 HOUR - INTERVAL 15 MINUTE, NOW(6) - INTERVAL 4 DAY - INTERVAL 7 HOUR - INTERVAL 5 MINUTE, NULL, NULL
    UNION ALL SELECT 'an.vo@music.com', 'Bản scan sách tập đàn', NULL, 'EASY', NULL, 'PENDING', 'PRIVATE', 0, NULL, NULL, NULL, NULL, NULL, NULL, 2, 8, 'OMR', 0, 0, NOW(6) - INTERVAL 0 DAY - INTERVAL 10 HOUR - INTERVAL 15 MINUTE, NOW(6) - INTERVAL 0 DAY - INTERVAL 10 HOUR - INTERVAL 5 MINUTE, NULL, NULL
    UNION ALL SELECT 'huong.le@music.com', 'Bài hát đám cưới (giọng + piano)', NULL, 'MEDIUM', NULL, 'COMPLETED', 'PRIVATE', 0, NULL, NULL, 78, 56, 'Eb', '4/4', 2, NULL, 'IMPORT', 0, 0, NOW(6) - INTERVAL 10 DAY - INTERVAL 13 HOUR - INTERVAL 15 MINUTE, NOW(6) - INTERVAL 6 DAY - INTERVAL 13 HOUR - INTERVAL 5 MINUTE, NULL, NULL
    UNION ALL SELECT 'admin2@music.com', 'Twinkle Twinkle Little Star', 'W.A. Mozart', 'EASY', NULL, 'COMPLETED', 'PUBLIC', 1, NULL, NULL, 100, 24, 'C', '4/4', 2, NULL, 'IMPORT', 2650, 1, NOW(6) - INTERVAL 60 DAY - INTERVAL 16 HOUR - INTERVAL 15 MINUTE, NOW(6) - INTERVAL 60 DAY - INTERVAL 16 HOUR - INTERVAL 5 MINUTE, NULL, NULL
    UNION ALL SELECT 'admin2@music.com', 'Happy Birthday to You', NULL, 'EASY', NULL, 'COMPLETED', 'PUBLIC', 1, NULL, NULL, 110, 16, 'G', '3/4', 2, NULL, 'IMPORT', 2210, 0, NOW(6) - INTERVAL 58 DAY - INTERVAL 19 HOUR - INTERVAL 15 MINUTE, NOW(6) - INTERVAL 57 DAY - INTERVAL 19 HOUR - INTERVAL 5 MINUTE, NULL, NULL
    UNION ALL SELECT 'admin2@music.com', 'Ode to Joy (bản giản lược)', 'Ludwig van Beethoven', 'EASY', NULL, 'COMPLETED', 'PUBLIC', 1, NULL, 'Demo User', 100, 24, 'D', '4/4', 2, NULL, 'IMPORT', 910, 0, NOW(6) - INTERVAL 20 DAY - INTERVAL 22 HOUR - INTERVAL 15 MINUTE, NOW(6) - INTERVAL 18 DAY - INTERVAL 22 HOUR - INTERVAL 5 MINUTE, NULL, NULL
    UNION ALL SELECT 'admin2@music.com', 'Für Elise (giản lược)', 'Beethoven', 'MEDIUM', NULL, 'COMPLETED', 'PUBLIC', 1, NULL, 'Nguyễn Thị Lan', 110, 60, 'Am', '3/8', 2, NULL, 'IMPORT', 640, 0, NOW(6) - INTERVAL 14 DAY - INTERVAL 1 HOUR - INTERVAL 15 MINUTE, NOW(6) - INTERVAL 11 DAY - INTERVAL 1 HOUR - INTERVAL 5 MINUTE, NULL, NULL
    UNION ALL SELECT 'user@music.com', 'Bản nháp thử OMR', NULL, 'EASY', NULL, 'COMPLETED', 'PRIVATE', 0, NULL, NULL, 90, 8, 'C', '4/4', 2, 1, 'OMR', 0, 0, NOW(6) - INTERVAL 12 DAY - INTERVAL 4 HOUR - INTERVAL 15 MINUTE, NOW(6) - INTERVAL 8 DAY - INTERVAL 4 HOUR - INTERVAL 5 MINUTE, NOW(6) - INTERVAL 3 DAY - INTERVAL 2 HOUR - INTERVAL 0 MINUTE, NULL
    UNION ALL SELECT 'minh.tran@music.com', 'Bản chép lại có bản quyền', NULL, 'MEDIUM', NULL, 'COMPLETED', 'PRIVATE', 0, NULL, NULL, 100, 40, 'C', '4/4', 2, NULL, 'IMPORT', 0, 0, NOW(6) - INTERVAL 9 DAY - INTERVAL 7 HOUR - INTERVAL 15 MINUTE, NOW(6) - INTERVAL 9 DAY - INTERVAL 7 HOUR - INTERVAL 5 MINUTE, NOW(6) - INTERVAL 5 DAY - INTERVAL 2 HOUR - INTERVAL 0 MINUTE, 'Vi phạm bản quyền (kiểm duyệt)'
) t
JOIN members m ON m.email = t.owner_email;

-- Người xóa bản trong thùng rác (chủ bản hoặc admin kiểm duyệt)
UPDATE scores s JOIN members m ON m.email = 'user@music.com' SET s.deleted_by = m.id WHERE s.title = 'Bản nháp thử OMR';
UPDATE scores s JOIN members m ON m.email = 'admin2@music.com' SET s.deleted_by = m.id WHERE s.title = 'Bản chép lại có bản quyền';

-- Bản sao trong kho mẫu trỏ về bản gốc của người dùng
UPDATE scores c JOIN scores o ON o.title = 'Ode to Joy' SET c.original_score_id = o.id WHERE c.title = 'Ode to Joy (bản giản lược)';
UPDATE scores c JOIN scores o ON o.title = 'Für Elise' SET c.original_score_id = o.id WHERE c.title = 'Für Elise (giản lược)';

-- Gắn bản nhạc với nhạc sĩ theo chữ tác giả khớp tên hoặc tên khác (backend cũng tự làm việc này mỗi lần lưu bản nhạc)
UPDATE scores s
    JOIN composers c ON LOWER(s.composer) = LOWER(c.name)
        OR FIND_IN_SET(LOWER(s.composer), REPLACE(LOWER(COALESCE(c.aliases, '')), ', ', ',')) > 0
SET s.composer_id = c.id
WHERE s.composer IS NOT NULL;

-- Thể loại của từng bản nhạc
INSERT INTO score_tags (id, score_id, tag_id)
SELECT UUID(), s.id, g.id
FROM (
    SELECT 'Für Elise' AS title, 'co-dien' AS slug
    UNION ALL SELECT 'Moonlight Sonata (Mvt. 1)', 'co-dien'
    UNION ALL SELECT 'Clair de Lune', 'co-dien'
    UNION ALL SELECT 'Gymnopédie No. 1', 'co-dien'
    UNION ALL SELECT 'Nocturne Op. 9 No. 2', 'co-dien'
    UNION ALL SELECT 'Prelude in C major (BWV 846)', 'co-dien'
    UNION ALL SELECT 'Minuet in G major', 'co-dien'
    UNION ALL SELECT 'Eine kleine Nachtmusik (K. 525)', 'co-dien'
    UNION ALL SELECT 'Turkish March', 'co-dien'
    UNION ALL SELECT 'Ode to Joy', 'co-dien'
    UNION ALL SELECT 'Canon in D', 'co-dien'
    UNION ALL SELECT 'Canon in D', 'pop'
    UNION ALL SELECT 'Swan Lake - Theme', 'co-dien'
    UNION ALL SELECT 'Swan Lake - Theme', 'nhac-phim'
    UNION ALL SELECT 'Tình ca', 'nhac-viet'
    UNION ALL SELECT 'Diễm xưa', 'nhac-viet'
    UNION ALL SELECT 'Diễm xưa', 'ballad'
    UNION ALL SELECT 'Tiến quân ca', 'nhac-viet'
    UNION ALL SELECT 'Thiên Thai', 'nhac-viet'
    UNION ALL SELECT 'Thiên Thai', 'ballad'
    UNION ALL SELECT 'Nghìn trùng xa cách', 'nhac-viet'
    UNION ALL SELECT 'Nghìn trùng xa cách', 'ballad'
    UNION ALL SELECT 'Spring (Four Seasons)', 'co-dien'
    UNION ALL SELECT 'Hallelujah (Messiah)', 'co-dien'
    UNION ALL SELECT 'Ave Maria', 'co-dien'
    UNION ALL SELECT 'Ave Maria', 'ballad'
    UNION ALL SELECT 'Hà Nội mùa vắng những cơn mưa', 'nhac-viet'
    UNION ALL SELECT 'Hà Nội mùa vắng những cơn mưa', 'ballad'
    UNION ALL SELECT 'Mùa xuân đầu tiên', 'nhac-viet'
    UNION ALL SELECT 'Như có Bác trong ngày vui đại thắng', 'nhac-viet'
    UNION ALL SELECT 'Hungarian Rhapsody No. 2', 'co-dien'
    UNION ALL SELECT 'Sao Mai (hợp xướng)', 'nhac-viet'
    UNION ALL SELECT 'Sao Mai (hợp xướng)', 'dan-gian'
    UNION ALL SELECT 'Bản phối lại nhạc phim (chưa xin phép)', 'nhac-phim'
    UNION ALL SELECT 'Bản phối lại nhạc phim (chưa xin phép)', 'pop'
    UNION ALL SELECT 'Bài tập gam Đô trưởng', 'co-dien'
    UNION ALL SELECT 'Happy Birthday (bản phối đơn giản)', 'thieu-nhi'
    UNION ALL SELECT 'Happy Birthday (bản phối đơn giản)', 'pop'
    UNION ALL SELECT 'Jingle Bells (nháp)', 'thieu-nhi'
    UNION ALL SELECT 'Giáo án piano cơ bản - Bài 1', 'co-dien'
    UNION ALL SELECT 'Giáo án piano cơ bản - Bài 1', 'thieu-nhi'
    UNION ALL SELECT 'Czerny Op. 599 No. 1', 'co-dien'
    UNION ALL SELECT 'Jazz Standard - Autumn Leaves (lead sheet)', 'jazz'
    UNION ALL SELECT 'Bài hát đám cưới (giọng + piano)', 'pop'
    UNION ALL SELECT 'Bài hát đám cưới (giọng + piano)', 'ballad'
    UNION ALL SELECT 'Twinkle Twinkle Little Star', 'thieu-nhi'
    UNION ALL SELECT 'Twinkle Twinkle Little Star', 'co-dien'
    UNION ALL SELECT 'Happy Birthday to You', 'thieu-nhi'
    UNION ALL SELECT 'Happy Birthday to You', 'pop'
    UNION ALL SELECT 'Ode to Joy (bản giản lược)', 'co-dien'
    UNION ALL SELECT 'Für Elise (giản lược)', 'co-dien'
) t
JOIN scores s ON s.title = t.title
JOIN tags g ON g.slug = t.slug;
