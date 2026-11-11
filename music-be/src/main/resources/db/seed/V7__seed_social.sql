-- V7: dữ liệu tương tác giữa người dùng: đánh giá, chia sẻ, playlist, lời xin vào kho mẫu.
-- Đánh giá (1..5 sao, có thể chỉ bình luận) trên bản công khai và bản được chia sẻ.
INSERT INTO score_reviews (id, score_id, member_id, rating, comment, created_at, updated_at)
SELECT UUID(), s.id, m.id, t.rating, t.comment, t.created_at, t.created_at
FROM (
    SELECT 'Für Elise' AS title, 'user@music.com' AS email, 5 AS rating, 'Bản số hóa rất chuẩn, đoạn giữa đúng từng nốt. Cảm ơn bạn đã chia sẻ!' AS comment, NOW(6) - INTERVAL 20 DAY - INTERVAL 5 HOUR - INTERVAL 30 MINUTE AS created_at
    UNION ALL SELECT 'Für Elise', 'minh.tran@music.com', 4, 'Tay trái hơi khó với người mới, nhưng bản nhạc đẹp.', NOW(6) - INTERVAL 18 DAY - INTERVAL 5 HOUR - INTERVAL 30 MINUTE
    UNION ALL SELECT 'Für Elise', 'huong.le@music.com', 5, NULL, NOW(6) - INTERVAL 15 DAY - INTERVAL 5 HOUR - INTERVAL 30 MINUTE
    UNION ALL SELECT 'Für Elise', 'duy.pham@music.com', 4, 'Mình tập chậm 60% trước rồi mới tăng dần.', NOW(6) - INTERVAL 9 DAY - INTERVAL 5 HOUR - INTERVAL 30 MINUTE
    UNION ALL SELECT 'Moonlight Sonata (Mvt. 1)', 'lan.nguyen@music.com', 5, 'Chương 1 chép rất sạch, có đủ dấu luyến và nhấn.', NOW(6) - INTERVAL 22 DAY - INTERVAL 5 HOUR - INTERVAL 30 MINUTE
    UNION ALL SELECT 'Moonlight Sonata (Mvt. 1)', 'user@music.com', 5, NULL, NOW(6) - INTERVAL 14 DAY - INTERVAL 5 HOUR - INTERVAL 30 MINUTE
    UNION ALL SELECT 'Moonlight Sonata (Mvt. 1)', 'an.vo@music.com', 4, 'Nhịp 4/4 nhưng cảm giác như 12/8, bản này ghi rõ ràng.', NOW(6) - INTERVAL 10 DAY - INTERVAL 5 HOUR - INTERVAL 30 MINUTE
    UNION ALL SELECT 'Clair de Lune', 'lan.nguyen@music.com', 5, 'Rất đẹp. Mong bạn đăng thêm Suite Bergamasque.', NOW(6) - INTERVAL 25 DAY - INTERVAL 5 HOUR - INTERVAL 30 MINUTE
    UNION ALL SELECT 'Clair de Lune', 'bao.hoang@music.com', 4, NULL, NOW(6) - INTERVAL 12 DAY - INTERVAL 5 HOUR - INTERVAL 30 MINUTE
    UNION ALL SELECT 'Gymnopédie No. 1', 'user@music.com', 5, 'Bản dễ nhất để bắt đầu với Satie.', NOW(6) - INTERVAL 28 DAY - INTERVAL 5 HOUR - INTERVAL 30 MINUTE
    UNION ALL SELECT 'Gymnopédie No. 1', 'trang.dang@music.com', 5, NULL, NOW(6) - INTERVAL 16 DAY - INTERVAL 5 HOUR - INTERVAL 30 MINUTE
    UNION ALL SELECT 'Gymnopédie No. 1', 'mai.ngo@music.com', 4, 'Tempo hơi chậm so với bản mình nghe, nhưng tập thì tốt.', NOW(6) - INTERVAL 5 DAY - INTERVAL 5 HOUR - INTERVAL 30 MINUTE
    UNION ALL SELECT 'Nocturne Op. 9 No. 2', 'huong.le@music.com', 5, 'Phần trang trí ở ô 12 chép khá chính xác.', NOW(6) - INTERVAL 24 DAY - INTERVAL 5 HOUR - INTERVAL 30 MINUTE
    UNION ALL SELECT 'Nocturne Op. 9 No. 2', 'minh.tran@music.com', 3, 'Có vài nốt hoa mỹ bị thiếu ở trang 2.', NOW(6) - INTERVAL 17 DAY - INTERVAL 5 HOUR - INTERVAL 30 MINUTE
    UNION ALL SELECT 'Prelude in C major (BWV 846)', 'lan.nguyen@music.com', 5, 'Bản kinh điển, thích hợp luyện độc lập các ngón.', NOW(6) - INTERVAL 20 DAY - INTERVAL 5 HOUR - INTERVAL 30 MINUTE
    UNION ALL SELECT 'Prelude in C major (BWV 846)', 'user@music.com', 4, NULL, NOW(6) - INTERVAL 11 DAY - INTERVAL 5 HOUR - INTERVAL 30 MINUTE
    UNION ALL SELECT 'Minuet in G major', 'user@music.com', 4, NULL, NOW(6) - INTERVAL 19 DAY - INTERVAL 5 HOUR - INTERVAL 30 MINUTE
    UNION ALL SELECT 'Minuet in G major', 'an.vo@music.com', 5, 'Bé nhà mình tập bản này rất thích.', NOW(6) - INTERVAL 7 DAY - INTERVAL 5 HOUR - INTERVAL 30 MINUTE
    UNION ALL SELECT 'Eine kleine Nachtmusik (K. 525)', 'minh.tran@music.com', 4, NULL, NOW(6) - INTERVAL 14 DAY - INTERVAL 5 HOUR - INTERVAL 30 MINUTE
    UNION ALL SELECT 'Eine kleine Nachtmusik (K. 525)', 'bao.hoang@music.com', 3, 'Bản rút gọn cho piano khá lược bỏ nhiều bè.', NOW(6) - INTERVAL 6 DAY - INTERVAL 5 HOUR - INTERVAL 30 MINUTE
    UNION ALL SELECT 'Turkish March', 'user@music.com', 5, 'Đoạn tăng tốc cuối bài chép chuẩn.', NOW(6) - INTERVAL 13 DAY - INTERVAL 5 HOUR - INTERVAL 30 MINUTE
    UNION ALL SELECT 'Turkish March', 'duy.pham@music.com', 4, NULL, NOW(6) - INTERVAL 8 DAY - INTERVAL 5 HOUR - INTERVAL 30 MINUTE
    UNION ALL SELECT 'Ode to Joy', 'lan.nguyen@music.com', 5, 'Rất phù hợp cho học viên mới.', NOW(6) - INTERVAL 18 DAY - INTERVAL 5 HOUR - INTERVAL 30 MINUTE
    UNION ALL SELECT 'Ode to Joy', 'minh.tran@music.com', 5, NULL, NOW(6) - INTERVAL 15 DAY - INTERVAL 5 HOUR - INTERVAL 30 MINUTE
    UNION ALL SELECT 'Ode to Joy', 'huong.le@music.com', 4, NULL, NOW(6) - INTERVAL 12 DAY - INTERVAL 5 HOUR - INTERVAL 30 MINUTE
    UNION ALL SELECT 'Ode to Joy', 'trang.dang@music.com', 5, 'Con mình tập được sau một tuần.', NOW(6) - INTERVAL 6 DAY - INTERVAL 5 HOUR - INTERVAL 30 MINUTE
    UNION ALL SELECT 'Canon in D', 'user@music.com', 5, 'Giai điệu quen thuộc, rất dễ nghe.', NOW(6) - INTERVAL 17 DAY - INTERVAL 5 HOUR - INTERVAL 30 MINUTE
    UNION ALL SELECT 'Canon in D', 'lan.nguyen@music.com', 4, NULL, NOW(6) - INTERVAL 12 DAY - INTERVAL 5 HOUR - INTERVAL 30 MINUTE
    UNION ALL SELECT 'Canon in D', 'bao.hoang@music.com', 5, NULL, NOW(6) - INTERVAL 7 DAY - INTERVAL 5 HOUR - INTERVAL 30 MINUTE
    UNION ALL SELECT 'Canon in D', 'mai.ngo@music.com', 5, 'Mình dùng để chơi đám cưới bạn, cảm ơn bản số hóa này.', NOW(6) - INTERVAL 3 DAY - INTERVAL 5 HOUR - INTERVAL 30 MINUTE
    UNION ALL SELECT 'Swan Lake - Theme', 'user@music.com', 4, NULL, NOW(6) - INTERVAL 12 DAY - INTERVAL 5 HOUR - INTERVAL 30 MINUTE
    UNION ALL SELECT 'Tình ca', 'huong.le@music.com', 5, 'Giai điệu giản dị mà xúc động.', NOW(6) - INTERVAL 14 DAY - INTERVAL 5 HOUR - INTERVAL 30 MINUTE
    UNION ALL SELECT 'Diễm xưa', 'user@music.com', 5, NULL, NOW(6) - INTERVAL 16 DAY - INTERVAL 5 HOUR - INTERVAL 30 MINUTE
    UNION ALL SELECT 'Diễm xưa', 'duy.pham@music.com', 4, 'Hợp âm ghi đủ, hát theo được ngay.', NOW(6) - INTERVAL 9 DAY - INTERVAL 5 HOUR - INTERVAL 30 MINUTE
    UNION ALL SELECT 'Diễm xưa', 'mai.ngo@music.com', 5, NULL, NOW(6) - INTERVAL 3 DAY - INTERVAL 5 HOUR - INTERVAL 30 MINUTE
    UNION ALL SELECT 'Tiến quân ca', 'user@music.com', 5, NULL, NOW(6) - INTERVAL 13 DAY - INTERVAL 5 HOUR - INTERVAL 30 MINUTE
    UNION ALL SELECT 'Tiến quân ca', 'minh.tran@music.com', 5, 'Bản quốc ca đúng nhịp hành khúc.', NOW(6) - INTERVAL 10 DAY - INTERVAL 5 HOUR - INTERVAL 30 MINUTE
    UNION ALL SELECT 'Tiến quân ca', 'trang.dang@music.com', 4, NULL, NOW(6) - INTERVAL 5 DAY - INTERVAL 5 HOUR - INTERVAL 30 MINUTE
    UNION ALL SELECT 'Thiên Thai', 'an.vo@music.com', 4, NULL, NOW(6) - INTERVAL 11 DAY - INTERVAL 5 HOUR - INTERVAL 30 MINUTE
    UNION ALL SELECT 'Nghìn trùng xa cách', 'lan.nguyen@music.com', 4, 'Cần thêm ký hiệu hơi thở cho người hát.', NOW(6) - INTERVAL 9 DAY - INTERVAL 5 HOUR - INTERVAL 30 MINUTE
    UNION ALL SELECT 'Spring (Four Seasons)', 'lan.nguyen@music.com', 5, 'Bản rút gọn piano mà vẫn giữ được tinh thần của dàn dây.', NOW(6) - INTERVAL 12 DAY - INTERVAL 5 HOUR - INTERVAL 30 MINUTE
    UNION ALL SELECT 'Spring (Four Seasons)', 'duy.pham@music.com', 4, NULL, NOW(6) - INTERVAL 6 DAY - INTERVAL 5 HOUR - INTERVAL 30 MINUTE
    UNION ALL SELECT 'Hallelujah (Messiah)', 'minh.tran@music.com', 5, 'Bản 4 bè hợp xướng rõ ràng, dễ chia bè.', NOW(6) - INTERVAL 10 DAY - INTERVAL 5 HOUR - INTERVAL 30 MINUTE
    UNION ALL SELECT 'Hallelujah (Messiah)', 'huong.le@music.com', 5, NULL, NOW(6) - INTERVAL 4 DAY - INTERVAL 5 HOUR - INTERVAL 30 MINUTE
    UNION ALL SELECT 'Ave Maria', 'huong.le@music.com', 5, 'Giọng và piano cùng một bản, rất tiện tập đôi.', NOW(6) - INTERVAL 9 DAY - INTERVAL 5 HOUR - INTERVAL 30 MINUTE
    UNION ALL SELECT 'Ave Maria', 'user@music.com', 4, NULL, NOW(6) - INTERVAL 5 DAY - INTERVAL 5 HOUR - INTERVAL 30 MINUTE
    UNION ALL SELECT 'Hà Nội mùa vắng những cơn mưa', 'user@music.com', 4, NULL, NOW(6) - INTERVAL 4 DAY - INTERVAL 5 HOUR - INTERVAL 30 MINUTE
    UNION ALL SELECT 'Twinkle Twinkle Little Star', 'lan.nguyen@music.com', 5, 'Bài mở đầu hoàn hảo cho học viên nhỏ tuổi.', NOW(6) - INTERVAL 40 DAY - INTERVAL 5 HOUR - INTERVAL 30 MINUTE
    UNION ALL SELECT 'Twinkle Twinkle Little Star', 'user@music.com', 5, NULL, NOW(6) - INTERVAL 30 DAY - INTERVAL 5 HOUR - INTERVAL 30 MINUTE
    UNION ALL SELECT 'Twinkle Twinkle Little Star', 'bao.hoang@music.com', 5, NULL, NOW(6) - INTERVAL 21 DAY - INTERVAL 5 HOUR - INTERVAL 30 MINUTE
    UNION ALL SELECT 'Happy Birthday to You', 'user@music.com', 4, NULL, NOW(6) - INTERVAL 26 DAY - INTERVAL 5 HOUR - INTERVAL 30 MINUTE
    UNION ALL SELECT 'Happy Birthday to You', 'trang.dang@music.com', 5, 'Bài nào cũng dùng được trong tiệc sinh nhật.', NOW(6) - INTERVAL 8 DAY - INTERVAL 5 HOUR - INTERVAL 30 MINUTE
    UNION ALL SELECT 'Ode to Joy (bản giản lược)', 'an.vo@music.com', 5, NULL, NOW(6) - INTERVAL 6 DAY - INTERVAL 5 HOUR - INTERVAL 30 MINUTE
    UNION ALL SELECT 'Für Elise (giản lược)', 'user@music.com', 4, 'Bản giản lược tay trái dễ hơn nhiều.', NOW(6) - INTERVAL 4 DAY - INTERVAL 5 HOUR - INTERVAL 30 MINUTE
    UNION ALL SELECT 'Giáo án piano cơ bản - Bài 1', 'user@music.com', NULL, 'Giáo án rõ ràng, cảm ơn cô Lan.', NOW(6) - INTERVAL 20 DAY - INTERVAL 5 HOUR - INTERVAL 30 MINUTE
) t
JOIN scores s ON s.title = t.title
JOIN members m ON m.email = t.email;

