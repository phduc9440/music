package com.ptit.music_be.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.Otp;

@Repository
public interface OtpRepository extends JpaRepository<Otp, String> {
    Optional<Otp> findByMemberAndOtpCode(Member member, String otpCode);

    @org.springframework.transaction.annotation.Transactional
    @org.springframework.data.jpa.repository.Modifying
    void deleteByMember(Member member);
}
