import { t } from '../../i18n/core';
import Icon from './Icon';
import { playClickNote, setClickSoundOn, useClickSoundOn } from './clickMusic';
import './sound-toggle.css';

/**
 * Mục bật / tắt tiếng nốt nhạc khi bấm, đặt trong menu tài khoản (ngay trên Đăng xuất). Là menuitemcheckbox: trạng thái
 * báo qua aria-checked và nhãn "Bật / Tắt" bên phải. Bật lại thì chơi ngay một nốt để người dùng nghe thấy. Menu vẫn mở
 * sau khi bấm để thấy trạng thái đổi.
 */
export default function SoundToggle({ className }: { className: string }) {
  const on = useClickSoundOn();
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={on}
      className={`${className} sound-item`}
      data-no-click-sound
      onClick={() => {
        setClickSoundOn(!on);
        if (!on) playClickNote();
      }}
    >
      <Icon name={on ? 'volume' : 'volumeOff'} size={16} />
      {t('common.header.clickSound')}
      <span className={`sound-item__state${on ? ' is-on' : ''}`}>
        {on ? t('common.header.soundStateOn') : t('common.header.soundStateOff')}
      </span>
    </button>
  );
}
