-- V16: ảnh chân dung nghệ sĩ, lấy từ Wikimedia Commons (ảnh đại diện trong bài Wikipedia của từng người). Giấy phép đã
-- kiểm tra qua API của Commons: tranh / ảnh chụp cũ thuộc phạm vi công cộng, ảnh CC ghi kèm tác giả để ghi công đúng
-- điều kiện giấy phép (trang chi tiết nhạc sĩ hiện "Ảnh: Nguồn · giấy phép" dưới chân dung).
-- Chỉ điền cho nhạc sĩ CHƯA có ảnh, để không ghi đè ảnh quản trị viên đã chọn. Johann Pachelbel không có chân dung xác
-- thực nào còn lại nên để trống (vẫn hiện chân dung chữ cái; quản trị viên thêm được ở trang Quản lý nhạc sĩ).

UPDATE composers SET
    image_url = 'https://thumb.wikimedia.org/wikipedia/commons/thumb/b/bd/Vivaldi.jpg/500px-Vivaldi.jpg',
    image_source = 'https://commons.wikimedia.org/wiki/File:Vivaldi.jpg',
    image_license = 'Public domain',
    updated_at = NOW(6)
WHERE slug = 'antonio-vivaldi' AND image_url IS NULL;

UPDATE composers SET
    image_url = 'https://thumb.wikimedia.org/wikipedia/commons/thumb/6/6a/Johann_Sebastian_Bach.jpg/500px-Johann_Sebastian_Bach.jpg',
    image_source = 'https://commons.wikimedia.org/wiki/File:Johann_Sebastian_Bach.jpg',
    image_license = 'Public domain',
    updated_at = NOW(6)
WHERE slug = 'johann-sebastian-bach' AND image_url IS NULL;

UPDATE composers SET
    image_url = 'https://thumb.wikimedia.org/wikipedia/commons/thumb/f/fa/George_Frideric_Handel_by_Balthasar_Denner.jpg/500px-George_Frideric_Handel_by_Balthasar_Denner.jpg',
    image_source = 'https://commons.wikimedia.org/wiki/File:George_Frideric_Handel_by_Balthasar_Denner.jpg',
    image_license = 'Public domain',
    updated_at = NOW(6)
WHERE slug = 'george-frideric-handel' AND image_url IS NULL;

UPDATE composers SET
    image_url = 'https://thumb.wikimedia.org/wikipedia/commons/thumb/0/05/Joseph_Haydn.jpg/500px-Joseph_Haydn.jpg',
    image_source = 'https://commons.wikimedia.org/wiki/File:Joseph_Haydn.jpg',
    image_license = 'Public domain',
    updated_at = NOW(6)
WHERE slug = 'joseph-haydn' AND image_url IS NULL;

UPDATE composers SET
    image_url = 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ad/The_Mozart_Family_-_Wolfgang_Amadeus_Mozart_headshot.jpg/500px-The_Mozart_Family_-_Wolfgang_Amadeus_Mozart_headshot.jpg',
    image_source = 'https://commons.wikimedia.org/wiki/File:The_Mozart_Family_-_Wolfgang_Amadeus_Mozart_headshot.jpg',
    image_license = 'Public domain',
    updated_at = NOW(6)
WHERE slug = 'wolfgang-amadeus-mozart' AND image_url IS NULL;

UPDATE composers SET
    image_url = 'https://thumb.wikimedia.org/wikipedia/commons/thumb/6/6e/Joseph_Karl_Stieler%27s_Beethoven_mit_dem_Manuskript_der_Missa_solemnis.jpg/500px-Joseph_Karl_Stieler%27s_Beethoven_mit_dem_Manuskript_der_Missa_solemnis.jpg',
    image_source = 'https://commons.wikimedia.org/wiki/File:Joseph_Karl_Stieler%27s_Beethoven_mit_dem_Manuskript_der_Missa_solemnis.jpg',
    image_license = 'Public domain',
    updated_at = NOW(6)
WHERE slug = 'ludwig-van-beethoven' AND image_url IS NULL;

UPDATE composers SET
    image_url = 'https://thumb.wikimedia.org/wikipedia/commons/thumb/0/0d/Franz_Schubert_by_Wilhelm_August_Rieder_1875.jpg/500px-Franz_Schubert_by_Wilhelm_August_Rieder_1875.jpg',
    image_source = 'https://commons.wikimedia.org/wiki/File:Franz_Schubert_by_Wilhelm_August_Rieder_1875.jpg',
    image_license = 'Public domain',
    updated_at = NOW(6)
WHERE slug = 'franz-schubert' AND image_url IS NULL;

UPDATE composers SET
    image_url = 'https://thumb.wikimedia.org/wikipedia/commons/thumb/e/e8/Frederic_Chopin_photo.jpeg/500px-Frederic_Chopin_photo.jpeg',
    image_source = 'https://commons.wikimedia.org/wiki/File:Frederic_Chopin_photo.jpeg',
    image_license = 'Public domain',
    updated_at = NOW(6)
WHERE slug = 'frederic-chopin' AND image_url IS NULL;

UPDATE composers SET
    image_url = 'https://thumb.wikimedia.org/wikipedia/commons/thumb/0/0d/Franz_Liszt_by_Herman_Biow-_1843.png/500px-Franz_Liszt_by_Herman_Biow-_1843.png',
    image_source = 'https://commons.wikimedia.org/wiki/File:Franz_Liszt_by_Herman_Biow-_1843.png',
    image_license = 'Public domain',
    updated_at = NOW(6)
