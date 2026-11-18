import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from '../../../routes/useTransitionNavigate';
import { toast } from 'react-toastify';
import { LibraryEmpty, LibrarySkeleton } from '../../../components/scores/library/LibraryStates';
import Pagination from '../../../components/scores/common/Pagination';
import ScoreCard from '../../../components/scores/library/ScoreCard';
import ScoreFilters from '../../../components/scores/library/ScoreFilters';
import PlaylistPicker from '../../../components/scores/library/PlaylistPicker';
import DeleteScoreModal from '../../../components/scores/detail/DeleteScoreModal';
import ContextMenu from '../../../components/ui/ContextMenu';
import type { MenuItem } from '../../../components/ui/ContextMenu';
import Icon from '../../../components/ui/Icon';
import { useDialog } from '../../../components/ui/dialog-context';
import { officialRequestApi, scoreApi, tagApi } from '../../../services';
import type {
  Difficulty,
  PageResult,
  ProcessingStatus,
  ScoreSort,
  ScoreSource,
  ScoreSummary,
  Tag,
} from '../../../types';
import { getErrorMessage, getScorePath, MAX_KEYWORD, POLL_INTERVAL_MS } from '../../../utils/score';
import '../../../components/scores/scores.css';
import './ScoreLibrary.css';
import { t } from '../../../i18n/core';

const PAGE_SIZE = 12;
/** Độ dài tối đa của tên bản nhạc (khớp BE). */
const MAX_TITLE = 255;

/** Bản nhạc đã có nội dung để mở trình chỉnh sửa / phát (không còn đang nhận dạng hay lỗi). */
const isReady = (s: ScoreSummary): boolean => s.processingStatus === 'COMPLETED';

