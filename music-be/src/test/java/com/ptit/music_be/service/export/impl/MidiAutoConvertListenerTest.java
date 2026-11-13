package com.ptit.music_be.service.export.impl;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import org.junit.jupiter.api.Test;

import com.ptit.music_be.event.ScoreImportedEvent;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.service.export.ExportService;

class MidiAutoConvertListenerTest {

    final ExportService exportService = mock(ExportService.class);
    final MidiAutoConvertListener listener = new MidiAutoConvertListener(exportService);

    @Test
    void ignoresNonMidiImports() {
        listener.onImported(new ScoreImportedEvent("s1", "m1", false));

        verify(exportService, never()).startMidiConversionForImport(anyString(), anyString());
    }

    @Test
    void startsConversionForMidiImports() {
        listener.onImported(new ScoreImportedEvent("s1", "m1", true));

        verify(exportService).startMidiConversionForImport("s1", "m1");
    }

    @Test
    void swallowsConversionFailures() {
        doThrow(new AppException(ErrorCode.EXPORT_NOT_AVAILABLE))
                .when(exportService)
                .startMidiConversionForImport("s1", "m1");

        assertThatCode(() -> listener.onImported(new ScoreImportedEvent("s1", "m1", true)))
                .doesNotThrowAnyException();
    }
}
