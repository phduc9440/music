-- V5: nhạc sĩ. Chưa có ảnh: quản trị viên thêm ảnh thuộc phạm vi công cộng (ví dụ tranh trên Wikimedia Commons) kèm
-- nguồn và giấy phép ở trang Quản lý nhạc sĩ. INSERT IGNORE nên chạy lại không bị trùng (slug UNIQUE).
INSERT IGNORE INTO composers
    (id, name, slug, aliases, birth_year, death_year, country, period, bio, created_at, updated_at)
SELECT UUID(), t.name, t.slug, t.aliases, t.birth_year, t.death_year, t.country, t.period, t.bio, NOW(6), NOW(6)
FROM (
    SELECT 'Antonio Vivaldi' AS name, 'antonio-vivaldi' AS slug, 'Vivaldi' AS aliases, 1678 AS birth_year, 1741 AS death_year, 'Ý' AS country, 'BAROQUE' AS period, 'Nhà soạn nhạc và nghệ sĩ violin người Ý, tác giả bộ bốn concerto Bốn mùa.' AS bio
    UNION ALL SELECT 'Johann Sebastian Bach', 'johann-sebastian-bach', 'Bach, J.S. Bach, J. S. Bach', 1685, 1750, 'Đức', 'BAROQUE', 'Nhà soạn nhạc và nghệ sĩ organ người Đức thời Baroque, nổi tiếng với Bình quân luật (The Well-Tempered Clavier) và các bản Concerto Brandenburg.'
    UNION ALL SELECT 'George Frideric Handel', 'george-frideric-handel', 'Handel, Händel, Georg Friedrich Händel', 1685, 1759, 'Đức, Anh', 'BAROQUE', 'Nhà soạn nhạc gốc Đức sống phần lớn cuộc đời ở Anh, nổi tiếng với oratorio Messiah và tổ khúc Nhạc nước.'
    UNION ALL SELECT 'Joseph Haydn', 'joseph-haydn', 'Haydn, Franz Joseph Haydn', 1732, 1809, 'Áo', 'CLASSICAL', 'Nhà soạn nhạc người Áo thời Cổ điển, thường được gọi là cha đẻ của giao hưởng và tứ tấu đàn dây.'
    UNION ALL SELECT 'Wolfgang Amadeus Mozart', 'wolfgang-amadeus-mozart', 'Mozart, W.A. Mozart, W. A. Mozart', 1756, 1791, 'Áo', 'CLASSICAL', 'Thần đồng âm nhạc thời Cổ điển, để lại hơn 600 tác phẩm gồm giao hưởng, opera, concerto và sonata piano.'
    UNION ALL SELECT 'Ludwig van Beethoven', 'ludwig-van-beethoven', 'Beethoven, L. v. Beethoven, L. van Beethoven', 1770, 1827, 'Đức', 'CLASSICAL', 'Nhà soạn nhạc người Đức, cầu nối giữa thời Cổ điển và Lãng mạn; tác giả 9 bản giao hưởng và 32 sonata piano.'
    UNION ALL SELECT 'Franz Schubert', 'franz-schubert', 'Schubert', 1797, 1828, 'Áo', 'ROMANTIC', 'Nhà soạn nhạc người Áo, nổi tiếng với hơn 600 ca khúc nghệ thuật (lied) và Giao hưởng Dang dở.'
    UNION ALL SELECT 'Frédéric Chopin', 'frederic-chopin', 'Chopin, Frederic Chopin, Fryderyk Chopin', 1810, 1849, 'Ba Lan', 'ROMANTIC', 'Nhà soạn nhạc và nghệ sĩ piano người Ba Lan, gần như chỉ viết cho piano: nocturne, mazurka, ballade, étude.'
    UNION ALL SELECT 'Franz Liszt', 'franz-liszt', 'Liszt', 1811, 1886, 'Hungary', 'ROMANTIC', 'Nghệ sĩ piano bậc thầy người Hungary, người khai sinh thể loại thơ giao hưởng.'
    UNION ALL SELECT 'Pyotr Ilyich Tchaikovsky', 'pyotr-ilyich-tchaikovsky', 'Tchaikovsky, Tchaikovski, Chaikovsky, P. I. Tchaikovsky', 1840, 1893, 'Nga', 'ROMANTIC', 'Nhà soạn nhạc người Nga, tác giả các vở ballet Hồ thiên nga, Kẹp hạt dẻ và Người đẹp ngủ trong rừng.'
    UNION ALL SELECT 'Claude Debussy', 'claude-debussy', 'Debussy', 1862, 1918, 'Pháp', 'MODERN', 'Gương mặt tiêu biểu của âm nhạc ấn tượng, với Clair de lune và Prélude à l''après-midi d''un faune.'
    UNION ALL SELECT 'Erik Satie', 'erik-satie', 'Satie', 1866, 1925, 'Pháp', 'MODERN', 'Nhà soạn nhạc người Pháp, nổi tiếng với ba bản Gymnopédies giản dị.'
    UNION ALL SELECT 'Johann Pachelbel', 'johann-pachelbel', 'Pachelbel', 1653, 1706, 'Đức', 'BAROQUE', 'Nhà soạn nhạc và nghệ sĩ organ người Đức, nổi tiếng nhất với Canon in D.'
    UNION ALL SELECT 'Carl Czerny', 'carl-czerny', 'Czerny', 1791, 1857, 'Áo', 'ROMANTIC', 'Nhà soạn nhạc và nhà sư phạm piano người Áo, tác giả hàng nghìn bài tập kỹ thuật được dùng đến ngày nay.'
    UNION ALL SELECT 'Phạm Duy', 'pham-duy', NULL, 1921, 2013, 'Việt Nam', 'VIETNAM', 'Nhạc sĩ có sự nghiệp sáng tác dài, với các trường ca và ca khúc như Việt Nam Việt Nam, Nghìn trùng xa cách.'
    UNION ALL SELECT 'Văn Cao', 'van-cao', NULL, 1923, 1995, 'Việt Nam', 'VIETNAM', 'Nhạc sĩ, họa sĩ, nhà thơ; tác giả Tiến quân ca (Quốc ca Việt Nam) và các ca khúc Thiên Thai, Trương Chi, Suối mơ.'
    UNION ALL SELECT 'Hoàng Việt', 'hoang-viet', NULL, 1928, 1967, 'Việt Nam', 'VIETNAM', 'Nhạc sĩ, tác giả ca khúc Tình ca, Lên ngàn và bản giao hưởng Quê hương.'
    UNION ALL SELECT 'Trịnh Công Sơn', 'trinh-cong-son', NULL, 1939, 2001, 'Việt Nam', 'VIETNAM', 'Nhạc sĩ với hàng trăm ca khúc như Diễm xưa, Hạ trắng, Cát bụi.'
    UNION ALL SELECT 'Phạm Tuyên', 'pham-tuyen', NULL, 1930, NULL, 'Việt Nam', 'VIETNAM', 'Nhạc sĩ, tác giả Như có Bác Hồ trong ngày vui đại thắng và nhiều ca khúc thiếu nhi.'
) t;
