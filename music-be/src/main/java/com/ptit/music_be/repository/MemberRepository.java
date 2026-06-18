package com.ptit.music_be.repository;

import com.ptit.music_be.entity.Member;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface MemberRepository extends JpaRepository<Member, String> {

	Optional<Member> findByUsername(String username);

	boolean existsByUsername(String username);

	boolean existsByEmail(String email);
}
