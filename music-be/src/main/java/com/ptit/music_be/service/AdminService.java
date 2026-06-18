package com.ptit.music_be.service;

import com.ptit.music_be.dto.request.AccountCreationRequest;
import com.ptit.music_be.dto.request.AccountUpdateRequest;
import com.ptit.music_be.dto.request.PageRequest;

import com.ptit.music_be.dto.response.AdminResponse;
import com.ptit.music_be.dto.response.PageResponse;

public interface AdminService {

	AdminResponse getMyInfo();

	AdminResponse createAccount(AccountCreationRequest request);

	PageResponse<AdminResponse> getAllAccounts(PageRequest request);

	AdminResponse getAccount(String id);

	AdminResponse updateAccount(String id, AccountUpdateRequest request);

	void deleteAccount(String id);
}
