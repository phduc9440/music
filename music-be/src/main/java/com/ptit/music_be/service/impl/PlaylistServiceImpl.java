package com.ptit.music_be.service.impl;

import java.util.List;

import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.ptit.music_be.dto.request.PlaylistRequest;
import com.ptit.music_be.dto.response.PlaylistResponse;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.Playlist;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.repository.MemberRepository;
import com.ptit.music_be.repository.PlaylistRepository;
import com.ptit.music_be.service.PlaylistService;
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

    private void apply(Playlist playlist, PlaylistRequest request) {
        String name = request == null || request.getName() == null ? null : request.getName().trim();
        if (!StringUtils.hasText(name) || name.length() > MAX_NAME) {
            throw new AppException(ErrorCode.PLAYLIST_NAME_INVALID);
        }
        String description = request.getDescription() == null ? null : request.getDescription().trim();
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
