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
import AdminDashboard from '../pages/admin/AdminDashboard';
import AdminLayout from '../components/admin/AdminLayout';
import AdminMembers from '../pages/admin/AdminMembers';
import AdminOfficialScores from '../pages/admin/AdminOfficialScores';
import AdminPendingScores from '../pages/admin/AdminPendingScores';
import AdminScores from '../pages/admin/AdminScores';
import AdminSystem from '../pages/admin/AdminSystem';
import AdminTags from '../pages/admin/AdminTags';
import OfficialScores from '../pages/scores/OfficialScores';
import PracticeHistory from '../pages/scores/PracticeHistory';
import PracticeStats from '../pages/scores/PracticeStats';
import ProtectedRoute from './ProtectedRoute';

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/auth/login" element={<Login />} />
      <Route
        path="/profile"
        element={
          <ProtectedRoute allowedRole="USER">
            <UserProfile />
          </ProtectedRoute>
        }
      />
      <Route
        path="/scores"
        element={
          <ProtectedRoute allowedRole="USER">
            <ScoreLibrary />
          </ProtectedRoute>
        }
      />
      <Route
        path="/scores/upload"
        element={
          <ProtectedRoute allowedRole="USER">
            <ScoreUpload />
          </ProtectedRoute>
        }
      />
      <Route
        path="/scores/:id/processing"
        element={
          <ProtectedRoute allowedRole="USER">
            <ScoreProcessing />
          </ProtectedRoute>
        }
      />
      <Route
        path="/scores/import"
        element={
          <ProtectedRoute allowedRole="USER">
            <ScoreImport />
          </ProtectedRoute>
        }
      />
      <Route
        path="/scores/:id/review"
        element={
          <ProtectedRoute allowedRole="USER">
            <ScoreReview />
          </ProtectedRoute>
        }
      />
      <Route
        path="/playlists"
        element={
          <ProtectedRoute allowedRole="USER">
            <Playlists />
          </ProtectedRoute>
        }
      />
      <Route
        path="/playlists/:id"
        element={
          <ProtectedRoute allowedRole="USER">
            <PlaylistDetail />
          </ProtectedRoute>
        }
      />
      <Route
        path="/scores/official"
        element={
          <ProtectedRoute allowedRole="USER">
            <OfficialScores />
          </ProtectedRoute>
        }
      />
      <Route
        path="/scores/shared"
        element={
          <ProtectedRoute allowedRole="USER">
            <SharedScores />
          </ProtectedRoute>
        }
      />
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
        path="/scores/:id"
        element={
          <ProtectedRoute allowedRole="USER">
            <ScoreDetail />
          </ProtectedRoute>
        }
      />
      <Route
        path="/practice-history"
        element={
          <ProtectedRoute allowedRole="USER">
            <PracticeHistory />
          </ProtectedRoute>
        }
      />
      <Route
        path="/practice-stats"
        element={
          <ProtectedRoute allowedRole="USER">
            <PracticeStats />
          </ProtectedRoute>
        }
      />
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
        <Route path="scores" element={<AdminScores />} />
        <Route path="scores/:id" element={<ScoreDetail admin />} />
        <Route path="scores/:id/edit" element={<ScoreViewer />} />
        <Route path="scores/:id/play" element={<ScorePlayer />} />
        <Route path="scores/:id/processing" element={<ScoreProcessing />} />
        <Route path="scores/:id/review" element={<ScoreReview />} />
        <Route path="pending-scores" element={<AdminPendingScores />} />
        <Route path="official-scores" element={<AdminOfficialScores />} />
        <Route path="tags" element={<AdminTags />} />
        <Route path="system" element={<AdminSystem />} />
      </Route>
    </Routes>
  );
};

export default AppRoutes;
