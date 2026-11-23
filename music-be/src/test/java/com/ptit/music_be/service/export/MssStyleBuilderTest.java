package com.ptit.music_be.service.export;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import javax.xml.parsers.DocumentBuilderFactory;

import org.junit.jupiter.api.Test;
import org.w3c.dom.Document;

import com.fasterxml.jackson.databind.ObjectMapper;

class MssStyleBuilderTest {

    @Test
    void a4Portrait_defaultStaffSpaceAndSystemNumbers() {
        String mss = MssStyleBuilder.build("A4", "PORTRAIT", 1.75, 15, "SYSTEM");

        assertThat(mss)
                .contains("<museScore version=\"3.02\">")
                .contains("<pageWidth>8.27</pageWidth>")
                .contains("<pageHeight>11.69</pageHeight>")
                // 15 mm = 0.590551 inch; vùng in = 8.27 - 2 x 0.590551
                .contains("<pageEvenLeftMargin>0.590551</pageEvenLeftMargin>")
                .contains("<pageOddLeftMargin>0.590551</pageOddLeftMargin>")
                .contains("<pageEvenTopMargin>0.590551</pageEvenTopMargin>")
                .contains("<pageOddBottomMargin>0.590551</pageOddBottomMargin>")
                .contains("<pagePrintableWidth>7.088898</pagePrintableWidth>")
                .contains("<pageTwosided>0</pageTwosided>")
                .contains("<Spatium>1.75</Spatium>")
                .contains("<showMeasureNumber>1</showMeasureNumber>")
                .contains("<measureNumberSystem>1</measureNumberSystem>")
                .contains("<showMeasureNumberOne>0</showMeasureNumberOne>");
    }

    @Test
    void letterLandscape_swapsWidthAndHeight() {
        String mss = MssStyleBuilder.build("LETTER", "LANDSCAPE", 2.0, 10, "NONE");

        assertThat(mss)
                .contains("<pageWidth>11</pageWidth>")
                .contains("<pageHeight>8.5</pageHeight>")
                .contains("<Spatium>2</Spatium>")
                .contains("<showMeasureNumber>0</showMeasureNumber>")
                .doesNotContain("measureNumberSystem");
    }

    @Test
    void everyMeasureNumbering() {
        String mss = MssStyleBuilder.build("A4", "PORTRAIT", 1.75, 15, "EVERY");

        assertThat(mss)
                .contains("<showMeasureNumber>1</showMeasureNumber>")
                .contains("<measureNumberSystem>0</measureNumberSystem>")
                .contains("<measureNumberInterval>1</measureNumberInterval>");
    }

    @Test
    void outputIsWellFormedXml() throws Exception {
        String mss = MssStyleBuilder.build("A4", "LANDSCAPE", 1.5, 25, "SYSTEM");

        Document doc = DocumentBuilderFactory.newInstance()
                .newDocumentBuilder()
                .parse(new ByteArrayInputStream(mss.getBytes(StandardCharsets.UTF_8)));
        assertThat(doc.getDocumentElement().getTagName()).isEqualTo("museScore");
        assertThat(doc.getElementsByTagName("Style").getLength()).isEqualTo(1);
    }

    @Test
    void fromOptions_readsNormalizedOptions() throws Exception {
        var options = new ObjectMapper()
                .readTree("{\"pageSize\":\"LETTER\",\"orientation\":\"PORTRAIT\",\"staffSpaceMm\":2.2,"
                        + "\"marginMm\":20,\"measureNumbers\":\"EVERY\"}");

        String mss = MssStyleBuilder.fromOptions(options);

        assertThat(mss)
                .contains("<pageWidth>8.5</pageWidth>")
                .contains("<Spatium>2.2</Spatium>")
                .contains("<pageEvenLeftMargin>0.787402</pageEvenLeftMargin>")
                .contains("<measureNumberInterval>1</measureNumberInterval>");
    }

    @Test
    void numbersHaveNoTrailingZerosOrExponent() {
        assertThat(MssStyleBuilder.number(11.0)).isEqualTo("11");
        assertThat(MssStyleBuilder.number(0.0)).isEqualTo("0");
        assertThat(MssStyleBuilder.number(1.75)).isEqualTo("1.75");
        assertThat(MssStyleBuilder.number(15 / 25.4)).isEqualTo("0.590551");
    }
}
