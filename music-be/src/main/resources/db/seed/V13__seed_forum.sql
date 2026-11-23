-- V13: dữ liệu mẫu diễn đàn (mục 5.5): chuyên mục, chủ đề, trả lời, bình chọn, theo dõi và báo cáo, để thử luồng hỏi đáp giữa người dùng.
-- Id cố định (seed-ft-*, seed-fp-*) và INSERT IGNORE nên chạy lại không bị trùng. Báo cáo để trạng thái chờ cho admin xử lý.
--   Chủ đề có đáp án hay nhất: 1, 4, 7, 8, 14. Chưa có đáp án: 2, 3, 5, 6, 9, 11, 12. Chủ đề 10 là spam bị báo cáo để thử hàng chờ admin.
--   admin@music.com (Super Admin) đặt chủ đề 11 và có câu trả lời hay nhất ở chủ đề 7; quản trị diễn đàn: ghim + khóa chủ đề
--   12 (nội quy), khóa chủ đề 8, ẩn chủ đề spam 13 và bài spam seed-fp-4-3, xử lý 4 báo cáo (cuối file). Phía người dùng:
--   chủ đề 14 của admin@ gắn bản nhạc, đã sửa, admin@ tự chọn câu trả lời hay nhất; admin@ chỉ theo dõi + bình chọn chủ đề 5.
--   user@music.com (Demo User) đặt chủ đề 2 (còn mở, thử nút 'Chọn là hay nhất') và trả lời chủ đề 3, 9.

INSERT IGNORE INTO forum_categories (id, slug, name, description, sort_order) VALUES
    ('seed-forum-cat-1', 'hoi-dap', 'Hỏi đáp', 'Câu hỏi về cách dùng ứng dụng, số hóa và chỉnh sửa bản nhạc', 1),
    ('seed-forum-cat-2', 'ky-thuat', 'Kỹ thuật chơi nhạc', 'Luyện tập, kỹ thuật, nhạc lý và cách xử lý đoạn khó', 2),
    ('seed-forum-cat-3', 'chia-se-ban-nhac', 'Chia sẻ bản nhạc', 'Giới thiệu bản phối, xin góp ý và tìm bản nhạc', 3),
    ('seed-forum-cat-4', 'gop-y-ung-dung', 'Góp ý ứng dụng', 'Báo lỗi và đề xuất tính năng mới', 4),
    ('seed-forum-cat-5', 'tro-chuyen', 'Trò chuyện', 'Chuyện âm nhạc nói chung', 5);

-- Chủ đề
INSERT IGNORE INTO forum_threads (id, category_id, author_id, score_id, title, body, created_at)
    SELECT 'seed-ft-1', (SELECT id FROM forum_categories WHERE slug = 'hoi-dap'), (SELECT id FROM members WHERE email = 'minh.tran@music.com'), NULL, 'Số hóa ảnh chụp bản nhạc bị lệch dòng, phải làm sao?', 'Mình chụp bản nhạc bằng điện thoại rồi tải lên, nhưng kết quả số hóa bị **lệch dòng** ở khuông thứ hai: nốt tay trái nhảy lên khuông trên.

Mình đã thử:
- Chụp lại dưới ánh sáng tốt hơn
- Cắt bớt viền ảnh

Có mẹo nào để ảnh đầu vào chuẩn hơn không?', NOW(6) - INTERVAL 9 DAY - INTERVAL 3 HOUR - INTERVAL 10 MINUTE
UNION ALL
    SELECT 'seed-ft-2', (SELECT id FROM forum_categories WHERE slug = 'hoi-dap'), (SELECT id FROM members WHERE email = 'user@music.com'), NULL, 'Khác nhau giữa nhập MusicXML và số hóa từ ảnh là gì?', 'Mình mới dùng ứng dụng. Mình thấy có hai cách tạo bản nhạc: **nhập file MusicXML/MIDI** và **số hóa từ ảnh/PDF**.

Hai cách này khác nhau thế nào, nên dùng cách nào khi mình có sẵn file từ MuseScore?', NOW(6) - INTERVAL 6 DAY - INTERVAL 5 HOUR - INTERVAL 0 MINUTE
UNION ALL
    SELECT 'seed-ft-3', (SELECT id FROM forum_categories WHERE slug = 'ky-thuat'), (SELECT id FROM members WHERE email = 'lan.nguyen@music.com'), (SELECT id FROM scores WHERE title = 'Moonlight Sonata (Mvt. 1)' AND visibility = 'PUBLIC' LIMIT 1), 'Mẹo tập đoạn arpeggio tay trái trong Moonlight Sonata', 'Chương 1 của Moonlight Sonata nghe chậm nhưng arpeggio tay trái ba nốt liên tục rất dễ **mỏi cổ tay**.

Mình chia sẻ cách mình tập, mong mọi người bổ sung:

### Cách tập
- Tập tay trái một mình với metronome 50 BPM
- Giữ cổ tay thả lỏng, để **trọng lượng cánh tay** làm việc
- Nhấn nhẹ nốt đầu mỗi nhóm ba

> Chậm mà đều còn hơn nhanh mà gồng.

Bản mình đính kèm có ghi chú ngón tay ở những ô khó.', NOW(6) - INTERVAL 14 DAY - INTERVAL 2 HOUR - INTERVAL 0 MINUTE
UNION ALL
    SELECT 'seed-ft-4', (SELECT id FROM forum_categories WHERE slug = 'ky-thuat'), (SELECT id FROM members WHERE email = 'duy.pham@music.com'), NULL, 'Tập chậm bao nhiêu phần trăm tốc độ thì hợp lý?', 'Khi tập một đoạn khó mình thường để ở **50%** tốc độ, nhưng có người bảo nên để 70%.

Theo kinh nghiệm của mọi người, tập chậm bao nhiêu thì hiệu quả và khi nào nên tăng tốc?', NOW(6) - INTERVAL 11 DAY - INTERVAL 4 HOUR - INTERVAL 0 MINUTE
UNION ALL
    SELECT 'seed-ft-5', (SELECT id FROM forum_categories WHERE slug = 'chia-se-ban-nhac'), (SELECT id FROM members WHERE email = 'huong.le@music.com'), (SELECT id FROM scores WHERE title = 'Clair de Lune' AND visibility = 'PUBLIC' LIMIT 1), 'Xin góp ý bản số hóa Clair de Lune', 'Mình vừa đăng bản **Clair de Lune** (nhịp 9/8, giọng Rê giáng trưởng). Mọi người xem giúp mình đoạn chuyển giọng ở ô 27-31 đã đúng chưa nhé.

Nếu thấy sai, mọi người có thể để lại **góp ý ở ô nhịp** trong bản nhạc hoặc đề xuất sửa trực tiếp.', NOW(6) - INTERVAL 16 DAY - INTERVAL 6 HOUR - INTERVAL 0 MINUTE
UNION ALL
    SELECT 'seed-ft-6', (SELECT id FROM forum_categories WHERE slug = 'chia-se-ban-nhac'), (SELECT id FROM members WHERE email = 'nam.do@music.com'), NULL, 'Gợi ý bản nhạc Việt Nam dễ cho người mới học piano', 'Mình mới học piano được 3 tháng và muốn tập vài bài nhạc Việt. Mọi người có thể gợi ý bản **dễ, tay trái đơn giản** được không?', NOW(6) - INTERVAL 5 DAY - INTERVAL 7 HOUR - INTERVAL 0 MINUTE
UNION ALL
    SELECT 'seed-ft-7', (SELECT id FROM forum_categories WHERE slug = 'gop-y-ung-dung'), (SELECT id FROM members WHERE email = 'an.vo@music.com'), NULL, 'Mong có chế độ lặp một đoạn khi luyện tập', 'Khi tập mình hay muốn **lặp liên tục một đoạn** vài ô nhịp thay vì chạy cả bài.

Đề xuất: chọn ô bắt đầu và ô kết thúc rồi bật *Lặp*, kèm tăng tốc dần sau mỗi vòng. Mọi người thấy sao?', NOW(6) - INTERVAL 12 DAY - INTERVAL 5 HOUR - INTERVAL 0 MINUTE
UNION ALL
    SELECT 'seed-ft-8', (SELECT id FROM forum_categories WHERE slug = 'gop-y-ung-dung'), (SELECT id FROM members WHERE email = 'bao.hoang@music.com'), NULL, 'Xuất PDF bị mất dấu nhắc lại (repeat)', 'Mình xuất bản nhạc sang PDF thì dấu **nhắc lại** ở cuối ô 16 không hiện, trong khi xem trên web vẫn có. Có ai gặp không?', NOW(6) - INTERVAL 8 DAY - INTERVAL 6 HOUR - INTERVAL 0 MINUTE
