package com.ptit.music_be.service.impl;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import com.ptit.music_be.dto.request.AccountCreationRequest;
import com.ptit.music_be.dto.request.AccountUpdateRequest;
import com.ptit.music_be.dto.request.PageRequest;
import com.ptit.music_be.dto.response.AdminResponse;
import com.ptit.music_be.dto.response.PageResponse;
import com.ptit.music_be.entity.Admin;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.mapper.MemberMapper;
import com.ptit.music_be.repository.AdminRepository;
import com.ptit.music_be.repository.MemberRepository;
import com.ptit.music_be.service.AdminService;

import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@Service
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
public class AdminServiceImpl implements AdminService {

    AdminRepository adminRepository;
    MemberRepository memberRepository;
    MemberMapper memberMapper;
    PasswordEncoder passwordEncoder;

    @Override
    public AdminResponse getMyInfo() {
        String username = SecurityContextHolder.getContext().getAuthentication().getName();

        return adminRepository
                .findByUsername(username)
                .map(memberMapper::toAdminResponse)
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_EXISTED));
    }

    @Override
    public AdminResponse createAccount(AccountCreationRequest request) {
        if (memberRepository.existsByUsername(request.getUsername())) {
            throw new AppException(ErrorCode.USER_EXISTED);
        }

        Admin employee = memberMapper.toAdmin(request);
        employee.setPassword(passwordEncoder.encode(request.getPassword()));

        employee = adminRepository.save(employee);
        return memberMapper.toAdminResponse(employee);
    }

    @Override
    public PageResponse<AdminResponse> getAllAccounts(PageRequest request) {
        Pageable pageable = Pageable.ofSize(request.getSize()).withPage(request.getPage());
        Page<Admin> adminPage = adminRepository.findAll(pageable);

        return PageResponse.<AdminResponse>builder()
                .content(adminPage.getContent().stream()
                        .map(memberMapper::toAdminResponse)
                        .toList())
                .pageNumber(adminPage.getNumber())
                .pageSize(adminPage.getSize())
                .totalElements(adminPage.getTotalElements())
                .totalPages(adminPage.getTotalPages())
                .build();
    }

    @Override
    public AdminResponse getAccount(String id) {
        Admin employee = adminRepository.findById(id).orElseThrow(() -> new AppException(ErrorCode.EMPLOYEE_NOT_FOUND));
        return memberMapper.toAdminResponse(employee);
    }

    @Override
    public AdminResponse updateAccount(String id, AccountUpdateRequest request) {
        Admin employee = adminRepository.findById(id).orElseThrow(() -> new AppException(ErrorCode.EMPLOYEE_NOT_FOUND));

        memberMapper.updateAdmin(employee, request);
        employee = adminRepository.save(employee);

        return memberMapper.toAdminResponse(employee);
    }

    @Override
    public void deleteAccount(String id) {
        Admin employee = adminRepository.findById(id).orElseThrow(() -> new AppException(ErrorCode.EMPLOYEE_NOT_FOUND));
        adminRepository.delete(employee);
    }
}
