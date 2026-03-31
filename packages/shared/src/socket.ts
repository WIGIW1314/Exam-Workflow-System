import type { DashboardStats } from './models.js';

export interface OnlineUser {
  userId: string;
  realName: string;
  roleCode: string;
  departmentId?: string | null;
  departmentName?: string | null;
  connectedAt: string;
}

export interface PaperStatusEvent {
  paperId: string;
  status: string;
  courseName: string;
  teacherName: string;
  message: string;
}

export interface NotificationEvent {
  notificationId: string;
  title: string;
  content: string;
  type: string;
}

export interface ServerToClientEvents {
  'online:update': (payload: { onlineUsers: OnlineUser[]; count: number }) => void;
  'paper:status-changed': (payload: PaperStatusEvent) => void;
  'paper:new-submission': (payload: PaperStatusEvent) => void;
  'stats:update': (payload: DashboardStats) => void;
  'notification:new': (payload: NotificationEvent) => void;
  'session:force-logout': (payload: { reason: string }) => void;
}

export interface ClientToServerEvents {
  'role:switch': (roleCode: string, callback: (result: { ok: boolean; message: string }) => void) => void;
  heartbeat: (callback: () => void) => void;
  'room:join': (departmentId: string) => void;
}
