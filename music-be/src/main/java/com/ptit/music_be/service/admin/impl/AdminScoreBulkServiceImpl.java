package com.ptit.music_be.service.admin.impl;

import java.util.ArrayList;
import java.util.List;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;

import com.ptit.music_be.dto.enums.ScoreBulkAction;
import com.ptit.music_be.dto.enums.Visibility;
import com.ptit.music_be.dto.request.AdminScoreBulkRequest;
import com.ptit.music_be.dto.response.AdminScoreBulkResponse;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.service.admin.AdminScoreBulkService;
import com.ptit.music_be.service.score.ScoreService;

import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;
import lombok.extern.slf4j.Slf4j;

/**
 * Cố ý KHÔNG đặt @Transactional ở lớp này: mỗi lần gọi {@link ScoreService} tự mở transaction riêng, nên một bản lỗi
 * (đang có tác vụ chạy, đã bị xóa...) chỉ rollback chính nó chứ không kéo theo các bản khác.
 */
@Service
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
@Slf4j
@PreAuthorize("hasRole('ADMIN')")
public class AdminScoreBulkServiceImpl implements AdminScoreBulkService {

    ScoreService scoreService;

    @Override
    public AdminScoreBulkResponse apply(AdminScoreBulkRequest request) {
        if (request.getIds() == null || request.getIds().isEmpty() || request.getAction() == null) {
            throw new AppException(ErrorCode.INVALID_REQUEST);
        }
        int success = 0;
        List<AdminScoreBulkResponse.Failure> failures = new ArrayList<>();
        for (String id : request.getIds().stream()
                .filter(i -> i != null && !i.isBlank())
                .distinct()
                .toList()) {
            try {
                run(id, request.getAction(), request.getReason());
                success++;
            } catch (AppException e) {
                failures.add(
                        new AdminScoreBulkResponse.Failure(id, e.getErrorCode().getMessage()));
            } catch (RuntimeException e) {
                log.error("Bulk score action {} failed for {}", request.getAction(), id, e);
                failures.add(new AdminScoreBulkResponse.Failure(id, ErrorCode.UNCATEGORIZED_EXCEPTION.getMessage()));
            }
        }
        return AdminScoreBulkResponse.builder()
                .success(success)
                .failures(failures)
                .build();
    }

    private void run(String id, ScoreBulkAction action, String reason) {
        switch (action) {
            case PUBLIC -> scoreService.setVisibilityByAdmin(id, Visibility.PUBLIC, null);
            case PRIVATE -> scoreService.setVisibilityByAdmin(id, Visibility.PRIVATE, reason);
            case DELETE -> scoreService.deleteScore(id, reason);
        }
    }
}