UNION ALL
    SELECT 'seed-ft-9', (SELECT id FROM forum_categories WHERE slug = 'tro-chuyen'), (SELECT id FROM members WHERE email = 'trang.dang@music.com'), NULL, 'Tuần này bạn đang tập bài gì?', 'Mở chủ đề nhỏ để mọi người chia sẻ **bài đang tập tuần này** và mục tiêu nhỏ của mình.

Mình đang tập *Canon in D* bản piano, mục tiêu là chơi trơn tru đoạn biến tấu thứ ba.', NOW(6) - INTERVAL 4 DAY - INTERVAL 3 HOUR - INTERVAL 0 MINUTE
UNION ALL
    SELECT 'seed-ft-10', (SELECT id FROM forum_categories WHERE slug = 'tro-chuyen'), (SELECT id FROM members WHERE email = 'khoa.bui@music.com'), NULL, 'Kiếm tiền online cực nhanh, liên hệ ngay', 'Làm việc tại nhà thu nhập 20 triệu mỗi tháng, không cần kinh nghiệm. Nhắn ngay Zalo để nhận hướng dẫn!!! [bấm vào đây](https://example.com/kiem-tien)', NOW(6) - INTERVAL 1 DAY - INTERVAL 2 HOUR - INTERVAL 0 MINUTE;

-- Trả lời
INSERT IGNORE INTO forum_posts (id, thread_id, author_id, body, created_at)
    SELECT 'seed-fp-1-1', 'seed-ft-1', (SELECT id FROM members WHERE email = 'huong.le@music.com'), 'Mình gặp đúng lỗi này. Cách xử lý hiệu quả nhất:
1. Chụp **thẳng góc**, đặt điện thoại song song với trang giấy
2. Bật chế độ quét tài liệu (hoặc dùng ứng dụng scan) để ảnh phẳng và đủ tương phản
3. Nếu vẫn lệch, sửa tay ở bước *Xem lại kết quả* trước khi lưu', NOW(6) - INTERVAL 9 DAY - INTERVAL 1 HOUR - INTERVAL 40 MINUTE
UNION ALL
    SELECT 'seed-fp-1-2', 'seed-ft-1', (SELECT id FROM members WHERE email = 'an.vo@music.com'), 'Thêm một mẹo: tải **PDF** thay vì ảnh nếu bạn có file gốc, độ chính xác cao hơn hẳn.', NOW(6) - INTERVAL 8 DAY - INTERVAL 22 HOUR - INTERVAL 5 MINUTE
UNION ALL
    SELECT 'seed-fp-1-3', 'seed-ft-1', (SELECT id FROM members WHERE email = 'minh.tran@music.com'), 'Cảm ơn bạn Hương! Quét bằng ứng dụng scan là ổn rồi, đã đúng từng khuông.', NOW(6) - INTERVAL 8 DAY - INTERVAL 20 HOUR - INTERVAL 30 MINUTE
UNION ALL
    SELECT 'seed-fp-2-1', 'seed-ft-2', (SELECT id FROM members WHERE email = 'lan.nguyen@music.com'), 'Nếu đã có file MusicXML (xuất từ MuseScore, Finale...) thì **nhập file** là chuẩn nhất: không mất nốt nào. Số hóa từ ảnh dành cho khi bạn chỉ có bản in hoặc bản scan.', NOW(6) - INTERVAL 5 DAY - INTERVAL 20 HOUR - INTERVAL 0 MINUTE
UNION ALL
    SELECT 'seed-fp-2-2', 'seed-ft-2', (SELECT id FROM members WHERE email = 'duy.pham@music.com'), 'Bổ sung: nhập MIDI thì mất thông tin ký hiệu (dấu luyến, nhấn...), ứng dụng sẽ tự chuyển thành bản nhạc nhưng nên xem lại kỹ.', NOW(6) - INTERVAL 5 DAY - INTERVAL 16 HOUR - INTERVAL 45 MINUTE
UNION ALL
    SELECT 'seed-fp-3-1', 'seed-ft-3', (SELECT id FROM members WHERE email = 'minh.tran@music.com'), 'Đồng ý với bạn. Mình thêm: tập **ngược lại**, bắt đầu từ ô cuối rồi lùi dần, nhớ rất lâu.', NOW(6) - INTERVAL 13 DAY - INTERVAL 20 HOUR - INTERVAL 0 MINUTE
UNION ALL
    SELECT 'seed-fp-3-2', 'seed-ft-3', (SELECT id FROM members WHERE email = 'huong.le@music.com'), 'Thử thay đổi nhịp điệu khi tập: đọc ba nốt thành nhịp chấm rồi đảo ngược. Rất hiệu quả cho độ đều.', NOW(6) - INTERVAL 12 DAY - INTERVAL 9 HOUR - INTERVAL 30 MINUTE
UNION ALL
    SELECT 'seed-fp-3-3', 'seed-ft-3', (SELECT id FROM members WHERE email = 'an.vo@music.com'), 'Cảm ơn bạn, mình đã tập theo hai tuần và thấy tay đỡ mỏi rõ rệt.', NOW(6) - INTERVAL 7 DAY - INTERVAL 12 HOUR - INTERVAL 0 MINUTE
UNION ALL
    SELECT 'seed-fp-3-4', 'seed-ft-3', (SELECT id FROM members WHERE email = 'user@music.com'), 'Bản đính kèm có ghi chú ngón tay rất hữu ích, cảm ơn bạn!', NOW(6) - INTERVAL 3 DAY - INTERVAL 8 HOUR - INTERVAL 15 MINUTE
UNION ALL
    SELECT 'seed-fp-3-5', 'seed-ft-3', (SELECT id FROM members WHERE email = 'minh.tran@music.com'), 'Rất vui vì bản ghi chú giúp được bạn, chúc bạn tập tốt nhé!', NOW(6) - INTERVAL 2 DAY - INTERVAL 20 HOUR - INTERVAL 0 MINUTE
UNION ALL
    SELECT 'seed-fp-4-1', 'seed-ft-4', (SELECT id FROM members WHERE email = 'huong.le@music.com'), 'Quy tắc của mình: tập ở tốc độ mà bạn chơi **đúng liên tục 3 lần** không sai nốt nào, sau đó tăng 5%. Con số bắt đầu tùy đoạn nhạc, đừng cố định.

Chế độ luyện tập của ứng dụng cho chỉnh tốc độ từng bước rất tiện cho việc này.', NOW(6) - INTERVAL 10 DAY - INTERVAL 22 HOUR - INTERVAL 0 MINUTE
UNION ALL
    SELECT 'seed-fp-4-2', 'seed-ft-4', (SELECT id FROM members WHERE email = 'lan.nguyen@music.com'), 'Mình hay bắt đầu ở 60% rồi tăng dần. Quan trọng là tập đều mỗi ngày 15 phút hơn là dồn một buổi dài.', NOW(6) - INTERVAL 10 DAY - INTERVAL 15 HOUR - INTERVAL 20 MINUTE
UNION ALL
    SELECT 'seed-fp-5-1', 'seed-ft-5', (SELECT id FROM members WHERE email = 'lan.nguyen@music.com'), 'Mình đã xem, đoạn 27-31 đúng rồi bạn. Chỉ có dấu luyến ở ô 33 bị thiếu, mình để góp ý bên bản nhạc.', NOW(6) - INTERVAL 15 DAY - INTERVAL 19 HOUR - INTERVAL 0 MINUTE
UNION ALL
    SELECT 'seed-fp-5-2', 'seed-ft-5', (SELECT id FROM members WHERE email = 'bao.hoang@music.com'), 'Bản chép rất sạch. Mong bạn đăng thêm *Suite Bergamasque*.', NOW(6) - INTERVAL 14 DAY - INTERVAL 10 HOUR - INTERVAL 0 MINUTE
UNION ALL
    SELECT 'seed-fp-6-1', 'seed-ft-6', (SELECT id FROM members WHERE email = 'duy.pham@music.com'), 'Bạn thử *Tình ca* (Hoàng Việt) trong mục Khám phá, mình đã số hóa và ghi chú ngón tay sẵn. Tay trái chỉ là hợp âm rải cơ bản.', NOW(6) - INTERVAL 4 DAY - INTERVAL 21 HOUR - INTERVAL 0 MINUTE
UNION ALL
    SELECT 'seed-fp-6-2', 'seed-ft-6', (SELECT id FROM members WHERE email = 'an.vo@music.com'), 'Thêm *Diễm xưa* nữa, giai điệu quen và nhịp chậm nên tập rất thoải mái.', NOW(6) - INTERVAL 4 DAY - INTERVAL 11 HOUR - INTERVAL 30 MINUTE
