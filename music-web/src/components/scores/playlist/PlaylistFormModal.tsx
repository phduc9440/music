import { useState } from 'react';
import type { FormEvent } from 'react';
import { toast } from 'react-toastify';
import { playlistApi } from '../../../services';
import { getErrorMessage } from '../../../utils/score';
import Modal from '../common/Modal';
import type { Playlist } from '../../../types';
import { t } from '../../../i18n/core';

const MAX_NAME = 255; // khớp BE (mã lỗi 2602)
const MAX_DESCRIPTION = 2000; // khớp BE (mã lỗi 2603)

interface Props {
  /** Có giá trị = sửa, không có = tạo mới. */
  playlist?: Playlist;
  onClose: () => void;
  onSaved: () => void;
}

export default function PlaylistFormModal({ playlist, onClose, onSaved }: Props) {
  const [name, setName] = useState(playlist?.name ?? '');
  const [description, setDescription] = useState(playlist?.description ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError(t('playlists.form.nameRequired'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      const data = { name: name.trim(), description: description.trim() };
      if (playlist) await playlistApi.update(playlist.id, data);
      else await playlistApi.create(data);
      toast.success(playlist ? t('playlists.form.saved') : t('playlists.form.created'));
      onSaved();
    } catch (err) {
      setError(getErrorMessage(err, t('playlists.form.saveFailed')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={playlist ? t('playlists.form.editTitle') : t('playlists.form.createTitle')} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <label className="sc-label" htmlFor="pl-name">
          {t('playlists.form.name')}
        </label>
        <input
          id="pl-name"
          className="sc-input"
          value={name}
          maxLength={MAX_NAME}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('playlists.form.namePlaceholder')}
          autoFocus
        />
        <label className="sc-label" htmlFor="pl-desc">
          {t('playlists.form.description')}
        </label>
        <textarea
          id="pl-desc"
          className="sc-input"
          rows={4}
          value={description}
          maxLength={MAX_DESCRIPTION}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t('playlists.form.descriptionPlaceholder')}
        />
        {error && <div className="sc-error">{error}</div>}
        <div className="sc-modal__actions">
          <button type="button" className="sc-btn" onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="sc-btn sc-btn--primary" disabled={saving}>
            {saving ? t('scores.edit.saving') : t('common.save')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
