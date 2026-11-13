package com.ptit.music_be.service.collab.live;

import java.time.Instant;

import com.ptit.music_be.service.collab.live.LiveMessages.Selection;

/** Một tab trình duyệt đang ở trong phiên của một bản nhạc. Chỉ {@link LiveSessionRegistry} được sửa. */
public final class LiveParticipant {

    private static final long OP_WINDOW_MILLIS = 1_000;

    final String sessionId;
    final String email;
    final String memberId;
    final String name;
    int colorIndex;
    boolean editing;
    Selection selection;
    Instant lastSeen;
    private long opWindowStart;
    private int opCount;

    LiveParticipant(String sessionId, String email, String memberId, String name, Instant now) {
        this.sessionId = sessionId;
        this.email = email;
        this.memberId = memberId;
        this.name = name;
        this.lastSeen = now;
    }

    public String sessionId() {
        return sessionId;
    }

    public String email() {
        return email;
    }

    public String memberId() {
        return memberId;
    }

    public String name() {
        return name;
    }

    public boolean editing() {
        return editing;
    }

    /** Giới hạn số gói thao tác mỗi giây của một người. */
    synchronized boolean allowOp(Instant now, int perSecond) {
        long t = now.toEpochMilli();
        if (t - opWindowStart >= OP_WINDOW_MILLIS) {
            opWindowStart = t;
            opCount = 0;
        }
        opCount += 1;
        return opCount <= perSecond;
    }

    LiveMessages.Participant toMessage() {
        return new LiveMessages.Participant(sessionId, memberId, name, colorIndex, editing, selection);
    }
}
