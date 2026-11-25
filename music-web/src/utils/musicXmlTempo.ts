/**
 * Đặt nhịp độ đầu bản nhạc trong MusicXML (OMR-13: OMR không đọc được ♩ = 70 trên bản gốc nên đang dùng mặc định).
 * Sửa <direction> đầu tiên có <metronome> hoặc <sound tempo> của part đầu; chưa có thì thêm vào ô đầu, sau <attributes>.
 * Ghi cả <metronome> (để hiện "♩ = 70") lẫn <sound tempo> (để phát nhạc đúng nhịp độ), tính theo nốt đen.
 */
const childOf = (el: Element, tag: string): Element | undefined =>
  Array.from(el.children).find((c) => c.tagName === tag);

export function setMusicXmlTempo(xml: string, bpm: number): string {
  const value = String(Math.round(bpm));
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) throw new Error('Unreadable MusicXML');
  const part = doc.getElementsByTagName('part')[0];
  const measures = part ? Array.from(part.children).filter((c) => c.tagName === 'measure') : [];
  if (measures.length === 0) throw new Error('MusicXML has no measures');

  let direction: Element | undefined;
  for (const measure of measures) {
    direction = Array.from(measure.children).find(
      (c) =>
        c.tagName === 'direction' &&
        (c.getElementsByTagName('metronome').length > 0 || !!childOf(c, 'sound')?.getAttribute('tempo')),
    );
    if (direction) break;
  }

  if (!direction) {
    direction = doc.createElement('direction');
    direction.setAttribute('placement', 'above');
    const first = measures[0];
    const attributes = childOf(first, 'attributes');
    const anchor = attributes ? attributes.nextSibling : first.firstChild;
    first.insertBefore(direction, anchor);
  }

  let metronome = direction.getElementsByTagName('metronome')[0];
  if (!metronome) {
    const type = doc.createElement('direction-type');
    metronome = doc.createElement('metronome');
    type.appendChild(metronome);
    direction.insertBefore(type, direction.firstChild);
  }
  while (metronome.firstChild) metronome.removeChild(metronome.firstChild);
  const unit = doc.createElement('beat-unit');
  unit.textContent = 'quarter';
  const perMinute = doc.createElement('per-minute');
  perMinute.textContent = value;
  metronome.appendChild(unit);
  metronome.appendChild(perMinute);

  let sound = childOf(direction, 'sound');
  if (!sound) {
    sound = doc.createElement('sound');
    direction.appendChild(sound);
  }
  sound.setAttribute('tempo', value);

  const out = new XMLSerializer().serializeToString(doc);
  const declaration = /^<\?xml[^>]*\?>/.exec(xml.trimStart())?.[0];
  return declaration && !out.startsWith('<?xml') ? `${declaration}\n${out}` : out;
}
