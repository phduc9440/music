package com.ptit.music_be.service.score.impl;

import java.time.LocalDateTime;
import java.util.List;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ptit.music_be.dto.response.PageResponse;
import com.ptit.music_be.dto.response.TrashedScoreResponse;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.repository.MemberRepository;
import com.ptit.music_be.repository.ScoreTrashRepository;
import com.ptit.music_be.service.score.ScoreTrashService;
import com.ptit.music_be.service.storage.ScoreStorageCleaner;
import com.ptit.music_be.utils.SecurityUtils;

import lombok.extern.slf4j.Slf4j;

@Service
@Slf4j
public class ScoreTrashServiceImpl implements ScoreTrashService {

    static final int DEFAULT_PAGE_SIZE = 12;
    static final int MAX_PAGE_SIZE = 50;

    private final ScoreTrashRepository scoreTrashRepository;
    private final MemberRepository memberRepository;
    private final ScoreStorageCleaner scoreStorageCleaner;
    private final int retentionDays;

    @PersistenceContext
    private EntityManager entityManager;

    public ScoreTrashServiceImpl(
            ScoreTrashRepository scoreTrashRepository,
            MemberRepository memberRepository,
            ScoreStorageCleaner scoreStorageCleaner,
            @Value("${score.trash.retention-days:30}") int retentionDays) {
        this.scoreTrashRepository = scoreTrashRepository;
        this.memberRepository = memberRepository;
        this.scoreStorageCleaner = scoreStorageCleaner;
        this.retentionDays = retentionDays;
    }

    @Override
    @Transactional(readOnly = true)
    public PageResponse<TrashedScoreResponse> getMyTrash(int page, int size) {
        Member me = currentMember();
        int safeSize = size <= 0 ? DEFAULT_PAGE_SIZE : Math.min(size, MAX_PAGE_SIZE);
        var result = scoreTrashRepository.findTrashOfMember(me.getId(), PageRequest.of(Math.max(page, 0), safeSize));
        List<TrashedScoreResponse> content =
                result.getContent().stream().map(this::toResponse).toList();
        return PageResponse.<TrashedScoreResponse>builder()
                .content(content)
                .pageNumber(result.getNumber())
                .pageSize(result.getSize())
                .totalElements(result.getTotalElements())
                .totalPages(result.getTotalPages())
                .build();
    }

    @Override
    @Transactional
    public void restore(String scoreId) {
        Score score = findMyTrashed(scoreId);
        score.setDeletedAt(null);
        score.setDeletedBy(null);
        score.setDeleteReason(null);
    }

    @Override
    @Transactional
    public void purge(String scoreId) {
        removeForGood(findMyTrashed(scoreId));
    }

    @Override
    @Transactional(readOnly = true)
    public List<String> findExpiredIds() {
        return scoreTrashRepository.findExpiredIds(LocalDateTime.now().minusDays(retentionDays));
    }

    @Override
    @Transactional
    public void purgeExpired(String scoreId) {
        Score score = scoreTrashRepository.findTrashedById(scoreId).orElse(null);
        if (score == null) {
            return; // đã được khôi phục hoặc xóa hẳn ở nơi khác trong lúc job chạy
        }
        LocalDateTime expiredBefore = LocalDateTime.now().minusDays(retentionDays);
        if (score.getDeletedAt() == null || score.getDeletedAt().isAfter(expiredBefore)) {
            return; // vừa được khôi phục rồi xóa lại, chưa tới hạn
        }
        removeForGood(score);
        log.info("Đã xóa hẳn bản nhạc {} khỏi thùng rác", scoreId);
    }

    /**
     * Xóa dòng bằng JPA để cascade sang chia sẻ, thể loại, playlist, phiên tập (không có ON DELETE CASCADE ở DB);
     * score_files, ai_tasks, score_reviews xóa theo bằng ON DELETE CASCADE. File trên đĩa xóa sau khi commit.
     */
    private void removeForGood(Score score) {
        entityManager.remove(score);
        scoreStorageCleaner.deleteScoreDirAfterCommit(score.getId());
    }

    private Score findMyTrashed(String scoreId) {
        Member me = currentMember();
        return scoreTrashRepository
                .findTrashedByIdAndMember(scoreId, me.getId())
                .orElseThrow(() -> new AppException(ErrorCode.SCORE_NOT_IN_TRASH));
    }

    private Member currentMember() {
        return memberRepository
                .findByEmail(SecurityUtils.getCurrentEmail())
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_EXISTED));
    }

    private TrashedScoreResponse toResponse(Score score) {
        LocalDateTime deletedAt = score.getDeletedAt();
        String ownerId = score.getMember() == null ? null : score.getMember().getId();
        return TrashedScoreResponse.builder()
                .id(score.getId())
                .title(score.getTitle())
                .composer(score.getComposer())
                .measureCount(score.getMeasureCount())
                .deletedAt(deletedAt)
                .purgeAt(deletedAt == null ? null : deletedAt.plusDays(retentionDays))
                .deletedByAdmin(
                        score.getDeletedBy() != null && !score.getDeletedBy().equals(ownerId))
                .deleteReason(score.getDeleteReason())
                .build();
    }
}
