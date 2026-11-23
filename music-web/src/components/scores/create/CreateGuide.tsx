import type { ReactNode } from 'react';
import { Icon } from '../../ui';
import NoteField from '../../ui/NoteField';
import type { IconName } from '../../ui';
import { useReveal } from '../../../hooks/useReveal';
import { t } from '../../../i18n/core';
import './create-guide.css';

type Variant = 'scan' | 'import';

const FORMATS: Record<Variant, string[]> = {
  scan: ['PDF', 'PNG', 'JPG'],
  import: ['MusicXML', 'MXL', 'MIDI'],
};
const SCAN_STEPS: { icon: IconName; key: 'capture' | 'edit' | 'practice' }[] = [
  { icon: 'upload', key: 'capture' },
  { icon: 'edit', key: 'edit' },
  { icon: 'play', key: 'practice' },
];
const IMPORT_STEPS: { icon: IconName; key: 'export' | 'import' | 'edit' }[] = [
  { icon: 'share', key: 'export' },
  { icon: 'upload', key: 'import' },
  { icon: 'edit', key: 'edit' },
];
const TIPS: Record<Variant, string[]> = {
  scan: ['light', 'flat', 'sharp', 'single'],
  import: ['prefer', 'export', 'batch', 'scan'],
};
const FAQ = ['prepare', 'privacy'] as const;

/** Khối có tiêu đề, hiện dần khi cuộn tới. */
function Block({ title, lead, children }: { title: string; lead?: string; children: ReactNode }) {
  const ref = useReveal<HTMLElement>();
  return (
    <section ref={ref} className="sc-cr-sec reveal">
      <header>
        <h2>{title}</h2>
        {lead && <p>{lead}</p>}
      </header>
      {children}
    </section>
  );
}

/**
 * Phần hướng dẫn kiểu landing page đặt dưới biểu mẫu của trang tải lên (/scores/upload) và nhập file (/scores/import):
 * định dạng hỗ trợ, ba bước, mẹo và câu hỏi thường gặp. Chỉ là nội dung, không đụng tới luồng tải file.
 */
export default function CreateGuide({ variant, maxFiles }: { variant: Variant; maxFiles?: number }) {
  const steps = variant === 'scan' ? SCAN_STEPS : IMPORT_STEPS;
  const stepText = (key: string, field: 'title' | 'text') =>
    variant === 'scan' ? t(`home.guest.steps.${key}.${field}`) : t(`upload.guide.import.steps.${key}.${field}`);

  return (
    <div className="sc-cr-guide">
      <div className="notef-band" aria-hidden="true">
        <NoteField />
      </div>
      <ul className="sc-cr-formats" aria-label={t('upload.guide.formats')}>
        <li className="sc-cr-formats__label">{t('upload.guide.formats')}:</li>
        {FORMATS[variant].map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>

      <Block
        title={variant === 'scan' ? t('home.guest.howTitle') : t('upload.guide.import.howTitle')}
        lead={variant === 'scan' ? t('upload.guide.scan.howLead') : undefined}
      >
        <ol className="sc-cr-steps">
          {steps.map((s, i) => (
            <li key={s.key} style={{ transitionDelay: `${i * 140}ms` }}>
              <span className="sc-cr-steps__icon">
                <Icon name={s.icon} size={22} />
              </span>
              <span className="sc-cr-steps__no">{t('home.guest.step', { n: i + 1 })}</span>
              <strong>{stepText(s.key, 'title')}</strong>
              <p>{stepText(s.key, 'text')}</p>
            </li>
          ))}
        </ol>
      </Block>

      <Block title={t(`upload.guide.${variant}.tipsTitle`)} lead={t(`upload.guide.${variant}.tipsLead`)}>
        <div className="sc-cr-tips">
          {TIPS[variant].map((k, i) => (
            <article key={k} style={{ transitionDelay: `${i * 80}ms` }}>
              <span className="sc-cr-tips__no">{i + 1}</span>
              <strong>{t(`upload.guide.${variant}.tips.${k}.title`)}</strong>
              <p>{t(`upload.guide.${variant}.tips.${k}.text`, { count: maxFiles ?? 0 })}</p>
            </article>
          ))}
        </div>
      </Block>

      <Block title={t('home.guest.faqTitle')}>
        <div className="sc-cr-faq">
          {FAQ.map((k) => (
            <details key={k}>
              <summary>{t(`home.guest.faq.${k}.q`)}</summary>
              <p>{t(`home.guest.faq.${k}.a`)}</p>
            </details>
          ))}
        </div>
      </Block>
    </div>
  );
}
