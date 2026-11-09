import { Routes, Route } from 'react-router-dom';
import Home from '../pages/Home';
import Login from '../pages/Login';
import UserProfile from '../pages/Profile';
import ScoreLibrary from '../pages/scores/ScoreLibrary';
import ScoreDetail from '../pages/scores/ScoreDetail';
import ScoreUpload from '../pages/scores/ScoreUpload';
import ScoreProcessing from '../pages/scores/ScoreProcessing';
import ScoreReview from '../pages/scores/ScoreReview';
import ScoreViewer from '../pages/scores/ScoreViewer';
import ScorePlayer from '../pages/scores/ScorePlayer';
import EditorSpike from '../pages/scores/EditorSpike';
import ScoreImport from '../pages/scores/ScoreImport';
import SharedScores from '../pages/scores/SharedScores';
import PlaylistDetail from '../pages/scores/PlaylistDetail';
import Playlists from '../pages/scores/Playlists';
import AdminAnnouncements from '../pages/admin/AdminAnnouncements';
import AdminDashboard from '../pages/admin/AdminDashboard';
import AdminLayout from '../components/admin/AdminLayout';
import AdminMemberDetail from '../pages/admin/AdminMemberDetail';
import AdminMembers from '../pages/admin/AdminMembers';
import AdminOfficialScores from '../pages/admin/AdminOfficialScores';
import AdminPendingScores from '../pages/admin/AdminPendingScores';
import AdminScores from '../pages/admin/AdminScores';
import AdminSystem from '../pages/admin/AdminSystem';
import AdminTags from '../pages/admin/AdminTags';
import OfficialScores from '../pages/scores/OfficialScores';
import PracticeHistory from '../pages/scores/PracticeHistory';
import PracticeStats from '../pages/scores/PracticeStats';
import UserLayout from '../components/layout/UserLayout';
import ProtectedRoute from './ProtectedRoute';

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/auth/login" element={<Login />} />
      {/* Trang người dùng nằm trong khung chung (thanh trên + nội dung) */}
      <Route
        element={
          <ProtectedRoute allowedRole="USER">
            <UserLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/profile" element={<UserProfile />} />
        <Route path="/scores" element={<ScoreLibrary />} />
        <Route path="/scores/upload" element={<ScoreUpload />} />
        <Route path="/scores/import" element={<ScoreImport />} />
        <Route path="/scores/official" element={<OfficialScores />} />
        <Route path="/scores/shared" element={<SharedScores />} />
        <Route path="/scores/:id" element={<ScoreDetail />} />
        <Route path="/scores/:id/processing" element={<ScoreProcessing />} />
        <Route path="/scores/:id/review" element={<ScoreReview />} />
        <Route path="/playlists" element={<Playlists />} />
        <Route path="/playlists/:id" element={<PlaylistDetail />} />
        <Route path="/practice-history" element={<PracticeHistory />} />
        <Route path="/practice-stats" element={<PracticeStats />} />
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
        <Route index element={<AdminDashboard />} />
        <Route path="members" element={<AdminMembers />} />
        <Route path="members/:id" element={<AdminMemberDetail />} />
        <Route path="scores" element={<AdminScores />} />
        <Route path="scores/:id" element={<ScoreDetail admin />} />
        <Route path="scores/:id/edit" element={<ScoreViewer />} />
        <Route path="scores/:id/play" element={<ScorePlayer />} />
        <Route path="scores/:id/processing" element={<ScoreProcessing />} />
        <Route path="scores/:id/review" element={<ScoreReview />} />
        <Route path="pending-scores" element={<AdminPendingScores />} />
        <Route path="official-scores" element={<AdminOfficialScores />} />
        <Route path="announcements" element={<AdminAnnouncements />} />
        <Route path="tags" element={<AdminTags />} />
        <Route path="system" element={<AdminSystem />} />
      </Route>
    </Routes>
  );
};

export default AppRoutes;
