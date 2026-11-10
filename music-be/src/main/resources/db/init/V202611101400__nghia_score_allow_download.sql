-- Chủ bản nhạc quyết định người xem có được tải MusicXML, MIDI, âm thanh, PDF hay không (mặc định: không).
ALTER TABLE scores
    ADD COLUMN allow_download TINYINT(1) NOT NULL DEFAULT 0;
