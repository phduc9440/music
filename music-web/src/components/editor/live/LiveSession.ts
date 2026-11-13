/**
 * Phía client của đồng chỉnh sửa: giữ bản sao "đã được server xác nhận" của từng ô, hàng đợi thao tác (mỗi lúc chỉ một
 * thao tác đang bay, nên thứ tự luôn khớp với server), và áp dụng thao tác của người khác vào {@link ScoreDocument}.
 * Server là nguồn đúng duy nhất: thao tác bị từ chối thì ô được trả về bản của server. Không phụ thuộc React.
 */
import type { EditCommand } from '../core/commands';
import type { ScoreDocument } from '../core/ScoreDocument';
import type {
  LiveError,
  LiveJoinResult,
  LiveLockResult,
  LiveLocks,
  LiveMeasureChange,
  LiveMeasureRef,
  LiveMeasureXml,
  LiveOp,
  LiveParticipant,
  LivePresence,
  LiveRejected,
  LiveSelection,
  LiveStatus,
  LiveVersion,
} from '../../../types';
import { LiveClient } from './LiveClient';

/** Sau chừng này (ms) không đụng tới, ô đang giữ khóa mà không còn được chọn sẽ được nhả. */
const RELEASE_IDLE_MS = 5_000;
/** Gom các lần đổi vùng chọn liên tiếp thành một yêu cầu khóa. */
const LOCK_DEBOUNCE_MS = 150;

/** Các phần tử trong <attributes> mà thay đổi chúng là thay đổi cấu trúc (khớp `LiveDocument.contextSignature` ở BE). */
const CONTEXT_TAGS = new Set(['divisions', 'key', 'time', 'clef', 'staves', 'transpose']);

export const measureKey = (partIndex: number, measureIndex: number): string => `${partIndex}:${measureIndex}`;

export interface LiveState {
  status: LiveStatus;
  participants: LiveParticipant[];
  selfSessionId: string | null;
  locks: LiveLocks | null;
  /** Số thao tác chưa được server xác nhận. */
  pending: number;
  /** Có thay đổi đã đồng bộ nhưng chưa thành phiên bản. */
  unsaved: boolean;
}

export interface SessionCallbacks {
  onState: (state: LiveState) => void;
  /** Tài liệu vừa bị người khác (hoặc server) đổi: `'all'` nếu đổi cấu trúc, ngược lại là khóa các ô đã đổi. */
  onDocChanged: (touched: ReadonlySet<string> | 'all') => void;
  onVersion: (version: number) => void;
  /** Báo người dùng bằng khóa dịch; `error` là lỗi từ server. */
  onNotice: (key: string, params?: Record<string, string | number>) => void;
  onServerError: (error: LiveError) => void;
  getSelection: () => LiveSelection | null;
}

interface QueuedOp {
  opId: string;
  /** Null: thao tác cấu trúc. */
  measures: Array<{ ref: LiveMeasureRef; afterXml: string }> | null;
  structuralXml: string | null;
}

const serializer = new XMLSerializer();

function parseMeasure(xml: string): Element {
  return new DOMParser().parseFromString(xml, 'application/xml').documentElement;
}

function contextSignature(measure: Element): string {
  const parts: string[] = [];
  for (const attrs of Array.from(measure.children).filter((c) => c.tagName === 'attributes')) {
    for (const child of Array.from(attrs.children)) {
      if (CONTEXT_TAGS.has(child.tagName)) parts.push(serializer.serializeToString(child));
    }
  }
  return parts.join('|');
}

/** Lệnh đổi cấu trúc (đổi đầu file, số ô/part, hoặc khóa/nhịp/khuông/khóa nhạc của một ô) cần khóa cả bài. */
export function isStructural(command: EditCommand): boolean {
  if (command.head || command.parts) return true;
  return command.snapshots.some((s) => contextSignature(s.before) !== contextSignature(s.after));
}

export class LiveSession {
  private readonly client: LiveClient;
  private link: 'connecting' | 'online' | 'offline' = 'connecting';
  private participants: LiveParticipant[] = [];
  private locks: LiveLocks | null = null;
  private selfSessionId: string | null = null;
  private awaitingJoin = false;
  private seq = -1;
  private unsaved = false;
  /** Mã băm và XML do server xác nhận, theo part rồi theo ô. */
  private hashes: string[][] = [];
  private confirmed = new Map<string, string>();
  private queue: QueuedOp[] = [];
  private inFlight: QueuedOp | null = null;
  private waitingLock = false;
  private desired: LiveMeasureRef[] = [];
  private lastWanted = new Map<string, number>();
  private lockTimer: number | null = null;
  private opCounter = 0;
  private stopped = false;
  private readonly scoreId: string;
  private readonly doc: ScoreDocument;
  private readonly canEdit: boolean;
  private readonly cb: SessionCallbacks;

