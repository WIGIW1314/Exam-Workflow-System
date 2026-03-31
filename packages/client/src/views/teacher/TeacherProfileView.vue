<script setup lang="ts">
import { reactive } from 'vue';
import { ElMessage } from 'element-plus';
import PageCard from '@/components/common/PageCard.vue';
import { useAuthStore } from '@/stores/auth';

const authStore = useAuthStore();
const passwordForm = reactive({
  oldPassword: '',
  newPassword: '',
});

async function submitPassword() {
  await authStore.updatePassword(passwordForm);
  passwordForm.oldPassword = '';
  passwordForm.newPassword = '';
  ElMessage.success('密码修改成功');
}
</script>

<template>
  <div class="split-grid">
    <PageCard title="个人信息" eyebrow="Profile">
      <el-descriptions :column="1" border>
        <el-descriptions-item label="姓名">{{ authStore.user?.realName }}</el-descriptions-item>
        <el-descriptions-item label="用户名">{{ authStore.user?.username }}</el-descriptions-item>
        <el-descriptions-item label="邮箱">{{ authStore.user?.email || '未填写' }}</el-descriptions-item>
        <el-descriptions-item label="教研室">{{ authStore.user?.departmentName || '未分配' }}</el-descriptions-item>
      </el-descriptions>
    </PageCard>

    <PageCard title="修改密码" eyebrow="Security">
      <el-form label-position="top">
        <el-form-item label="原密码"><el-input v-model="passwordForm.oldPassword" type="password" show-password /></el-form-item>
        <el-form-item label="新密码"><el-input v-model="passwordForm.newPassword" type="password" show-password /></el-form-item>
        <el-button type="primary" @click="submitPassword">保存新密码</el-button>
      </el-form>
    </PageCard>
  </div>
</template>
