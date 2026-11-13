import { useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { useNavigate } from '../../../routes/useTransitionNavigate';
import BlankScoreForm from '../../../components/scores/create/BlankScoreForm';
import { detectFileKind, groupOfKind } from '../../../utils/fileKind';
import type { KindGroup } from '../../../utils/fileKind';
import { setPendingUpload } from '../../../utils/pendingUpload';
import { UPLOAD_MAX_FILE_BYTES, UPLOAD_MAX_IMAGES } from '../../../utils/score';
import '../../../components/scores/scores.css';
import '../upload/ScoreUpload.css';
import './ScoreCreate.css';
import { t } from '../../../i18n/core';

/** Một file bị từ chối kèm lý do; name rỗng nghĩa là lỗi của cả lượt thả. */
interface Problem {
  name: string;
  reason: string;
}

const SCAN_ACCEPT = '.pdf,.png,.jpg,.jpeg';
const IMPORT_ACCEPT = '.musicxml,.xml,.mxl,.mid,.midi';
const ROUTES: Record<KindGroup, string> = { SCAN: '/scores/upload', IMPORT: '/scores/import' };

/**
 * Trang /scores/new: một lối vào cho mọi cách tạo bản nhạc. Thả file thì nhận loại bằng byte đầu rồi chuyển sang trang
 * số hóa hoặc trang nhập file (file chờ giữ trong bộ nhớ); chọn "Bản trống" thì tạo bản mới và mở trình chỉnh sửa.
 */
export default function ScoreCreate() {
  const navigate = useNavigate();
  const scanInput = useRef<HTMLInputElement>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [checking, setChecking] = useState(false);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [blank, setBlank] = useState(false);

  const handleFiles = async (files: File[]) => {
    if (files.length === 0 || checking) return;
    if (files.length > UPLOAD_MAX_IMAGES) {
      setProblems([{ name: '', reason: t('upload.create.tooMany', { max: UPLOAD_MAX_IMAGES }) }]);
      return;
    }
    setChecking(true);
    const found: Problem[] = [];
    const groups = new Set<KindGroup>();
    for (const file of files) {
      const kind = await detectFileKind(file);
      if (kind === 'EMPTY') found.push({ name: file.name, reason: t('upload.create.empty') });
      else if (kind === 'UNKNOWN') found.push({ name: file.name, reason: t('upload.create.unsupported') });
      else if (file.size > UPLOAD_MAX_FILE_BYTES)
        found.push({
          name: file.name,
          reason: t('upload.import.tooLarge', { max: UPLOAD_MAX_FILE_BYTES / 1024 / 1024 }),
        });
      else groups.add(groupOfKind(kind));
    }
    if (found.length === 0 && groups.size > 1) found.push({ name: '', reason: t('upload.create.mixed') });
    setProblems(found);
    setChecking(false);
    if (found.length > 0) return;
    setPendingUpload(files);
    navigate(ROUTES[[...groups][0]]);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    setBlank(false);
    void handleFiles(Array.from(e.dataTransfer.files));
  };

  const pickFrom = (input: HTMLInputElement | null) => {
    setBlank(false);
    input?.click();
  };

  const onPicked = (input: HTMLInputElement) => {
    void handleFiles(Array.from(input.files ?? []));
    input.value = ''; // cho phép chọn lại cùng một file
  };

  return (
    <div className="sc-page">
      <main className="sc-container sc-container--form">
        <header className="sc-lib-head">
          <div>
            <h1>{t('upload.create.title')}</h1>
            <p>{t('upload.create.subtitle')}</p>
          </div>
        </header>

        <section
          className={`sc-create ${dragging ? 'is-dragging' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
          }}
          onDrop={onDrop}
        >
          <div className="sc-create__cards">
            <button
              type="button"
              className="sc-create-card"
              disabled={checking}
              onClick={() => pickFrom(scanInput.current)}
            >
              <strong>{t('upload.create.scan.title')}</strong>
              <span>{t('upload.create.scan.hint')}</span>
            </button>
            <button
              type="button"
              className="sc-create-card"
              disabled={checking}
              onClick={() => pickFrom(importInput.current)}
            >
              <strong>{t('upload.create.import.title')}</strong>
              <span>{t('upload.create.import.hint')}</span>
            </button>
            <button
              type="button"
              className={`sc-create-card ${blank ? 'is-active' : ''}`}
              disabled={checking}
              onClick={() => setBlank(true)}
            >
              <strong>{t('upload.create.blank.card')}</strong>
              <span>{t('upload.create.blank.cardHint')}</span>
            </button>
          </div>
          <p className="sc-create__drop">{checking ? t('upload.create.checking') : t('upload.create.dropHint')}</p>

          {problems.length > 0 && (
            <ul className="sc-create__problems" role="alert">
              {problems.map((p, i) => (
                <li key={`${p.name}-${i}`}>
                  {p.name && <strong>{p.name}: </strong>}
                  {p.reason}
                </li>
              ))}
            </ul>
          )}

          <input
            ref={scanInput}
            type="file"
            hidden
            multiple
            accept={SCAN_ACCEPT}
            onChange={(e) => onPicked(e.target)}
          />
          <input
            ref={importInput}
            type="file"
            hidden
            multiple
            accept={IMPORT_ACCEPT}
            onChange={(e) => onPicked(e.target)}
          />
        </section>

        {blank && (
          <BlankScoreForm onCreated={(id) => navigate(`/scores/${id}/edit`)} onCancel={() => setBlank(false)} />
        )}
      </main>
    </div>
  );
}
