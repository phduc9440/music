package com.ptit.music_be.repository;

import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.Otp;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface OtpRepository extends JpaRepository<Otp, String> {
    Optional<Otp> findByMemberAndOtpCode(Member member, String otpCode);
    
    @org.springframework.transaction.annotation.Transactional
    @org.springframework.data.jpa.repository.Modifying
    void deleteByMember(Member member);
}
