/** Trạng thái đàn MIDI nối với trình duyệt (ST-07). */
export type MidiStatus = { state: 'unsupported' } | { state: 'denied' } | { state: 'ready'; devices: string[] };

type NoteHandler = (midi: number, velocity: number) => void;
type StatusHandler = (status: MidiStatus) => void;

interface MidiMessage {
  data: Uint8Array | null;
}
interface MidiPort {
  name?: string | null;
  onmidimessage: ((event: MidiMessage) => void) | null;
}
interface MidiAccess {
  inputs: { forEach: (fn: (input: MidiPort) => void) => void };
  onstatechange: (() => void) | null;
}

/**
 * Nhận nốt từ đàn MIDI qua Web MIDI API (Chrome, Edge, Opera; Firefox cần bật, Safari chưa có). Mỗi note-on (velocity
 * > 0) gọi onNote với số MIDI và lực đánh 0–1. Cắm thêm/rút đàn giữa chừng thì tự nối lại và báo danh sách đàn.
 * Trả về hàm ngắt kết nối.
 */
export async function connectMidi(onNote: NoteHandler, onStatus: StatusHandler): Promise<() => void> {
  const request = (navigator as Navigator & { requestMIDIAccess?: (o?: { sysex: boolean }) => Promise<MidiAccess> })
    .requestMIDIAccess;
  if (typeof request !== 'function') {
    onStatus({ state: 'unsupported' });
    return () => undefined;
  }
  let access: MidiAccess;
  try {
    access = await request.call(navigator, { sysex: false });
  } catch {
    onStatus({ state: 'denied' });
    return () => undefined;
  }

  const onMessage = ({ data }: MidiMessage) => {
    if (!data || data.length < 3) return;
    const command = data[0] & 0xf0;
    // note-on (0x9n) với velocity 0 là note-off theo chuẩn MIDI
    if (command === 0x90 && data[2] > 0) onNote(data[1], data[2] / 127);
  };
  const attach = () => {
    const devices: string[] = [];
    access.inputs.forEach((input) => {
      input.onmidimessage = onMessage;
      devices.push(input.name?.trim() || 'MIDI');
    });
    onStatus({ state: 'ready', devices });
  };
  attach();
  access.onstatechange = attach;

  return () => {
    access.onstatechange = null;
    access.inputs.forEach((input) => {
      input.onmidimessage = null;
    });
  };
}
