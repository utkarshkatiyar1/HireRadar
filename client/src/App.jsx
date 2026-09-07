import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute, PublicOnlyRoute, AdminRoute } from './routes/guards';
import PricingRoute from './routes/PricingRoute';
import AppShell from './layout/AppShell';

import LoginPageRoute from './pages/LoginPageRoute';
import JobsPage from './pages/JobsPage';
import JobDetail from './pages/JobDetail';
import ProgressPage from './pages/ProgressPage';
import CompaniesPageRoute from './pages/CompaniesPageRoute';
import LeaderboardPageRoute from './pages/LeaderboardPageRoute';
import ProfilePageRoute from './pages/ProfilePageRoute';
import TerminalPageRoute from './pages/TerminalPageRoute';
import CandidateProfilePage from './pages/CandidateProfilePage';
import ResumesPage from './pages/ResumesPage';
import ApprovalQueuePage from './pages/ApprovalQueuePage';
import ApplicationDetail from './pages/ApplicationDetail';
import AuditTrailPage from './pages/AuditTrailPage';
import { FEATURES } from './config/features';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<PublicOnlyRoute><LoginPageRoute /></PublicOnlyRoute>} />
      <Route path="/pricing" element={<PricingRoute />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route path="/jobs" element={<JobsPage />} />
          <Route path="/jobs/:id" element={<JobDetail />} />
          <Route path="/progress" element={<ProgressPage />} />
          {FEATURES.applications && (
            <>
              <Route path="/applications" element={<ApprovalQueuePage />} />
              <Route path="/applications/:id" element={<ApplicationDetail />} />
              <Route path="/audit/:applicationId" element={<AuditTrailPage />} />
            </>
          )}
          <Route path="/companies" element={<CompaniesPageRoute />} />
          <Route path="/leaderboard" element={<LeaderboardPageRoute />} />
          <Route path="/profile" element={<ProfilePageRoute />} />
          {FEATURES.candidateProfile && (
            <Route path="/profile/candidate" element={<CandidateProfilePage />} />
          )}
          <Route path="/resumes" element={<ResumesPage />} />
          <Route element={<AdminRoute />}>
            <Route path="/terminal" element={<TerminalPageRoute />} />
          </Route>
        </Route>
      </Route>

      <Route path="/" element={<Navigate to="/jobs" replace />} />
      <Route path="*" element={<Navigate to="/jobs" replace />} />
    </Routes>
  );
}
