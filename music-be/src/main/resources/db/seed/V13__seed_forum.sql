-- V13: dữ liệu mẫu diễn đàn (mục 5.5): chuyên mục, chủ đề, trả lời, bình chọn, theo dõi và báo cáo, để thử luồng hỏi đáp giữa người dùng.
-- Id cố định (seed-ft-*, seed-fp-*) và INSERT IGNORE nên chạy lại không bị trùng. Báo cáo để trạng thái chờ: admin được tạo khi backend khởi động (sau seed).
--   Chủ đề có đáp án hay nhất: 1, 4, 8. Chưa có đáp án: 2, 3, 5, 6, 7, 9. Chủ đề 10 là spam bị báo cáo để thử hàng chờ admin.
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