-- Chia sẻ trực tiếp (permission: 1 xem, 2 nhận xét, 3 chỉnh sửa) và yêu cầu xin quyền đang chờ duyệt
INSERT INTO member_scores (id, member_id, score_id, permission, source, requested_permission, request_message, requested_at)
SELECT UUID(), m.id, s.id, t.permission, 'DIRECT', t.requested_permission, t.request_message, t.requested_at
FROM (
    SELECT 'Giáo án piano cơ bản - Bài 1' AS title, 'user@music.com' AS email, 2 AS permission, NULL AS requested_permission, NULL AS request_message, NULL AS requested_at
    UNION ALL SELECT 'Giáo án piano cơ bản - Bài 1', 'an.vo@music.com', 1, NULL, NULL, NULL
    UNION ALL SELECT 'Giáo án piano cơ bản - Bài 1', 'trang.dang@music.com', 3, NULL, NULL, NULL
    UNION ALL SELECT 'Czerny Op. 599 No. 1', 'user@music.com', 1, NULL, NULL, NULL
    UNION ALL SELECT 'Jazz Standard - Autumn Leaves (lead sheet)', 'huong.le@music.com', 3, NULL, NULL, NULL
    UNION ALL SELECT 'Jazz Standard - Autumn Leaves (lead sheet)', 'duy.pham@music.com', 2, NULL, NULL, NULL
    UNION ALL SELECT 'Bài hát đám cưới (giọng + piano)', 'lan.nguyen@music.com', 1, NULL, NULL, NULL
    UNION ALL SELECT 'Giáo án piano cơ bản - Bài 1', 'bao.hoang@music.com', NULL, 1, 'Em xin được xem giáo án để tập cho con em ạ.', NOW(6) - INTERVAL 2 DAY - INTERVAL 3 HOUR - INTERVAL 0 MINUTE
    UNION ALL SELECT 'Czerny Op. 599 No. 1', 'an.vo@music.com', NULL, 2, 'Em muốn nhận xét giúp phần chỉ ngón.', NOW(6) - INTERVAL 1 DAY - INTERVAL 3 HOUR - INTERVAL 0 MINUTE
    UNION ALL SELECT 'Bài hát đám cưới (giọng + piano)', 'mai.ngo@music.com', NULL, 3, 'Chị cho em xin quyền sửa để chuyển sang giọng khác nhé.', NOW(6) - INTERVAL 3 DAY - INTERVAL 3 HOUR - INTERVAL 0 MINUTE
    UNION ALL SELECT 'Bài tập gam Đô trưởng', 'lan.nguyen@music.com', NULL, 2, 'Mình muốn góp ý thêm cho bài tập này.', NOW(6) - INTERVAL 1 DAY - INTERVAL 3 HOUR - INTERVAL 0 MINUTE
    UNION ALL SELECT 'Happy Birthday (bản phối đơn giản)', 'minh.tran@music.com', NULL, 1, NULL, NOW(6) - INTERVAL 0 DAY - INTERVAL 3 HOUR - INTERVAL 0 MINUTE
) t
JOIN scores s ON s.title = t.title
JOIN members m ON m.email = t.email;

