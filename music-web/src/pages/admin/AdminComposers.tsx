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
  if (!f.name.trim()) return 'Nhập tên nhạc sĩ';
  const thisYear = new Date().getFullYear();
  const birth = f.birthYear ? Number(f.birthYear) : null;
  const death = f.deathYear ? Number(f.deathYear) : null;
  if ((birth !== null && (birth < 1 || birth > thisYear)) || (death !== null && (death < 1 || death > thisYear)))
    return 'Năm sinh, năm mất không hợp lệ';
  if (birth !== null && death !== null && death < birth) return 'Năm mất phải sau năm sinh';
  if (f.imageUrl.trim()) {
    if (!f.imageUrl.trim().startsWith('https://')) return 'Link ảnh phải bắt đầu bằng https://';
    if (!/^https?:\/\//.test(f.imageSource.trim())) return 'Có ảnh thì phải ghi trang nguồn của ảnh (link)';
    if (!f.imageLicense.trim()) return 'Có ảnh thì phải ghi giấy phép của ảnh';
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
      .catch(() => toast.error('Không tải được danh sách nhạc sĩ'));
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
      toast.success(editing === 'new' ? 'Đã thêm nhạc sĩ' : 'Đã lưu thay đổi');
      setEditing(null);
      load();
    } catch (err) {
      setError(errorMessage(err, 'Không lưu được nhạc sĩ'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (c: Composer) => {
    const ok = await confirm({
      title: `Xóa nhạc sĩ "${c.name}"?`,
      message:
        c.scoreCount > 0
          ? `${c.scoreCount} bản nhạc đang gắn sẽ chỉ mất liên kết; chữ tác giả trên bản nhạc vẫn giữ nguyên.`
          : undefined,
      confirmLabel: 'Xóa',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await adminComposerApi.remove(c.id);
      toast.success('Đã xóa nhạc sĩ');
      if (editing !== 'new' && editing?.id === c.id) setEditing(null);
      load();
    } catch (err) {
      toast.error(errorMessage(err, 'Không xóa được nhạc sĩ'));
    }
  };

  const relink = async () => {
    setBusy(true);
    try {
      const res = await adminComposerApi.relink();
      toast.success(res.data.result > 0 ? `Đã gắn lại ${res.data.result} bản nhạc` : 'Mọi bản nhạc đã đúng liên kết');
      load();
    } catch (err) {
      toast.error(errorMessage(err, 'Không gắn lại được'));
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
        title="Nhạc sĩ"
        description="Bản nhạc tự gắn với nhạc sĩ khi chữ tác giả khớp tên hoặc tên khác. Ảnh chỉ dùng loại thuộc phạm vi công cộng hoặc có giấy phép, luôn ghi nguồn."
        actions={
          <>
            <Button icon="refresh" disabled={busy} onClick={relink} title="Gắn lại mọi bản nhạc theo tên tác giả">
              Gắn lại bản nhạc
            </Button>
            <Button variant="primary" icon="plus" onClick={() => openForm('new')}>
              Thêm nhạc sĩ
            </Button>
          </>
        }
      />

      {editing && (
        <Card
          title={editing === 'new' ? 'Thêm nhạc sĩ' : `Sửa: ${editing.name}`}
          actions={
            <Button variant="ghost" icon="x" onClick={() => setEditing(null)}>
              Đóng
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
                <Field label="Tên nhạc sĩ *" htmlFor="acp-name">
                  <input
                    id="acp-name"
                    className="adm-input"
                    maxLength={255}
                    value={form.name}
                    onChange={(e) => set('name', e.target.value)}
                    autoFocus
                  />
                </Field>
                <Field label="Thời kỳ" htmlFor="acp-period">
                  <select
                    id="acp-period"
                    className="adm-input"
                    value={form.period}
                    onChange={(e) => set('period', e.target.value as ComposerPeriod | '')}
                  >
                    <option value="">Chưa chọn</option>
                    {PERIODS.map((p) => (
                      <option key={p} value={p}>
                        {PERIOD_LABELS[p]}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Năm sinh" htmlFor="acp-birth">
                  <input
                    id="acp-birth"
                    className="adm-input"
                    inputMode="numeric"
                    value={form.birthYear}
                    onChange={(e) => set('birthYear', e.target.value.replace(/\D/g, '').slice(0, 4))}
                  />
                </Field>
                <Field label="Năm mất" htmlFor="acp-death">
                  <input
                    id="acp-death"
                    className="adm-input"
                    inputMode="numeric"
                    value={form.deathYear}
                    onChange={(e) => set('deathYear', e.target.value.replace(/\D/g, '').slice(0, 4))}
                  />
                </Field>
                <Field label="Quốc gia" htmlFor="acp-country">
                  <input
                    id="acp-country"
                    className="adm-input"
                    maxLength={100}
                    value={form.country}
                    onChange={(e) => set('country', e.target.value)}
                  />
                </Field>
                <Field
                  label="Tên khác"
                  htmlFor="acp-aliases"
                  hint="Cách nhau bằng dấu phẩy, ví dụ: Bach, J.S. Bach. Dùng để gắn bản nhạc."
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
              <Field label="Tiểu sử ngắn" htmlFor="acp-bio" hint={`${form.bio.length}/4000 ký tự`}>
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
                <Field label="Link ảnh (https)" htmlFor="acp-image">
                  <input
                    id="acp-image"
                    className="adm-input"
                    placeholder="https://upload.wikimedia.org/..."
                    maxLength={1000}
                    value={form.imageUrl}
                    onChange={(e) => set('imageUrl', e.target.value)}
                  />
                </Field>
                <Field label="Trang nguồn của ảnh" htmlFor="acp-source">
                  <input
                    id="acp-source"
                    className="adm-input"
                    placeholder="https://commons.wikimedia.org/wiki/File:..."
                    maxLength={1000}
                    value={form.imageSource}
                    onChange={(e) => set('imageSource', e.target.value)}
                  />
                </Field>
                <Field label="Giấy phép ảnh" htmlFor="acp-license">
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
                  Hủy
                </Button>
                <Button type="submit" variant="primary" icon="check" loading={busy}>
                  {editing === 'new' ? 'Thêm nhạc sĩ' : 'Lưu thay đổi'}
                </Button>
              </div>
            </div>
          </form>
        </Card>
      )}

      <Card
        flush
        title={list ? `${list.length} nhạc sĩ` : 'Danh sách'}
        actions={
          <input
            className="adm-input"
            placeholder="Tìm theo tên"
            aria-label="Tìm nhạc sĩ"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        }
      >
        <Table minWidth={760}>
          <thead>
            <tr>
              <th>Nhạc sĩ</th>
              <th>Thời kỳ</th>
              <th>Ảnh</th>
              <th className="adm-table__num">Bản nhạc gắn</th>
              <th className="adm-table__actions">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {!list && <TableState colSpan={5} loading />}
            {list && shown.length === 0 && <TableState colSpan={5} title="Không có nhạc sĩ nào" />}
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
                      {c.imageLicense ?? 'Có ảnh'}
                    </Badge>
                  ) : (
                    <Badge>Chưa có</Badge>
                  )}
                </td>
                <td className="adm-table__num">
                  <Badge tone={c.scoreCount > 0 ? 'primary' : 'neutral'}>{c.scoreCount}</Badge>
                </td>
                <td className="adm-table__actions">
                  <div className="adm-table__actions-inner">
                    <Button size="sm" icon="edit" onClick={() => openForm(c)}>
                      Sửa
                    </Button>
                    <Button size="sm" variant="ghost" icon="trash" onClick={() => remove(c)}>
                      Xóa
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
