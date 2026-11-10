package com.ptit.music_be.service.library.impl;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.ptit.music_be.dto.request.PlaylistOrderRequest;
import com.ptit.music_be.dto.request.PlaylistRequest;
import com.ptit.music_be.dto.response.PlaylistItemResponse;
import com.ptit.music_be.dto.response.PlaylistResponse;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.Playlist;
import com.ptit.music_be.entity.PlaylistItem;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.repository.MemberRepository;
import com.ptit.music_be.repository.PlaylistItemRepository;
import com.ptit.music_be.repository.PlaylistRepository;
import com.ptit.music_be.repository.ScoreRepository;
import com.ptit.music_be.service.library.PlaylistService;
import com.ptit.music_be.service.score.ScoreFileService;
import com.ptit.music_be.utils.SecurityUtils;

import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@Service
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
public class PlaylistServiceImpl implements PlaylistService {

    static int MAX_NAME = 255;
    static int MAX_DESCRIPTION = 2000;

    PlaylistRepository playlistRepository;
    PlaylistItemRepository playlistItemRepository;
    ScoreRepository scoreRepository;
    ScoreFileService scoreFileService;
    MemberRepository memberRepository;

    @Override
    @Transactional(readOnly = true)
    public List<PlaylistResponse> getMyPlaylists() {
        Member me = currentMember();
        return playlistRepository.findByMember(me).stream()
                .sorted((a, b) -> a.getName().compareToIgnoreCase(b.getName()))
                .map(this::toResponse)
                .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public PlaylistResponse getPlaylist(String id) {
        return toResponse(findOwned(id));
    }

    @Override
    @Transactional
    public PlaylistResponse create(PlaylistRequest request) {
        Playlist playlist = Playlist.builder().member(currentMember()).build();
        apply(playlist, request);
        return toResponse(playlistRepository.save(playlist));
    }

    @Override
    @Transactional
    public PlaylistResponse update(String id, PlaylistRequest request) {
        Playlist playlist = findOwned(id);
        apply(playlist, request);
        return toResponse(playlistRepository.save(playlist));
    }

    @Override
    @Transactional
    public void delete(String id) {
        playlistRepository.delete(findOwned(id));
    }

    // ------------------------------------------------------------------ 3.10: bài trong playlist

    @Override
    @Transactional(readOnly = true)
    public List<PlaylistItemResponse> getItems(String id) {
        return toItemResponses(findOwned(id));
    }

    @Override
    @Transactional
    public List<PlaylistItemResponse> addScore(String id, String scoreId) {
        Playlist playlist = findOwned(id);
        Score score = scoreRepository
                .findById(scoreId == null ? "" : scoreId)
                .orElseThrow(() -> new AppException(ErrorCode.SCORE_NOT_EXISTED));
        // Bản nhạc không xem được thì trả "không tồn tại" để không lộ id
        if (!scoreFileService.canView(score)) {
            throw new AppException(ErrorCode.SCORE_NOT_EXISTED);
        }
        if (playlistItemRepository.existsByPlaylistAndScore(playlist, score)) {
            throw new AppException(ErrorCode.PLAYLIST_SCORE_DUPLICATED);
        }
        int next = playlistItemRepository
                        .findByPlaylistOrderByPositionAsc(playlist)
                        .size()
                + 1;
        playlistItemRepository.save(PlaylistItem.builder()
                .playlist(playlist)
                .score(score)
                .position(next)
                .build());
        return toItemResponses(playlist);
    }

    @Override
    @Transactional
    public List<PlaylistItemResponse> removeScore(String id, String scoreId) {
        Playlist playlist = findOwned(id);
        List<PlaylistItem> items = playlistItemRepository.findByPlaylistOrderByPositionAsc(playlist);
        PlaylistItem target = items.stream()
                .filter(i -> i.getScore().getId().equals(scoreId))
                .findFirst()
                .orElseThrow(() -> new AppException(ErrorCode.PLAYLIST_SCORE_NOT_IN_PLAYLIST));
        playlist.getPlaylistItems().removeIf(i -> i.getId().equals(target.getId()));
        playlistItemRepository.delete(target);
        items.remove(target);
        renumber(items);
        playlistItemRepository.saveAll(items);
        return toItemResponses(playlist);
    }

    @Override
    @Transactional
    public List<PlaylistItemResponse> reorder(String id, PlaylistOrderRequest request) {
        Playlist playlist = findOwned(id);
        List<PlaylistItem> items = playlistItemRepository.findByPlaylistOrderByPositionAsc(playlist);
        List<String> order = request == null || request.getScoreIds() == null ? List.of() : request.getScoreIds();
        // Phải đúng bằng tập bài hiện có: cùng số lượng, không trùng, không thừa/thiếu
        if (order.size() != items.size() || new HashSet<>(order).size() != order.size()) {
            throw new AppException(ErrorCode.PLAYLIST_ORDER_INVALID);
        }
        Map<String, PlaylistItem> byScore =
                items.stream().collect(Collectors.toMap(i -> i.getScore().getId(), Function.identity()));
        List<PlaylistItem> sorted = new ArrayList<>();
        for (String scoreId : order) {
            PlaylistItem item = byScore.get(scoreId);
            if (item == null) {
                throw new AppException(ErrorCode.PLAYLIST_ORDER_INVALID);
            }
            sorted.add(item);
        }
        renumber(sorted);
        playlistItemRepository.saveAll(sorted);
        return toItemResponses(playlist);
    }

    private static void renumber(List<PlaylistItem> items) {
        for (int i = 0; i < items.size(); i++) {
            items.get(i).setPosition(i + 1);
        }
    }

    private List<PlaylistItemResponse> toItemResponses(Playlist playlist) {
        return playlistItemRepository.findByPlaylistOrderByPositionAsc(playlist).stream()
                .map(i -> PlaylistItemResponse.builder()
                        .scoreId(i.getScore().getId())
                        .title(i.getScore().getTitle())
                        .composer(i.getScore().getComposer())
                        .difficulty(i.getScore().getDifficulty())
                        .measureCount(i.getScore().getMeasureCount())
                        .position(i.getPosition() == null ? 0 : i.getPosition())
                        .build())
                .toList();
    }

    private void apply(Playlist playlist, PlaylistRequest request) {
        String name = request == null || request.getName() == null
                ? null
                : request.getName().trim();
        if (!StringUtils.hasText(name) || name.length() > MAX_NAME) {
            throw new AppException(ErrorCode.PLAYLIST_NAME_INVALID);
        }
        String description = request.getDescription() == null
                ? null
                : request.getDescription().trim();
        if (description != null && description.length() > MAX_DESCRIPTION) {
            throw new AppException(ErrorCode.PLAYLIST_DESCRIPTION_INVALID);
        }
        playlist.setName(name);
        playlist.setDescription(StringUtils.hasText(description) ? description : null);
    }

    /** Playlist của người khác cũng trả "không tồn tại" để không lộ id. */
    private Playlist findOwned(String id) {
        Member me = currentMember();
        return playlistRepository
                .findById(id)
                .filter(p -> p.getMember().getId().equals(me.getId()))
                .orElseThrow(() -> new AppException(ErrorCode.PLAYLIST_NOT_EXISTED));
    }

    private Member currentMember() {
        return memberRepository
                .findByEmail(SecurityUtils.getCurrentEmail())
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_EXISTED));
    }

    private PlaylistResponse toResponse(Playlist p) {
        return PlaylistResponse.builder()
                .id(p.getId())
                .name(p.getName())
                .description(p.getDescription())
                .scoreCount(p.getPlaylistItems().size())
                .build();
    }
}
