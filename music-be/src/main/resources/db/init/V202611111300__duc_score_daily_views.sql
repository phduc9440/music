-- Lượt xem theo ngày của bản nhạc công khai, để trang chủ có mục "Nổi bật tuần" (mục 5.3). view_count vẫn là tổng.
-- Chỉ những lượt xem được tính từ lúc có bảng này; bản nhạc bị xóa hẳn thì dòng đếm đi theo.
CREATE TABLE score_daily_views
(
    score_id  VARCHAR(36) NOT NULL,
    view_date DATE        NOT NULL,
    views     INT         NOT NULL DEFAULT 0,
    PRIMARY KEY (score_id, view_date),
    INDEX idx_score_daily_views_date (view_date),
    CONSTRAINT fk_score_daily_views_score FOREIGN KEY (score_id) REFERENCES scores (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
