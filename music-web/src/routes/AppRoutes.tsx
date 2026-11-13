import { Route, createBrowserRouter, createRoutesFromElements } from 'react-router-dom';
import Login from '../pages/Login';
import UserProfile from '../pages/Profile';
import ScoreLibrary from '../pages/scores/library/ScoreLibrary';
import ScoreDetail from '../pages/scores/library/ScoreDetail';
import ScoreTrash from '../pages/scores/library/ScoreTrash';
import ScoreUpload from '../pages/scores/upload/ScoreUpload';
import ScoreProcessing from '../pages/scores/upload/ScoreProcessing';
import ScoreReview from '../pages/scores/upload/ScoreReview';
import ScoreViewer from '../pages/scores/editor/ScoreViewer';
import ScorePlayer from '../pages/scores/player/ScorePlayer';
import EditorSpike from '../pages/scores/editor/EditorSpike';
import ScoreImport from '../pages/scores/upload/ScoreImport';
import SharedScores from '../pages/scores/library/SharedScores';
import PlaylistDetail from '../pages/scores/playlists/PlaylistDetail';
import Playlists from '../pages/scores/playlists/Playlists';
import AdminAiTasks from '../pages/admin/AdminAiTasks';
import AdminAnnouncements from '../pages/admin/AdminAnnouncements';
import AdminLayout from '../components/admin/AdminLayout';
import AdminMemberDetail from '../pages/admin/AdminMemberDetail';
import AdminMembers from '../pages/admin/AdminMembers';
import AdminOfficialScores from '../pages/admin/AdminOfficialScores';
import AdminPendingScores from '../pages/admin/AdminPendingScores';
import AdminReports from '../pages/admin/AdminReports';
import AdminActivity from '../pages/admin/AdminActivity';
import AdminScores from '../pages/admin/AdminScores';
import AdminSystem from '../pages/admin/AdminSystem';
import AdminTags from '../pages/admin/AdminTags';
import AdminComposers from '../pages/admin/AdminComposers';
import ComposerDetail from '../pages/composers/ComposerDetail';
import Composers from '../pages/composers/Composers';
import ExploreScores from '../pages/scores/library/ExploreScores';
import OfficialRequests from '../pages/scores/library/OfficialRequests';
import OfficialScores from '../pages/scores/library/OfficialScores';
import PracticeHistory from '../pages/scores/practice/PracticeHistory';
import PracticeStats from '../pages/scores/practice/PracticeStats';
import MyPlan from '../pages/billing/MyPlan';
import Pricing from '../pages/billing/Pricing';
import BillingResult from '../pages/billing/BillingResult';
import AdminRevenue from '../pages/admin/AdminRevenue';
import AdminPlans from '../pages/admin/AdminPlans';
import AdminMemberPlans from '../pages/admin/AdminMemberPlans';
import AdminTeams from '../pages/admin/AdminTeams';
import AdminRoles from '../pages/admin/AdminRoles';
import AdminHome from '../pages/admin/AdminHome';
import AdminTeamDetail from '../pages/admin/AdminTeamDetail';
import GuestRoute from './GuestRoute';
import ProtectedRoute from './ProtectedRoute';
import RootLayout from './RootLayout';
import UserArea from './UserArea';
import WorkspaceHome from '../pages/home/WorkspaceHome';
import NotFound from '../pages/NotFound';
import Teams from '../pages/teams/Teams';
import TeamDetail from '../pages/teams/TeamDetail';
import TeamInvite from '../pages/teams/TeamInvite';
import ShowBoard from '../pages/teams/ShowBoard';

/**
 * Router dạng dữ liệu (createBrowserRouter) thay cho <BrowserRouter>: cần cho hiệu ứng chuyển trang bằng View
 * Transitions (prop viewTransition của Link/navigate) và cho loader/action về sau. Mọi route nằm dưới RootLayout, nơi
 * đặt các thành phần dùng chung (hộp thoại, thông báo nổi).
 */
