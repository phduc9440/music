package com.ptit.music_be.service.export;

import java.math.BigDecimal;
import java.math.RoundingMode;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * Sinh file style {@code .mss} cho MuseScore khi xuất PDF (đặc tả 1.30): khổ giấy, hướng, lề, cỡ khuông và cách đánh số
 * ô nhịp. File được nạp bằng {@code mscore -S style.mss}.
 *
 * <p>Tên thẻ đã đối chiếu với MuseScore 3.6.2: khối {@code <Style>} trong {@code legacy-style-defaults-v3.mss} (đi kèm
 * ứng dụng) cho các thẻ trang và đánh số ô nhịp, và khối {@code <Style><Spatium>} trong file {@code .mscx} do chính
 * MuseScore 3.6.2 ghi ra. Khổ giấy và lề tính bằng inch, {@code Spatium} (khoảng cách giữa hai dòng kẻ) tính bằng mm.
 * File style một phần (như {@code Leland.mss}) vẫn được MuseScore nạp nên chỉ cần ghi các thẻ cần đổi.
 */
public final class MssStyleBuilder {

    /** Kích thước giấy (inch) đúng như MuseScore dùng: A4 8.27 x 11.69, Letter 8.5 x 11. */
    private static final double A4_WIDTH = 8.27;

    private static final double A4_HEIGHT = 11.69;
    private static final double LETTER_WIDTH = 8.5;
    private static final double LETTER_HEIGHT = 11.0;
    private static final double MM_PER_INCH = 25.4;

    private MssStyleBuilder() {}

    /** Dựng style từ các tùy chọn PDF đã chuẩn hóa (xem {@code ExportOptionsValidator}). */
    public static String fromOptions(JsonNode options) {
        return build(
                options.path("pageSize").asText("A4"),
                options.path("orientation").asText("PORTRAIT"),
                options.path("staffSpaceMm").asDouble(1.75),
                options.path("marginMm").asInt(15),
                options.path("measureNumbers").asText("SYSTEM"));
    }

    /**
     * @param pageSize {@code A4} hoặc {@code LETTER}
     * @param orientation {@code PORTRAIT} hoặc {@code LANDSCAPE}
     * @param staffSpaceMm khoảng cách giữa hai dòng kẻ (mm), mặc định của MuseScore là 1.75
     * @param marginMm lề cả bốn phía (mm)
     * @param measureNumbers {@code SYSTEM} (đầu mỗi hàng), {@code EVERY} (mọi ô nhịp) hoặc {@code NONE}
     */
    public static String build(
            String pageSize, String orientation, double staffSpaceMm, int marginMm, String measureNumbers) {
        boolean letter = "LETTER".equals(pageSize);
        double width = letter ? LETTER_WIDTH : A4_WIDTH;
        double height = letter ? LETTER_HEIGHT : A4_HEIGHT;
        if ("LANDSCAPE".equals(orientation)) {
            double swap = width;
            width = height;
            height = swap;
        }
        double margin = marginMm / MM_PER_INCH;
        double printableWidth = width - 2 * margin;

        StringBuilder xml = new StringBuilder();
        xml.append("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
        xml.append("<museScore version=\"3.02\">\n");
        xml.append("  <Style>\n");
        tag(xml, "pageWidth", width);
        tag(xml, "pageHeight", height);
        tag(xml, "pagePrintableWidth", printableWidth);
        tag(xml, "pageEvenLeftMargin", margin);
        tag(xml, "pageOddLeftMargin", margin);
        tag(xml, "pageEvenTopMargin", margin);
        tag(xml, "pageOddTopMargin", margin);
        tag(xml, "pageEvenBottomMargin", margin);
        tag(xml, "pageOddBottomMargin", margin);
        // Một mặt giấy: lề trái và phải của trang chẵn, lẻ như nhau
        xml.append("    <pageTwosided>0</pageTwosided>\n");
        tag(xml, "Spatium", staffSpaceMm);
        switch (measureNumbers == null ? "SYSTEM" : measureNumbers) {
            case "NONE" -> xml.append("    <showMeasureNumber>0</showMeasureNumber>\n");
            case "EVERY" -> {
                xml.append("    <showMeasureNumber>1</showMeasureNumber>\n");
                xml.append("    <measureNumberSystem>0</measureNumberSystem>\n");
                xml.append("    <measureNumberInterval>1</measureNumberInterval>\n");
            }
            default -> {
                xml.append("    <showMeasureNumber>1</showMeasureNumber>\n");
                xml.append("    <measureNumberSystem>1</measureNumberSystem>\n");
            }
        }
        xml.append("    <showMeasureNumberOne>0</showMeasureNumberOne>\n");
        xml.append("  </Style>\n");
        xml.append("</museScore>\n");
        return xml.toString();
    }

    private static void tag(StringBuilder xml, String name, double value) {
        xml.append("    <")
                .append(name)
                .append('>')
                .append(number(value))
                .append("</")
                .append(name)
                .append(">\n");
    }

    /** Số thực không dùng ký hiệu khoa học, tối đa 6 chữ số thập phân, không có số 0 thừa ở cuối. */
    static String number(double value) {
        return BigDecimal.valueOf(value)
                .setScale(6, RoundingMode.HALF_UP)
                .stripTrailingZeros()
                .toPlainString();
    }
}
