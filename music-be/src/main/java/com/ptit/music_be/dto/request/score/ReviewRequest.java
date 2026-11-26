package com.ptit.music_be.dto.request.score;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;

import lombok.*;
import lombok.experimental.FieldDefaults;

/** Nhận xét của tôi cho một bản nhạc: số sao (1-5) và/hoặc bình luận; cần ít nhất một trong hai. */
@Data
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class ReviewRequest {
    @Min(value = 1, message = "REVIEW_RATING_INVALID")
    @Max(value = 5, message = "REVIEW_RATING_INVALID")
    Integer rating;

    @Size(max = 2000, message = "REVIEW_COMMENT_INVALID")
    String comment;
}
