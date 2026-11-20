import type { Glyph } from './musicGlyphs';

/*
 * Các bài cho vòng khuông hộp nhạc ở trang chủ khách. Chỉ dùng bài đã thuộc phạm vi công cộng.
 *
 * Mỗi chuỗi trong `bars` là một ô nhịp của giai điệu (khoá Sol). Một nốt viết "A4:A2.E3.A3*3":
 *   A4        cao độ giai điệu (có thể có dấu thăng: "D#5")
 *   :A2.E3.A3 hợp âm đệm tay trái chơi cùng nốt này (không bắt buộc)
 *   *3        trường độ tính bằng `unit` của bài (bỏ trống thì lấy `dur` mặc định của bài)
 * Giữ giai điệu trong khoảng Đô4 (một dòng kẻ phụ dưới) tới La5 (một dòng kẻ phụ trên).
 */

interface SongDef {
  id: string;
  unitMs: number; // độ dài một đơn vị trường độ khi tự chạy
  quarter: number; // số đơn vị của một nốt đen, để chọn hình nốt
  dur: number; // trường độ mặc định của một nốt
  arpMs?: number; // khoảng cách giữa các nốt hợp âm đệm khi tự chạy (mặc định = unitMs: rải đều như Für Elise)
  pickup?: boolean; // ô nhịp đầu là nhịp lấy đà (không có vạch nhịp phía trước)
  bars: string[];
}

export interface SongNote {
  midi: number;
  step: number; // 0 = dòng 1 khoá Sol (Mi4), mỗi bậc là một dòng hoặc một khe
  sharp: boolean;
  ledger: boolean;
  kind: Glyph;
  bass: number[];
  dur: number;
  barStart: boolean;
}

export interface Song {
  id: string;
  unitMs: number;
  arpMs: number;
  notes: SongNote[];
}

