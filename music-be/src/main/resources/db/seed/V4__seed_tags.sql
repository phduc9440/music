-- V4: thể loại (tags) mặc định. INSERT IGNORE nên chạy lại không bị trùng (name, slug là UNIQUE).
INSERT IGNORE INTO tags (id, name, slug)
VALUES
    (UUID(), 'Cổ điển', 'co-dien'),
    (UUID(), 'Pop', 'pop'),
    (UUID(), 'Ballad', 'ballad'),
    (UUID(), 'Jazz', 'jazz'),
    (UUID(), 'Rock', 'rock'),
    (UUID(), 'Nhạc Việt', 'nhac-viet'),
    (UUID(), 'Nhạc phim', 'nhac-phim'),
    (UUID(), 'Thiếu nhi', 'thieu-nhi'),
    (UUID(), 'Dân gian', 'dan-gian');
