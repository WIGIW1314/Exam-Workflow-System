<script setup lang="ts">
import { Bell, SwitchButton } from '@element-plus/icons-vue';
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { menuByRole } from '@/utils/menu';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const menuItems = computed(() => menuByRole[authStore.currentRole]);
const title = computed(() => (route.meta.title as string) ?? '试卷工作流系统');

async function handleRoleCommand(roleCode: string) {
  await authStore.switchRole(roleCode);
  const fallbackMap: Record<string, string> = {
    admin: '/admin/dashboard',
    director: '/director/dashboard',
    teacher: '/teacher/courses',
  };
  router.push(fallbackMap[roleCode]);
}
</script>

<template>
  <div class="shell">
    <aside class="shell-sidebar">
      <div class="brand-block">
        <div class="brand-kicker">Exam Workflow</div>
        <h1>试卷工作流系统</h1>
        <p>教务流程、审核闭环与试卷编号一体化。</p>
      </div>

      <el-menu
        :default-active="route.path"
        class="shell-menu"
        router
        background-color="transparent"
        text-color="#f5f2eb"
        active-text-color="#f4d9a6"
      >
        <el-menu-item v-for="item in menuItems" :key="item.path" :index="item.path">
          <el-icon><component :is="item.icon" /></el-icon>
          <span>{{ item.label }}</span>
        </el-menu-item>
      </el-menu>
    </aside>

    <div class="shell-main">
      <header class="shell-header">
        <div>
          <div class="page-kicker">{{ authStore.currentRole.toUpperCase() }}</div>
          <h2>{{ title }}</h2>
        </div>
        <div class="header-actions">
          <el-dropdown trigger="click">
            <span class="notify-trigger">
              <el-badge :value="authStore.unreadCount" :hidden="!authStore.unreadCount">
                <el-icon><Bell /></el-icon>
              </el-badge>
            </span>
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
            <span class="role-pill">
              当前角色：{{ authStore.currentRole }}
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item v-for="role in authStore.availableRoles" :key="role" :command="role">
                  {{ role }}
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>

          <div class="user-pill">
            <div>
              <strong>{{ authStore.user?.realName }}</strong>
              <span>{{ authStore.user?.username }}</span>
            </div>
            <el-button type="danger" plain :icon="SwitchButton" @click="authStore.logout(); router.push('/login')">
              退出
            </el-button>
          </div>
        </div>
      </header>

      <main class="shell-content">
        <router-view />
      </main>
    </div>
  </div>
</template>