UNION ALL
    SELECT 'seed-fp-7-1', 'seed-ft-7', (SELECT id FROM members WHERE email = 'minh.tran@music.com'), 'Ủng hộ! Tính năng này gần như bắt buộc với người tập nghiêm túc.', NOW(6) - INTERVAL 11 DAY - INTERVAL 20 HOUR - INTERVAL 0 MINUTE
UNION ALL
    SELECT 'seed-fp-7-2', 'seed-ft-7', (SELECT id FROM members WHERE email = 'lan.nguyen@music.com'), 'Thêm gợi ý: cho đếm nhịp dạo (count-in) trước mỗi vòng lặp.', NOW(6) - INTERVAL 11 DAY - INTERVAL 9 HOUR - INTERVAL 0 MINUTE
UNION ALL
    SELECT 'seed-fp-7-3', 'seed-ft-7', (SELECT id FROM members WHERE email = 'huong.le@music.com'), '+1, mình cũng cần để tập đoạn khó của Nocturne.', NOW(6) - INTERVAL 10 DAY - INTERVAL 8 HOUR - INTERVAL 0 MINUTE
UNION ALL
    SELECT 'seed-fp-8-1', 'seed-ft-8', (SELECT id FROM members WHERE email = 'trang.dang@music.com'), 'Mình gặp rồi. Thử xuất lại bằng định dạng **MusicXML → PDF** thay vì chụp màn hình, dấu nhắc lại giữ nguyên. Nếu vẫn lỗi thì báo giúp tại đây để nhóm xem.', NOW(6) - INTERVAL 7 DAY - INTERVAL 21 HOUR - INTERVAL 0 MINUTE
UNION ALL
    SELECT 'seed-fp-9-1', 'seed-ft-9', (SELECT id FROM members WHERE email = 'minh.tran@music.com'), 'Mình đang vật lộn với *Turkish March*, đoạn tay trái nhảy quãng tám thật sự khó.', NOW(6) - INTERVAL 3 DAY - INTERVAL 20 HOUR - INTERVAL 0 MINUTE
UNION ALL
    SELECT 'seed-fp-9-2', 'seed-ft-9', (SELECT id FROM members WHERE email = 'duy.pham@music.com'), 'Prelude in C của Bach, tập đều mỗi tối 20 phút.', NOW(6) - INTERVAL 3 DAY - INTERVAL 13 HOUR - INTERVAL 0 MINUTE
UNION ALL
    SELECT 'seed-fp-9-3', 'seed-ft-9', (SELECT id FROM members WHERE email = 'user@music.com'), 'Mình mới tập *Für Elise*, đang ở đoạn B. Chúc mọi người tập vui!', NOW(6) - INTERVAL 2 DAY - INTERVAL 19 HOUR - INTERVAL 0 MINUTE
UNION ALL
    SELECT 'seed-fp-9-4', 'seed-ft-9', (SELECT id FROM members WHERE email = 'nam.do@music.com'), 'Mình đang tập *Diễm xưa*, chậm mà chắc.', NOW(6) - INTERVAL 1 DAY - INTERVAL 10 HOUR - INTERVAL 0 MINUTE;

-- Trả lời trực tiếp vào một bài (người được trả lời nhận thông báo riêng)
UPDATE forum_posts SET reply_to_id = 'seed-fp-1-1' WHERE id = 'seed-fp-1-3';
UPDATE forum_posts SET reply_to_id = 'seed-fp-3-4' WHERE id = 'seed-fp-3-5';
UPDATE forum_posts SET reply_to_id = 'seed-fp-3-1' WHERE id = 'seed-fp-3-3';
UPDATE forum_posts SET reply_to_id = 'seed-fp-6-1' WHERE id = 'seed-fp-6-2';
UPDATE forum_posts SET reply_to_id = 'seed-fp-7-1' WHERE id = 'seed-fp-7-3';

-- Câu trả lời hay nhất do người đặt chủ đề chọn
UPDATE forum_threads SET accepted_post_id = 'seed-fp-1-1' WHERE id = 'seed-ft-1';
UPDATE forum_threads SET accepted_post_id = 'seed-fp-4-1' WHERE id = 'seed-ft-4';
UPDATE forum_threads SET accepted_post_id = 'seed-fp-8-1' WHERE id = 'seed-ft-8';

-- Bình chọn cho chủ đề (không ai bình chọn chủ đề của chính mình)
INSERT IGNORE INTO forum_votes (id, member_id, thread_id, created_at)
    SELECT UUID(), (SELECT id FROM members WHERE email = 'huong.le@music.com'), 'seed-ft-1', NOW(6) - INTERVAL 1 DAY
UNION ALL
    SELECT UUID(), (SELECT id FROM members WHERE email = 'an.vo@music.com'), 'seed-ft-1', NOW(6) - INTERVAL 1 DAY
UNION ALL
    SELECT UUID(), (SELECT id FROM members WHERE email = 'lan.nguyen@music.com'), 'seed-ft-1', NOW(6) - INTERVAL 1 DAY
UNION ALL
    SELECT UUID(), (SELECT id FROM members WHERE email = 'duy.pham@music.com'), 'seed-ft-1', NOW(6) - INTERVAL 1 DAY
UNION ALL
    SELECT UUID(), (SELECT id FROM members WHERE email = 'trang.dang@music.com'), 'seed-ft-1', NOW(6) - INTERVAL 1 DAY
UNION ALL
    SELECT UUID(), (SELECT id FROM members WHERE email = 'lan.nguyen@music.com'), 'seed-ft-2', NOW(6) - INTERVAL 1 DAY
UNION ALL
    SELECT UUID(), (SELECT id FROM members WHERE email = 'duy.pham@music.com'), 'seed-ft-2', NOW(6) - INTERVAL 1 DAY
UNION ALL
    SELECT UUID(), (SELECT id FROM members WHERE email = 'mai.ngo@music.com'), 'seed-ft-2', NOW(6) - INTERVAL 1 DAY
UNION ALL
    SELECT UUID(), (SELECT id FROM members WHERE email = 'minh.tran@music.com'), 'seed-ft-3', NOW(6) - INTERVAL 1 DAY
UNION ALL
    SELECT UUID(), (SELECT id FROM members WHERE email = 'huong.le@music.com'), 'seed-ft-3', NOW(6) - INTERVAL 1 DAY
UNION ALL
    SELECT UUID(), (SELECT id FROM members WHERE email = 'an.vo@music.com'), 'seed-ft-3', NOW(6) - INTERVAL 1 DAY
UNION ALL
    SELECT UUID(), (SELECT id FROM members WHERE email = 'user@music.com'), 'seed-ft-3', NOW(6) - INTERVAL 1 DAY
UNION ALL
    SELECT UUID(), (SELECT id FROM members WHERE email = 'duy.pham@music.com'), 'seed-ft-3', NOW(6) - INTERVAL 1 DAY
UNION ALL
    SELECT UUID(), (SELECT id FROM members WHERE email = 'bao.hoang@music.com'), 'seed-ft-3', NOW(6) - INTERVAL 1 DAY
UNION ALL
    SELECT UUID(), (SELECT id FROM members WHERE email = 'trang.dang@music.com'), 'seed-ft-3', NOW(6) - INTERVAL 1 DAY
UNION ALL
    SELECT UUID(), (SELECT id FROM members WHERE email = 'huong.le@music.com'), 'seed-ft-4', NOW(6) - INTERVAL 1 DAY
UNION ALL
    SELECT UUID(), (SELECT id FROM members WHERE email = 'lan.nguyen@music.com'), 'seed-ft-4', NOW(6) - INTERVAL 1 DAY
UNION ALL
    SELECT UUID(), (SELECT id FROM members WHERE email = 'minh.tran@music.com'), 'seed-ft-4', NOW(6) - INTERVAL 1 DAY
UNION ALL
    SELECT UUID(), (SELECT id FROM members WHERE email = 'nam.do@music.com'), 'seed-ft-4', NOW(6) - INTERVAL 1 DAY
UNION ALL
    SELECT UUID(), (SELECT id FROM members WHERE email = 'lan.nguyen@music.com'), 'seed-ft-5', NOW(6) - INTERVAL 1 DAY
UNION ALL
    SELECT UUID(), (SELECT id FROM members WHERE email = 'bao.hoang@music.com'), 'seed-ft-5', NOW(6) - INTERVAL 1 DAY
UNION ALL
    SELECT UUID(), (SELECT id FROM members WHERE email = 'an.vo@music.com'), 'seed-ft-5', NOW(6) - INTERVAL 1 DAY
UNION ALL
    SELECT UUID(), (SELECT id FROM members WHERE email = 'duy.pham@music.com'), 'seed-ft-6', NOW(6) - INTERVAL 1 DAY
UNION ALL
    SELECT UUID(), (SELECT id FROM members WHERE email = 'an.vo@music.com'), 'seed-ft-6', NOW(6) - INTERVAL 1 DAY
