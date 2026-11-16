import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { notificationApi } from '../../services';
import type { NotificationPreference } from '../../types';
import { t, translateError } from '../../i18n/core';
import Skeleton from '../../components/ui/Skeleton';
import '../../components/scores/scores.css';
import './notification-settings.css';

type Channel = 'inApp' | 'email';
const CHANNELS: Channel[] = ['inApp', 'email'];

/**
 * Cài đặt thông báo (/settings/notifications, mục R8): mỗi nhóm bật/tắt chuông trong ứng dụng và email tóm tắt hằng
 * ngày. Tắt cả hai thì nhóm đó không gửi gì (thông báo chung của quản trị viên luôn hiện). Lưu ngay khi gạt công tắc.
 */
export default function NotificationSettings() {
  const [prefs, setPrefs] = useState<NotificationPreference[] | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    notificationApi
      .preferences()
      .then((res) => !cancelled && setPrefs(res.data.result))
      .catch((e) => !cancelled && toast.error(translateError(e, t('notificationSettings.loadFailed'))));
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = async (category: NotificationPreference['category'], channel: Channel) => {
    if (!prefs || saving) return;
    const before = prefs;
    const next = prefs.map((p) => (p.category === category ? { ...p, [channel]: !p[channel] } : p));
    setPrefs(next);
    setSaving(true);
    try {
      const changed = next.find((p) => p.category === category)!;
      const res = await notificationApi.updatePreferences([changed]);
      setPrefs(res.data.result);
    } catch (e) {
      setPrefs(before);
      toast.error(translateError(e, t('notificationSettings.saveFailed')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="sc-page">
      <main className="sc-container ns-page">
        <header className="sc-lib-head">
          <div>
            <h1>{t('notificationSettings.title')}</h1>
            <p>{t('notificationSettings.subtitle')}</p>
          </div>
        </header>

        {!prefs && <Skeleton lines={5} />}
        {prefs && (
          <section className="ns-card" aria-label={t('notificationSettings.title')}>
            <div className="ns-row ns-row--head" aria-hidden="true">
              <span />
              {CHANNELS.map((c) => (
                <span key={c} className="ns-col">
                  {t(`notificationSettings.channel.${c}`)}
                </span>
              ))}
            </div>
            {prefs.map((p) => {
              const off = !p.inApp && !p.email;
              return (
                <div className={`ns-row${off ? ' ns-row--off' : ''}`} key={p.category}>
                  <div>
                    <strong>{t(`notificationSettings.category.${p.category}.name`)}</strong>
                    <p>{t(`notificationSettings.category.${p.category}.desc`)}</p>
                    {off && <small className="ns-off">{t('notificationSettings.offHint')}</small>}
                  </div>
                  {CHANNELS.map((c) => (
                    <label key={c} className="ns-col ns-switch">
                      <input
                        type="checkbox"
                        role="switch"
                        checked={p[c]}
                        disabled={saving}
                        onChange={() => toggle(p.category, c)}
                        aria-label={`${t(`notificationSettings.category.${p.category}.name`)}: ${t(`notificationSettings.channel.${c}`)}`}
                      />
                      <span className="ns-switch__track" aria-hidden="true" />
                    </label>
                  ))}
                </div>
              );
            })}
            <p className="ns-foot">{t('notificationSettings.systemNote')}</p>
          </section>
        )}
      </main>
    </div>
  );
}
