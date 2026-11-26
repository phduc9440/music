-- Ảnh bìa bản nhạc: ảnh bìa cho MỌI bản nhạc công khai, chờ duyệt công khai và kho bản nhạc mẫu (scores.cover_url), để thẻ bản nhạc,
-- Khám phá, trang chủ và trang chi tiết luôn có ảnh (seed chưa kèm file nên không có ảnh trang 1 để thay).
-- Ảnh lấy từ Wikimedia Commons, hợp với từng bài (bản thảo tay, trang bìa ấn bản đầu, vở diễn...), giấy phép đã kiểm tra
-- qua API của Commons (ghi ở danh sách dưới). URL là ảnh thu nhỏ 960px, đã thử tải được.
-- Ba lớp, chạy lại không đè ảnh người dùng tự tải lên (chỉ ghi khi chưa có bìa hoặc đang là ảnh mẫu "demo" của Cloudinary
-- mà V6 gán, vốn không liên quan tới bài):
--   1. ảnh riêng theo tên bài;
--   2. bài còn lại: chân dung nhạc sĩ (V16) nếu có;
--   3. cuối cùng: ảnh đàn piano (CC0) để không bản nào trống.
--
-- Nguồn và giấy phép:
--   https://commons.wikimedia.org/wiki/File:F%C3%BCr_Elise_-_Beethoven-Haus_Bonn_Draft_(BH_116,_1810)_-_page_1.png
--     Public domain · dùng cho: Für Elise, Für Elise (giản lược)
--   https://commons.wikimedia.org/wiki/File:Beethoven_Piano_Sonata_14_-_title_page_1802.jpg
--     Public domain · dùng cho: Moonlight Sonata (Mvt. 1)
--   https://commons.wikimedia.org/wiki/File:Clair_de_lune_(Debussy)_-_first_edition,_1905.jpg
--     Public domain · dùng cho: Clair de Lune
--   https://commons.wikimedia.org/wiki/File:Gymnopedie01.png
--     Public domain · dùng cho: Gymnopédie No. 1
--   https://commons.wikimedia.org/wiki/File:Nocturne_in_E_flat_major,_Op._9,_No._2_-_first_bars.png
--     Public domain · dùng cho: Nocturne Op. 9 No. 2
--   https://commons.wikimedia.org/wiki/File:Bach-wtc1-title-ms.jpg
--     Public domain · dùng cho: Prelude in C major (BWV 846)
--   https://commons.wikimedia.org/wiki/File:AMBII44-4-Minuet-G-Petzold.png
--     Public domain · dùng cho: Minuet in G major
--   https://commons.wikimedia.org/wiki/File:Mozart_-_Eine_kleine_Nachtmusik_K.525_autograph.png
--     Public domain · dùng cho: Eine kleine Nachtmusik (K. 525)
--   https://commons.wikimedia.org/wiki/File:RondoAllaTurcaMozart.png
--     Public domain · dùng cho: Turkish March
--   https://commons.wikimedia.org/wiki/File:Ninth_Symphony_original.png
--     Public domain · dùng cho: Ode to Joy, Ode to Joy (bản giản lược)
--   https://commons.wikimedia.org/wiki/File:Pachelbel%27s_Canon_-_Mus.MS_16481-8_Page_1.jpg
--     Public domain · dùng cho: Canon in D
--   https://commons.wikimedia.org/wiki/File:Swan_lake_ballet_at_SODRE.jpg
--     CC BY-SA 2.0 · Jimmy Baikovicius from Montevideo, Uruguay · dùng cho: Swan Lake - Theme
--   https://commons.wikimedia.org/wiki/File:Antonio_Vivaldi,_Il_Cemento_dell%27armonia_edell%27inventione,_op.8,_1st_page.png
--     Public domain · dùng cho: Spring (Four Seasons)
--   https://commons.wikimedia.org/wiki/File:H%C3%A4ndel_Beginning_of_Hallelujah_Autograph.jpg
--     Public domain · dùng cho: Hallelujah (Messiah)
--   https://commons.wikimedia.org/wiki/File:Schubert_Ave_Maria_(Latin_words).jpg
--     CC0 · Chuck Israels · dùng cho: Ave Maria
--   https://commons.wikimedia.org/wiki/File:Bach_Invention_played_on_Yamaha_PSR-E303.jpg
--     CC BY 2.0 · ptwo · dùng cho: Invention No. 1 (BWV 772)
--   https://commons.wikimedia.org/wiki/File:Ah!_vous_dirai-je_maman.jpg
--     Public domain · dùng cho: Twinkle Twinkle Little Star
--   https://commons.wikimedia.org/wiki/File:B%C3%B6sendorfer_Model_290_Imperial_at_Saga_Arashiyama.jpg
--     CC0 · Hahifuheho · dùng cho: Happy Birthday to You, Nghìn trùng xa cách
--   https://commons.wikimedia.org/wiki/File:Cach-choi-dan-tranh-150714.jpg
--     CC BY-SA 4.0 · Duongdangninh · dùng cho: Tình ca, Thiên Thai
--   https://commons.wikimedia.org/wiki/File:Boesendorfer-5075415.jpg
--     CC BY-SA 3.0 · ermell · dùng cho: Tiến quân ca, Mùa xuân đầu tiên
--   https://commons.wikimedia.org/wiki/File:H%C3%A0_N%E1%BB%99i_sau_c%C6%A1n_m%C6%B0a_(Hanoi_After_the_Rain)_-_panoramio.jpg
--     CC BY-SA 3.0 · VŨ HÙNG · dùng cho: Diễm xưa, Hà Nội mùa vắng những cơn mưa

