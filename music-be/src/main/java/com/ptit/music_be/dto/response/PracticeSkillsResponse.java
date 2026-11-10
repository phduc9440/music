package com.ptit.music_be.dto.response;

import lombok.*;
import lombok.experimental.FieldDefaults;

/** Điểm 4 kỹ năng trên thang 0-100 cho biểu đồ radar. sessionCount = 0 nghĩa là chưa có dữ liệu trong kỳ. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class PracticeSkillsResponse {
    /** Số ngày gần nhất được tính (tính cả hôm nay). */
    int days;

    long sessionCount;
    /** Tỉ lệ nốt đúng cao độ. */
    double pitchAccuracy;
    /** Tỉ lệ nốt đúng giờ. */
    double timing;
    /** Tốc độ ngón: tempo trung bình so với bản gốc, tối đa 100. */
    double speed;
    /** Chăm chỉ: tỉ lệ ngày có luyện tập trong kỳ. */
    double diligence;
}
