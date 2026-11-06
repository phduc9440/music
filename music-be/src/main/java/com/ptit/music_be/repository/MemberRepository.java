package com.ptit.music_be.repository;

import java.util.Optional;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.ptit.music_be.entity.Member;

@Repository
public interface MemberRepository extends JpaRepository<Member, String> {

    Optional<Member> findByEmail(String email);

    boolean existsByEmail(String email);

    /** Mọi thành viên có vai trò ADMIN (để gửi thông báo duyệt). */
    @Query("select distinct mr.member from MemberRole mr where mr.role.name = 'ADMIN'")
    java.util.List<Member> findAllAdmins();

    @Query(
            """
			SELECT m FROM Member m
			WHERE :keyword IS NULL
			OR LOWER(m.email) LIKE LOWER(CONCAT('%', :keyword, '%'))
			OR LOWER(m.fullName) LIKE LOWER(CONCAT('%', :keyword, '%'))
			""")
    Page<Member> search(@Param("keyword") String keyword, Pageable pageable);
}
