package com.ptit.music_be.dto.request.team;

import java.util.List;
import lombok.*;
import lombok.experimental.FieldDefaults;

/** Thứ tự diễn mới: đủ mọi id bài của show, theo thứ tự. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class ShowItemOrderRequest {
    List<String> itemIds;
}
