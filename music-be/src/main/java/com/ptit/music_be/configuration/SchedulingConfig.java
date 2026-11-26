package com.ptit.music_be.configuration;

import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/** Bật {@code @Scheduled} cho job quét task OMR ({@code AiTaskWatchdog}). */
@Configuration
@EnableScheduling
public class SchedulingConfig {}