UNION ALL
    SELECT UUID(), (SELECT id FROM members WHERE email = 'user@music.com'), 'seed-ft-6', NOW(6) - INTERVAL 1 DAY
UNION ALL
    SELECT UUID(), (SELECT id FROM members WHERE email = 'minh.tran@music.com'), 'seed-ft-7', NOW(6) - INTERVAL 1 DAY
UNION ALL
    SELECT UUID(), (SELECT id FROM members WHERE email = 'lan.nguyen@music.com'), 'seed-ft-7', NOW(6) - INTERVAL 1 DAY
UNION ALL
    SELECT UUID(), (SELECT id FROM members WHERE email = 'huong.le@music.com'), 'seed-ft-7', NOW(6) - INTERVAL 1 DAY
UNION ALL
    SELECT UUID(), (SELECT id FROM members WHERE email = 'duy.pham@music.com'), 'seed-ft-7', NOW(6) - INTERVAL 1 DAY
UNION ALL
    SELECT UUID(), (SELECT id FROM members WHERE email = 'bao.hoang@music.com'), 'seed-ft-7', NOW(6) - INTERVAL 1 DAY
UNION ALL
    SELECT UUID(), (SELECT id FROM members WHERE email = 'user@music.com'), 'seed-ft-7', NOW(6) - INTERVAL 1 DAY
UNION ALL
    SELECT UUID(), (SELECT id FROM members WHERE email = 'trang.dang@music.com'), 'seed-ft-7', NOW(6) - INTERVAL 1 DAY
UNION ALL
    SELECT UUID(), (SELECT id FROM members WHERE email = 'mai.ngo@music.com'), 'seed-ft-7', NOW(6) - INTERVAL 1 DAY
UNION ALL
    SELECT UUID(), (SELECT id FROM members WHERE email = 'trang.dang@music.com'), 'seed-ft-8', NOW(6) - INTERVAL 1 DAY
UNION ALL
    SELECT UUID(), (SELECT id FROM members WHERE email = 'minh.tran@music.com'), 'seed-ft-8', NOW(6) - INTERVAL 1 DAY
UNION ALL
    SELECT UUID(), (SELECT id FROM members WHERE email = 'minh.tran@music.com'), 'seed-ft-9', NOW(6) - INTERVAL 1 DAY
UNION ALL
    SELECT UUID(), (SELECT id FROM members WHERE email = 'duy.pham@music.com'), 'seed-ft-9', NOW(6) - INTERVAL 1 DAY
UNION ALL
    SELECT UUID(), (SELECT id FROM members WHERE email = 'user@music.com'), 'seed-ft-9', NOW(6) - INTERVAL 1 DAY
UNION ALL
    SELECT UUID(), (SELECT id FROM members WHERE email = 'nam.do@music.com'), 'seed-ft-9', NOW(6) - INTERVAL 1 DAY
UNION ALL
    SELECT UUID(), (SELECT id FROM members WHERE email = 'lan.nguyen@music.com'), 'seed-ft-9', NOW(6) - INTERVAL 1 DAY;

-- Bình chọn cho vài câu trả lời tiêu biểu
INSERT IGNORE INTO forum_votes (id, member_id, post_id, created_at)
    SELECT UUID(), (SELECT id FROM members WHERE email = 'minh.tran@music.com'), 'seed-fp-1-1', NOW(6) - INTERVAL 1 DAY
UNION ALL
    SELECT UUID(), (SELECT id FROM members WHERE email = 'an.vo@music.com'), 'seed-fp-1-1', NOW(6) - INTERVAL 1 DAY
UNION ALL
    SELECT UUID(), (SELECT id FROM members WHERE email = 'duy.pham@music.com'), 'seed-fp-1-1', NOW(6) - INTERVAL 1 DAY
UNION ALL
    SELECT UUID(), (SELECT id FROM members WHERE email = 'lan.nguyen@music.com'), 'seed-fp-1-1', NOW(6) - INTERVAL 1 DAY
UNION ALL
    SELECT UUID(), (SELECT id FROM members WHERE email = 'minh.tran@music.com'), 'seed-fp-1-2', NOW(6) - INTERVAL 1 DAY
UNION ALL
    SELECT UUID(), (SELECT id FROM members WHERE email = 'huong.le@music.com'), 'seed-fp-1-2', NOW(6) - INTERVAL 1 DAY
UNION ALL
    SELECT UUID(), (SELECT id FROM members WHERE email = 'lan.nguyen@music.com'), 'seed-fp-3-1', NOW(6) - INTERVAL 1 DAY
UNION ALL
    SELECT UUID(), (SELECT id FROM members WHERE email = 'huong.le@music.com'), 'seed-fp-3-1', NOW(6) - INTERVAL 1 DAY
UNION ALL
    SELECT UUID(), (SELECT id FROM members WHERE email = 'an.vo@music.com'), 'seed-fp-3-1', NOW(6) - INTERVAL 1 DAY
UNION ALL
    SELECT UUID(), (SELECT id FROM members WHERE email = 'lan.nguyen@music.com'), 'seed-fp-3-2', NOW(6) - INTERVAL 1 DAY
UNION ALL
    SELECT UUID(), (SELECT id FROM members WHERE email = 'minh.tran@music.com'), 'seed-fp-3-2', NOW(6) - INTERVAL 1 DAY
UNION ALL
    SELECT UUID(), (SELECT id FROM members WHERE email = 'user@music.com'), 'seed-fp-3-2', NOW(6) - INTERVAL 1 DAY
UNION ALL
    SELECT UUID(), (SELECT id FROM members WHERE email = 'duy.pham@music.com'), 'seed-fp-4-1', NOW(6) - INTERVAL 1 DAY
UNION ALL
    SELECT UUID(), (SELECT id FROM members WHERE email = 'lan.nguyen@music.com'), 'seed-fp-4-1', NOW(6) - INTERVAL 1 DAY
UNION ALL
    SELECT UUID(), (SELECT id FROM members WHERE email = 'minh.tran@music.com'), 'seed-fp-4-1', NOW(6) - INTERVAL 1 DAY
UNION ALL
    SELECT UUID(), (SELECT id FROM members WHERE email = 'nam.do@music.com'), 'seed-fp-4-1', NOW(6) - INTERVAL 1 DAY
UNION ALL
    SELECT UUID(), (SELECT id FROM members WHERE email = 'user@music.com'), 'seed-fp-4-1', NOW(6) - INTERVAL 1 DAY
UNION ALL
    SELECT UUID(), (SELECT id FROM members WHERE email = 'an.vo@music.com'), 'seed-fp-7-2', NOW(6) - INTERVAL 1 DAY
UNION ALL
    SELECT UUID(), (SELECT id FROM members WHERE email = 'minh.tran@music.com'), 'seed-fp-7-2', NOW(6) - INTERVAL 1 DAY
UNION ALL
    SELECT UUID(), (SELECT id FROM members WHERE email = 'user@music.com'), 'seed-fp-2-1', NOW(6) - INTERVAL 1 DAY
UNION ALL
    SELECT UUID(), (SELECT id FROM members WHERE email = 'duy.pham@music.com'), 'seed-fp-2-1', NOW(6) - INTERVAL 1 DAY;

-- Theo dõi: người đặt chủ đề, người đã trả lời và vài người theo dõi thêm
INSERT IGNORE INTO forum_subscriptions (id, thread_id, member_id, created_at)
    SELECT UUID(), 'seed-ft-1', (SELECT id FROM members WHERE email = 'an.vo@music.com'), NOW(6) - INTERVAL 9 DAY - INTERVAL 3 HOUR - INTERVAL 10 MINUTE
UNION ALL
    SELECT UUID(), 'seed-ft-1', (SELECT id FROM members WHERE email = 'huong.le@music.com'), NOW(6) - INTERVAL 9 DAY - INTERVAL 3 HOUR - INTERVAL 10 MINUTE
UNION ALL
    SELECT UUID(), 'seed-ft-1', (SELECT id FROM members WHERE email = 'minh.tran@music.com'), NOW(6) - INTERVAL 9 DAY - INTERVAL 3 HOUR - INTERVAL 10 MINUTE
UNION ALL
    SELECT UUID(), 'seed-ft-2', (SELECT id FROM members WHERE email = 'duy.pham@music.com'), NOW(6) - INTERVAL 6 DAY - INTERVAL 5 HOUR - INTERVAL 0 MINUTE
UNION ALL
    SELECT UUID(), 'seed-ft-2', (SELECT id FROM members WHERE email = 'lan.nguyen@music.com'), NOW(6) - INTERVAL 6 DAY - INTERVAL 5 HOUR - INTERVAL 0 MINUTE
