import { Routes, Route } from 'react-router-dom';
import Home from '../pages/Home';
import Login from '../pages/Login';
import UserProfile from '../pages/Profile';
import ScoreLibrary from '../pages/scores/ScoreLibrary';
import ScoreDetail from '../pages/scores/ScoreDetail';
import ScoreUpload from '../pages/scores/ScoreUpload';
import ScoreImport from '../pages/scores/ScoreImport';
import SharedScores from '../pages/scores/SharedScores';
import ScoreProcessing from '../pages/scores/ScoreProcessing';
import ScoreReview from '../pages/scores/ScoreReview';
import ScoreViewer from '../pages/scores/ScoreViewer';
import EditorSpike from '../pages/scores/EditorSpike';
import AdminDashboard from '../pages/Admin';
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
        path="/admin"
        element={
          <ProtectedRoute allowedRole="ADMIN">
            <AdminDashboard />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
};

export default AppRoutes;
