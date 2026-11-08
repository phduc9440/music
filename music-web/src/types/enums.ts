/**
 * Khớp enum BE: DB và API đều dùng số. Dùng const object (thay cho TS enum) để tương thích erasableSyntaxOnly.
 * Ví dụ: AuthProvider.GOOGLE === 2.
 */
export const AuthProvider = { LOCAL: 1, GOOGLE: 2 } as const;
export type AuthProvider = (typeof AuthProvider)[keyof typeof AuthProvider];

export const MemberStatus = { ACTIVE: 1, INACTIVE: 2 } as const;
export type MemberStatus = (typeof MemberStatus)[keyof typeof MemberStatus];

export const SharePermission = { VIEW: 1, EDIT: 2 } as const;
export type SharePermission = (typeof SharePermission)[keyof typeof SharePermission];

export const PracticeMode = { FREE: 1, LOOP: 2, TEST: 3 } as const;
export type PracticeMode = (typeof PracticeMode)[keyof typeof PracticeMode];

export type ProcessingStatus = 'NONE' | 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
export type ScoreSource = 'OMR' | 'IMPORT' | 'MANUAL';
export type Visibility = 'PRIVATE' | 'PUBLIC';
export type Difficulty = 'EASY' | 'MEDIUM' | 'HARD' | 'EXPERT';
export type ScoreSort = 'newest' | 'oldest' | 'title';
export type TaskStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
/** Loại bản gốc khi upload OMR (BE: OmrSourceType), dùng cho thống kê SER 1.7. */
export type OmrSourceType = 'PHOTO' | 'SCAN' | 'PDF_NATIVE';