UNION ALL
    SELECT UUID(), 'seed-ft-2', (SELECT id FROM members WHERE email = 'user@music.com'), NOW(6) - INTERVAL 6 DAY - INTERVAL 5 HOUR - INTERVAL 0 MINUTE
UNION ALL
    SELECT UUID(), 'seed-ft-3', (SELECT id FROM members WHERE email = 'an.vo@music.com'), NOW(6) - INTERVAL 14 DAY - INTERVAL 2 HOUR - INTERVAL 0 MINUTE
UNION ALL
    SELECT UUID(), 'seed-ft-3', (SELECT id FROM members WHERE email = 'huong.le@music.com'), NOW(6) - INTERVAL 14 DAY - INTERVAL 2 HOUR - INTERVAL 0 MINUTE
UNION ALL
    SELECT UUID(), 'seed-ft-3', (SELECT id FROM members WHERE email = 'lan.nguyen@music.com'), NOW(6) - INTERVAL 14 DAY - INTERVAL 2 HOUR - INTERVAL 0 MINUTE
UNION ALL
    SELECT UUID(), 'seed-ft-3', (SELECT id FROM members WHERE email = 'minh.tran@music.com'), NOW(6) - INTERVAL 14 DAY - INTERVAL 2 HOUR - INTERVAL 0 MINUTE
UNION ALL
    SELECT UUID(), 'seed-ft-3', (SELECT id FROM members WHERE email = 'user@music.com'), NOW(6) - INTERVAL 14 DAY - INTERVAL 2 HOUR - INTERVAL 0 MINUTE
UNION ALL
    SELECT UUID(), 'seed-ft-4', (SELECT id FROM members WHERE email = 'duy.pham@music.com'), NOW(6) - INTERVAL 11 DAY - INTERVAL 4 HOUR - INTERVAL 0 MINUTE
UNION ALL
    SELECT UUID(), 'seed-ft-4', (SELECT id FROM members WHERE email = 'huong.le@music.com'), NOW(6) - INTERVAL 11 DAY - INTERVAL 4 HOUR - INTERVAL 0 MINUTE
UNION ALL
    SELECT UUID(), 'seed-ft-4', (SELECT id FROM members WHERE email = 'lan.nguyen@music.com'), NOW(6) - INTERVAL 11 DAY - INTERVAL 4 HOUR - INTERVAL 0 MINUTE
UNION ALL
    SELECT UUID(), 'seed-ft-5', (SELECT id FROM members WHERE email = 'an.vo@music.com'), NOW(6) - INTERVAL 16 DAY - INTERVAL 6 HOUR - INTERVAL 0 MINUTE
UNION ALL
    SELECT UUID(), 'seed-ft-5', (SELECT id FROM members WHERE email = 'bao.hoang@music.com'), NOW(6) - INTERVAL 16 DAY - INTERVAL 6 HOUR - INTERVAL 0 MINUTE
UNION ALL
    SELECT UUID(), 'seed-ft-5', (SELECT id FROM members WHERE email = 'huong.le@music.com'), NOW(6) - INTERVAL 16 DAY - INTERVAL 6 HOUR - INTERVAL 0 MINUTE
UNION ALL
    SELECT UUID(), 'seed-ft-5', (SELECT id FROM members WHERE email = 'lan.nguyen@music.com'), NOW(6) - INTERVAL 16 DAY - INTERVAL 6 HOUR - INTERVAL 0 MINUTE
UNION ALL
    SELECT UUID(), 'seed-ft-6', (SELECT id FROM members WHERE email = 'an.vo@music.com'), NOW(6) - INTERVAL 5 DAY - INTERVAL 7 HOUR - INTERVAL 0 MINUTE
UNION ALL
    SELECT UUID(), 'seed-ft-6', (SELECT id FROM members WHERE email = 'duy.pham@music.com'), NOW(6) - INTERVAL 5 DAY - INTERVAL 7 HOUR - INTERVAL 0 MINUTE
UNION ALL
    SELECT UUID(), 'seed-ft-6', (SELECT id FROM members WHERE email = 'nam.do@music.com'), NOW(6) - INTERVAL 5 DAY - INTERVAL 7 HOUR - INTERVAL 0 MINUTE
UNION ALL
    SELECT UUID(), 'seed-ft-7', (SELECT id FROM members WHERE email = 'an.vo@music.com'), NOW(6) - INTERVAL 12 DAY - INTERVAL 5 HOUR - INTERVAL 0 MINUTE
UNION ALL
    SELECT UUID(), 'seed-ft-7', (SELECT id FROM members WHERE email = 'huong.le@music.com'), NOW(6) - INTERVAL 12 DAY - INTERVAL 5 HOUR - INTERVAL 0 MINUTE
UNION ALL
    SELECT UUID(), 'seed-ft-7', (SELECT id FROM members WHERE email = 'lan.nguyen@music.com'), NOW(6) - INTERVAL 12 DAY - INTERVAL 5 HOUR - INTERVAL 0 MINUTE
UNION ALL
    SELECT UUID(), 'seed-ft-7', (SELECT id FROM members WHERE email = 'minh.tran@music.com'), NOW(6) - INTERVAL 12 DAY - INTERVAL 5 HOUR - INTERVAL 0 MINUTE
UNION ALL
    SELECT UUID(), 'seed-ft-8', (SELECT id FROM members WHERE email = 'bao.hoang@music.com'), NOW(6) - INTERVAL 8 DAY - INTERVAL 6 HOUR - INTERVAL 0 MINUTE
UNION ALL
    SELECT UUID(), 'seed-ft-8', (SELECT id FROM members WHERE email = 'trang.dang@music.com'), NOW(6) - INTERVAL 8 DAY - INTERVAL 6 HOUR - INTERVAL 0 MINUTE
UNION ALL
    SELECT UUID(), 'seed-ft-9', (SELECT id FROM members WHERE email = 'duy.pham@music.com'), NOW(6) - INTERVAL 4 DAY - INTERVAL 3 HOUR - INTERVAL 0 MINUTE
UNION ALL
    SELECT UUID(), 'seed-ft-9', (SELECT id FROM members WHERE email = 'minh.tran@music.com'), NOW(6) - INTERVAL 4 DAY - INTERVAL 3 HOUR - INTERVAL 0 MINUTE
UNION ALL
    SELECT UUID(), 'seed-ft-9', (SELECT id FROM members WHERE email = 'nam.do@music.com'), NOW(6) - INTERVAL 4 DAY - INTERVAL 3 HOUR - INTERVAL 0 MINUTE
UNION ALL
    SELECT UUID(), 'seed-ft-9', (SELECT id FROM members WHERE email = 'trang.dang@music.com'), NOW(6) - INTERVAL 4 DAY - INTERVAL 3 HOUR - INTERVAL 0 MINUTE
UNION ALL
    SELECT UUID(), 'seed-ft-9', (SELECT id FROM members WHERE email = 'user@music.com'), NOW(6) - INTERVAL 4 DAY - INTERVAL 3 HOUR - INTERVAL 0 MINUTE
UNION ALL
    SELECT UUID(), 'seed-ft-10', (SELECT id FROM members WHERE email = 'khoa.bui@music.com'), NOW(6) - INTERVAL 1 DAY - INTERVAL 2 HOUR - INTERVAL 0 MINUTE;

-- Báo cáo đang chờ để thử hàng chờ admin: chủ đề spam (2 người báo cáo) và một câu trả lời
INSERT IGNORE INTO content_reports (id, target_type, forum_thread_id, reporter_id, reason, details, status, created_at) VALUES
    ('seed-report-ft-1', 'FORUM_THREAD', 'seed-ft-10', (SELECT id FROM members WHERE email = 'lan.nguyen@music.com'), 'SPAM', 'Quảng cáo kiếm tiền, không liên quan âm nhạc.', 'PENDING', NOW(6) - INTERVAL 20 HOUR),
    ('seed-report-ft-2', 'FORUM_THREAD', 'seed-ft-10', (SELECT id FROM members WHERE email = 'huong.le@music.com'), 'SPAM', NULL, 'PENDING', NOW(6) - INTERVAL 18 HOUR);
INSERT IGNORE INTO content_reports (id, target_type, forum_thread_id, forum_post_id, reporter_id, reason, details, status, created_at) VALUES
    ('seed-report-fp-1', 'FORUM_POST', 'seed-ft-6', 'seed-fp-6-2', (SELECT id FROM members WHERE email = 'mai.ngo@music.com'), 'OTHER', 'Bài này lạc đề so với câu hỏi của bạn đăng chủ đề.', 'PENDING', NOW(6) - INTERVAL 5 HOUR);

