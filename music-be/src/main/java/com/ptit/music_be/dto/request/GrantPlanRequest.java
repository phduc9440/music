package com.ptit.music_be.dto.request;

import lombok.*;
import lombok.experimental.FieldDefaults;

@Data
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class GrantPlanRequest {
    String memberId;
    String planCode;
    Integer days;
}
