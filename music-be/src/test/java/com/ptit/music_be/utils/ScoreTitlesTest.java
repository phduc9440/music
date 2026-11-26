package com.ptit.music_be.utils;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class ScoreTitlesTest {

    @Test
    void typedTitleUpTo80CharactersIsValid() {
        assertThat(ScoreTitles.isValid("Bèo dạt mây trôi")).isTrue();
        assertThat(ScoreTitles.isValid("x".repeat(80))).isTrue();
        assertThat(ScoreTitles.isValid("  " + "x".repeat(80) + "  ")).isTrue();
        assertThat(ScoreTitles.isValid("x".repeat(81))).isFalse();
        assertThat(ScoreTitles.isValid("   ")).isFalse();
        assertThat(ScoreTitles.isValid(null)).isFalse();
    }

    @Test
    void tooLongIgnoresBlank() {
        assertThat(ScoreTitles.isTooLong(null)).isFalse();
        assertThat(ScoreTitles.isTooLong("  ")).isFalse();
        assertThat(ScoreTitles.isTooLong("x".repeat(81))).isTrue();
    }

    @Test
    void fileNameUpTo80CharactersBecomesTheTitle() {
        assertThat(ScoreTitles.fromFileName("bèo dạt mây trôi.jpg")).isEqualTo("bèo dạt mây trôi");
        assertThat(ScoreTitles.fromFileName("C:\\Users\\a\\Downloads\\william-gomez-ave-maria.pdf"))
                .isEqualTo("william-gomez-ave-maria");
        assertThat(ScoreTitles.fromFileName("x".repeat(80) + ".png")).isEqualTo("x".repeat(80));
    }

    @Test
    void fileNameLongerThan80CharactersBecomesUntitled() {
        String messenger =
                "1793598573782_1629614282312674930_g1668634218578729671_de19acbe88df88a68783e9327417ade4.jpg";
        String zalo = "z6071839202145_8f3c9d2e1b47f6aa8f3c9d2e1b47f6aa9b0c1d2e3f405162738495a6b7c8d9e0f1a2b3c4.jpg";
        assertThat(ScoreTitles.fromFileName(messenger)).isEqualTo(ScoreTitles.UNTITLED);
        assertThat(ScoreTitles.fromFileName(zalo)).isEqualTo(ScoreTitles.UNTITLED);
        assertThat(ScoreTitles.fromFileName("x".repeat(81) + ".pdf")).isEqualTo(ScoreTitles.UNTITLED);
    }

    @Test
    void missingNameBecomesUntitled() {
        assertThat(ScoreTitles.fromFileName(null)).isEqualTo(ScoreTitles.UNTITLED);
        assertThat(ScoreTitles.fromFileName(".jpg")).isEqualTo(ScoreTitles.UNTITLED);
        assertThat(ScoreTitles.fromSource("   ")).isEqualTo(ScoreTitles.UNTITLED);
    }
}