-- Thông báo mẫu cho user@music.com (chưa đọc): bấm vào mở đúng chủ đề và nhảy tới bài trả lời
INSERT IGNORE INTO notifications (id, recipient_id, type, message, params, is_read, created_at)
    SELECT UUID(), (SELECT id FROM members WHERE email = 'user@music.com'), 'FORUM_REPLY', 'Nguyễn Thị Lan đã trả lời trong “Khác nhau giữa nhập MusicXML và số hóa từ ảnh là gì?”: “Nếu đã có file MusicXML (xuất từ MuseScore, Finale...) thì nhập file là chuẩn nhất: không mất nốt nào.”', '{"name": "Nguyễn Thị Lan", "title": "Khác nhau giữa nhập MusicXML và số hóa từ ảnh là gì?", "threadId": "seed-ft-2", "postId": "seed-fp-2-1", "excerpt": "Nếu đã có file MusicXML (xuất từ MuseScore, Finale...) thì nhập file là chuẩn nhất: không mất nốt nào."}', 0, NOW(6) - INTERVAL 120 HOUR
UNION ALL
    SELECT UUID(), (SELECT id FROM members WHERE email = 'user@music.com'), 'FORUM_POST_REPLY', 'Trần Quang Minh đã trả lời bình luận của bạn trong “Mẹo tập đoạn arpeggio tay trái trong Moonlight Sonata”: “Rất vui vì bản ghi chú giúp được bạn, chúc bạn tập tốt nhé!”', '{"name": "Trần Quang Minh", "title": "Mẹo tập đoạn arpeggio tay trái trong Moonlight Sonata", "threadId": "seed-ft-3", "postId": "seed-fp-3-5", "excerpt": "Rất vui vì bản ghi chú giúp được bạn, chúc bạn tập tốt nhé!"}', 0, NOW(6) - INTERVAL 44 HOUR;

-- ---------------------------------------------------------------------------------------------------- diễn đàn của SUPER_ADMIN
-- admin@music.com đặt chủ đề 11 (xin ý kiến cho kho mẫu, đang mở) và trả lời chủ đề 7 bằng câu được chọn là hay nhất.
-- Chủ đề ghim duy nhất là 12 (nội quy, không có trả lời, hoạt động cũ nhất): AdminForumFlowTest ghim seed-ft-9 rồi kiểm tra
-- nó đứng đầu danh sách, mà giữa các chủ đề ghim thì chủ đề có hoạt động mới hơn đứng trước. Không ẩn bài nào trong chủ đề
-- 1 (test đếm bài ẩn ở đó).
INSERT IGNORE INTO forum_threads (id, category_id, author_id, score_id, title, body, created_at)
    SELECT 'seed-ft-11', (SELECT id FROM forum_categories WHERE slug = 'gop-y-ung-dung'), (SELECT id FROM members WHERE email = 'admin@music.com'), NULL, 'Bạn muốn kho bản nhạc mẫu có thêm bài gì?', 'Kho bản nhạc mẫu hiện có vài bài **cho người mới** (Twinkle, Happy Birthday, bản giản lược của Ode to Joy và Für Elise).

Ban quản trị đang soạn đợt tiếp theo. Mọi người góp ý giúp:
- Bài muốn có (ghi rõ tác giả nếu được)
- Mức độ: dễ, trung bình hay khó
- Cần bản piano solo, hợp xướng hay lead sheet

Bản nào đủ điều kiện sẽ được xin phép chủ bản rồi đưa vào kho.', NOW(6) - INTERVAL 3 DAY - INTERVAL 2 HOUR;

INSERT IGNORE INTO forum_posts (id, thread_id, author_id, body, created_at)
    SELECT 'seed-fp-11-1', 'seed-ft-11', (SELECT id FROM members WHERE email = 'huong.le@music.com'), 'Mình mong có thêm **nhạc Việt** bản piano dễ, ví dụ *Diễm xưa* hay *Mùa xuân đầu tiên*, để dạy học viên nhỏ.', NOW(6) - INTERVAL 2 DAY - INTERVAL 20 HOUR
UNION ALL
    SELECT 'seed-fp-11-2', 'seed-ft-11', (SELECT id FROM members WHERE email = 'bao.hoang@music.com'), 'Cho mình xin vài bản **hợp xướng 4 bè** mức trung bình, nhóm mình tập Giáng sinh mà khó tìm bản sạch.', NOW(6) - INTERVAL 2 DAY - INTERVAL 6 HOUR
UNION ALL
    SELECT 'seed-fp-11-3', 'seed-ft-11', (SELECT id FROM members WHERE email = 'admin@music.com'), 'Cảm ơn bạn! *Mùa xuân đầu tiên* đã có bản công khai, ban quản trị sẽ xin phép tác giả bản đó trong tuần này.', NOW(6) - INTERVAL 1 DAY - INTERVAL 9 HOUR
UNION ALL
    SELECT 'seed-fp-7-4', 'seed-ft-7', (SELECT id FROM members WHERE email = 'admin@music.com'), 'Tính năng này đã có: trong Luyện tập chọn chế độ **Lặp đoạn**, nhập ô bắt đầu và ô kết thúc. Tốc độ chỉnh ở thanh tempo (50% đến 100%) ngay trên trình phát.', NOW(6) - INTERVAL 9 DAY - INTERVAL 4 HOUR;

INSERT IGNORE INTO forum_posts (id, thread_id, author_id, body, created_at)
    SELECT 'seed-fp-11-4', 'seed-ft-11', (SELECT id FROM members WHERE email = 'user@music.com'), 'Tuyệt quá! Khi nào có bản *Mùa xuân đầu tiên* trong kho thì mình tập ngay.', NOW(6) - INTERVAL 20 HOUR;

UPDATE forum_posts SET reply_to_id = 'seed-fp-11-1' WHERE id = 'seed-fp-11-3';
UPDATE forum_posts SET reply_to_id = 'seed-fp-11-3' WHERE id = 'seed-fp-11-4';
UPDATE forum_threads SET accepted_post_id = 'seed-fp-7-4' WHERE id = 'seed-ft-7';

INSERT IGNORE INTO forum_votes (id, member_id, thread_id, created_at)
    SELECT UUID(), (SELECT id FROM members WHERE email = 'huong.le@music.com'), 'seed-ft-11', NOW(6) - INTERVAL 1 DAY
UNION ALL
    SELECT UUID(), (SELECT id FROM members WHERE email = 'bao.hoang@music.com'), 'seed-ft-11', NOW(6) - INTERVAL 1 DAY
UNION ALL
    SELECT UUID(), (SELECT id FROM members WHERE email = 'user@music.com'), 'seed-ft-11', NOW(6) - INTERVAL 1 DAY
UNION ALL
    SELECT UUID(), (SELECT id FROM members WHERE email = 'admin@music.com'), 'seed-ft-8', NOW(6) - INTERVAL 1 DAY;

INSERT IGNORE INTO forum_votes (id, member_id, post_id, created_at)
    SELECT UUID(), (SELECT id FROM members WHERE email = 'an.vo@music.com'), 'seed-fp-7-4', NOW(6) - INTERVAL 1 DAY
UNION ALL
    SELECT UUID(), (SELECT id FROM members WHERE email = 'huong.le@music.com'), 'seed-fp-7-4', NOW(6) - INTERVAL 1 DAY
UNION ALL
    SELECT UUID(), (SELECT id FROM members WHERE email = 'admin@music.com'), 'seed-fp-11-2', NOW(6) - INTERVAL 1 DAY;

INSERT IGNORE INTO forum_subscriptions (id, thread_id, member_id, created_at)
    SELECT UUID(), 'seed-ft-11', (SELECT id FROM members WHERE email = 'admin@music.com'), NOW(6) - INTERVAL 3 DAY - INTERVAL 2 HOUR
UNION ALL
    SELECT UUID(), 'seed-ft-11', (SELECT id FROM members WHERE email = 'huong.le@music.com'), NOW(6) - INTERVAL 2 DAY - INTERVAL 20 HOUR
UNION ALL
    SELECT UUID(), 'seed-ft-11', (SELECT id FROM members WHERE email = 'bao.hoang@music.com'), NOW(6) - INTERVAL 2 DAY - INTERVAL 6 HOUR
UNION ALL
    SELECT UUID(), 'seed-ft-11', (SELECT id FROM members WHERE email = 'user@music.com'), NOW(6) - INTERVAL 20 HOUR
UNION ALL
    SELECT UUID(), 'seed-ft-7', (SELECT id FROM members WHERE email = 'admin@music.com'), NOW(6) - INTERVAL 9 DAY - INTERVAL 4 HOUR;

