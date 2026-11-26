package com.ptit.music_be.configuration;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;

import com.ptit.music_be.utils.MusicXmlInspector;
import com.ptit.music_be.utils.MusicXmlSummary;

class SeedMusicXmlInitializerTest {

    @Test
    void picksPieceByTitlePrefixIgnoringAccents() {
        assertThat(SeedMusicXmlInitializer.resourceFor("Für Elise")).isEqualTo("fur-elise");
        assertThat(SeedMusicXmlInitializer.resourceFor("Für Elise (giản lược)")).isEqualTo("fur-elise");
        assertThat(SeedMusicXmlInitializer.resourceFor("Gymnopédie No. 1")).isEqualTo("gymnopedie");
        assertThat(SeedMusicXmlInitializer.resourceFor("Happy Birthday (bản phối đơn giản)"))
                .isEqualTo("happy-birthday");
        assertThat(SeedMusicXmlInitializer.resourceFor("Diễm xưa")).isEqualTo(SeedMusicXmlInitializer.FALLBACK);
        assertThat(SeedMusicXmlInitializer.resourceFor(null)).isEqualTo(SeedMusicXmlInitializer.FALLBACK);
    }

    @Test
    void everyBundledFileIsValidMusicXml() throws IOException {
        List<String> names = new ArrayList<>(SeedMusicXmlInitializer.PIECES.values());
        names.add(SeedMusicXmlInitializer.FALLBACK);
        for (String name : names) {
            byte[] xml = read(name);
            MusicXmlSummary summary = MusicXmlInspector.inspect(xml);
            assertThat(summary.measureCount()).as(name).isPositive();
            assertThat(summary.staffCount()).as(name).isEqualTo(2);
        }
    }

    @Test
    void replacesTitleAndComposerWithEscapedValues() throws IOException {
        byte[] xml = SeedMusicXmlInitializer.withTitle(read("practice-scale"), "Diễm xưa & <b>", "Trịnh Công Sơn");
        String text = new String(xml, StandardCharsets.UTF_8);
        assertThat(text).contains("<work-title>Diễm xưa &amp; &lt;b&gt;</work-title>");
        assertThat(text).contains("<creator type=\"composer\">Trịnh Công Sơn</creator>");
        MusicXmlInspector.inspect(xml);
    }

    private static byte[] read(String name) throws IOException {
        try (InputStream in =
                new ClassPathResource(SeedMusicXmlInitializer.RESOURCE_DIR + name + ".musicxml").getInputStream()) {
            return in.readAllBytes();
        }
    }
}