-- Playlist cá nhân
INSERT INTO playlists (id, member_id, name, description)
SELECT UUID(), m.id, t.name, t.description
FROM (
    SELECT 'user@music.com' AS email, 'Khởi động mỗi sáng' AS name, 'Các bài dễ, tập 10 phút trước khi vào bài chính.' AS description
    UNION ALL SELECT 'user@music.com', 'Cổ điển yêu thích', 'Những bản mình nghe nhiều nhất.'
    UNION ALL SELECT 'user@music.com', 'Nhạc Việt để hát cùng', 'Giai điệu quen thuộc cho buổi họp mặt.'
    UNION ALL SELECT 'lan.nguyen@music.com', 'Giáo trình năm nhất', 'Danh sách bài cho lớp piano cơ bản.'
    UNION ALL SELECT 'lan.nguyen@music.com', 'Chopin và Beethoven', 'Bài nâng cao cho học viên khá.'
    UNION ALL SELECT 'minh.tran@music.com', 'Baroque cho tay trái', NULL
    UNION ALL SELECT 'huong.le@music.com', 'Setlist đám cưới', 'Thứ tự biểu diễn buổi tiệc cuối tuần.'
    UNION ALL SELECT 'an.vo@music.com', 'Piano giản dị', 'Nhạc chậm, dễ tập.'
    UNION ALL SELECT 'trang.dang@music.com', 'Cho bé tập đàn', 'Bài ngắn, tempo vừa.'
) t
JOIN members m ON m.email = t.email;