-- Bản cần ảnh: công khai, chờ duyệt công khai hoặc trong kho mẫu, chưa xóa, chưa có bìa riêng
-- (V6 gán ảnh mẫu Cloudinary "demo" cho 8 bản; thay bằng ảnh hợp bài)
UPDATE scores s
JOIN (
    SELECT 'Für Elise' AS title, 'https://thumb.wikimedia.org/wikipedia/commons/thumb/7/7e/F%C3%BCr_Elise_-_Beethoven-Haus_Bonn_Draft_%28BH_116%2C_1810%29_-_page_1.png/960px-F%C3%BCr_Elise_-_Beethoven-Haus_Bonn_Draft_%28BH_116%2C_1810%29_-_page_1.png' AS url
    UNION ALL SELECT 'Für Elise (giản lược)', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/7/7e/F%C3%BCr_Elise_-_Beethoven-Haus_Bonn_Draft_%28BH_116%2C_1810%29_-_page_1.png/960px-F%C3%BCr_Elise_-_Beethoven-Haus_Bonn_Draft_%28BH_116%2C_1810%29_-_page_1.png'
    UNION ALL SELECT 'Moonlight Sonata (Mvt. 1)', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/1/11/Beethoven_Piano_Sonata_14_-_title_page_1802.jpg/960px-Beethoven_Piano_Sonata_14_-_title_page_1802.jpg'
    UNION ALL SELECT 'Clair de Lune', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/3/3e/Clair_de_lune_%28Debussy%29_-_first_edition%2C_1905.jpg/960px-Clair_de_lune_%28Debussy%29_-_first_edition%2C_1905.jpg'
    UNION ALL SELECT 'Gymnopédie No. 1', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/4/48/Gymnopedie01.png/960px-Gymnopedie01.png'
    UNION ALL SELECT 'Nocturne Op. 9 No. 2', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/c/ce/Nocturne_in_E_flat_major%2C_Op._9%2C_No._2_-_first_bars.png/960px-Nocturne_in_E_flat_major%2C_Op._9%2C_No._2_-_first_bars.png'
    UNION ALL SELECT 'Prelude in C major (BWV 846)', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/2/2b/Bach-wtc1-title-ms.jpg/960px-Bach-wtc1-title-ms.jpg'
    UNION ALL SELECT 'Minuet in G major', 'https://upload.wikimedia.org/wikipedia/commons/d/d7/AMBII44-4-Minuet-G-Petzold.png'
    UNION ALL SELECT 'Eine kleine Nachtmusik (K. 525)', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/d/de/Mozart_-_Eine_kleine_Nachtmusik_K.525_autograph.png/960px-Mozart_-_Eine_kleine_Nachtmusik_K.525_autograph.png'
    UNION ALL SELECT 'Turkish March', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/2/22/RondoAllaTurcaMozart.png/960px-RondoAllaTurcaMozart.png'
    UNION ALL SELECT 'Ode to Joy', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/3/3f/Ninth_Symphony_original.png/960px-Ninth_Symphony_original.png'
    UNION ALL SELECT 'Ode to Joy (bản giản lược)', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/3/3f/Ninth_Symphony_original.png/960px-Ninth_Symphony_original.png'
    UNION ALL SELECT 'Canon in D', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/2/2d/Pachelbel%27s_Canon_-_Mus.MS_16481-8_Page_1.jpg/960px-Pachelbel%27s_Canon_-_Mus.MS_16481-8_Page_1.jpg'
    UNION ALL SELECT 'Swan Lake - Theme', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/6/6f/Swan_lake_ballet_at_SODRE.jpg/960px-Swan_lake_ballet_at_SODRE.jpg'
    UNION ALL SELECT 'Spring (Four Seasons)', 'https://upload.wikimedia.org/wikipedia/commons/b/b8/Antonio_Vivaldi%2C_Il_Cemento_dell%27armonia_edell%27inventione%2C_op.8%2C_1st_page.png'
    UNION ALL SELECT 'Hallelujah (Messiah)', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/6/67/H%C3%A4ndel_Beginning_of_Hallelujah_Autograph.jpg/960px-H%C3%A4ndel_Beginning_of_Hallelujah_Autograph.jpg'
    UNION ALL SELECT 'Ave Maria', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/e/e6/Schubert_Ave_Maria_%28Latin_words%29.jpg/960px-Schubert_Ave_Maria_%28Latin_words%29.jpg'
    UNION ALL SELECT 'Invention No. 1 (BWV 772)', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/9/9f/Bach_Invention_played_on_Yamaha_PSR-E303.jpg/960px-Bach_Invention_played_on_Yamaha_PSR-E303.jpg'
    UNION ALL SELECT 'Twinkle Twinkle Little Star', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/4/44/Ah%21_vous_dirai-je_maman.jpg/960px-Ah%21_vous_dirai-je_maman.jpg'
    UNION ALL SELECT 'Happy Birthday to You', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/9/9c/B%C3%B6sendorfer_Model_290_Imperial_at_Saga_Arashiyama.jpg/960px-B%C3%B6sendorfer_Model_290_Imperial_at_Saga_Arashiyama.jpg'
    UNION ALL SELECT 'Tình ca', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/f/f3/Cach-choi-dan-tranh-150714.jpg/960px-Cach-choi-dan-tranh-150714.jpg'
    UNION ALL SELECT 'Thiên Thai', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/f/f3/Cach-choi-dan-tranh-150714.jpg/960px-Cach-choi-dan-tranh-150714.jpg'
    UNION ALL SELECT 'Tiến quân ca', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/9/90/Boesendorfer-5075415.jpg/960px-Boesendorfer-5075415.jpg'
    UNION ALL SELECT 'Mùa xuân đầu tiên', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/9/90/Boesendorfer-5075415.jpg/960px-Boesendorfer-5075415.jpg'
    UNION ALL SELECT 'Nghìn trùng xa cách', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/9/9c/B%C3%B6sendorfer_Model_290_Imperial_at_Saga_Arashiyama.jpg/960px-B%C3%B6sendorfer_Model_290_Imperial_at_Saga_Arashiyama.jpg'
    UNION ALL SELECT 'Diễm xưa', 'https://upload.wikimedia.org/wikipedia/commons/3/31/H%C3%A0_N%E1%BB%99i_sau_c%C6%A1n_m%C6%B0a_%28Hanoi_After_the_Rain%29_-_panoramio.jpg'
    UNION ALL SELECT 'Hà Nội mùa vắng những cơn mưa', 'https://upload.wikimedia.org/wikipedia/commons/3/31/H%C3%A0_N%E1%BB%99i_sau_c%C6%A1n_m%C6%B0a_%28Hanoi_After_the_Rain%29_-_panoramio.jpg'
) c ON c.title = s.title
SET s.cover_url = c.url
WHERE (s.visibility IN ('PUBLIC', 'PENDING') OR s.is_official = 1)
  AND s.deleted_at IS NULL
  AND (s.cover_url IS NULL OR s.cover_url LIKE 'https://res.cloudinary.com/demo/%');

-- Lớp 2: chân dung nhạc sĩ (composer_id do V6 gắn theo tên tác giả)
UPDATE scores s
JOIN composers c ON c.id = s.composer_id
SET s.cover_url = c.image_url
WHERE (s.visibility IN ('PUBLIC', 'PENDING') OR s.is_official = 1)
  AND s.deleted_at IS NULL
  AND c.image_url IS NOT NULL
  AND (s.cover_url IS NULL OR s.cover_url LIKE 'https://res.cloudinary.com/demo/%');

-- Lớp 3: ảnh đàn piano cho bản còn trống (không có tác giả hoặc nhạc sĩ chưa có chân dung)
UPDATE scores s
SET s.cover_url = 'https://thumb.wikimedia.org/wikipedia/commons/thumb/9/9c/B%C3%B6sendorfer_Model_290_Imperial_at_Saga_Arashiyama.jpg/960px-B%C3%B6sendorfer_Model_290_Imperial_at_Saga_Arashiyama.jpg'
WHERE (s.visibility IN ('PUBLIC', 'PENDING') OR s.is_official = 1)
  AND s.deleted_at IS NULL
  AND (s.cover_url IS NULL OR s.cover_url LIKE 'https://res.cloudinary.com/demo/%');
