import { Toaster } from "@/components/ui/toaster"
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter as Router, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import ScrollToTop from './components/ScrollToTop';
import ProtectedRoute from './components/ProtectedRoute';
import { AuthProvider } from '@/lib/AuthContext';
import Home from '@/views/Home';
import EpisodeDetail from '@/views/EpisodeDetail';
import Archive from '@/views/Archive';
import Admin from '@/views/Admin';
import Landing from '@/views/Landing';
import Login from '@/views/Login';
import SignalEditor from '@/views/SignalEditor';
import SignalDetail from '@/views/SignalDetail';
import SignalItem from '@/views/SignalItem';

const queryClient = new QueryClient();

function LegacyEpisodeRedirect() {
  const { id } = useParams();
  return <Navigate to={`/nci-signal/episode/${id}`} replace />
}

function LoginRedirect() {
  const location = useLocation();
  return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router>
          <ScrollToTop />
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route element={<ProtectedRoute unauthenticatedElement={<LoginRedirect />} />}>
              <Route path="/signals/new" element={<SignalEditor />} />
              <Route path="/signals/:slug/edit" element={<SignalEditor />} />
            </Route>
            <Route path="/signals/:slug" element={<SignalDetail />} />
            <Route path="/signals/:slug/items/:itemId" element={<SignalItem />} />

            <Route path="/nci-signal" element={<Home />} />
            <Route path="/nci-signal/archive" element={<Archive />} />
            <Route path="/nci-signal/episode/:id" element={<EpisodeDetail />} />
            <Route path="/archive" element={<Navigate to="/nci-signal/archive" replace />} />
            <Route path="/episode/:id" element={<LegacyEpisodeRedirect />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="*" element={<PageNotFound />} />
          </Routes>
        </Router>
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  )
}

export default App
