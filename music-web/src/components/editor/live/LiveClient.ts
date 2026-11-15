import { Client, type IMessage, type StompSubscription } from '@stomp/stompjs';
import { API_BASE_URL } from '../../../services/client';
import type {
  LiveError,
  LiveJoinResult,
  LiveLockResult,
  LiveLocks,
  LiveMeasureRef,
  LiveOp,
  LiveOpRequest,
  LivePresence,
  LiveRejected,
  LiveSelection,
  LiveVersion,
} from '../../../types';

/** Chu kỳ nhịp tim (ms); BE coi người im quá 45 giây là đã rời. */
export const HEARTBEAT_MS = 15_000;

export interface LiveHandlers {
  /** Đã nối (hoặc nối lại) xong: gọi {@link LiveClient.join}. */
  onConnect: () => void;
  onDisconnect: () => void;
  onJoin: (result: LiveJoinResult) => void;
  onPresence: (presence: LivePresence) => void;
  onLocks: (locks: LiveLocks) => void;
  onLockResult: (result: LiveLockResult) => void;
  onOp: (op: LiveOp) => void;
  onRejected: (rejected: LiveRejected) => void;
  onVersion: (version: LiveVersion) => void;
  onError: (error: LiveError) => void;
}

/** Địa chỉ WebSocket suy ra từ địa chỉ API (http -> ws, bỏ đuôi /api), cookie HttpOnly tự đi kèm lúc bắt tay. */
function socketUrl(): string {
  const base = API_BASE_URL.replace(/\/api\/?$/, '');
  return `${base.replace(/^http/, 'ws')}/ws`;
}

function parse<T>(message: IMessage): T | null {
  try {
    return JSON.parse(message.body) as T;
  } catch {
    return null; // gói hỏng: bỏ qua, lần đồng bộ sau sẽ sửa
  }
}

/**
 * Kết nối STOMP riêng cho một bản nhạc đang đồng chỉnh sửa. Chỉ lo vận chuyển: chuyển gói tin sang callback và gửi lệnh
 * lên `/app/scores/{id}/...`. Mất mạng thì thư viện tự nối lại sau 3 giây và gọi lại `onConnect` để vào lại phiên.
 */
export class LiveClient {
  private readonly client: Client;
  private subscriptions: StompSubscription[] = [];
  private heartbeat: number | null = null;
  private readonly scoreId: string;
  private readonly currentSelection: () => LiveSelection | null;

  constructor(scoreId: string, handlers: LiveHandlers, currentSelection: () => LiveSelection | null) {
    this.scoreId = scoreId;
    this.currentSelection = currentSelection;
    this.client = new Client({
      brokerURL: socketUrl(),
      reconnectDelay: 3_000,
      heartbeatIncoming: 10_000,
      heartbeatOutgoing: 10_000,
      onConnect: () => {
        this.subscribe(handlers);
        handlers.onConnect();
      },
      onWebSocketClose: () => {
        this.stopHeartbeat();
        handlers.onDisconnect();
      },
      onStompError: () => handlers.onDisconnect(),
    });
  }

  start(): void {
    this.client.activate();
  }

  async stop(): Promise<void> {
    this.stopHeartbeat();
    if (this.client.connected) this.publish('leave', {});
    await this.client.deactivate();
  }

  get connected(): boolean {
    return this.client.connected;
  }

  join(editing: boolean, lastSeq: number): void {
    this.publish('join', { editing, lastSeq, selection: this.currentSelection() });
    this.startHeartbeat();
  }

  presence(): void {
    this.publish('presence', { selection: this.currentSelection() });
  }

  lock(measures: LiveMeasureRef[], whole: boolean, release: boolean): void {
    this.publish('lock', { measures, whole, release });
  }

  ops(request: LiveOpRequest): void {
    this.publish('ops', request);
  }

  save(): void {
    this.publish('save', {});
  }

  private publish(action: string, body: unknown): void {
    if (!this.client.connected) return;
    this.client.publish({ destination: `/app/scores/${this.scoreId}/${action}`, body: JSON.stringify(body) });
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeat = window.setInterval(() => this.presence(), HEARTBEAT_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeat !== null) window.clearInterval(this.heartbeat);
    this.heartbeat = null;
  }

  private subscribe(h: LiveHandlers): void {
    this.subscriptions.forEach((s) => s.unsubscribe());
    const topic = (name: string) => `/topic/scores/${this.scoreId}/${name}`;
    const forward =
      <T>(handler: (value: T) => void) =>
      (message: IMessage) => {
        const value = parse<T>(message);
        if (value) handler(value);
      };
    this.subscriptions = [
      this.client.subscribe('/user/queue/live-join', forward<LiveJoinResult>(h.onJoin)),
      this.client.subscribe('/user/queue/live-locks', forward<LiveLockResult>(h.onLockResult)),
      this.client.subscribe('/user/queue/live-rejected', forward<LiveRejected>(h.onRejected)),
      this.client.subscribe('/user/queue/live-errors', forward<LiveError>(h.onError)),
      this.client.subscribe(topic('presence'), forward<LivePresence>(h.onPresence)),
      this.client.subscribe(topic('locks'), forward<LiveLocks>(h.onLocks)),
      this.client.subscribe(topic('ops'), forward<LiveOp>(h.onOp)),
      this.client.subscribe(topic('version'), forward<LiveVersion>(h.onVersion)),
    ];
  }
}
