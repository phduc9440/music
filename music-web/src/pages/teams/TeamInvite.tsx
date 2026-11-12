import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Link } from '../../routes/transition-nav';
import { useNavigate } from '../../routes/useTransitionNavigate';
import Skeleton from '../../components/ui/Skeleton';
import { Icon } from '../../components/ui';
import { teamApi } from '../../services';
import type { TeamInvitationPreview } from '../../types';
import { formatDate, t } from '../../i18n/core';
import { getErrorMessage } from '../../utils/score';
import { RoleBadge } from './shared';
import '../../components/scores/scores.css';
import './teams.css';

/**
 * Trang /teams/invite/:token (link trong email hoặc link mời): xem team, vai trò rồi bấm Chấp nhận. Chưa đăng nhập thì
 * khung chung đưa sang trang đăng nhập và quay lại đây sau khi đăng nhập.
 */
export default function TeamInvite() {
  const { token = '' } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [preview, setPreview] = useState<TeamInvitationPreview | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    teamApi
      .preview(token)
      .then((res) => setPreview(res.data.result))
      .catch(() => setInvalid(true));
  }, [token]);

  const accept = async () => {
    setAccepting(true);
    try {
      const res = await teamApi.accept(token);
      toast.success(t('teams.invite.joined', { team: res.data.result.name }));
      navigate(`/teams/${res.data.result.id}`);
    } catch (err) {
      toast.error(getErrorMessage(err, t('teams.invite.respondFailed')));
      setAccepting(false);
    }
  };

  const problem = invalid
    ? t('teams.invite.state.INVALID')
    : preview?.alreadyMember
      ? t('teams.invite.alreadyMember')
      : preview && preview.state !== 'VALID'
        ? t(`teams.invite.state.${preview.state}`)
        : preview?.emailMismatch
          ? t('teams.invite.emailMismatch', { email: preview.email ?? '' })
          : null;

  return (
    <div className="sc-page">
      <main className="sc-container">
        <div className="tm-invitation">
          <Icon name="users" size={32} />
          {!preview && !invalid && <Skeleton lines={3} />}
          {invalid && <h1>{t('teams.invite.invalidTitle')}</h1>}
          {preview && (
            <>
              <p className="tm-muted">{t('teams.invite.title', { name: preview.invitedByName ?? '' })}</p>
              <h1>{preview.teamName}</h1>
              {preview.teamDescription && <p>{preview.teamDescription}</p>}
              <p>
                {t('teams.invite.roleLine')} <RoleBadge role={preview.role} />
              </p>
              <p className="tm-muted">{t(`teams.roleHint.${preview.role}`)}</p>
              {preview.state === 'VALID' && (
                <p className="tm-muted">{t('teams.invite.expires', { date: formatDate(preview.expiresAt) })}</p>
              )}
            </>
          )}
          {problem && <p className="tm-note tm-note--warning">{problem}</p>}
          <div className="sc-modal__actions">
            {preview?.alreadyMember ? (
              <Link className="sc-btn sc-btn--primary" to={`/teams/${preview.teamId}`}>
                {t('teams.invite.openTeam')}
              </Link>
            ) : (
              <>
                <Link className="sc-btn" to="/teams">
                  {t('teams.backToTeams')}
                </Link>
                {preview && !problem && (
                  <button type="button" className="sc-btn sc-btn--primary" disabled={accepting} onClick={accept}>
                    {accepting ? t('teams.invite.accepting') : t('teams.invite.accept')}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
