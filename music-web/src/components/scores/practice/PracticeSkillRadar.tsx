import { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip } from 'recharts';
import { practiceStatsApi } from '../../../services';
import type { PracticeSkills } from '../../../types';
import { t } from '../../../i18n/core';

const RANGES = [7, 30, 90];

/** Biểu đồ radar 4 kỹ năng: Pitch Accuracy / Timing / Tốc độ ngón / Chăm chỉ (mục 3.14). */
export default function PracticeSkillRadar() {
  const [days, setDays] = useState(30);
  const [skills, setSkills] = useState<PracticeSkills | null>(null);

  useEffect(() => {
    let cancelled = false;
    practiceStatsApi
      .skills(days)
      .then((res) => !cancelled && setSkills(res.data.result))
      .catch(() => toast.error(t('practice.radar.loadFailed')));
    return () => {
      cancelled = true;
    };
  }, [days]);

  const data = useMemo(
    () =>
      skills
        ? [
            { skill: 'Pitch Accuracy', value: skills.pitchAccuracy },
            { skill: 'Timing', value: skills.timing },
            { skill: t('practice.radar.speed'), value: skills.speed },
            { skill: t('practice.radar.diligence'), value: skills.diligence },
          ]
        : [],
    [skills],
  );

  return (
    <section className="ps-chart">
      <div className="ps-chart__head">
        <div>
          <h2>{t('practice.radar.title')}</h2>
          <p>
            {skills && skills.sessionCount > 0
              ? t('practice.radar.sessions', { sessions: skills.sessionCount, days })
              : t('practice.radar.noSessions', { days })}
          </p>
        </div>
        <div className="ps-chart__tabs">
          {RANGES.map((d) => (
            <button
              key={d}
              className={`sc-btn sc-btn--sm${d === days ? ' sc-btn--primary' : ''}`}
              onClick={() => setDays(d)}
            >
              {t('practice.stats.days', { count: d })}
            </button>
          ))}
        </div>
      </div>

      <div className="ps-chart__body">
        <ResponsiveContainer width="100%" height={320}>
          <RadarChart data={data} outerRadius="75%">
            <PolarGrid />
            <PolarAngleAxis dataKey="skill" tick={{ fontSize: 13 }} />
            <PolarRadiusAxis angle={90} domain={[0, 100]} tickCount={5} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(value) => [`${value}/100`, t('practice.history.points')]} />
            <Radar dataKey="value" stroke="#2563eb" fill="#2563eb" fillOpacity={0.35} />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      <ul className="ps-skill-notes">
        <li>
          <strong>Pitch Accuracy:</strong> {t('practice.radar.notePitch')}
        </li>
        <li>
          <strong>Timing:</strong> {t('practice.radar.noteTiming')}
        </li>
        <li>
          <strong>{t('practice.radar.speed')}:</strong> {t('practice.radar.noteSpeed')}
        </li>
        <li>
          <strong>{t('practice.radar.diligence')}:</strong> {t('practice.radar.noteDiligence')}
        </li>
      </ul>
    </section>
  );
}
