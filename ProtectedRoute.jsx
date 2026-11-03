import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
export default function ProtectedRoute({ moderator = false }) {
  const { user, loading } = useAuth(); const location = useLocation();
  if (loading) return <main className="page-state">Checking your session…</main>;
  if (!user) return <Navigate to={`/login?returnTo=${encodeURIComponent(`${location.pathname}${location.search}`)}`} replace />;
  if (moderator && user.role !== 'moderator') return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
