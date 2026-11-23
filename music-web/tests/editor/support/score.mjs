/** Dựng MusicXML nhỏ cho test. Mặc định 4/4, divisions = 1, khóa Đô trưởng, một part, một khuông. */

/**
 * Một nốt hoặc dấu lặng.
 * @param {string|null} pitch ví dụ 'C4', 'F#4', 'Bb3'; null = dấu lặng
 */
export function note(pitch, opts = {}) {
  const { dur = 1, type = 'quarter', voice, staff, chord = false, dots = 0, tie, tuplet, grace = false } = opts;
  let body = '';
  if (grace) body += '<grace/>';
  if (chord) body += '<chord/>';
  if (pitch === null) body += '<rest/>';
  else {
    const m = /^([A-G])(#|b)?(-?\d)$/.exec(pitch);
    if (!m) throw new Error(`bad pitch ${pitch}`);
    const alter = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
    body += `<pitch><step>${m[1]}</step>${alter ? `<alter>${alter}</alter>` : ''}<octave>${m[3]}</octave></pitch>`;
  }
  if (!grace) body += `<duration>${dur}</duration>`;
  if (tie) body += `<tie type="${tie}"/>`;
  if (voice) body += `<voice>${voice}</voice>`;
  body += `<type>${type}</type>`;
  body += '<dot/>'.repeat(dots);
  if (tuplet)
    body += `<time-modification><actual-notes>${tuplet[0]}</actual-notes><normal-notes>${tuplet[1]}</normal-notes></time-modification>`;
  if (staff) body += `<staff>${staff}</staff>`;
  if (tie) body += `<notations><tied type="${tie}"/></notations>`;
  return `<note>${body}</note>`;
}

export const quarters = (...pitches) => pitches.map((p) => note(p)).join('');

/**
 * Bản nhạc từ danh sách nội dung ô nhịp (chuỗi XML các <note>).
 * @param {string[]} measures
 */
export function score(measures, opts = {}) {
  const { fifths = 0, mode, beats = 4, beatType = 4, divisions = 1, extraAttributes = '' } = opts;
  const attrs =
    `<attributes><divisions>${divisions}</divisions><key><fifths>${fifths}</fifths>${mode ? `<mode>${mode}</mode>` : ''}</key>` +
    `<time><beats>${beats}</beats><beat-type>${beatType}</beat-type></time><clef><sign>G</sign><line>2</line></clef>${extraAttributes}</attributes>`;
  const body = measures.map((m, i) => `<measure number="${i + 1}">${i === 0 ? attrs : ''}${m}</measure>`).join('');
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<score-partwise version="4.0"><work><work-title>Test</work-title></work>' +
    '<part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>' +
    `<part id="P1">${body}</part></score-partwise>`
  );
}

/** Tên cao độ của một nốt trong tài liệu ('C4', 'F#4'...) hoặc 'rest'. */
export function nameOf(doc, id) {
  const el = doc.getNote(id);
  if (!el) return undefined;
  const pitch = el.getElementsByTagName('pitch')[0];
  if (!pitch) return 'rest';
  const text = (tag) => pitch.getElementsByTagName(tag)[0]?.textContent ?? '';
  const alter = Number(text('alter') || 0);
  return `${text('step')}${alter > 0 ? '#'.repeat(alter) : 'b'.repeat(-alter)}${text('octave')}`;
}

/** Danh sách (cao độ/rest, type, duration) của một ô nhịp, theo thứ tự, bỏ nốt hợp âm. */
export function measureSummary(doc, measureIndex, partIndex = 0) {
  const measure = doc.getMeasure(partIndex, measureIndex);
  return Array.from(measure.children)
    .filter((c) => c.tagName === 'note')
    .map((n) => {
      const kids = Array.from(n.children);
      const tag = (t) => kids.find((c) => c.tagName === t);
      const pitch = tag('pitch');
      let name = 'rest';
      if (pitch) {
        const get = (t) => Array.from(pitch.children).find((c) => c.tagName === t)?.textContent ?? '';
        const alter = Number(get('alter') || 0);
        name = `${get('step')}${alter > 0 ? '#' : alter < 0 ? 'b' : ''}${get('octave')}`;
      }
      const dots = kids.filter((c) => c.tagName === 'dot').length;
      return `${tag('chord') ? '+' : ''}${name}:${tag('type')?.textContent ?? '?'}${'.'.repeat(dots)}/${tag('duration')?.textContent ?? 'g'}`;
    });
}
