<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { useAuthStore } from '@/stores/auth';

const authStore = useAuthStore();
const router = useRouter();
const form = ref({
  username: 'admin',
  password: '123456',
});
const loading = ref(false);

async function handleLogin() {
  loading.value = true;
  try {
    await authStore.login(form.value);
    const targetMap: Record<string, string> = {
      admin: '/admin/dashboard',
      director: '/director/dashboard',
      teacher: '/teacher/courses',
    };
    router.push(targetMap[authStore.currentRole]);
    ElMessage.success('登录成功');
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="login-page">
    <div class="login-shell">
      <section class="login-panel login-showcase">
        <span class="login-badge">Workflow Driven</span>
        <h1>试卷从提交、审核到编号归档，不再断档。</h1>
        <p>
          这套系统把课程清单、教师出卷、主任审核、编号注入、实时提醒和审计留痕放进一条可追踪流程里。
        </p>
        <div class="metric-grid">
          <div class="metric-card">
            <span>流程节点</span>
            <strong>5</strong>
            <small>出题 / 提交 / 审核 / 编号 / 归档</small>
          </div>
          <div class="metric-card">
            <span>角色协同</span>
            <strong>3</strong>
            <small>管理员、主任、教师</small>
          </div>
        </div>
      </section>

      <section class="login-panel">
        <div class="page-kicker">Secure Entrance</div>
        <h1>登录系统</h1>
        <p>默认种子账号：`admin` / `director` / `teacher`，密码均为 `123456`。</p>
        <el-form label-position="top" @submit.prevent="handleLogin">
          <el-form-item label="用户名">
            <el-input v-model="form.username" size="large" placeholder="请输入用户名" />
          </el-form-item>
          <el-form-item label="密码">
            <el-input v-model="form.password" type="password" size="large" show-password placeholder="请输入密码" />
          </el-form-item>
          <el-button type="primary" size="large" :loading="loading" style="width: 100%" @click="handleLogin">
            进入工作台
          </el-button>
        </el-form>
      </section>
    </div>
  </div>
</template>