const router = createBrowserRouter(
  createRoutesFromElements(
    <Route element={<RootLayout />}>
      <Route
        path="/auth/login"
        element={
          <GuestRoute>
            <Login />
          </GuestRoute>
        }
      />
      {/* Trang người dùng nằm trong khung chung (thanh trên + nội dung). "/" là trang làm việc khi đã đăng nhập,
          trang giới thiệu khi chưa (xem UserArea) */}
      <Route element={<UserArea />}>
        <Route index element={<WorkspaceHome />} />
        <Route path="/profile" element={<UserProfile />} />
        <Route path="/scores" element={<ScoreLibrary />} />
        <Route path="/scores/upload" element={<ScoreUpload />} />
        <Route path="/scores/import" element={<ScoreImport />} />
        <Route path="/explore" element={<ExploreScores />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/billing" element={<MyPlan />} />
        <Route path="/billing/result" element={<BillingResult />} />
        <Route path="/composers" element={<Composers />} />
        <Route path="/composers/:slug" element={<ComposerDetail />} />
        <Route path="/scores/official" element={<OfficialScores />} />
        <Route path="/scores/official-requests" element={<OfficialRequests />} />
        <Route path="/scores/shared" element={<SharedScores />} />
        <Route path="/scores/trash" element={<ScoreTrash />} />
        <Route path="/scores/:id" element={<ScoreDetail />} />
        <Route path="/scores/:id/processing" element={<ScoreProcessing />} />
        <Route path="/scores/:id/review" element={<ScoreReview />} />
        <Route path="/playlists" element={<Playlists />} />
        <Route path="/playlists/:id" element={<PlaylistDetail />} />
        <Route path="/practice-history" element={<PracticeHistory />} />
        <Route path="/practice-stats" element={<PracticeStats />} />
        {/* Team và Show (mục 4.1) */}
        <Route path="/teams" element={<Teams />} />
        <Route path="/teams/invite/:token" element={<TeamInvite />} />
        <Route path="/teams/:id" element={<TeamDetail />} />
        <Route path="/teams/:teamId/shows/:showId" element={<ShowBoard />} />
      </Route>

      {/* Trình chỉnh sửa và trình phát dùng toàn màn hình, có thanh công cụ riêng */}
      <Route
        path="/scores/:id/edit"
        element={
          <ProtectedRoute allowedRole="USER">
            <ScoreViewer />
          </ProtectedRoute>
        }
      />
      <Route
        path="/scores/:id/play"
        element={
          <ProtectedRoute allowedRole="USER">
            <ScorePlayer />
          </ProtectedRoute>
        }
      />
      {import.meta.env.DEV && (
        <Route
          path="/dev/editor-spike/:id"
          element={
            <ProtectedRoute allowedRole="USER">
              <EditorSpike />
            </ProtectedRoute>
          }
        />
      )}
      <Route
        path="/admin"
        element={
          <ProtectedRoute allowedRole="ADMIN">
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<AdminHome />} />
        <Route path="members" element={<AdminMembers />} />
        <Route path="roles" element={<AdminRoles />} />
        <Route path="members/:id" element={<AdminMemberDetail />} />
        <Route path="teams" element={<AdminTeams />} />
        <Route path="teams/:id" element={<AdminTeamDetail />} />
        <Route path="scores" element={<AdminScores />} />
        <Route path="scores/:id" element={<ScoreDetail admin />} />
        <Route path="scores/:id/edit" element={<ScoreViewer />} />
        <Route path="scores/:id/play" element={<ScorePlayer />} />
        <Route path="scores/:id/processing" element={<ScoreProcessing />} />
        <Route path="scores/:id/review" element={<ScoreReview />} />
        <Route path="pending-scores" element={<AdminPendingScores />} />
        <Route path="reports" element={<AdminReports />} />
        <Route path="activity" element={<AdminActivity />} />
        <Route path="official-scores" element={<AdminOfficialScores />} />
        <Route path="announcements" element={<AdminAnnouncements />} />
        <Route path="tags" element={<AdminTags />} />
        <Route path="revenue" element={<AdminRevenue />} />
        <Route path="plans" element={<AdminPlans />} />
        <Route path="member-plans" element={<AdminMemberPlans />} />
        <Route path="composers" element={<AdminComposers />} />
        <Route path="ai-tasks" element={<AdminAiTasks />} />
        <Route path="system" element={<AdminSystem />} />
        <Route path="*" element={<NotFound embedded />} />
      </Route>

      {/* Đường dẫn không khớp route nào: trang 404, khách và người đã đăng nhập đều thấy (không bắt đăng nhập) */}
      <Route path="*" element={<NotFound />} />
    </Route>,
  ),
);

export default router;
