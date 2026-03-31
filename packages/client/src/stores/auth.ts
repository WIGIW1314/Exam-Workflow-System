import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { io, type Socket } from 'socket.io-client';
import type { AuthProfile, NotificationSummary } from '@exam-workflow/shared';
import { apiGet, apiPost, apiPut } from '@/api';

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem('exam-workflow-token') ?? '');
  const profile = ref<AuthProfile | null>(null);
  const notifications = ref<NotificationSummary[]>([]);
  const socket = ref<Socket | null>(null);
  const loading = ref(false);

  const isLoggedIn = computed(() => Boolean(token.value));
  const currentRole = computed(() => profile.value?.currentRole ?? 'teacher');
  const user = computed(() => profile.value?.user ?? null);
  const availableRoles = computed(() => profile.value?.availableRoles ?? []);
  const unreadCount = computed(() => notifications.value.filter((item) => !item.isRead).length);

  function persistToken(nextToken: string) {
    token.value = nextToken;
    if (nextToken) {
      localStorage.setItem('exam-workflow-token', nextToken);
    } else {
      localStorage.removeItem('exam-workflow-token');
    }
  }

  function connectSocket() {
    if (!token.value) return;
    if (socket.value) {
      socket.value.disconnect();
    }
    const client = io('/', {
      autoConnect: true,
      auth: {
        token: token.value,
      },
    });
    client.on('notification:new', async () => {
      await fetchNotifications();
    });
    client.on('session:force-logout', () => {
      logout(true);
    });
    client.on('paper:status-changed', async () => {
      await fetchNotifications();
    });
    socket.value = client;
  }

  async function fetchNotifications() {
    if (!token.value) return;
    notifications.value = await apiGet<NotificationSummary[]>('/notifications');
  }

  async function bootstrap() {
    if (!token.value) return;
    loading.value = true;
    try {
      const data = await apiGet<Omit<AuthProfile, 'token'>>('/auth/profile');
      profile.value = {
        ...data,
        token: token.value,
      };
      await fetchNotifications();
      connectSocket();
    } catch {
      persistToken('');
      profile.value = null;
    } finally {
      loading.value = false;
    }
  }

  async function login(payload: { username: string; password: string }) {
    const data = await apiPost<AuthProfile>('/auth/login', payload);
    persistToken(data.token);
    profile.value = data;
    await fetchNotifications();
    connectSocket();
  }

  async function logout(isForced = false) {
    if (!isForced && token.value) {
      await apiPost('/auth/logout');
    }
    socket.value?.disconnect();
    socket.value = null;
    persistToken('');
    profile.value = null;
    notifications.value = [];
  }

  async function switchRole(roleCode: string) {
    const data = await apiPost<{ token: string; currentRole: string }>('/auth/switch-role', { roleCode });
    persistToken(data.token);
    if (profile.value) {
      profile.value = {
        ...profile.value,
        currentRole: data.currentRole as AuthProfile['currentRole'],
        token: data.token,
      };
    }
    connectSocket();
  }

  async function updatePassword(payload: { oldPassword: string; newPassword: string }) {
    await apiPut('/auth/password', payload);
  }

  async function markNotificationRead(notificationId: string) {
    await apiPut(`/notifications/${notificationId}/read`);
    await fetchNotifications();
  }

  return {
    token,
    profile,
    user,
    notifications,
    unreadCount,
    isLoggedIn,
    currentRole,
    availableRoles,
    loading,
    bootstrap,
    login,
    logout,
    switchRole,
    fetchNotifications,
    updatePassword,
    markNotificationRead,
  };
});
