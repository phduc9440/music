import { useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { t } from '../../../i18n/core';

interface Props {
  disabled?: boolean;
  onFiles: (files: File[]) => void;
}

/** Vùng kéo-thả lớn kèm nút "Chọn file" và dòng gợi ý định dạng. */
export default function UploadDropzone({ disabled, onFiles }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (!disabled) onFiles(Array.from(e.dataTransfer.files));
  };

  return (
    <div
      className={`sc-dropzone ${dragging ? 'is-dragging' : ''} ${disabled ? 'is-disabled' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      <svg viewBox="0 0 24 24" width="44" height="44" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
        <path
          d="M12 16V4m0 0-4 4m4-4 4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <h3>{t('upload.dropzone.title')}</h3>
      <p>{t('upload.dropzone.hint')}</p>
      <button
        type="button"
        className="sc-btn sc-btn--primary"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        {t('upload.chooseFile')}
      </button>
      <input
        ref={inputRef}
        type="file"
        hidden
        multiple
        accept=".pdf,.png,.jpg,.jpeg"
        onChange={(e) => {
          onFiles(Array.from(e.target.files ?? []));
          e.target.value = ''; // cho phép chọn lại cùng một file
        }}
      />
    </div>
  );
}
