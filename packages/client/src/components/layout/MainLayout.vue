<script setup lang="ts">
import { ArrowDown, ArrowLeft, ArrowRight, Bell, SwitchButton, User, UserFilled } from '@element-plus/icons-vue';
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { menuByRole } from '@/utils/menu';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const roleLabelMap: Record<string, string> = {
  admin: '管理员',
  director: '教研室主任',
  teacher: '任课教师',
};
const isCollapse = ref(localStorage.getItem('exam-workflow-sidebar-collapse') === '1');

const menuItems = computed(() => menuByRole[authStore.currentRole]);
const title = computed(() => (route.meta.title as string) ?? '试卷工作流系统');
const currentRoleLabel = computed(() => roleLabelMap[authStore.currentRole] ?? authStore.currentRole);
const greetingText = computed(() => {
  if (authStore.currentRole === 'admin') {
    return '欢迎您，管理员';
  }
  const name = authStore.user?.realName || authStore.user?.username || '用户';
  return `欢迎您，${name}`;
});
const profilePath = computed(() => {
  const profileMap: Record<string, string> = {
    admin: '/admin/profile',
    director: '/director/profile',
    teacher: '/teacher/profile',
  };
  return profileMap[authStore.currentRole] ?? '/login';
});

function toggleSidebar() {
  isCollapse.value = !isCollapse.value;
  localStorage.setItem('exam-workflow-sidebar-collapse', isCollapse.value ? '1' : '0');
}

async function handleRoleCommand(roleCode: string) {
  await authStore.switchRole(roleCode);
  const fallbackMap: Record<string, string> = {
    admin: '/admin/dashboard',
    director: '/director/dashboard',
    teacher: '/teacher/courses',
  };
  router.push(fallbackMap[roleCode]);
}

async function handleUserCommand(command: 'profile' | 'logout') {
  if (command === 'profile') {
    await router.push(profilePath.value);
    return;
  }
  await authStore.logout();
  await router.push('/login');
}
</script>

<template>
  <div class="shell" :class="{ 'shell--collapsed': isCollapse }">
    <aside class="shell-sidebar">
      <div class="brand-block" :class="{ 'brand-block--collapsed': isCollapse }">
        <img class="brand-mark brand-mark--image" src="/logo.svg" alt="试卷工作流系统 Logo" />
        <div class="brand-copy" :class="{ 'brand-copy--hidden': isCollapse }">
          <h1>试卷系统</h1>
        </div>
      </div>

      <el-menu
        :default-active="route.path"
        :collapse="isCollapse"
        :collapse-transition="false"
        class="shell-menu"
        router
        background-color="transparent"
        text-color="#303133"
        active-text-color="#409eff"
      >
        <el-menu-item v-for="item in menuItems" :key="item.path" :index="item.path">
          <el-tooltip :disabled="!isCollapse" :content="item.label" placement="right" :show-after="120">
            <div class="shell-menu-item__inner">
              <el-icon><component :is="item.icon" /></el-icon>
              <span>{{ item.label }}</span>
            </div>
          </el-tooltip>
        </el-menu-item>
      </el-menu>
    </aside>

    <button class="sidebar-toggle-handle" type="button" @click="toggleSidebar" :aria-label="isCollapse ? '展开侧边栏' : '收起侧边栏'">
      <el-icon><component :is="isCollapse ? ArrowRight : ArrowLeft" /></el-icon>
    </button>

    <header class="shell-header">
      <div class="shell-header__left">
        <div class="header-title-wrap">
          <h2>{{ title }}</h2>
          <span class="header-role">{{ currentRoleLabel }}</span>
        </div>
      </div>
      <div class="header-actions">
        <el-dropdown trigger="click">
          <el-badge :value="authStore.unreadCount" :hidden="!authStore.unreadCount">
            <el-button class="header-icon-btn" circle>
              <el-icon><Bell /></el-icon>
            </el-button>
          </el-badge>
          <template #dropdown>
            <el-dropdown-menu class="notify-menu">
              <el-dropdown-item
                v-for="item in authStore.notifications.slice(0, 8)"
                :key="item.id"
                @click="authStore.markNotificationRead(item.id)"
              >
                <div class="notify-item">
                  <strong>{{ item.title }}</strong>
                  <span>{{ item.content }}</span>
                </div>
              </el-dropdown-item>
              <el-dropdown-item v-if="!authStore.notifications.length" disabled>
                暂无通知
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>

        <el-dropdown @command="handleRoleCommand">
          <button class="header-role-btn" type="button">
            <span class="header-role-btn__label">当前角色</span>
            <strong>{{ currentRoleLabel }}</strong>
            <el-icon><ArrowDown /></el-icon>
          </button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item v-for="role in authStore.availableRoles" :key="role" :command="role">
                {{ roleLabelMap[role] ?? role }}
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>

        <span class="header-greeting">{{ greetingText }}</span>

        <el-dropdown trigger="click" @command="handleUserCommand" placement="bottom-end">
          <button class="header-user-trigger" type="button">
            <div class="header-user__avatar">
              <el-icon><UserFilled /></el-icon>
            </div>
          </button>
          <template #dropdown>
            <el-dropdown-menu class="user-dropdown-menu">
              <el-dropdown-item command="profile">
                <el-icon><User /></el-icon>
                个人中心
              </el-dropdown-item>
              <el-dropdown-item divided command="logout">
                <el-icon><SwitchButton /></el-icon>
                退出登录
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </header>

    <div class="shell-main">
      <main class="shell-content">
        <router-view />
      </main>
    </div>
  </div>
</template>
