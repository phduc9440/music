import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import ComposerPortrait from '../../components/composers/ComposerPortrait';
import { Badge, Button, Card, CellTitle, Field, PageHeader, Table, TableState } from '../../components/ui';
import { errorMessage } from '../../components/ui/helpers';
import { useDialog } from '../../components/ui/dialog-context';
import { adminComposerApi } from '../../services';
import type { Composer, ComposerPayload, ComposerPeriod } from '../../types';
import { PERIOD_LABELS, PERIODS, lifespan } from '../../utils/composer';
import './admin-composers.css';
import { t } from '../../i18n/core';

interface FormState {
  name: string;
  aliases: string;
  birthYear: string;
  deathYear: string;
  country: string;
  period: ComposerPeriod | '';
  bio: string;
  imageUrl: string;
  imageSource: string;
  imageLicense: string;
}

const EMPTY: FormState = {
  name: '',
  aliases: '',
  birthYear: '',
  deathYear: '',
  country: '',
  period: '',
  bio: '',
  imageUrl: '',
  imageSource: '',
  imageLicense: '',
};

const LICENSES = ['Public domain', 'CC0', 'CC BY 4.0', 'CC BY-SA 4.0', 'CC BY-SA 3.0'];

const toForm = (c: Composer): FormState => ({
  name: c.name,
  aliases: c.aliases ?? '',
  birthYear: c.birthYear?.toString() ?? '',
  deathYear: c.deathYear?.toString() ?? '',
  country: c.country ?? '',
  period: c.period ?? '',
  bio: c.bio ?? '',
  imageUrl: c.imageUrl ?? '',
  imageSource: c.imageSource ?? '',
  imageLicense: c.imageLicense ?? '',
});

const toPayload = (f: FormState): ComposerPayload => ({
  name: f.name.trim(),
  aliases: f.aliases.trim(),
  birthYear: f.birthYear ? Number(f.birthYear) : null,
  deathYear: f.deathYear ? Number(f.deathYear) : null,
  country: f.country.trim(),
  period: f.period || null,
  bio: f.bio.trim(),
  imageUrl: f.imageUrl.trim(),
  imageSource: f.imageSource.trim(),
  imageLicense: f.imageLicense.trim(),
});

