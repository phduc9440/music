package com.ptit.music_be.dto.response.forum;

import lombok.*;
import lombok.experimental.FieldDefaults;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class ForumVoteResponse {
    boolean voted;
    long voteCount;
}