const LETTERS = 'CDEFGAB';
const SEMIS = [0, 2, 4, 5, 7, 9, 11];
const parsePitch = (name: string) => {
  const m = /^([A-G])(#?)(\d)$/.exec(name);
  if (!m) throw new Error(`Cao độ không hợp lệ: ${name}`);
  const li = LETTERS.indexOf(m[1]);
  const oct = Number(m[3]);
  return {
    midi: 12 * (oct + 1) + SEMIS[li] + (m[2] ? 1 : 0),
    step: oct * 7 + li - (4 * 7 + 2),
    sharp: !!m[2],
  };
};

function parse(def: SongDef): Song {
  const notes = def.bars.flatMap((bar, b) =>
    bar.split(' ').map((tok, i): SongNote => {
      const [body, durText] = tok.split('*');
      const [mel, bass] = body.split(':');
      const p = parsePitch(mel);
      const dur = durText ? Number(durText) : def.dur;
      const q = dur / def.quarter;
      return {
        ...p,
        ledger: p.step <= -2 || p.step >= 10,
        kind: q >= 4 ? 3 : q >= 2 ? 2 : q >= 1 ? 1 : 0,
        bass: bass ? bass.split('.').map((x) => parsePitch(x).midi) : [],
        dur,
        barStart: i === 0 && !(def.pickup && b === 0),
      };
    }),
  );
  return { id: def.id, unitMs: def.unitMs, arpMs: def.arpMs ?? def.unitMs, notes };
}

// Für Elise (Beethoven, 1810): 3/8, đơn vị là móc kép; tay trái rải hợp âm mỗi móc kép một nốt như bản gốc
const ELISE_A = [
  'E5 D#5 E5 B4 D5 C5',
  'A4:A2.E3.A3*3 C4 E4 A4',
  'B4:E2.E3.G#3*3 E4 G#4 B4',
  'C5:A2.E3.A3*3 E4 E5 D#5',
  'E5 D#5 E5 B4 D5 C5',
  'A4:A2.E3.A3*3 C4 E4 A4',
  'B4:E2.E3.G#3*3 E4 C5 B4',
];

// Ode to Joy (Beethoven, Giao hưởng số 9, 1824), lên một quãng tám cho vừa khuông; đơn vị là móc đơn
const ODE_A = ['E5:C3.G3 E5 F5 G5', 'G5:G2.D3 F5 E5 D5', 'C5:C3.G3 C5 D5 E5'];
const ODE_END1 = 'E5:C3.G3*3 D5*1 D5:G2.D3*4';
const ODE_END2 = 'D5:G2.D3*3 C5*1 C5:C3.G3*4';

// Twinkle Twinkle Little Star (giai điệu dân ca Pháp "Ah! vous dirai-je, maman", thế kỷ 18)
const TWINKLE_A = [
  'C4:C3.G3 C4 G4 G4',
  'A4:F2.C3 A4 G4:C3.G3*4',
  'F4:F2.C3 F4 E4:C3.G3 E4',
  'D4:G2.D3 D4 C4:C3.G3*4',
];
const TWINKLE_B = ['G4:C3.G3 G4 F4:F2.C3 F4', 'E4:C3.G3 E4 D4:G2.D3*4'];

// Jingle Bells (James Lord Pierpont, 1857), điệp khúc
const JINGLE_A = ['E4:C3.G3 E4 E4*4', 'E4:C3.G3 E4 E4*4', 'E4:C3.G3 G4 C4*3 D4*1', 'E4:C3.G3*8'];
const JINGLE_B = ['F4:F2.C3 F4 F4*3 F4*1', 'F4:C3.G3 E4 E4 E4*1 E4*1'];

const DEFS: SongDef[] = [
  {
    id: 'furElise',
    unitMs: 150,
    quarter: 4,
    dur: 1,
    pickup: true,
    bars: [
      'E5 D#5',
      ...ELISE_A,
      'A4:A2.E3.A3*4 E5 D#5', // khung 1: quay lại đầu
      ...ELISE_A,
      'A4:A2.E3.A3*3 B4 C5 D5', // khung 2: sang đoạn giữa
      'E5:C3.G3.C4*3 G4 F5 E5',
      'D5:G2.G3.B3*3 F4 E5 D5',
      'C5:A2.E3.A3*3 E4 D5 C5',
      'B4:E2.E3.E4 E4 E5 E4 E5 D#5',
      'E5 D#5',
      ...ELISE_A,
      'A4:A2.E3.A3*6',
    ],
  },
  {
    id: 'odeToJoy',
    unitMs: 290,
    quarter: 2,
    dur: 2,
    arpMs: 40,
    bars: [
      ...ODE_A,
      ODE_END1,
      ...ODE_A,
      ODE_END2,
      'D5:G2.D3 D5 E5 C5:C3.G3',
      'D5:G2.D3 E5*1 F5*1 E5 C5:C3.G3',
      'D5:G2.D3 E5*1 F5*1 E5 D5',
      'C5:C3.G3 D5 G4:G2.D3*4',
      ...ODE_A,
      ODE_END2,
    ],
  },
  {
    id: 'twinkle',
    unitMs: 280,
    quarter: 2,
    dur: 2,
    arpMs: 40,
    bars: [...TWINKLE_A, ...TWINKLE_B, ...TWINKLE_B, ...TWINKLE_A],
  },
  {
    id: 'jingleBells',
    unitMs: 230,
    quarter: 2,
    dur: 2,
    arpMs: 35,
    bars: [
      ...JINGLE_A,
      ...JINGLE_B,
      'E4:D3.A3 D4 D4 E4',
      'D4:G2.D3*4 G4*4',
      ...JINGLE_A,
      ...JINGLE_B,
      'G4:G2.D3 G4 F4 D4',
      'C4:C3.G3*8',
    ],
  },
  {
    // Happy Birthday (giai điệu "Good Morning to All", chị em Hill, 1893)
    id: 'happyBirthday',
    unitMs: 170,
    quarter: 4,
    dur: 4,
    arpMs: 40,
    pickup: true,
    bars: [
      'G4*3 G4*1',
      'A4:C3.G3 G4 C5',
      'B4:G2.D3*8 G4*3 G4*1',
      'A4:G2.D3 G4 D5',
      'C5:C3.G3*8 G4*3 G4*1',
      'G5:C3.G3 E5 C5',
      'B4:F2.C3 A4 F5*3 F5*1',
      'E5:C3.G3 C5 D5:G2.D3',
      'C5:C3.G3*12',
    ],
  },
  {
    // Canon in D (Johann Pachelbel, khoảng 1680): giai điệu trên vòng hợp âm D A Bm F#m G D G A
    id: 'canonInD',
    unitMs: 270,
    quarter: 2,
    dur: 2,
    arpMs: 60,
    bars: [
      'F#5:D3.A3*4 E5:A2.E3*4',
      'D5:B2.F#3*4 C#5:F#2.C#3*4',
      'B4:G2.D3*4 A4:D3.A3*4',
      'B4:G2.D3*4 C#5:A2.E3*4',
      'D5:D3.A3 C#5 B4:A2.E3 A4',
      'G4:B2.F#3 F#4 G4:F#2.C#3 E4',
      'D4:G2.D3 F#4 A4:D3.A3 G4',
      'F#4:G2.D3 D4 F#4:A2.E3 E4',
      'F#5:D3.A3*4 E5:A2.E3*4',
      'D5:B2.F#3*4 C#5:F#2.C#3*4',
      'B4:G2.D3*4 A4:D3.A3*4',
      'B4:G2.D3*4 C#5:A2.E3*4',
      'D5:D3.A3*8',
    ],
  },
  {
    // Eine kleine Nachtmusik (Mozart, 1787), câu mở đầu hạ một quãng tám; đơn vị là móc đơn, dấu lặng gộp vào nốt trước
    id: 'nachtmusik',
    unitMs: 190,
    quarter: 2,
    dur: 1,
    arpMs: 40,
    bars: [
      'G4:G2.D3*3 D4 G4*3 D4',
      'G4:G2.D3 D4 G4 B4 D5*4',
      'C5:D3.F#3*3 A4 C5*3 A4',
      'C5:D3.F#3 A4 F#4 A4 D4*4',
      'G4:G2.D3*3 D4 G4*3 D4',
      'G4:G2.D3 D4 G4 B4 D5*4',
      'C5:D3.F#3*3 A4 C5*3 A4',
      'C5:D3.F#3 A4 F#4 A4 G4:G2.D3*4',
    ],
  },
  {
    // Wiegenlied / Lullaby (Johannes Brahms, 1868): 3/4, đơn vị là móc đơn
    id: 'lullaby',
    unitMs: 250,
    quarter: 2,
    dur: 1,
    arpMs: 70,
    pickup: true,
    bars: [
      'E4 E4',
      'G4:C3.G3*4 E4 E4',
      'G4:G2.F3*4 E4 G4',
      'C5:C3.G3*2 B4*3 A4',
      'A4:F2.C3*2 G4*2 D4 E4',
      'F4:G2.F3*2 D4*2 D4 E4',
      'F4:G2.F3*4 D4 F4',
      'B4:G2.F3 A4 G4*2 B4*2',
      'C5:C3.G3*4 C4 C4',
      'C5:F2.C3*4 A4 F4',
      'G4:C3.G3*4 E4 C4',
      'F4:G2.F3*2 G4*2 A4*2',
      'G4:C3.G3*4 C4 C4',
      'C5:F2.C3*4 A4 F4',
      'G4:C3.G3*4 E4 C4',
      'F4:G2.F3*2 E4*2 D4*2',
      'C4:C3.G3*6',
    ],
  },
  {
    // Greensleeves (dân ca Anh, thế kỷ 16): 6/8, đơn vị là móc kép
    id: 'greensleeves',
    unitMs: 125,
    quarter: 4,
    dur: 2,
    arpMs: 60,
    pickup: true,
    bars: [
      'A4*2',
      'C5:A2.E3*4 D5 E5*3 F5*1 E5',
      'D5:G2.D3*4 B4 G4*3 A4*1 B4',
      'C5:A2.E3*4 A4 A4*3 G#4*1 A4',
      'B4:E2.B2*4 G#4 E4*4 A4',
      'C5:A2.E3*4 D5 E5*3 F5*1 E5',
      'D5:G2.D3*4 B4 G4*3 A4*1 B4',
      'C5:A2.E3*3 B4*1 A4 G#4:E2.B2*3 F#4*1 G#4',
      'A4:A2.E3*6 A4*6',
    ],
  },
];

export const SONGS: Song[] = DEFS.map(parse);