/** Kiểm tra phía web trước khi gửi (BE vẫn kiểm tra lại); trả câu lỗi hoặc chuỗi rỗng. */
function validate(f: FormState): string {
  if (!f.name.trim()) return t('admin.composers.errName');
  const thisYear = new Date().getFullYear();
  const birth = f.birthYear ? Number(f.birthYear) : null;
  const death = f.deathYear ? Number(f.deathYear) : null;
  if ((birth !== null && (birth < 1 || birth > thisYear)) || (death !== null && (death < 1 || death > thisYear)))
    return t('admin.composers.errYears');
  if (birth !== null && death !== null && death < birth) return t('admin.composers.errDeathBeforeBirth');
  if (f.imageUrl.trim()) {
    if (!f.imageUrl.trim().startsWith('https://')) return t('admin.composers.errHttps');
    if (!/^https?:\/\//.test(f.imageSource.trim())) return t('admin.composers.errSource');
    if (!f.imageLicense.trim()) return t('admin.composers.errLicense');
  }
  return '';
}

/** Admin (mục 5.4): thêm, sửa, xóa nhạc sĩ; bản nhạc tự gắn với nhạc sĩ theo tên tác giả. */
export default function AdminComposers() {
  const { confirm } = useDialog();
  const [list, setList] = useState<Composer[] | null>(null);
  const [editing, setEditing] = useState<Composer | 'new' | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');

  const load = useCallback(() => {
    adminComposerApi
      .list()
      .then((res) => setList(res.data.result))
      .catch(() => toast.error(t('composers.loadFailed')));
  }, []);

  useEffect(load, [load]);

  const openForm = (target: Composer | 'new') => {
    setEditing(target);
    setForm(target === 'new' ? EMPTY : toForm(target));
    setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const problem = validate(form);
    if (problem) return setError(problem);
    setBusy(true);
    try {
      const payload = toPayload(form);
      if (editing === 'new') await adminComposerApi.create(payload);
      else if (editing) await adminComposerApi.update(editing.id, payload);
      toast.success(editing === 'new' ? t('admin.composers.added') : t('admin.composers.saved'));
      setEditing(null);
      load();
    } catch (err) {
      setError(errorMessage(err, t('admin.composers.saveFailed')));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (c: Composer) => {
    const ok = await confirm({
      title: t('admin.composers.deleteTitle', { name: c.name }),
      message: c.scoreCount > 0 ? t('admin.composers.deleteMessage', { count: c.scoreCount }) : undefined,
      confirmLabel: t('common.delete'),
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await adminComposerApi.remove(c.id);
      toast.success(t('admin.composers.deleted'));
      if (editing !== 'new' && editing?.id === c.id) setEditing(null);
      load();
    } catch (err) {
      toast.error(errorMessage(err, t('admin.composers.deleteFailed')));
    }
  };

  const relink = async () => {
    setBusy(true);
    try {
      const res = await adminComposerApi.relink();
      toast.success(
        res.data.result > 0
          ? t('admin.composers.relinked', { count: res.data.result })
          : t('admin.composers.relinkedNone'),
      );
      load();
    } catch (err) {
      toast.error(errorMessage(err, t('admin.composers.relinkFailed')));
    } finally {
      setBusy(false);
    }
  };

  const q = query.trim().toLowerCase();
  const shown = (list ?? []).filter(
    (c) => !q || c.name.toLowerCase().includes(q) || (c.aliases ?? '').toLowerCase().includes(q),
  );

  return (
    <>
      <PageHeader
        title={t('composers.title')}
        description={t('admin.composers.description')}
        actions={
          <>
            <Button icon="refresh" disabled={busy} onClick={relink} title={t('admin.composers.relinkHint')}>
              {t('admin.composers.relink')}
            </Button>
            <Button variant="primary" icon="plus" onClick={() => openForm('new')}>
              {t('admin.composers.add')}
            </Button>
          </>
        }
      />

      {editing && (
        <Card
          title={editing === 'new' ? t('admin.composers.add') : t('admin.composers.editing', { name: editing.name })}
          actions={
            <Button variant="ghost" icon="x" onClick={() => setEditing(null)}>
              {t('common.close')}
            </Button>
          }
          className="acp-form-card"
        >
          <form className="acp-form" onSubmit={save} noValidate>
            <div className="acp-form__preview">
              <ComposerPortrait
                name={form.name || '?'}
                imageUrl={form.imageUrl.startsWith('https://') ? form.imageUrl : null}
              />
            </div>
            <div className="acp-form__fields">
              <div className="acp-grid">
                <Field label={t('admin.composers.fieldName')} htmlFor="acp-name">
                  <input
                    id="acp-name"
                    className="adm-input"
                    maxLength={255}
                    value={form.name}
                    onChange={(e) => set('name', e.target.value)}
                    autoFocus
                  />
                </Field>
                <Field label={t('composers.period')} htmlFor="acp-period">
                  <select
                    id="acp-period"
                    className="adm-input"
                    value={form.period}
                    onChange={(e) => set('period', e.target.value as ComposerPeriod | '')}
                  >
                    <option value="">{t('admin.composers.notChosen')}</option>
                    {PERIODS.map((p) => (
                      <option key={p} value={p}>
                        {PERIOD_LABELS[p]}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={t('admin.composers.birth')} htmlFor="acp-birth">
                  <input
                    id="acp-birth"
                    className="adm-input"
                    inputMode="numeric"
                    value={form.birthYear}
                    onChange={(e) => set('birthYear', e.target.value.replace(/\D/g, '').slice(0, 4))}
                  />
                </Field>
                <Field label={t('admin.composers.death')} htmlFor="acp-death">
                  <input
                    id="acp-death"
                    className="adm-input"
                    inputMode="numeric"
                    value={form.deathYear}
                    onChange={(e) => set('deathYear', e.target.value.replace(/\D/g, '').slice(0, 4))}
                  />
                </Field>
                <Field label={t('admin.composers.country')} htmlFor="acp-country">
                  <input
                    id="acp-country"
                    className="adm-input"
                    maxLength={100}
                    value={form.country}
                    onChange={(e) => set('country', e.target.value)}
                  />
                </Field>
                <Field
                  label={t('admin.composers.aliases')}
                  htmlFor="acp-aliases"
                  hint={t('admin.composers.aliasesHint')}
                >
                  <input
                    id="acp-aliases"
                    className="adm-input"
                    maxLength={500}
                    value={form.aliases}
                    onChange={(e) => set('aliases', e.target.value)}
                  />
                </Field>
              </div>
              <Field
                label={t('admin.composers.bio')}
                htmlFor="acp-bio"
                hint={t('admin.announcements.chars', { used: form.bio.length, max: 4000 })}
              >
                <textarea
                  id="acp-bio"
                  className="adm-input"
                  rows={4}
                  maxLength={4000}
                  value={form.bio}
                  onChange={(e) => set('bio', e.target.value)}
                />
              </Field>
              <div className="acp-grid acp-grid--image">
                <Field label={t('admin.composers.imageUrl')} htmlFor="acp-image">
                  <input
                    id="acp-image"
                    className="adm-input"
                    placeholder="https://upload.wikimedia.org/..."
                    maxLength={1000}
                    value={form.imageUrl}
                    onChange={(e) => set('imageUrl', e.target.value)}
                  />
                </Field>
                <Field label={t('admin.composers.imageSource')} htmlFor="acp-source">
                  <input
                    id="acp-source"
                    className="adm-input"
                    placeholder="https://commons.wikimedia.org/wiki/File:..."
                    maxLength={1000}
                    value={form.imageSource}
                    onChange={(e) => set('imageSource', e.target.value)}
                  />
                </Field>
                <Field label={t('admin.composers.imageLicense')} htmlFor="acp-license">
                  <input
                    id="acp-license"
                    className="adm-input"
                    list="acp-licenses"
                    maxLength={100}
                    value={form.imageLicense}
                    onChange={(e) => set('imageLicense', e.target.value)}
                  />
                  <datalist id="acp-licenses">
                    {LICENSES.map((l) => (
                      <option key={l} value={l} />
                    ))}
                  </datalist>
                </Field>
              </div>
              {error && (
                <p className="acp-error" role="alert">
                  {error}
                </p>
              )}
              <div className="acp-form__actions">
                <Button variant="ghost" onClick={() => setEditing(null)}>
                  {t('common.cancel')}
                </Button>
                <Button type="submit" variant="primary" icon="check" loading={busy}>
                  {editing === 'new' ? t('admin.composers.add') : t('scores.edit.saveChanges')}
                </Button>
              </div>
            </div>
          </form>
        </Card>
      )}

      <Card
        flush
        title={list ? t('admin.composers.count', { count: list.length }) : t('admin.composers.list')}
        actions={
          <input
            className="adm-input"
            placeholder={t('admin.composers.searchPlaceholder')}
            aria-label={t('composers.search')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        }
      >
        <Table minWidth={760}>
          <thead>
            <tr>
              <th>{t('composers.title')}</th>
              <th>{t('composers.period')}</th>
              <th>{t('admin.composers.photo')}</th>
              <th className="adm-table__num">{t('admin.composers.linked')}</th>
              <th className="adm-table__actions">{t('scores.files.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {!list && <TableState colSpan={5} loading />}
            {list && shown.length === 0 && <TableState colSpan={5} title={t('composers.emptyTitle')} />}
            {shown.map((c) => (
              <tr key={c.id}>
                <td>
                  <div className="acp-row">
                    <span className="acp-row__thumb">
                      <ComposerPortrait name={c.name} imageUrl={c.imageUrl} />
                    </span>
                    <CellTitle sub={[lifespan(c), c.country].filter(Boolean).join(' · ') || c.slug}>
                      <Link to={`/composers/${c.slug}`} target="_blank" rel="noopener noreferrer">
                        {c.name}
                      </Link>
                    </CellTitle>
                  </div>
                </td>
                <td>{c.period ? PERIOD_LABELS[c.period] : '—'}</td>
                <td>
                  {c.imageUrl ? (
                    <Badge tone="success" title={c.imageLicense ?? undefined}>
                      {c.imageLicense ?? t('admin.composers.hasPhoto')}
                    </Badge>
                  ) : (
                    <Badge>{t('admin.composers.noPhoto')}</Badge>
                  )}
                </td>
                <td className="adm-table__num">
                  <Badge tone={c.scoreCount > 0 ? 'primary' : 'neutral'}>{c.scoreCount}</Badge>
                </td>
                <td className="adm-table__actions">
                  <div className="adm-table__actions-inner">
                    <Button size="sm" icon="edit" onClick={() => openForm(c)}>
                      {t('playlists.edit')}
                    </Button>
                    <Button size="sm" variant="ghost" icon="trash" onClick={() => remove(c)}>
                      {t('common.delete')}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
