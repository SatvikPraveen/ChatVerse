// apps/web/src/App.tsx
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import MainLayout from './app/layouts/MainLayout';
import AuthLayout from './app/layouts/AuthLayout';
import ChatRoute from './app/routes/ChatRoute';
import LoginRoute from './app/routes/LoginRoute';
import RegisterRoute from './app/routes/RegisterRoute';
import SettingsRoute from './app/routes/SettingsRoute';
import { Toaster } from './components/common/Toaster';

function App() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <>
      <Routes>
        {user ? (
          <Route path="/" element={<MainLayout />}>
            <Route index element={<Navigate to="/chat" replace />} />
            <Route path="chat/*" element={<ChatRoute />} />
            <Route path="settings" element={<SettingsRoute />} />
            <Route path="*" element={<Navigate to="/chat" replace />} />
          </Route>
        ) : (
          <Route path="/" element={<AuthLayout />}>
            <Route index element={<Navigate to="/login" replace />} />
            <Route path="login" element={<LoginRoute />} />
            <Route path="register" element={<RegisterRoute />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Route>
        )}
      </Routes>
      <Toaster />
    </>
  );
}

export default App;
