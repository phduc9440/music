package com.ptit.music_be.dto.response;

/**
 * Kết quả ghi nhận lượt xem.
 *
 * @param viewCount tổng lượt xem hiện tại của bản nhạc
 * @param counted true nếu lần gọi này đã làm tăng lượt xem
 */
public record ViewCountResponse(long viewCount, boolean counted) {}
