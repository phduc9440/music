package com.ptit.music_be.dto.enums;

import java.time.Period;

public enum BillingPeriod {
    MONTH(Period.ofMonths(1)),
    YEAR(Period.ofYears(1));

    private final Period duration;

    BillingPeriod(Period duration) {
        this.duration = duration;
    }

    public Period duration() {
        return duration;
    }
}