WHERE slug = 'franz-liszt' AND image_url IS NULL;

UPDATE composers SET
    image_url = 'https://thumb.wikimedia.org/wikipedia/commons/thumb/2/20/Tchaikovsky_by_Reutlinger_%28cropped%29.jpg/500px-Tchaikovsky_by_Reutlinger_%28cropped%29.jpg',
    image_source = 'https://commons.wikimedia.org/wiki/File:Tchaikovsky_by_Reutlinger_(cropped).jpg',
    image_license = 'Public domain',
    updated_at = NOW(6)
WHERE slug = 'pyotr-ilyich-tchaikovsky' AND image_url IS NULL;

UPDATE composers SET
    image_url = 'https://thumb.wikimedia.org/wikipedia/commons/thumb/c/c3/Claude_Debussy_by_Atelier_Nadar.jpg/500px-Claude_Debussy_by_Atelier_Nadar.jpg',
    image_source = 'https://commons.wikimedia.org/wiki/File:Claude_Debussy_by_Atelier_Nadar.jpg',
    image_license = 'Public domain',
    updated_at = NOW(6)
WHERE slug = 'claude-debussy' AND image_url IS NULL;

UPDATE composers SET
    image_url = 'https://thumb.wikimedia.org/wikipedia/commons/thumb/5/58/Ericsatie.jpg/500px-Ericsatie.jpg',
    image_source = 'https://commons.wikimedia.org/wiki/File:Ericsatie.jpg',
    image_license = 'Public domain',
    updated_at = NOW(6)
WHERE slug = 'erik-satie' AND image_url IS NULL;

UPDATE composers SET
    image_url = 'https://thumb.wikimedia.org/wikipedia/commons/thumb/6/6f/Czerny_2_part.jpg/500px-Czerny_2_part.jpg',
    image_source = 'https://commons.wikimedia.org/wiki/File:Czerny_2_part.jpg',
    image_license = 'Public domain',
    updated_at = NOW(6)
WHERE slug = 'carl-czerny' AND image_url IS NULL;

UPDATE composers SET
    image_url = 'https://thumb.wikimedia.org/wikipedia/commons/thumb/e/e0/Musician_V%C4%83n_Cao.jpg/500px-Musician_V%C4%83n_Cao.jpg',
    image_source = 'https://commons.wikimedia.org/wiki/File:Musician_V%C4%83n_Cao.jpg',
    image_license = 'Public domain',
    updated_at = NOW(6)
WHERE slug = 'van-cao' AND image_url IS NULL;

-- Ảnh CC: giấy phép bắt buộc ghi tên tác giả (tên tài khoản trên Commons) và giấy phép
UPDATE composers SET
    image_url = 'https://upload.wikimedia.org/wikipedia/commons/3/3c/Phamduy.jpg',
    image_source = 'https://commons.wikimedia.org/wiki/File:Phamduy.jpg',
    image_license = 'CC BY-SA 3.0, tác giả Xiaoao',
    updated_at = NOW(6)
WHERE slug = 'pham-duy' AND image_url IS NULL;

UPDATE composers SET
    image_url = 'https://thumb.wikimedia.org/wikipedia/commons/thumb/1/1c/NS_Ph%E1%BA%A1m_Tuy%C3%AAn.jpg/500px-NS_Ph%E1%BA%A1m_Tuy%C3%AAn.jpg',
    image_source = 'https://commons.wikimedia.org/wiki/File:NS_Ph%E1%BA%A1m_Tuy%C3%AAn.jpg',
    image_license = 'CC BY 3.0, tác giả Duyphuong',
    updated_at = NOW(6)
WHERE slug = 'pham-tuyen' AND image_url IS NULL;

-- Ảnh KHÔNG tự do (Wikipedia dùng theo "sử dụng hợp lý" / fair use): Hoàng Việt và Trịnh Công Sơn không có ảnh tự do nào.
-- Lấy ảnh đại diện trong bài Wikipedia, ghi rõ trang mô tả nguồn. Nên thay bằng ảnh có giấy phép khi có.
UPDATE composers SET
    image_url = 'https://upload.wikimedia.org/wikipedia/vi/c/c8/Hoang_Viet.jpg',
    image_source = 'https://vi.wikipedia.org/wiki/T%E1%BA%ADp_tin:Hoang_Viet.jpg',
    image_license = 'Sử dụng hợp lý (Wikipedia), chưa có giấy phép tự do',
    updated_at = NOW(6)
WHERE slug = 'hoang-viet' AND image_url IS NULL;

UPDATE composers SET
    image_url = 'https://upload.wikimedia.org/wikipedia/en/c/c9/Tr%E1%BB%8Bnh_C%C3%B4ng_S%C6%A1n.jpeg',
    image_source = 'https://en.wikipedia.org/wiki/File:Tr%E1%BB%8Bnh_C%C3%B4ng_S%C6%A1n.jpeg',
    image_license = 'Fair use (Wikipedia), chưa có giấy phép tự do',
    updated_at = NOW(6)
WHERE slug = 'trinh-cong-son' AND image_url IS NULL;