-- Thông báo cho admin@music.com: có người trả lời chủ đề 11, câu trả lời ở chủ đề 7 được chọn là hay nhất
INSERT IGNORE INTO notifications (id, recipient_id, type, message, params, is_read, created_at)
    SELECT UUID(), (SELECT id FROM members WHERE email = 'admin@music.com'), 'FORUM_REPLY', 'Hoàng Gia Bảo đã trả lời trong “Bạn muốn kho bản nhạc mẫu có thêm bài gì?”: “Cho mình xin vài bản hợp xướng 4 bè mức trung bình, nhóm mình tập Giáng sinh mà khó tìm bản sạch.”', '{"name": "Hoàng Gia Bảo", "title": "Bạn muốn kho bản nhạc mẫu có thêm bài gì?", "threadId": "seed-ft-11", "postId": "seed-fp-11-2", "excerpt": "Cho mình xin vài bản hợp xướng 4 bè mức trung bình, nhóm mình tập Giáng sinh mà khó tìm bản sạch."}', 0, NOW(6) - INTERVAL 2 DAY - INTERVAL 6 HOUR
UNION ALL
    SELECT UUID(), (SELECT id FROM members WHERE email = 'admin@music.com'), 'FORUM_ANSWER_ACCEPTED', 'Võ Hoài An đã chọn câu trả lời của bạn là hay nhất trong “Mong có chế độ lặp một đoạn khi luyện tập”', '{"name": "Võ Hoài An", "title": "Mong có chế độ lặp một đoạn khi luyện tập", "threadId": "seed-ft-7", "postId": "seed-fp-7-4"}', 1, NOW(6) - INTERVAL 8 DAY
UNION ALL
    SELECT UUID(), (SELECT id FROM members WHERE email = 'admin@music.com'), 'FORUM_POST_REPLY', 'Demo User đã trả lời bình luận của bạn trong “Bạn muốn kho bản nhạc mẫu có thêm bài gì?”: “Tuyệt quá! Khi nào có bản Mùa xuân đầu tiên trong kho thì mình tập ngay.”', '{"name": "Demo User", "title": "Bạn muốn kho bản nhạc mẫu có thêm bài gì?", "threadId": "seed-ft-11", "postId": "seed-fp-11-4", "excerpt": "Tuyệt quá! Khi nào có bản Mùa xuân đầu tiên trong kho thì mình tập ngay."}', 0, NOW(6) - INTERVAL 20 HOUR;

-- Chủ đề 14: admin@ dùng diễn đàn như thành viên. Gắn bản nhạc công khai của mình, sửa lại nội dung, tự chọn câu trả
-- lời hay nhất (của lan.nguyen), trả lời trực tiếp một bài và sửa câu trả lời đó.
INSERT IGNORE INTO forum_threads (id, category_id, author_id, score_id, title, body, created_at, edited_at)
    SELECT 'seed-ft-14', (SELECT id FROM forum_categories WHERE slug = 'chia-se-ban-nhac'), (SELECT id FROM members WHERE email = 'admin@music.com'), (SELECT id FROM scores WHERE title = 'Invention No. 1 (BWV 772)' LIMIT 1), 'Xin góp ý ngón tay cho Invention No. 1 (Bach)', 'Mình vừa số hóa *Invention No. 1* và để công khai (đính kèm bên dưới).

Đoạn **ô 3-6** hai bè đuổi nhau, tay trái mình hay vấp khi chuyển thế. Mọi người bấm ngón thế nào cho đoạn này?

*Sửa: đã thêm số ô nhịp cho dễ theo dõi.*', NOW(6) - INTERVAL 16 DAY, NOW(6) - INTERVAL 15 DAY - INTERVAL 22 HOUR;

INSERT IGNORE INTO forum_posts (id, thread_id, author_id, body, created_at, edited_at)
    SELECT 'seed-fp-14-1', 'seed-ft-14', (SELECT id FROM members WHERE email = 'duy.pham@music.com'), 'Tay trái ô 3 mình bấm **5-4-3-2-1** rồi luồn ngón 3 qua, không phải nhấc tay.', NOW(6) - INTERVAL 15 DAY - INTERVAL 10 HOUR, NULL
UNION ALL
    SELECT 'seed-fp-14-2', 'seed-ft-14', (SELECT id FROM members WHERE email = 'lan.nguyen@music.com'), 'Tập riêng bè trái ở 60% tốc độ, dùng chế độ **Lặp đoạn** ô 3-6. Ngón: 1-2-3-4 ở nhịp 1, chuyển ngón 1 sang nốt Sol ở nhịp 3. Sau 3 ngày ghép hai tay sẽ đỡ vấp hẳn.', NOW(6) - INTERVAL 15 DAY - INTERVAL 4 HOUR, NULL
UNION ALL
    SELECT 'seed-fp-14-3', 'seed-ft-14', (SELECT id FROM members WHERE email = 'admin@music.com'), 'Cảm ơn cô Lan, tập theo cách này hai hôm là trôi rồi. Mình đã ghi ngón vào ghi chú học tập của bản nhạc.', NOW(6) - INTERVAL 14 DAY - INTERVAL 20 HOUR, NOW(6) - INTERVAL 14 DAY - INTERVAL 19 HOUR;

UPDATE forum_posts SET reply_to_id = 'seed-fp-14-2' WHERE id = 'seed-fp-14-3';
UPDATE forum_threads SET accepted_post_id = 'seed-fp-14-2' WHERE id = 'seed-ft-14';

INSERT IGNORE INTO forum_votes (id, member_id, thread_id, created_at)
    SELECT UUID(), (SELECT id FROM members WHERE email = 'duy.pham@music.com'), 'seed-ft-14', NOW(6) - INTERVAL 15 DAY - INTERVAL 10 HOUR
UNION ALL
    SELECT UUID(), (SELECT id FROM members WHERE email = 'minh.tran@music.com'), 'seed-ft-14', NOW(6) - INTERVAL 15 DAY
UNION ALL
    SELECT UUID(), (SELECT id FROM members WHERE email = 'admin@music.com'), 'seed-ft-5', NOW(6) - INTERVAL 14 DAY;

INSERT IGNORE INTO forum_votes (id, member_id, post_id, created_at)
    SELECT UUID(), (SELECT id FROM members WHERE email = 'admin@music.com'), 'seed-fp-14-1', NOW(6) - INTERVAL 15 DAY - INTERVAL 9 HOUR
UNION ALL
    SELECT UUID(), (SELECT id FROM members WHERE email = 'admin@music.com'), 'seed-fp-14-2', NOW(6) - INTERVAL 14 DAY - INTERVAL 20 HOUR
UNION ALL
    SELECT UUID(), (SELECT id FROM members WHERE email = 'huong.le@music.com'), 'seed-fp-14-2', NOW(6) - INTERVAL 14 DAY;

-- Theo dõi: người đặt chủ đề, người trả lời; admin@ theo dõi chủ đề 5 mà không trả lời
INSERT IGNORE INTO forum_subscriptions (id, thread_id, member_id, created_at)
    SELECT UUID(), 'seed-ft-14', (SELECT id FROM members WHERE email = 'admin@music.com'), NOW(6) - INTERVAL 16 DAY
UNION ALL
    SELECT UUID(), 'seed-ft-14', (SELECT id FROM members WHERE email = 'duy.pham@music.com'), NOW(6) - INTERVAL 15 DAY - INTERVAL 10 HOUR
UNION ALL
    SELECT UUID(), 'seed-ft-14', (SELECT id FROM members WHERE email = 'lan.nguyen@music.com'), NOW(6) - INTERVAL 15 DAY - INTERVAL 4 HOUR
UNION ALL
    SELECT UUID(), 'seed-ft-5', (SELECT id FROM members WHERE email = 'admin@music.com'), NOW(6) - INTERVAL 14 DAY;

-- Thông báo của chủ đề 14 (đã đọc): admin@ nhận trả lời; lan.nguyen được chọn hay nhất và được admin@ trả lời trực tiếp
INSERT IGNORE INTO notifications (id, recipient_id, type, message, params, is_read, created_at)
    SELECT UUID(), (SELECT id FROM members WHERE email = 'admin@music.com'), 'FORUM_REPLY', 'Phạm Khánh Duy đã trả lời trong “Xin góp ý ngón tay cho Invention No. 1 (Bach)”: “Tay trái ô 3 mình bấm 5-4-3-2-1 rồi luồn ngón 3 qua, không phải nhấc tay.”', '{"name": "Phạm Khánh Duy", "title": "Xin góp ý ngón tay cho Invention No. 1 (Bach)", "threadId": "seed-ft-14", "postId": "seed-fp-14-1", "excerpt": "Tay trái ô 3 mình bấm 5-4-3-2-1 rồi luồn ngón 3 qua, không phải nhấc tay."}', 1, NOW(6) - INTERVAL 15 DAY - INTERVAL 10 HOUR
