package com.ptit.music_be.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.ptit.music_be.entity.Otp;
import com.ptit.music_be.entity.User;

@Repository
public interface OtpRepository extends JpaRepository<Otp, String> {

    Optional<Otp> findByUserAndOtpCode(User user, String otpCode);

    @org.springframework.transaction.annotation.Transactional
    @org.springframework.data.jpa.repository.Modifying
    void deleteByUser(User user);
}
