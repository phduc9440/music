package com.ptit.music_be.service.impl;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.ptit.music_be.dto.enums.PracticeSessionStatus;
import com.ptit.music_be.dto.request.StudioEventBatchRequest;
import com.ptit.music_be.dto.request.StudioNoteEventRequest;
import com.ptit.music_be.dto.response.StudioEventBatchResponse;
import com.ptit.music_be.dto.response.StudioTimelineResponse;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.PracticeSession;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.repository.auth.MemberRepository;
import com.ptit.music_be.repository.practice.PracticeSessionRepository;
import com.ptit.music_be.service.StudioEventService;
import com.ptit.music_be.service.StudioTimelineService;
import com.ptit.music_be.utils.SecurityUtils;

import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@Service
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
public class StudioEventServiceImpl implements StudioEventService {

    static final int MAX_EVENTS_PER_BATCH = 200;

    static final String INSERT_EVENT_SQL = """
			INSERT INTO practice_note_event
				(session_id, seq, note_id, measure, hand, expected_midi, played_midi, expected_ms, played_ms, delta_ms, result)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			""";

    JdbcTemplate jdbcTemplate;
    MemberRepository memberRepository;
    PracticeSessionRepository practiceSessionRepository;
    StudioTimelineService studioTimelineService;

    @Override
    @Transactional
    public StudioEventBatchResponse ingestEvents(String sessionId, StudioEventBatchRequest request) {
        if (request == null || request.events() == null) {
            throw new AppException(ErrorCode.STUDIO_EVENT_INVALID);
        }
        List<StudioNoteEventRequest> events = request.events();
        if (events.size() > MAX_EVENTS_PER_BATCH) {
            throw new AppException(ErrorCode.STUDIO_EVENT_BATCH_TOO_LARGE);
        }

        Member member = memberRepository
                .findByEmailForUpdate(SecurityUtils.getCurrentEmail())
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_EXISTED));
        PracticeSession session = practiceSessionRepository
                .findByIdAndMemberForUpdate(sessionId, member)
                .orElseThrow(() -> new AppException(ErrorCode.STUDIO_SESSION_NOT_EXISTED));
        if (session.getStatus() != PracticeSessionStatus.IN_PROGRESS) {
            throw new AppException(ErrorCode.STUDIO_SESSION_NOT_ACTIVE);
        }

        validateEvents(events);
        validateNoteIds(session, events);

        LinkedHashMap<Integer, StudioNoteEventRequest> uniqueEvents = new LinkedHashMap<>();
        for (StudioNoteEventRequest event : events) {
            uniqueEvents.putIfAbsent(event.seq(), event);
        }

        Set<Integer> existingSequences = findExistingSequences(session.getId(), uniqueEvents.keySet());
        List<StudioNoteEventRequest> newEvents = uniqueEvents.entrySet().stream()
                .filter(entry -> !existingSequences.contains(entry.getKey()))
                .map(java.util.Map.Entry::getValue)
                .toList();

        if (!newEvents.isEmpty()) {
            jdbcTemplate.batchUpdate(
                    INSERT_EVENT_SQL,
                    newEvents.stream()
                            .map(event -> toSqlArguments(session.getId(), event))
                            .toList());
        }

        Integer lastSeq = jdbcTemplate.queryForObject(
                "SELECT MAX(seq) FROM practice_note_event WHERE session_id = ?", Integer.class, session.getId());
        return new StudioEventBatchResponse(newEvents.size(), events.size() - newEvents.size(), lastSeq);
    }

    private static void validateEvents(List<StudioNoteEventRequest> events) {
        int previousSequence = -1;
        for (StudioNoteEventRequest event : events) {
            if (event == null
                    || event.seq() == null
                    || event.seq() < 0
                    || event.seq() < previousSequence
                    || event.result() == null
                    || (event.measure() != null && event.measure() < 1)
                    || !isMidi(event.expectedMidi())
                    || !isMidi(event.playedMidi())
                    || (event.expectedMs() != null && event.expectedMs() < 0)
                    || (event.hand() != null && !Set.of("RIGHT", "LEFT").contains(event.hand()))
                    || (event.noteId() != null && !StringUtils.hasText(event.noteId()))) {
                throw new AppException(ErrorCode.STUDIO_EVENT_INVALID);
            }
            previousSequence = event.seq();
        }
    }

    private void validateNoteIds(PracticeSession session, List<StudioNoteEventRequest> events) {
        if (events.stream().noneMatch(event -> event.noteId() != null)) {
            return;
        }
        Set<String> timelineNoteIds = studioTimelineService
                .getTimeline(session.getScore().getId())
                .notes()
                .stream()
                .map(StudioTimelineResponse.Note::id)
                .collect(Collectors.toSet());
        if (events.stream()
                .map(StudioNoteEventRequest::noteId)
                .filter(java.util.Objects::nonNull)
                .anyMatch(noteId -> !timelineNoteIds.contains(noteId))) {
            throw new AppException(ErrorCode.STUDIO_EVENT_INVALID);
        }
    }

    private Set<Integer> findExistingSequences(String sessionId, Set<Integer> sequences) {
        if (sequences.isEmpty()) {
            return Set.of();
        }
        String placeholders = String.join(",", java.util.Collections.nCopies(sequences.size(), "?"));
        List<Object> arguments = new ArrayList<>(sequences.size() + 1);
        arguments.add(sessionId);
        arguments.addAll(sequences);
        List<Integer> existing = jdbcTemplate.queryForList(
                "SELECT seq FROM practice_note_event WHERE session_id = ? AND seq IN (" + placeholders + ")",
                Integer.class,
                arguments.toArray());
        return new HashSet<>(existing);
    }

    private static boolean isMidi(Integer midi) {
        return midi == null || (midi >= 0 && midi <= 127);
    }

    private static Object[] toSqlArguments(String sessionId, StudioNoteEventRequest event) {
        return new Object[] {
            sessionId,
            event.seq(),
            event.noteId(),
            event.measure(),
            event.hand(),
            event.expectedMidi(),
            event.playedMidi(),
            event.expectedMs(),
            event.playedMs(),
            event.deltaMs(),
            event.result().name()
        };
    }
}
