package com.ptit.music_be.dto.response;

import java.util.List;

import lombok.*;
import lombok.experimental.FieldDefaults;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class ReviewListResponse {
    /** Điểm trung bình làm tròn 1 chữ số thập phân; null nếu chưa ai chấm sao. */
    Double averageRating;
    /** Số lượt chấm sao. */
    long ratingCount;

    List<ReviewResponse> reviews;
}
