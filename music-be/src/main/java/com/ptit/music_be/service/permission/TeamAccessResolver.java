package com.ptit.music_be.service.permission;

import java.util.Optional;

import com.ptit.music_be.dto.enums.ScoreAccess;
import com.ptit.music_be.entity.Score;

/**
 * Chỗ cắm cho tính năng Team: quyền một thành viên có được từ việc bản nhạc thuộc một team. Bản mặc định (xem
 * {@code PermissionDefaultsConfig}) luôn trả rỗng; khi có bản cài thật thì nó tự thay thế bản mặc định.
 */
public interface TeamAccessResolver {

    /** Mức truy cập {@code memberId} có được qua team với bản nhạc này, rỗng nếu không có. */
    Optional<ScoreAccess> resolve(Score score, String memberId);
}
