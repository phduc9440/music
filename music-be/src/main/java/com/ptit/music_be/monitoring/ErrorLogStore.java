package com.ptit.music_be.monitoring;

import java.time.Instant;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;

import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import com.ptit.music_be.dto.response.admin.ErrorLogResponse;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.LoggerContext;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.classic.spi.ThrowableProxyUtil;
import ch.qos.logback.core.AppenderBase;

/**
 * Giữ trong bộ nhớ các bản ghi log mức ERROR gần nhất (tối đa CAPACITY) để admin xem ở trang giám sát. Dữ liệu mất khi
 * khởi động lại backend. Lấy log bằng một logback appender gắn vào root logger.
 */
@Component
public class ErrorLogStore {

    static final int CAPACITY = 200;
    static final int MAX_STACK_CHARS = 6000;
    static final int MAX_MESSAGE_CHARS = 2000;

    private final Deque<ErrorLogResponse> entries = new ArrayDeque<>();
    private final AtomicLong sequence = new AtomicLong();
    private final AtomicLong totalSinceStart = new AtomicLong();
    private Appender appender;

    @PostConstruct
    void attach() {
        if (LoggerFactory.getILoggerFactory() instanceof LoggerContext context) {
            appender = new Appender();
            appender.setName("ERROR_LOG_STORE");
            appender.setContext(context);
            appender.start();
            context.getLogger(Logger.ROOT_LOGGER_NAME).addAppender(appender);
        }
    }

    @PreDestroy
    void detach() {
        if (appender != null && LoggerFactory.getILoggerFactory() instanceof LoggerContext context) {
            context.getLogger(Logger.ROOT_LOGGER_NAME).detachAppender(appender);
            appender.stop();
        }
    }

    /** Các bản ghi mới nhất trước, tối đa limit. */
    public List<ErrorLogResponse> latest(int limit) {
        synchronized (entries) {
            List<ErrorLogResponse> result = new ArrayList<>();
            for (var it = entries.descendingIterator(); it.hasNext() && result.size() < limit; ) {
                result.add(it.next());
            }
            return result;
        }
    }

    /** Số lỗi từ lúc backend khởi động (kể cả các lỗi đã bị đẩy khỏi bộ đệm hoặc đã xóa). */
    public long totalSinceStart() {
        return totalSinceStart.get();
    }

    public void clear() {
        synchronized (entries) {
            entries.clear();
        }
    }

    private void add(ErrorLogResponse entry) {
        totalSinceStart.incrementAndGet();
        synchronized (entries) {
            if (entries.size() >= CAPACITY) {
                entries.removeFirst();
            }
            entries.addLast(entry);
        }
    }

    private static String truncate(String value, int max) {
        if (value == null || value.length() <= max) {
            return value;
        }
        return value.substring(0, max) + "… (đã cắt bớt)";
    }

    private class Appender extends AppenderBase<ILoggingEvent> {
        @Override
        protected void append(ILoggingEvent event) {
            if (!event.getLevel().isGreaterOrEqual(Level.ERROR)) {
                return;
            }
            var proxy = event.getThrowableProxy();
            add(ErrorLogResponse.builder()
                    .id(sequence.incrementAndGet())
                    .timestamp(Instant.ofEpochMilli(event.getTimeStamp()))
                    .level(event.getLevel().toString())
                    .logger(event.getLoggerName())
                    .thread(event.getThreadName())
                    .message(truncate(event.getFormattedMessage(), MAX_MESSAGE_CHARS))
                    .exceptionClass(proxy == null ? null : proxy.getClassName())
                    .stackTrace(proxy == null ? null : truncate(ThrowableProxyUtil.asString(proxy), MAX_STACK_CHARS))
                    .build());
        }
    }
}