  constructor(scoreId: string, doc: ScoreDocument, canEdit: boolean, cb: SessionCallbacks) {
    this.scoreId = scoreId;
    this.doc = doc;
    this.canEdit = canEdit;
    this.cb = cb;
    this.client = new LiveClient(
      scoreId,
      {
        onConnect: () => this.join(),
        onDisconnect: () => this.setLink('offline'),
        onJoin: (r) => this.onJoin(r),
        onPresence: (p) => this.onPresence(p),
        onLocks: (l) => this.onLocks(l),
        onLockResult: (r) => this.onLockResult(r),
        onOp: (op) => this.onOp(op),
        onRejected: (r) => this.onRejected(r),
        onVersion: (v) => this.onVersion(v),
        onError: (e) => this.cb.onServerError(e),
      },
      cb.getSelection,
    );
  }

  start(): void {
    this.client.start();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.lockTimer !== null) window.clearTimeout(this.lockTimer);
    await this.client.stop();
  }

  // ------------------------------------------------------------------ giao diện cho editor

  /** Tên người đang giữ khóa một trong các ô mà lệnh chạm tới (không phải mình), hoặc null nếu tự do sửa. */
  heldByOther(command: EditCommand): string | null {
    const mine = this.selfSessionId;
    const locks = this.locks;
    if (!locks) return null;
    const holderOf = (sessionId: string) =>
      this.participants.find((p) => p.sessionId === sessionId)?.name ?? '';
    if (locks.wholeHolder && locks.wholeHolder !== mine) return holderOf(locks.wholeHolder);
    for (const s of command.snapshots) {
      const entry = locks.locks.find(
        (l) => l.partIndex === s.partIndex && l.measureIndex === s.measureIndex && l.sessionId !== mine,
      );
      if (entry) return holderOf(entry.sessionId);
    }
    return null;
  }

  /** Ghi nhận lệnh vừa áp dụng cục bộ (`undo`: lệnh vừa được hoàn tác nên nội dung gửi là bản `before`). */
  enqueue(command: EditCommand, direction: 'do' | 'undo' | 'redo'): void {
    if (!this.canEdit) return;
    this.opCounter += 1;
    const opId = `${this.selfSessionId ?? 'x'}-${Date.now().toString(36)}-${this.opCounter}`;
    if (isStructural(command)) {
      this.queue.push({ opId, measures: null, structuralXml: this.doc.serialize() });
    } else {
      const measures = command.snapshots.map((s) => ({
        ref: { partIndex: s.partIndex, measureIndex: s.measureIndex },
        afterXml: serializer.serializeToString(direction === 'undo' ? s.before : s.after),
      }));
      this.queue.push({ opId, measures, structuralXml: null });
    }
    this.publishState();
    this.pump();
  }

  /** Vùng chọn hiện tại: các ô cần giữ khóa. */
  setFocus(refs: LiveMeasureRef[]): void {
    this.desired = refs;
    const now = Date.now();
    refs.forEach((r) => this.lastWanted.set(measureKey(r.partIndex, r.measureIndex), now));
    this.scheduleLockSync();
  }

  save(): void {
    this.client.save();
  }

  // ------------------------------------------------------------------ kết nối

  private join(): void {
    if (this.stopped) return;
    this.setLink('connecting');
    this.awaitingJoin = true;
    this.client.join(this.canEdit, this.seq);
  }

  private onJoin(result: LiveJoinResult): void {
    if (result.scoreId !== this.scoreId || !this.awaitingJoin) return;
    this.awaitingJoin = false;
    this.selfSessionId = result.sessionId;
    if (this.inFlight) this.queue.unshift(this.inFlight); // gửi lại gói đang bay lúc mất mạng, server loại trùng theo opId
    this.inFlight = null;
    this.waitingLock = false;
    if (result.xml !== null) {
      this.loadFull(result.xml, result.hashes ?? []);
      this.cb.onDocChanged('all');
    } else {
      const touched = new Set<string>();
      let structural = false;
      for (const op of result.ops) structural = this.applyRemote(op, touched) || structural;
      if (touched.size > 0 || structural) this.cb.onDocChanged(structural ? 'all' : touched);
    }
    this.seq = result.seq;
    this.cb.onVersion(result.baseVersion);
    this.setLink('online');
    this.scheduleLockSync();
    this.pump();
  }

  /** Nạp lại cả bài từ server và dựng lại bản sao xác nhận. */
  private loadFull(xml: string, hashes: string[][]): void {
    this.doc.restore(xml);
    this.loadMirror(xml, hashes);
  }

  /** Dựng lại bản sao xác nhận từ XML của server (không đụng tới tài liệu). */
  private loadMirror(xml: string, hashes: string[][]): void {
    this.hashes = hashes.map((row) => [...row]);
    this.confirmed.clear();
    const parsed = new DOMParser().parseFromString(xml, 'application/xml');
    Array.from(parsed.documentElement.children)
      .filter((c) => c.tagName === 'part')
      .forEach((part, p) => {
        Array.from(part.children)
          .filter((c) => c.tagName === 'measure')
          .forEach((m, i) => this.confirmed.set(measureKey(p, i), serializer.serializeToString(m)));
      });
  }

  // ------------------------------------------------------------------ nhận từ server

  private onPresence(presence: LivePresence): void {
    if (presence.scoreId !== this.scoreId) return;
    this.participants = presence.participants;
    this.publishState();
  }

  private onLocks(locks: LiveLocks): void {
    if (locks.scoreId !== this.scoreId) return;
    this.locks = locks;
    this.publishState();
    if (this.waitingLock) this.pump();
  }

  private onLockResult(result: LiveLockResult): void {
    if (result.scoreId !== this.scoreId || result.sessionId !== this.selfSessionId || result.released) return;
    if (!this.waitingLock) return;
    this.waitingLock = false;
    if (result.granted) {
      this.pump();
      return;
    }
    this.cb.onNotice('live.notice.locked', { name: result.heldByName ?? '' });
    this.revertPending();
  }

  private onOp(op: LiveOp): void {
    if (op.scoreId !== this.scoreId) return;
    if (this.inFlight && op.opId === this.inFlight.opId) {
      this.acknowledge(op);
      return;
    }
    if (op.seq <= this.seq) return; // đã nhận rồi
    if (op.seq !== this.seq + 1) {
      this.join(); // hụt gói: vào lại để nhận phần thiếu
      return;
    }
    const touched = new Set<string>();
    const structural = this.applyRemote(op, touched);
    this.seq = op.seq;
    this.unsaved = true;
    this.cb.onDocChanged(structural ? 'all' : touched);
    this.publishState();
  }

  /** Server xác nhận thao tác của mình: ghi nhận mã băm mới, không áp dụng lại vào tài liệu. */
  private acknowledge(op: LiveOp): void {
    this.record(op);
    this.seq = op.seq;
    this.unsaved = true;
    const wasStructural = this.inFlight?.measures === null;
    this.inFlight = null;
    if (wasStructural) this.client.lock([], true, true);
    this.publishState();
    this.pump();
  }

  private onRejected(rejected: LiveRejected): void {
    if (rejected.scoreId !== this.scoreId || !this.inFlight || rejected.opId !== this.inFlight.opId) return;
    if (rejected.reason === 'CONFLICT' || rejected.reason === 'LOCK_REQUIRED') {
      rejected.measures.forEach((m) => this.remember(m));
      this.cb.onNotice(rejected.reason === 'CONFLICT' ? 'live.notice.conflict' : 'live.notice.lockLost');
      this.revertPending();
      return;
    }
    // STALE / STRUCTURAL_REQUIRED / INVALID: bỏ hàng đợi và nạp lại cả bài từ server
    this.cb.onNotice(rejected.reason === 'INVALID' ? 'live.notice.invalid' : 'live.notice.resync');
    this.dropQueue();
    this.seq = -1;
    this.join();
  }

  private onVersion(version: LiveVersion): void {
    if (version.scoreId !== this.scoreId) return;
    this.unsaved = false;
    this.cb.onVersion(version.version);
    this.publishState();
  }

  // ------------------------------------------------------------------ áp dụng

  /** Áp một thao tác của người khác vào tài liệu; trả về true nếu là thao tác cấu trúc. */
  private applyRemote(op: LiveOp, touched: Set<string>): boolean {
    if (op.structuralXml !== null) {
      this.loadFull(op.structuralXml, op.structuralHashes ?? []);
      return true;
    }
    for (const m of op.measures) {
      this.doc.replaceMeasure(m.partIndex, m.measureIndex, parseMeasure(m.xml), false);
      this.remember(m);
      touched.add(measureKey(m.partIndex, m.measureIndex));
    }
    this.doc.reindex();
    return false;
  }

  private remember(m: LiveMeasureXml): void {
    this.confirmed.set(measureKey(m.partIndex, m.measureIndex), m.xml);
    if (this.hashes[m.partIndex]) this.hashes[m.partIndex][m.measureIndex] = m.hash;
  }

  private record(op: LiveOp): void {
    if (op.structuralXml !== null) {
      this.loadMirror(op.structuralXml, op.structuralHashes ?? []);
      return;
    }
    op.measures.forEach((m) => this.remember(m));
  }

  /** Trả các ô đang chờ gửi về bản server đã xác nhận rồi bỏ hàng đợi. */
  private revertPending(): void {
    const touched = new Set<string>();
    let structural = false;
    for (const op of [this.inFlight, ...this.queue]) {
      if (!op) continue;
      if (op.measures === null) structural = true;
      else op.measures.forEach((m) => touched.add(measureKey(m.ref.partIndex, m.ref.measureIndex)));
    }
    this.dropQueue();
    if (structural) {
      this.seq = -1;
      this.join();
      return;
    }
    for (const key of touched) {
      const xml = this.confirmed.get(key);
      const [p, i] = key.split(':').map(Number);
      if (xml) this.doc.replaceMeasure(p, i, parseMeasure(xml), false);
    }
    this.doc.reindex();
    this.cb.onDocChanged(touched);
  }

  private dropQueue(): void {
    this.queue = [];
    this.inFlight = null;
    this.waitingLock = false;
    this.publishState();
  }

  // ------------------------------------------------------------------ gửi

  private pump(): void {
    if (this.inFlight || this.queue.length === 0 || this.link !== 'online' || !this.selfSessionId) return;
    const next = this.queue[0];
    if (!this.holdsLocksFor(next)) {
      if (!this.waitingLock) {
        this.waitingLock = true;
        if (next.measures === null) this.client.lock([], true, false);
        else this.client.lock(next.measures.map((m) => m.ref), false, false);
      }
      return;
    }
    this.queue.shift();
    this.inFlight = next;
    this.client.ops({
      opId: next.opId,
      baseSeq: this.seq,
      measures: next.measures === null ? null : next.measures.map((m) => this.change(m)),
      structural: next.structuralXml === null ? null : { afterXml: next.structuralXml },
    });
  }

  private change(m: { ref: LiveMeasureRef; afterXml: string }): LiveMeasureChange {
    return {
      ...m.ref,
      beforeHash: this.hashes[m.ref.partIndex]?.[m.ref.measureIndex] ?? '',
      afterXml: m.afterXml,
    };
  }

  private holdsLocksFor(op: QueuedOp): boolean {
    const locks = this.locks;
    if (!locks) return false;
    if (locks.wholeHolder === this.selfSessionId) return true;
    if (op.measures === null) return false;
    return op.measures.every((m) =>
      locks.locks.some(
        (l) =>
          l.sessionId === this.selfSessionId &&
          l.partIndex === m.ref.partIndex &&
          l.measureIndex === m.ref.measureIndex,
      ),
    );
  }

  // ------------------------------------------------------------------ khóa theo vùng chọn

  private scheduleLockSync(): void {
    if (this.lockTimer !== null) window.clearTimeout(this.lockTimer);
    this.lockTimer = window.setTimeout(() => this.syncLocks(), LOCK_DEBOUNCE_MS);
  }

  private syncLocks(): void {
    this.lockTimer = null;
    if (!this.canEdit || this.link !== 'online' || !this.selfSessionId) return;
    const mine = (this.locks?.locks ?? []).filter((l) => l.sessionId === this.selfSessionId);
    const wanted = new Set(this.desired.map((r) => measureKey(r.partIndex, r.measureIndex)));
    for (const op of [this.inFlight, ...this.queue]) {
      op?.measures?.forEach((m) => wanted.add(measureKey(m.ref.partIndex, m.ref.measureIndex)));
    }
    const missing = this.desired.filter(
      (r) => !mine.some((l) => l.partIndex === r.partIndex && l.measureIndex === r.measureIndex),
    );
    if (missing.length > 0) this.client.lock(missing, false, false);
    const now = Date.now();
    const stale = mine.filter(
      (l) =>
        !wanted.has(measureKey(l.partIndex, l.measureIndex)) &&
        now - (this.lastWanted.get(measureKey(l.partIndex, l.measureIndex)) ?? 0) >= RELEASE_IDLE_MS,
    );
    if (stale.length > 0) {
      this.client.lock(
        stale.map((l) => ({ partIndex: l.partIndex, measureIndex: l.measureIndex })),
        false,
        true,
      );
    }
    if (mine.length > stale.length) this.lockTimer = window.setTimeout(() => this.syncLocks(), RELEASE_IDLE_MS);
  }

  // ------------------------------------------------------------------ trạng thái

  private setLink(link: 'connecting' | 'online' | 'offline'): void {
    this.link = link;
    this.publishState();
  }

  private publishState(): void {
    const pending = this.queue.length + (this.inFlight ? 1 : 0);
    const status: LiveStatus = this.link === 'online' ? (pending > 0 ? 'syncing' : 'synced') : this.link;
    this.cb.onState({
      status,
      participants: this.participants,
      selfSessionId: this.selfSessionId,
      locks: this.locks,
      pending,
      unsaved: this.unsaved,
    });
  }
}
