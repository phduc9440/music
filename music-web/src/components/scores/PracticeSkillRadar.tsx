import { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip } from 'recharts';
import { practiceStatsApi } from '../../services';
import type { PracticeSkills } from '../../types';

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
      .catch(() => toast.error('Không tải được biểu đồ kỹ năng'));
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
            { skill: 'Tốc độ ngón', value: skills.speed },
            { skill: 'Chăm chỉ', value: skills.diligence },
          ]
        : [],
    [skills],
  );

  return (
    <section className="ps-chart">
      <div className="ps-chart__head">
        <div>
          <h2>Kỹ năng</h2>
          <p>
            {skills && skills.sessionCount > 0
              ? `${skills.sessionCount} phiên trong ${days} ngày gần nhất`
              : `Chưa có phiên tập nào trong ${days} ngày gần nhất`}
          </p>
        </div>
        <div className="ps-chart__tabs">
          {RANGES.map((d) => (
            <button
              key={d}
              className={`sc-btn sc-btn--sm${d === days ? ' sc-btn--primary' : ''}`}
              onClick={() => setDays(d)}
            >
              {d} ngày
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
            <Tooltip formatter={(value) => [`${value}/100`, 'Điểm']} />
            <Radar dataKey="value" stroke="#2563eb" fill="#2563eb" fillOpacity={0.35} />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      <ul className="ps-skill-notes">
        <li>
          <strong>Pitch Accuracy:</strong> % nốt chơi đúng cao độ.
        </li>
        <li>
          <strong>Timing:</strong> % nốt chơi đúng giờ.
        </li>
        <li>
          <strong>Tốc độ ngón:</strong> tốc độ tập trung bình so với bản gốc (100% tốc độ gốc là 100 điểm).
        </li>
        <li>
          <strong>Chăm chỉ:</strong> % số ngày có tập trong kỳ.
        </li>
      </ul>
    </section>
  );
}
