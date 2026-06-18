package com.ptit.music_be.repository;

import com.ptit.music_be.entity.Admin;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface AdminRepository extends JpaRepository<Admin, String> {

	Optional<Admin> findByUsername(String username);
}