INSERT INTO playlist_items (id, playlist_id, score_id, position)
SELECT UUID(), p.id, s.id, t.position
FROM (
    SELECT 'user@music.com' AS email, 'Khởi động mỗi sáng' AS playlist, 'Bài tập gam Đô trưởng' AS title, 1 AS position
    UNION ALL SELECT 'user@music.com', 'Khởi động mỗi sáng', 'Ode to Joy', 2
    UNION ALL SELECT 'user@music.com', 'Khởi động mỗi sáng', 'Gymnopédie No. 1', 3
    UNION ALL SELECT 'user@music.com', 'Khởi động mỗi sáng', 'Minuet in G major', 4
    UNION ALL SELECT 'user@music.com', 'Cổ điển yêu thích', 'Für Elise', 1
    UNION ALL SELECT 'user@music.com', 'Cổ điển yêu thích', 'Moonlight Sonata (Mvt. 1)', 2
    UNION ALL SELECT 'user@music.com', 'Cổ điển yêu thích', 'Clair de Lune', 3
    UNION ALL SELECT 'user@music.com', 'Cổ điển yêu thích', 'Canon in D', 4
    UNION ALL SELECT 'user@music.com', 'Cổ điển yêu thích', 'Nocturne Op. 9 No. 2', 5
    UNION ALL SELECT 'user@music.com', 'Nhạc Việt để hát cùng', 'Diễm xưa', 1
    UNION ALL SELECT 'user@music.com', 'Nhạc Việt để hát cùng', 'Tình ca', 2
    UNION ALL SELECT 'user@music.com', 'Nhạc Việt để hát cùng', 'Tiến quân ca', 3
    UNION ALL SELECT 'lan.nguyen@music.com', 'Giáo trình năm nhất', 'Twinkle Twinkle Little Star', 1
    UNION ALL SELECT 'lan.nguyen@music.com', 'Giáo trình năm nhất', 'Ode to Joy (bản giản lược)', 2
    UNION ALL SELECT 'lan.nguyen@music.com', 'Giáo trình năm nhất', 'Giáo án piano cơ bản - Bài 1', 3
    UNION ALL SELECT 'lan.nguyen@music.com', 'Giáo trình năm nhất', 'Czerny Op. 599 No. 1', 4
    UNION ALL SELECT 'lan.nguyen@music.com', 'Giáo trình năm nhất', 'Minuet in G major', 5
    UNION ALL SELECT 'lan.nguyen@music.com', 'Chopin và Beethoven', 'Für Elise', 1
    UNION ALL SELECT 'lan.nguyen@music.com', 'Chopin và Beethoven', 'Nocturne Op. 9 No. 2', 2
    UNION ALL SELECT 'lan.nguyen@music.com', 'Chopin và Beethoven', 'Moonlight Sonata (Mvt. 1)', 3
    UNION ALL SELECT 'lan.nguyen@music.com', 'Chopin và Beethoven', 'Turkish March', 4
    UNION ALL SELECT 'minh.tran@music.com', 'Baroque cho tay trái', 'Prelude in C major (BWV 846)', 1
    UNION ALL SELECT 'minh.tran@music.com', 'Baroque cho tay trái', 'Minuet in G major', 2
    UNION ALL SELECT 'minh.tran@music.com', 'Baroque cho tay trái', 'Spring (Four Seasons)', 3
    UNION ALL SELECT 'minh.tran@music.com', 'Baroque cho tay trái', 'Hallelujah (Messiah)', 4
    UNION ALL SELECT 'huong.le@music.com', 'Setlist đám cưới', 'Canon in D', 1
    UNION ALL SELECT 'huong.le@music.com', 'Setlist đám cưới', 'Ave Maria', 2
    UNION ALL SELECT 'huong.le@music.com', 'Setlist đám cưới', 'Bài hát đám cưới (giọng + piano)', 3
    UNION ALL SELECT 'huong.le@music.com', 'Setlist đám cưới', 'Clair de Lune', 4
    UNION ALL SELECT 'an.vo@music.com', 'Piano giản dị', 'Gymnopédie No. 1', 1
    UNION ALL SELECT 'an.vo@music.com', 'Piano giản dị', 'Diễm xưa', 2
    UNION ALL SELECT 'an.vo@music.com', 'Piano giản dị', 'Hà Nội mùa vắng những cơn mưa', 3
    UNION ALL SELECT 'trang.dang@music.com', 'Cho bé tập đàn', 'Twinkle Twinkle Little Star', 1
    UNION ALL SELECT 'trang.dang@music.com', 'Cho bé tập đàn', 'Happy Birthday to You', 2
    UNION ALL SELECT 'trang.dang@music.com', 'Cho bé tập đàn', 'Ode to Joy', 3
) t
JOIN members m ON m.email = t.email
JOIN playlists p ON p.member_id = m.id AND p.name = t.playlist
JOIN scores s ON s.title = t.title;

