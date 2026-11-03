import { OMR_STEPS, STEP_LATER_HINT } from '../../utils/omr';
import type { StepState } from '../../utils/omr';

interface Props {
  states: StepState[];
  /** Dòng phụ cho bước đang chạy, ví dụ "Đã xử lý 2/5 trang". */
  activeNote?: string;
}

const MARKS: Record<StepState, string> = {
  done: '✓',
  active: '',
  pending: '',
  failed: '!',
  skipped: '–',
  later: '',
};

/** Danh sách các bước số hóa kèm dấu tích; bước chưa hỗ trợ ở bản này hiện mờ. */
export default function ProcessingSteps({ states, activeNote }: Props) {
  return (
    <ol className="sp-steps">
      {OMR_STEPS.map((step, index) => {
        const state = states[index] ?? 'pending';
        let note = '';
        if (state === 'later') note = STEP_LATER_HINT;
        else if (state === 'skipped') note = 'Không cần với ảnh';
        else if (state === 'active') note = activeNote ?? '';
        return (
          <li
            key={step.key}
            className={`sp-step sp-step--${state}`}
            aria-current={state === 'active' ? 'step' : undefined}
          >
            <span className="sp-step__mark" aria-hidden="true">
              {MARKS[state]}
            </span>
            <span className="sp-step__body">
              <span className="sp-step__label">{step.label}</span>
              {note && <span className="sp-step__note">{note}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
