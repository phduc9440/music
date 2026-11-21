import { t } from '../../i18n/core';
import Icon from './Icon';
import { playClickNote, setClickSoundOn, useClickSoundOn } from './clickMusic';
import './sound-toggle.css';

/**
 * Nút loa trên thanh trên: bật / tắt tiếng nốt nhạc khi bấm. Nhãn cho trình đọc màn hình cố định, trạng thái báo qua
 * aria-pressed; chú thích khi rê chuột nói việc sẽ xảy ra. Bật lại thì chơi ngay một nốt để người dùng nghe thấy.
 */
export default function SoundToggle() {
  const on = useClickSoundOn();
  const hint = t(on ? 'common.header.soundTurnOff' : 'common.header.soundTurnOn');
  return (
    <button
      type="button"
      className={`sound-toggle${on ? '' : ' is-off'}`}
      aria-pressed={on}
      aria-label={t('common.header.clickSound')}
      title={hint}
      data-no-click-sound
      onClick={() => {
        setClickSoundOn(!on);
        if (!on) playClickNote();
      }}
    >
      <Icon name={on ? 'volume' : 'volumeOff'} size={18} />
    </button>
  );
}