UNION ALL
    SELECT UUID(), (SELECT id FROM members WHERE email = 'admin@music.com'), 'FORUM_REPLY', 'Nguyễn Thị Lan đã trả lời trong “Xin góp ý ngón tay cho Invention No. 1 (Bach)”: “Tập riêng bè trái ở 60% tốc độ, dùng chế độ Lặp đoạn ô 3-6.”', '{"name": "Nguyễn Thị Lan", "title": "Xin góp ý ngón tay cho Invention No. 1 (Bach)", "threadId": "seed-ft-14", "postId": "seed-fp-14-2", "excerpt": "Tập riêng bè trái ở 60% tốc độ, dùng chế độ Lặp đoạn ô 3-6."}', 1, NOW(6) - INTERVAL 15 DAY - INTERVAL 4 HOUR
UNION ALL
    SELECT UUID(), (SELECT id FROM members WHERE email = 'lan.nguyen@music.com'), 'FORUM_ANSWER_ACCEPTED', 'Super Admin đã chọn câu trả lời của bạn là hay nhất trong “Xin góp ý ngón tay cho Invention No. 1 (Bach)”', '{"name": "Super Admin", "title": "Xin góp ý ngón tay cho Invention No. 1 (Bach)", "threadId": "seed-ft-14", "postId": "seed-fp-14-2"}', 1, NOW(6) - INTERVAL 14 DAY - INTERVAL 20 HOUR
UNION ALL
    SELECT UUID(), (SELECT id FROM members WHERE email = 'lan.nguyen@music.com'), 'FORUM_POST_REPLY', 'Super Admin đã trả lời bình luận của bạn trong “Xin góp ý ngón tay cho Invention No. 1 (Bach)”: “Cảm ơn cô Lan, tập theo cách này hai hôm là trôi rồi.”', '{"name": "Super Admin", "title": "Xin góp ý ngón tay cho Invention No. 1 (Bach)", "threadId": "seed-ft-14", "postId": "seed-fp-14-3", "excerpt": "Cảm ơn cô Lan, tập theo cách này hai hôm là trôi rồi."}', 1, NOW(6) - INTERVAL 14 DAY - INTERVAL 20 HOUR;

-- ---------------------------------------------------------------------------------------------------- quản trị diễn đàn
-- Chủ đề 12: nội quy do admin@music.com đăng, ghim và khóa (chỉ đọc)
INSERT IGNORE INTO forum_threads (id, category_id, author_id, score_id, title, body, created_at, pinned_at, pinned_by, locked_at, locked_by)
    SELECT 'seed-ft-12', (SELECT id FROM forum_categories WHERE slug = 'hoi-dap'), (SELECT id FROM members WHERE email = 'admin@music.com'), NULL, 'Nội quy diễn đàn (đọc trước khi đăng bài)', 'Chào mừng bạn đến với diễn đàn! Vài quy tắc để mọi người trao đổi thoải mái:

1. **Đúng chuyên mục**: hỏi cách dùng ở *Hỏi đáp*, báo lỗi ở *Góp ý ứng dụng*.
2. **Tôn trọng bản quyền**: chỉ gắn bản nhạc công khai, không chia sẻ bản in còn bản quyền.
3. **Không quảng cáo, spam**: bài vi phạm sẽ bị ẩn, tái phạm có thể bị khóa tài khoản.
4. Câu hỏi đã được giải đáp thì **chọn câu trả lời hay nhất** để người sau dễ tìm.

Thấy bài vi phạm, bấm **Báo cáo** để ban quản trị xử lý.', NOW(6) - INTERVAL 70 DAY,
    NOW(6) - INTERVAL 70 DAY, (SELECT id FROM members WHERE email = 'admin@music.com'),
    NOW(6) - INTERVAL 70 DAY, (SELECT id FROM members WHERE email = 'admin@music.com');

INSERT IGNORE INTO forum_subscriptions (id, thread_id, member_id, created_at)
    SELECT UUID(), 'seed-ft-12', (SELECT id FROM members WHERE email = 'admin@music.com'), NOW(6) - INTERVAL 70 DAY;

INSERT IGNORE INTO forum_votes (id, member_id, thread_id, created_at)
    SELECT UUID(), (SELECT id FROM members WHERE email = 'lan.nguyen@music.com'), 'seed-ft-12', NOW(6) - INTERVAL 50 DAY
UNION ALL
    SELECT UUID(), (SELECT id FROM members WHERE email = 'minh.tran@music.com'), 'seed-ft-12', NOW(6) - INTERVAL 45 DAY;

-- Chủ đề 8 đã có đáp án: super admin khóa để không trả lời thêm
UPDATE forum_threads SET locked_at = NOW(6) - INTERVAL 5 DAY, locked_by = (SELECT id FROM members WHERE email = 'admin@music.com')
WHERE id = 'seed-ft-8';

-- Chủ đề 13 và bài seed-fp-4-3 là spam đã bị super admin ẩn sau báo cáo (khoa.bui, nay đã bị khóa tài khoản)
INSERT IGNORE INTO forum_threads (id, category_id, author_id, score_id, title, body, created_at, hidden_at, hidden_by)
    SELECT 'seed-ft-13', (SELECT id FROM forum_categories WHERE slug = 'tro-chuyen'), (SELECT id FROM members WHERE email = 'khoa.bui@music.com'), NULL, 'Bán khóa học piano cấp tốc giá rẻ', 'Khóa học piano 7 ngày chơi được mọi bài, giảm 90% hôm nay. Inbox để nhận link thanh toán!!!', NOW(6) - INTERVAL 6 DAY,
    NOW(6) - INTERVAL 5 DAY - INTERVAL 3 HOUR, (SELECT id FROM members WHERE email = 'admin@music.com');

INSERT IGNORE INTO forum_posts (id, thread_id, author_id, body, created_at, hidden_at, hidden_by)
    SELECT 'seed-fp-4-3', 'seed-ft-4', (SELECT id FROM members WHERE email = 'khoa.bui@music.com'), 'Tập chi cho mệt, mua khóa học cấp tốc của mình là chơi được ngay, inbox nhé!', NOW(6) - INTERVAL 7 DAY,
    NOW(6) - INTERVAL 6 DAY - INTERVAL 20 HOUR, (SELECT id FROM members WHERE email = 'admin@music.com');

-- Báo cáo super admin đã xử lý: ẩn chủ đề 13 (2 báo cáo đóng cùng lúc), ẩn bài seed-fp-4-3, bỏ qua báo cáo sai ở seed-fp-5-2
INSERT IGNORE INTO content_reports (id, target_type, forum_thread_id, forum_post_id, reporter_id, reason, details, status, action, resolution_note, resolved_by, resolved_at, created_at) VALUES
    ('seed-report-ft-3', 'FORUM_THREAD', 'seed-ft-13', NULL, (SELECT id FROM members WHERE email = 'trang.dang@music.com'), 'SPAM', 'Quảng cáo bán khóa học.', 'RESOLVED', 'HIDE', 'Quảng cáo, vi phạm nội quy mục 3.', (SELECT id FROM members WHERE email = 'admin@music.com'), NOW(6) - INTERVAL 5 DAY - INTERVAL 3 HOUR, NOW(6) - INTERVAL 5 DAY - INTERVAL 20 HOUR),
    ('seed-report-ft-4', 'FORUM_THREAD', 'seed-ft-13', NULL, (SELECT id FROM members WHERE email = 'duy.pham@music.com'), 'SPAM', NULL, 'RESOLVED', 'HIDE', 'Quảng cáo, vi phạm nội quy mục 3.', (SELECT id FROM members WHERE email = 'admin@music.com'), NOW(6) - INTERVAL 5 DAY - INTERVAL 3 HOUR, NOW(6) - INTERVAL 5 DAY - INTERVAL 9 HOUR),
    ('seed-report-fp-2', 'FORUM_POST', 'seed-ft-4', 'seed-fp-4-3', (SELECT id FROM members WHERE email = 'lan.nguyen@music.com'), 'SPAM', 'Bài quảng cáo, không liên quan câu hỏi.', 'RESOLVED', 'HIDE', NULL, (SELECT id FROM members WHERE email = 'admin@music.com'), NOW(6) - INTERVAL 6 DAY - INTERVAL 20 HOUR, NOW(6) - INTERVAL 6 DAY - INTERVAL 23 HOUR),
    ('seed-report-fp-3', 'FORUM_POST', 'seed-ft-5', 'seed-fp-5-2', (SELECT id FROM members WHERE email = 'nam.do@music.com'), 'OTHER', 'Bài này chỉ xin thêm bản nhạc, không góp ý gì.', 'DISMISSED', 'DISMISS', 'Bài hợp lệ: xin thêm bản nhạc là đúng chuyên mục Chia sẻ bản nhạc.', (SELECT id FROM members WHERE email = 'admin@music.com'), NOW(6) - INTERVAL 12 DAY, NOW(6) - INTERVAL 13 DAY);