/** Trang /scores: thư viện "Bản nhạc của tôi" (doc mục 2.0). */
export default function ScoreLibrary() {
  const navigate = useNavigate();
  const dialog = useDialog();

  // Menu chuột phải / nút ⋯ trên thẻ, và các hộp thoại mở từ menu
  const [menu, setMenu] = useState<{ score: ScoreSummary; x: number; y: number } | null>(null);
  const [saving, setSaving] = useState<ScoreSummary | null>(null);
  const [trashing, setTrashing] = useState<ScoreSummary | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);

  // Bộ lọc
  const [page, setPage] = useState(0);
  const [keywordInput, setKeywordInput] = useState(''); // giá trị đang gõ
  const [keyword, setKeyword] = useState(''); // giá trị đã debounce, dùng để gọi API
  const [status, setStatus] = useState<ProcessingStatus | ''>('');
  const [source, setSource] = useState<ScoreSource | ''>('');
  const [difficulty, setDifficulty] = useState<Difficulty | ''>('');
  const [tagId, setTagId] = useState('');
  const [allTags, setAllTags] = useState<Tag[]>([]);
  // Số lời xin đưa bản nhạc của mình vào kho mẫu đang chờ trả lời
  const [pendingOfficial, setPendingOfficial] = useState(0);
  const [sort, setSort] = useState<ScoreSort>('newest');

  // Dữ liệu: key = bộ lọc của lần tải xong gần nhất, dùng để biết đang tải lại hay không
  const [loaded, setLoaded] = useState<{ key: string; data: PageResult<ScoreSummary> | null }>({
    key: '',
    data: null,
  });
  const [tick, setTick] = useState(0); // tăng lên để tải lại (polling)
  const requestKey = [page, keyword, status, source, difficulty, tagId, sort].join('|');

  // Danh sách thể loại cho ô lọc; lỗi thì ô lọc chỉ còn "Mọi thể loại", không chặn trang
  useEffect(() => {
    tagApi
      .list()
      .then((res) => setAllTags(res.data.result))
      .catch(() => setAllTags([]));
  }, []);

  // Lời xin vào kho mẫu đang chờ; lỗi thì không hiện nút, không chặn trang
  useEffect(() => {
    officialRequestApi
      .mine()
      .then((res) => setPendingOfficial(res.data.result.length))
      .catch(() => setPendingOfficial(0));
  }, []);

  // Debounce ô tìm kiếm 400ms để không gọi API sau mỗi phím gõ
  useEffect(() => {
    const t = setTimeout(() => {
      setKeyword(keywordInput.trim().slice(0, MAX_KEYWORD));
      setPage(0);
    }, 400);
    return () => clearTimeout(t);
  }, [keywordInput]);

  // Gọi API mỗi khi bộ lọc / trang đổi hoặc tới nhịp polling
  useEffect(() => {
    let cancelled = false;
    scoreApi
      .list({ page, size: PAGE_SIZE, keyword, status, source, difficulty, tagId, sort })
      .then((res) => {
        if (!cancelled) setLoaded({ key: requestKey, data: res.data.result });
      })
      .catch(() => {
        if (cancelled) return;
        toast.error(t('scores.library.loadFailed'));
        setLoaded((prev) => ({ ...prev, key: requestKey }));
      });
    return () => {
      cancelled = true;
    };
  }, [page, keyword, status, source, difficulty, tagId, sort, tick, requestKey]);

  // Còn bản nhạc PENDING/PROCESSING thì cứ 5 giây tải lại một lần để thấy trạng thái mới
  const data = loaded.data;
  const hasRunning = data?.content.some((s) => s.processingStatus === 'PENDING' || s.processingStatus === 'PROCESSING');
  useEffect(() => {
    if (!hasRunning) return;
    const t = setInterval(() => setTick((n) => n + 1), POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [hasRunning]);

  const isInitialLoading = loaded.data === null && loaded.key === '';
  const isRefetching = loaded.key !== requestKey;
  const hasFilter = Boolean(keyword || status || source || difficulty || tagId);

  // Đổi bộ lọc thì quay về trang đầu
  const changeFilter =
    <T,>(setter: (v: T) => void) =>
    (v: T) => {
      setter(v);
      setPage(0);
    };

  const reload = () => setTick((n) => n + 1);

  const copyLink = async (score: ScoreSummary) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/scores/${score.id}`);
      toast.success(t('scores.libMenu.linkCopied'));
    } catch {
      toast.error(t('scores.libMenu.linkFailed'));
    }
  };

  const rename = async (score: ScoreSummary) => {
    const title = await dialog.prompt({
      title: t('scores.libMenu.renameTitle'),
      label: t('scores.libMenu.renameLabel'),
      defaultValue: score.title,
      maxLength: MAX_TITLE,
      required: true,
      confirmLabel: t('scores.libMenu.renameConfirm'),
    });
    const next = title?.trim();
    if (!next || next === score.title) return;
    try {
      await scoreApi.update(score.id, { title: next });
      toast.success(t('scores.libMenu.renamed'));
      reload();
    } catch (err) {
      toast.error(getErrorMessage(err, t('scores.libMenu.renameFailed')));
    }
  };

  /** Xóa vĩnh viễn ngay từ thư viện: chuyển vào thùng rác rồi xóa hẳn khỏi thùng rác (không khôi phục được). */
  const purge = async (score: ScoreSummary) => {
    const ok = await dialog.confirm({
      title: t('scores.libMenu.purgeTitle'),
      message: t('scores.libMenu.purgeMessage', { title: score.title }),
      confirmLabel: t('scores.libMenu.purgeConfirm'),
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await scoreApi.remove(score.id);
      await scoreApi.purge(score.id);
      toast.success(t('scores.libMenu.purged', { title: score.title }));
      reload();
    } catch (err) {
      toast.error(getErrorMessage(err, t('scores.trash.purgeFailed')));
      reload();
    }
  };

  const menuItems = (score: ScoreSummary): MenuItem[] => {
    const ready = isReady(score);
    const running = score.processingStatus === 'PENDING' || score.processingStatus === 'PROCESSING';
    return [
      {
        id: 'open',
        label: t('scores.libMenu.openDetail'),
        icon: <Icon name="music" size={16} />,
        shortcut: 'Enter',
        onSelect: () => navigate(getScorePath(score.id, score.processingStatus)),
      },
      {
        id: 'edit',
        label: t('scores.hero.openEditor'),
        icon: <Icon name="edit" size={16} />,
        disabled: !ready,
        disabledReason: t('scores.hero.noXmlOpen'),
        onSelect: () => navigate(`/scores/${score.id}/edit`),
      },
      {
        id: 'play',
        label: t('scores.hero.play'),
        icon: <Icon name="play" size={16} />,
        disabled: !ready,
        disabledReason: t('scores.hero.noXmlPlay'),
        onSelect: () => navigate(`/scores/${score.id}/play`),
      },
      {
        id: 'newTab',
        label: t('scores.libMenu.newTab'),
        icon: <Icon name="external" size={16} />,
        onSelect: () => window.open(getScorePath(score.id, score.processingStatus), '_blank', 'noopener'),
      },
      { type: 'separator', id: 's1' },
      {
        id: 'rename',
        label: t('scores.libMenu.rename'),
        icon: <Icon name="type" size={16} />,
        disabled: running,
        onSelect: () => void rename(score),
      },
      {
        id: 'playlist',
        label: t('scores.libMenu.addToPlaylist'),
        icon: <Icon name="listPlus" size={16} />,
        onSelect: () => setSaving(score),
      },
      {
        id: 'link',
        label: t('scores.libMenu.copyLink'),
        icon: <Icon name="link" size={16} />,
        onSelect: () => void copyLink(score),
      },
      { type: 'separator', id: 's2' },
      {
        id: 'trash',
        label: t('scores.libMenu.trash'),
        hint: t('scores.libMenu.trashHint'),
        icon: <Icon name="trash" size={16} />,
        shortcut: 'Del',
        danger: true,
        onSelect: () => setTrashing(score),
      },
      {
        id: 'purge',
        label: t('scores.libMenu.purge'),
        hint: t('scores.libMenu.purgeHint'),
        icon: <Icon name="trashX" size={16} />,
        shortcut: 'Shift+Del',
        danger: true,
        onSelect: () => void purge(score),
      },
    ];
  };

  // Phím Delete / Shift+Delete trên thẻ đang được chọn bằng bàn phím: chuyển vào thùng rác / xóa vĩnh viễn
  const onGridKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Delete') return;
    const id = (e.target as HTMLElement).closest<HTMLElement>('[data-score-id]')?.dataset.scoreId;
    const score = data?.content.find((s) => s.id === id);
    if (!score) return;
    e.preventDefault();
    if (e.shiftKey) void purge(score);
    else setTrashing(score);
  };

  const resetFilters = () => {
    setKeywordInput('');
    setKeyword('');
    setStatus('');
    setSource('');
    setDifficulty('');
    setTagId('');
    setSort('newest');
    setPage(0);
  };

  return (
    <div className="sc-page sc-lib">
      <main className="sc-container">
        <header className="sc-lib-head sc-lib-hero ui-stage">
          <div>
            <h1>{t('scores.library.title')}</h1>
            <p>{data ? t('scores.library.count', { count: data.totalElements }) : t('scores.library.subtitle')}</p>
          </div>
          <div className="sc-lib-head__actions">
            {pendingOfficial > 0 && (
              <button className="sc-btn sc-btn--primary" onClick={() => navigate('/scores/official-requests')}>
                {t('scores.library.officialRequests', { count: pendingOfficial })}
              </button>
            )}
            <button className="sc-btn" onClick={() => navigate('/scores/trash')}>
              {t('common.nav.items.trash')}
            </button>
            <button className="sc-btn sc-btn--primary" onClick={() => navigate('/scores/upload')}>
              {t('scores.library.upload')}
            </button>
          </div>
        </header>

        <ScoreFilters
          keyword={keywordInput}
          status={status}
          source={source}
          difficulty={difficulty}
          tags={allTags}
          tagId={tagId}
          sort={sort}
          onKeyword={setKeywordInput}
          onStatus={changeFilter(setStatus)}
          onSource={changeFilter(setSource)}
          onDifficulty={changeFilter(setDifficulty)}
          onTag={changeFilter(setTagId)}
          onSort={changeFilter(setSort)}
        />

        {isInitialLoading && <LibrarySkeleton />}

        {data && data.content.length === 0 && <LibraryEmpty filtered={hasFilter} onReset={resetFilters} />}

        {data && data.content.length > 0 && (
          <div className={`sc-grid ${isRefetching ? 'is-refetching' : ''}`} onKeyDown={onGridKeyDown}>
            {data.content.map((s) => (
              <div key={s.id} className="sc-grid__cell" data-score-id={s.id}>
                <ScoreCard
                  score={s}
                  showViews={sort === 'views'}
                  onOpen={(item) => navigate(getScorePath(item.id, item.processingStatus))}
                  onMenu={(item, point) => setMenu({ score: item, ...point })}
                  menuOpen={menu?.score.id === s.id}
                />
              </div>
            ))}
          </div>
        )}

        {data && data.content.length > 0 && <p className="sc-lib-tip">{t('scores.libMenu.tip')}</p>}

        {data && (
          <Pagination page={page} totalPages={data.totalPages} totalElements={data.totalElements} onChange={setPage} />
        )}
      </main>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          label={t('scores.libMenu.label')}
          title={menu.score.title}
          items={menuItems(menu.score)}
          onClose={closeMenu}
        />
      )}
      {saving && <PlaylistPicker score={saving} onClose={() => setSaving(null)} />}
      {trashing && (
        <DeleteScoreModal
          scoreId={trashing.id}
          title={trashing.title}
          onClose={() => setTrashing(null)}
          onDeleted={() => {
            setTrashing(null);
            reload();
          }}
        />
      )}
    </div>
  );
}
