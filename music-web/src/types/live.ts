/** Gói tin của kênh đồng chỉnh sửa (khớp `LiveMessages` ở BE). */

export interface LiveSelection {
  partIndex: number;
  from: number;
  to: number;
}

export interface LiveParticipant {
  sessionId: string;
  memberId: string;
  name: string;
  colorIndex: number;
  editing: boolean;
  selection: LiveSelection | null;
}

export interface LivePresence {
  scoreId: string;
  participants: LiveParticipant[];
}

export interface LiveMeasureRef {
  partIndex: number;
  measureIndex: number;
}

export interface LiveLockEntry extends LiveMeasureRef {
  sessionId: string;
}

export interface LiveLocks {
  scoreId: string;
  wholeHolder: string | null;
  locks: LiveLockEntry[];
}

export interface LiveLockResult {
  scoreId: string;
  sessionId: string;
  granted: boolean;
  released: boolean;
  heldBy: string | null;
  heldByName: string | null;
}

export interface LiveMeasureXml extends LiveMeasureRef {
  xml: string;
  hash: string;
}

export interface LiveMeasureChange extends LiveMeasureRef {
  beforeHash: string;
  afterXml: string;
}

export interface LiveOpRequest {
  opId: string;
  baseSeq: number;
  measures: LiveMeasureChange[] | null;
  structural: { afterXml: string } | null;
}

export interface LiveOp {
  scoreId: string;
  seq: number;
  opId: string;
  sessionId: string;
  memberId: string;
  measures: LiveMeasureXml[];
  structuralXml: string | null;
  structuralHashes: string[][] | null;
}

export interface LiveRejected {
  scoreId: string;
  opId: string;
  reason: 'CONFLICT' | 'STRUCTURAL_REQUIRED' | 'STALE' | 'INVALID' | 'LOCK_REQUIRED';
  seq: number;
  measures: LiveMeasureXml[];
  structuralXml: string | null;
}

export interface LiveJoinResult {
  scoreId: string;
  sessionId: string;
  editing: boolean;
  seq: number;
  baseVersion: number;
  xml: string | null;
  hashes: string[][] | null;
  ops: LiveOp[];
}

export interface LiveVersion {
  scoreId: string;
  version: number;
  seqTo: number;
  closed: boolean;
}

export interface LiveError {
  code: number;
  message: string;
}

/** Trạng thái kết nối hiển thị cho người dùng. */
export type LiveStatus = 'off' | 'connecting' | 'synced' | 'syncing' | 'offline';
