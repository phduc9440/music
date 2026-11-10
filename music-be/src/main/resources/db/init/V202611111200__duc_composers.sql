-- Mục 5.4: bảng nhạc sĩ. scores.composer vẫn là chữ tự do người dùng nhập; scores.composer_id được backend tự gắn khi
-- chữ đó khớp tên hoặc tên khác (aliases) của một nhạc sĩ. Xóa nhạc sĩ thì bản nhạc chỉ mất liên kết.
CREATE TABLE composers
(
    id            VARCHAR(36)  NOT NULL PRIMARY KEY,
    name          VARCHAR(255) NOT NULL,
    slug          VARCHAR(120) NOT NULL,
    -- tên khác, cách nhau bằng dấu phẩy (ví dụ "Bach, J.S. Bach")
    aliases       VARCHAR(500) NULL,
    birth_year    INT          NULL,
    death_year    INT          NULL,
    country       VARCHAR(100) NULL,
    -- BAROQUE / CLASSICAL / ROMANTIC / MODERN / VIETNAM
    period        VARCHAR(16)  NULL,
    bio           TEXT         NULL,
    -- ảnh chân dung: chỉ dùng ảnh thuộc phạm vi công cộng hoặc có giấy phép, luôn kèm nguồn và giấy phép
    image_url     VARCHAR(1000) NULL,
    image_source  VARCHAR(1000) NULL,
    image_license VARCHAR(100)  NULL,
    created_at    DATETIME(6)  NULL,
    updated_at    DATETIME(6)  NULL,
    CONSTRAINT uk_composers_slug UNIQUE (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE scores
    ADD COLUMN composer_id VARCHAR(36) NULL,
    ADD CONSTRAINT fk_scores_composer FOREIGN KEY (composer_id) REFERENCES composers (id) ON DELETE SET NULL,
    ADD INDEX idx_scores_composer (composer_id);
