import type {
  AuthResponse,
  Conversation,
  ConversationsResponse,
  CreateConversationBody,
  LoginBody,
  Message,
  MessagesQuery,
  MessagesResponse,
  OneTimePreKey,
  Page,
  PreKeyBundle,
  PreKeyBundleUpload,
  PreKeyCountResponse,
  Presence,
  PresignUploadBody,
  PresignUploadResponse,
  PublicUser,
  PushSubscriptionInput,
  RegisterBody,
  UpdateConversationBody,
  UpdateMeInput,
  UserProfile,
} from '@chatverse/protocol';
import type { ApiClient } from './api';

/** Every REST route of the ChatVerse API as a typed function. Keeps URL strings in one file. */
export function createEndpoints(api: ApiClient) {
  return {
    auth: {
      register: (body: RegisterBody) =>
        api.post<AuthResponse>('/auth/register', body, { anonymous: true }),
      login: (body: LoginBody) => api.post<AuthResponse>('/auth/login', body, { anonymous: true }),
      refresh: (refreshToken: string) =>
        api.post<AuthResponse>('/auth/refresh', { refreshToken }, { anonymous: true }),
      logout: (refreshToken: string) => api.post<null>('/auth/logout', { refreshToken }),
    },
    users: {
      me: () => api.get<UserProfile>('/users/me'),
      updateMe: (body: UpdateMeInput) => api.patch<UserProfile>('/users/me', body),
      search: (q: string, limit = 20) =>
        api.get<PublicUser[]>('/users/search', { query: { q, limit } }),
      get: (id: string) => api.get<PublicUser>(`/users/${id}`),
      presence: (ids: string[]) =>
        api.get<Presence[]>('/users/presence', { query: { ids: ids.join(',') } }),
    },
    conversations: {
      list: (cursor?: string | null, limit = 50) =>
        api.get<ConversationsResponse>('/conversations', {
          query: { cursor: cursor ?? undefined, limit },
        }),
      create: (body: CreateConversationBody) => api.post<Conversation>('/conversations', body),
      get: (id: string) => api.get<Conversation>(`/conversations/${id}`),
      update: (id: string, body: UpdateConversationBody) =>
        api.patch<Conversation>(`/conversations/${id}`, body),
      addParticipants: (id: string, userIds: string[]) =>
        api.post<Conversation>(`/conversations/${id}/participants`, { userIds }),
      removeParticipant: (id: string, userId: string) =>
        api.delete<Conversation>(`/conversations/${id}/participants/${userId}`),
      leave: (id: string) => api.post<null>(`/conversations/${id}/leave`),
      messages: (id: string, query: MessagesQuery) =>
        api.get<MessagesResponse>(`/conversations/${id}/messages`, { query: { ...query } }),
    },
    messages: {
      search: (q: string, conversationId?: string) =>
        api.get<Page<Message>>('/messages/search', { query: { q, conversationId } }),
    },
    keys: {
      uploadBundle: (bundle: PreKeyBundleUpload) => api.put<null>('/keys/bundle', bundle),
      uploadOneTime: (deviceId: string, oneTimePreKeys: OneTimePreKey[]) =>
        api.post<null>('/keys/one-time', { deviceId, oneTimePreKeys }),
      bundleFor: (userId: string) => api.get<PreKeyBundle>(`/keys/bundle/${userId}`),
      count: (deviceId: string) =>
        api.get<PreKeyCountResponse>('/keys/count', { query: { deviceId } }),
    },
    uploads: {
      presign: (body: PresignUploadBody) =>
        api.post<PresignUploadResponse>('/uploads/presign', body),
      complete: (attachmentId: string) => api.post<null>(`/uploads/${attachmentId}/complete`),
    },
    push: {
      subscribe: (body: PushSubscriptionInput) => api.post<null>('/push/subscriptions', body),
      unsubscribe: (endpoint: string) => api.delete<null>('/push/subscriptions', { endpoint }),
    },
  };
}

export type Endpoints = ReturnType<typeof createEndpoints>;
