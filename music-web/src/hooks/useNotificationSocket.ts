import { useEffect, useRef, useState } from 'react';
import { Client } from '@stomp/stompjs';
import { socketUrl } from '../services/client';
import type { AppNotification } from '../types';

const DESTINATION = '/user/queue/notifications';

/**
 * Nhận thông báo tức thì qua STOMP. Trả về `connected`: chuông chỉ cần poll dự phòng khi chưa kết nối được (token hết
 * hạn, mất mạng, máy chủ khởi động lại). Thư viện tự kết nối lại sau 5 giây; token mới do các lần poll làm mới.
 */
export function useNotificationSocket(onNotification: (n: AppNotification) => void): boolean {
  const [connected, setConnected] = useState(false);
  const handler = useRef(onNotification);

  useEffect(() => {
    handler.current = onNotification;
  });

  useEffect(() => {
    const client = new Client({
      brokerURL: socketUrl(),
      reconnectDelay: 5_000,
      heartbeatIncoming: 10_000,
      heartbeatOutgoing: 10_000,
      onConnect: () => {
        setConnected(true);
        client.subscribe(DESTINATION, (frame) => {
          try {
            handler.current(JSON.parse(frame.body) as AppNotification);
          } catch {
            // Gói hỏng: bỏ qua, lần mở chuông sau sẽ nạp lại danh sách
          }
        });
      },
      onWebSocketClose: () => setConnected(false),
      onStompError: () => setConnected(false),
    });
    client.activate();
    return () => {
      setConnected(false);
      void client.deactivate();
    };
  }, []);

  return connected;
}
