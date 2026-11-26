package com.ptit.music_be.dto.enums.score;

/** Điệu thức của khóa nhạc khi tạo bản nhạc trống. */
public enum KeyMode {
    MAJOR("major"),
    MINOR("minor");

    private final String musicXml;

    KeyMode(String musicXml) {
        this.musicXml = musicXml;
    }

    /** Giá trị của phần tử {@code <mode>} trong MusicXML. */
    public String musicXml() {
        return musicXml;
    }
}
