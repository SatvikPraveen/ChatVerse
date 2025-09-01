// apps/web/src/store/authStore.ts
import { create } from 'zustand';
import { apiClient } from '../services/apiClient';
import type { User } from '@chatverse/types';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (data: Partial<User>) => Promise<void>;
  initializeAuth: () => Promise<void>;
  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isLoading: true,
  token: localStorage.getItem('token'),

  login: async (email: string, password: string) => {
    try {
      set({ isLoading: true });
      const response = await apiClient.post('/auth/login', { email, password });
      const { user, token } = response.data;

      localStorage.setItem('token', token);
      apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;

      set({ user, token, isLoading: false });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  register: async (name: string, email: string, password: string) => {
    try {
      set({ isLoading: true });
      const response = await apiClient.post('/auth/register', { name, email, password });
      const { user, token } = response.data;

      localStorage.setItem('token', token);
      apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;

      set({ user, token, isLoading: false });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  logout: async () => {
    try {
      await apiClient.post('/auth/logout');
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      localStorage.removeItem('token');
      delete apiClient.defaults.headers.common['Authorization'];
      set({ user: null, token: null });
    }
  },

  updateProfile: async (data: Partial<User>) => {
    const { user } = get();
    if (!user) return;

    try {
      const response = await apiClient.patch('/users/profile', data);
      const updatedUser = response.data;
      set({ user: updatedUser });
    } catch (error) {
      throw error;
    }
  },

  initializeAuth: async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      set({ isLoading: false });
      return;
    }

    try {
      apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      const response = await apiClient.get('/auth/me');
      set({ user: response.data, token, isLoading: false });
    } catch (error) {
      localStorage.removeItem('token');
      delete apiClient.defaults.headers.common['Authorization'];
      set({ user: null, token: null, isLoading: false });
    }
  },

  setUser: (user: User | null) => set({ user }),
  setLoading: (loading: boolean) => set({ isLoading: loading }),
}));
