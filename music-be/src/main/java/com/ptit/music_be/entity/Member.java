package com.ptit.music_be.entity;

import com.ptit.music_be.dto.enums.AuthProvider;
import com.ptit.music_be.dto.enums.Role;

import jakarta.persistence.*;
import lombok.*;
import lombok.experimental.FieldDefaults;
import lombok.experimental.SuperBuilder;

@Table(name = "members")
@Inheritance(strategy = InheritanceType.JOINED)
@Entity
@Data
@NoArgsConstructor
@AllArgsConstructor
@SuperBuilder
@FieldDefaults(level = AccessLevel.PRIVATE)
public class Member {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    String id;

    @Column(name = "username", unique = true)
    String username;

    @Column(unique = true)
    String email;
    String password;
    String phone;
    String fullName;
    @Enumerated(EnumType.STRING)
    Role role;

    @Enumerated(EnumType.STRING)
    AuthProvider authProvider;
}
