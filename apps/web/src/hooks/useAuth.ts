// apps/web/src/hooks/useAuth.ts
import { useAuthStore } from '../store/authStore';

export const useAuth = () => {
  const { user, isLoading, login, register, logout, updateProfile } = useAuthStore();

  return {
    user,
    isLoading,
    login,
    register,
    logout,
    updateProfile,
  };
};
