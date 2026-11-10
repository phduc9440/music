package com.ptit.music_be.service.admin.impl;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import java.util.List;

import org.junit.jupiter.api.Test;

import com.ptit.music_be.dto.enums.ScoreBulkAction;
import com.ptit.music_be.dto.enums.Visibility;
import com.ptit.music_be.dto.request.AdminScoreBulkRequest;
import com.ptit.music_be.dto.response.AdminScoreBulkResponse;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.service.score.ScoreService;

class AdminScoreBulkServiceImplTest {

    private final ScoreService scores = mock(ScoreService.class);
    private final AdminScoreBulkServiceImpl service = new AdminScoreBulkServiceImpl(scores);

    @Test
    void oneFailureDoesNotStopTheOthers() {
        doThrow(new AppException(ErrorCode.SCORE_BUSY)).when(scores).deleteScore("b");

        AdminScoreBulkResponse r =
                service.apply(new AdminScoreBulkRequest(List.of("a", "b", "c"), ScoreBulkAction.DELETE, null));

        assertEquals(2, r.getSuccess());
        assertEquals(1, r.getFailures().size());
        assertEquals("b", r.getFailures().get(0).getId());
        assertEquals(ErrorCode.SCORE_BUSY.getMessage(), r.getFailures().get(0).getMessage());
        verify(scores).deleteScore("a");
        verify(scores).deleteScore("c");
    }

    @Test
    void privateCarriesReasonAndPublicDoesNot() {
        service.apply(new AdminScoreBulkRequest(List.of("a"), ScoreBulkAction.PRIVATE, "spam"));
        service.apply(new AdminScoreBulkRequest(List.of("b"), ScoreBulkAction.PUBLIC, "ignored"));

        verify(scores).setVisibilityByAdmin("a", Visibility.PRIVATE, "spam");
        verify(scores).setVisibilityByAdmin("b", Visibility.PUBLIC, null);
    }

    @Test
    void duplicatesAndBlankIdsAreSkippedAndEmptyIsRejected() {
        AdminScoreBulkResponse r =
                service.apply(new AdminScoreBulkRequest(List.of("a", "a", " "), ScoreBulkAction.DELETE, null));

        assertEquals(1, r.getSuccess());
        verify(scores).deleteScore("a");
        assertThrows(
                AppException.class,
                () -> service.apply(new AdminScoreBulkRequest(List.of(), ScoreBulkAction.DELETE, null)));
        verify(scores, never()).setVisibilityByAdmin(any(), any(), any());
    }
}