-- Lời xin đưa bản nhạc vào kho bản nhạc mẫu: admin xin phép chủ, chủ đồng ý thì có bản sao (V6)
INSERT INTO official_requests (id, score_id, requested_by, owner_id, status, copy_score_id, created_at, resolved_at)
SELECT UUID(), s.id, a.id, m.id, t.status, c.id, t.created_at, t.resolved_at
FROM (
    SELECT 'Ode to Joy' AS title, 'user@music.com' AS owner_email, 'ACCEPTED' AS status, 'Ode to Joy (bản giản lược)' AS copy_title, NOW(6) - INTERVAL 22 DAY - INTERVAL 4 HOUR - INTERVAL 0 MINUTE AS created_at, NOW(6) - INTERVAL 20 DAY - INTERVAL 4 HOUR - INTERVAL 0 MINUTE AS resolved_at
    UNION ALL SELECT 'Für Elise', 'lan.nguyen@music.com', 'ACCEPTED', 'Für Elise (giản lược)', NOW(6) - INTERVAL 16 DAY - INTERVAL 4 HOUR - INTERVAL 0 MINUTE, NOW(6) - INTERVAL 14 DAY - INTERVAL 4 HOUR - INTERVAL 0 MINUTE
    UNION ALL SELECT 'Turkish March', 'minh.tran@music.com', 'PENDING', NULL, NOW(6) - INTERVAL 2 DAY - INTERVAL 4 HOUR - INTERVAL 0 MINUTE, NULL
    UNION ALL SELECT 'Canon in D', 'huong.le@music.com', 'PENDING', NULL, NOW(6) - INTERVAL 1 DAY - INTERVAL 4 HOUR - INTERVAL 0 MINUTE, NULL
    UNION ALL SELECT 'Nocturne Op. 9 No. 2', 'lan.nguyen@music.com', 'DECLINED', NULL, NOW(6) - INTERVAL 10 DAY - INTERVAL 4 HOUR - INTERVAL 0 MINUTE, NOW(6) - INTERVAL 9 DAY - INTERVAL 4 HOUR - INTERVAL 0 MINUTE
    UNION ALL SELECT 'Tiến quân ca', 'bao.hoang@music.com', 'CANCELED', NULL, NOW(6) - INTERVAL 12 DAY - INTERVAL 4 HOUR - INTERVAL 0 MINUTE, NOW(6) - INTERVAL 11 DAY - INTERVAL 4 HOUR - INTERVAL 0 MINUTE
) t
JOIN scores s ON s.title = t.title
JOIN members m ON m.email = t.owner_email
JOIN members a ON a.email = 'admin2@music.com'
LEFT JOIN scores c ON c.title = t.copy_title;
