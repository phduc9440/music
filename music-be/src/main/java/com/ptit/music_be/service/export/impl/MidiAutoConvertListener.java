package com.ptit.music_be.service.export.impl;

import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import com.ptit.music_be.event.ScoreImportedEvent;
import com.ptit.music_be.service.export.ExportService;

import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;
import lombok.extern.slf4j.Slf4j;

/** Sau khi import file MIDI thành công, tự tạo task chuyển MIDI sang MusicXML. */
@Component
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
@Slf4j
public class MidiAutoConvertListener {

    ExportService exportService;

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onImported(ScoreImportedEvent event) {
        if (!event.midi()) {
            return;
        }
        try {
            exportService.startMidiConversionForImport(event.scoreId(), event.memberId());
        } catch (RuntimeException e) {
            // Import đã xong; người dùng vẫn có thể bấm chuyển thủ công trên trang chi tiết
            log.warn("Không tự chuyển được MIDI của bản nhạc {}: {}", event.scoreId(), e.getMessage());
        }
    }
}
