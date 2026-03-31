<script setup lang="ts">
import { Hide, Lock, User, View } from '@element-plus/icons-vue';
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { useAuthStore } from '@/stores/auth';

const authStore = useAuthStore();
const router = useRouter();

const form = reactive({
  username: localStorage.getItem('exam-workflow-remember-username') ?? 'admin',
  password: '123456',
  remember: localStorage.getItem('exam-workflow-remember') === '1',
});

const loading = ref(false);
const errorMessage = ref('');
const isError = ref(false);
const showPassword = ref(false);
const isFocusedOnPassword = ref(false);
const mouseX = ref(0);
const mouseY = ref(0);
const blinkOrange = ref(false);
const blinkPurple = ref(false);
const blinkBlack = ref(false);
const blinkYellow = ref(false);

let blinkTimers: number[] = [];

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function saveRememberState() {
  if (form.remember) {
    localStorage.setItem('exam-workflow-remember', '1');
    localStorage.setItem('exam-workflow-remember-username', form.username.trim());
  } else {
    localStorage.removeItem('exam-workflow-remember');
    localStorage.removeItem('exam-workflow-remember-username');
  }
}

async function handleLogin() {
  if (!form.username.trim() || !form.password.trim()) {
    errorMessage.value = '请输入账号和密码';
    isError.value = true;
    return;
  }

  loading.value = true;
  errorMessage.value = '';
  isError.value = false;

  try {
    await authStore.login({
      username: form.username.trim(),
      password: form.password,
    });
    saveRememberState();
    const targetMap: Record<string, string> = {
      admin: '/admin/dashboard',
      director: '/director/dashboard',
      teacher: '/teacher/courses',
    };
    await router.push(targetMap[authStore.currentRole]);
    ElMessage.success('登录成功');
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '登录失败，请检查账号或密码';
    isError.value = true;
    window.setTimeout(() => {
      isError.value = false;
    }, 3000);
  } finally {
    loading.value = false;
  }
}

function startBlink(target: { value: boolean }, initialDelay: number, intervalBase: number) {
  const startTimer = window.setTimeout(() => {
    const loop = () => {
      target.value = true;
      const closeTimer = window.setTimeout(() => {
        target.value = false;
      }, 120);
      blinkTimers.push(closeTimer);
      const nextTimer = window.setTimeout(loop, intervalBase + Math.random() * 1000);
      blinkTimers.push(nextTimer);
    };
    loop();
  }, initialDelay);
  blinkTimers.push(startTimer);
}

function resetBlinks() {
  blinkTimers.forEach((timer) => window.clearTimeout(timer));
  blinkTimers = [];
}

function handleMouseMove(event: MouseEvent) {
  if (isFocusedOnPassword.value) {
    return;
  }
  const width = window.innerWidth || 1;
  const height = window.innerHeight || 1;
  mouseX.value = clamp((event.clientX / width - 0.5) * 16, -8, 8);
  mouseY.value = clamp((event.clientY / height - 0.5) * 12, -6, 6);
}

function shapeStyle(kind: 'orange' | 'purple' | 'black' | 'yellow') {
  if (isFocusedOnPassword.value) {
    return {};
  }

  const shiftXMap = {
    orange: mouseX.value * 1.1,
    purple: mouseX.value * 0.9,
    black: mouseX.value * 0.7,
    yellow: mouseX.value * 0.8,
  };
  const shiftYMap = {
    orange: mouseY.value * 0.6,
    purple: mouseY.value * 0.5,
    black: mouseY.value * 0.45,
    yellow: mouseY.value * 0.5,
  };

  return {
    transform: `translate(${shiftXMap[kind]}px, ${shiftYMap[kind]}px)`,
  };
}

function bodyStyle(kind: 'orange' | 'purple' | 'black' | 'yellow') {
  const skew = `${-mouseX.value * 2.5}deg`;

  if (isFocusedOnPassword.value) {
    if (kind === 'orange') {
      return { transform: 'skewX(8deg)' };
    }
    if (kind === 'yellow') {
      return { transform: 'translateY(-2px)' };
    }
    return { transform: 'skewX(0deg)' };
  }

  return { transform: `skewX(${skew})` };
}

function faceStyle(kind: 'orange' | 'purple' | 'black' | 'yellow') {
  if (isFocusedOnPassword.value) {
    const passwordOffsets = {
      orange: { x: -22, y: 0 },
      purple: { x: -20, y: 0 },
      black: { x: 0, y: 0 },
      yellow: { x: -18, y: 0 },
    };
    const current = passwordOffsets[kind];
    return { transform: `translate(${current.x}px, ${current.y}px)` };
  }

  const offsetX = mouseX.value * 7;
  const offsetY = mouseY.value * 5.5;
  return { transform: `translate(${offsetX}px, ${offsetY}px)` };
}

function pupilStyle(mode: 'default' | 'peekRight' | 'left' | 'up', multiplier = 1, blinkRef = blinkOrange) {
  return computed(() => {
    if (isFocusedOnPassword.value) {
      const map = {
        default: { x: 0, y: 0 },
        peekRight: { x: 3.2, y: 0 },
        left: { x: -2.8, y: 0 },
        up: { x: 0, y: -3.2 },
      };
      const current = map[mode];
      return {
        transform: `translate(${current.x}px, ${current.y}px) scaleY(${blinkRef.value ? 0.1 : 1})`,
      };
    }

    return {
      transform: `translate(${mouseX.value * multiplier}px, ${mouseY.value * multiplier}px) scaleY(${blinkRef.value ? 0.1 : 1})`,
    };
  });
}

const orangePupilStyle = pupilStyle('default', 1.2, blinkOrange);
const purplePupilStyle = pupilStyle('peekRight', 1.15, blinkPurple);
const blackPupilStyle = pupilStyle('up', 1.1, blinkBlack);
const yellowPupilStyle = pupilStyle('left', 1.1, blinkYellow);

onMounted(() => {
  startBlink(blinkOrange, 0, 3000);
  startBlink(blinkPurple, 700, 3200);
  startBlink(blinkBlack, 1400, 2900);
  startBlink(blinkYellow, 2100, 3100);
  window.addEventListener('mousemove', handleMouseMove);
});

onBeforeUnmount(() => {
  window.removeEventListener('mousemove', handleMouseMove);
  resetBlinks();
});
</script>

<template>
  <div class="login-page2">
    <div class="login-page2__panel">
      <section class="login-page2__visual">
        <div class="shape-group">
          <div class="shape orange" :class="{ 'password-mode': isFocusedOnPassword, error: isError }" :style="shapeStyle('orange')">
            <div class="shape__body shape__body--orange" :style="bodyStyle('orange')">
              <div class="face orange-face" :style="faceStyle('orange')">
                <div class="eyes">
                  <span class="eye eye--solid" :style="orangePupilStyle"></span>
                  <span class="eye eye--solid" :style="orangePupilStyle"></span>
                </div>
                <div class="mouth" :class="{ 'mouth--sad': isError, 'mouth--flat': isFocusedOnPassword && !isError }"></div>
              </div>
            </div>
          </div>

          <div class="shape purple" :class="{ 'password-mode': isFocusedOnPassword, error: isError }" :style="shapeStyle('purple')">
            <div class="shape__body shape__body--purple" :style="bodyStyle('purple')">
              <div class="face purple-face" :style="faceStyle('purple')">
                <div class="eyes">
                  <span class="eye"><span class="pupil" :style="purplePupilStyle"></span></span>
                  <span class="eye"><span class="pupil" :style="purplePupilStyle"></span></span>
                </div>
                <div class="mouth mouth--light" :class="{ 'mouth--sad': isError, 'mouth--flat': isFocusedOnPassword && !isError }"></div>
              </div>
            </div>
          </div>

          <div class="shape black" :class="{ 'password-mode': isFocusedOnPassword }" :style="shapeStyle('black')">
            <div class="shape__body shape__body--black" :style="bodyStyle('black')">
              <div class="face black-face" :style="faceStyle('black')">
                <div class="eyes eyes--tight">
                  <span class="eye"><span class="pupil" :style="blackPupilStyle"></span></span>
                  <span class="eye"><span class="pupil" :style="blackPupilStyle"></span></span>
                </div>
                <div class="mouth mouth--light mouth--thin" v-if="isFocusedOnPassword && !isError"></div>
              </div>
            </div>
          </div>

          <div class="shape yellow" :class="{ 'password-mode': isFocusedOnPassword, error: isError }" :style="shapeStyle('yellow')">
            <div class="shape__body shape__body--yellow" :style="bodyStyle('yellow')">
              <div class="face yellow-face" :style="faceStyle('yellow')">
                <div class="eyes eyes--tight">
                  <span class="eye"><span class="pupil" :style="yellowPupilStyle"></span></span>
                  <span class="eye"><span class="pupil" :style="yellowPupilStyle"></span></span>
                </div>
                <div class="mouth mouth--short" :class="{ 'mouth--sad': isError }"></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="login-page2__form">
        <div class="login-page2__form-inner">
          <img class="login-brand-logo" src="/logo.svg" alt="试卷工作流系统 Logo" />

          <div class="login-copy">
            <h1>欢迎回来</h1>
            <p>请输入账号信息继续进入试卷工作流系统。</p>
          </div>

          <form class="login-form" @submit.prevent="handleLogin">
            <label class="login-form__field">
              <span>账号</span>
              <div class="login-form__control">
                <span class="login-form__field-icon" aria-hidden="true">
                  <el-icon><User /></el-icon>
                </span>
                <input
                  v-model="form.username"
                  type="text"
                  placeholder="请输入账号"
                  @focus="isFocusedOnPassword = false"
                  @input="errorMessage = ''; isError = false"
                />
              </div>
            </label>

            <label class="login-form__field">
              <span>密码</span>
              <div class="login-form__control login-form__password" :class="{ 'is-error': isError }">
                <span class="login-form__field-icon" aria-hidden="true">
                  <el-icon><Lock /></el-icon>
                </span>
                <input
                  v-model="form.password"
                  :type="showPassword ? 'text' : 'password'"
                  placeholder="请输入密码"
                  @focus="isFocusedOnPassword = true"
                  @blur="isFocusedOnPassword = false"
                  @input="errorMessage = ''; isError = false"
                />
                <button type="button" class="login-form__eye" @click="showPassword = !showPassword">
                  <el-icon>
                    <component :is="showPassword ? Hide : View" />
                  </el-icon>
                </button>
              </div>
            </label>

            <div class="login-form__row">
              <label class="remember-check">
                <input v-model="form.remember" type="checkbox" />
                <span>记住账号</span>
              </label>
            </div>

            <div v-if="errorMessage" class="login-form__error">{{ errorMessage }}</div>

            <button class="login-form__submit" type="submit" :disabled="loading">
              {{ loading ? '登录中...' : '登录' }}
            </button>
          </form>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
:global(body) {
  margin: 0;
}

.login-page2 {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  position: relative;
  background:
    radial-gradient(circle at 16% 18%, rgba(191, 227, 255, 0.42) 0, rgba(191, 227, 255, 0.16) 24%, transparent 48%),
    radial-gradient(circle at 84% 20%, rgba(255, 210, 226, 0.34) 0, rgba(255, 210, 226, 0.12) 22%, transparent 46%),
    radial-gradient(circle at 42% 90%, rgba(255, 236, 190, 0.28) 0, rgba(255, 236, 190, 0.1) 20%, transparent 42%),
    var(--bg-page);
}

.login-page2__panel {
  width: min(1200px, 100%);
  min-height: 78vh;
  display: flex;
  border-radius: 20px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.58);
  border: 1px solid rgba(255, 255, 255, 0.74);
  box-shadow: 0 24px 60px rgba(31, 41, 55, 0.1);
  backdrop-filter: blur(24px);
}

.login-page2__visual,
.login-page2__form {
  flex: 0 0 auto;
}

.login-page2__visual {
  width: 44%;
  position: relative;
  isolation: isolate;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  overflow: hidden;
  background: #f1f5f9;
  padding: 40px 24px 72px;
  border-right: 1px solid rgba(255, 255, 255, 0.52);
}

.login-page2__visual::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 0;
  background:
    linear-gradient(180deg, rgba(241, 245, 249, 0.18) 0%, rgba(241, 245, 249, 0.08) 100%),
    url('/login_bac.png') center center / cover no-repeat;
  opacity: 0.92;
  pointer-events: none;
}

.login-page2__form {
  width: 56%;
}

.shape-group {
  position: relative;
  z-index: 1;
  width: 320px;
  height: 320px;
  overflow: visible;
}

.shape {
  position: absolute;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  animation: dropIn 0.8s cubic-bezier(0.22, 1, 0.36, 1) both;
  transform-origin: center bottom;
  transition: filter 0.2s ease;
  will-change: transform;
}

.shape__body {
  position: relative;
  width: 100%;
  height: 100%;
  will-change: transform;
}

.shape__body--orange {
  border-radius: 180px 180px 0 0;
  background: #ff7b30;
}

.shape__body--purple {
  border-radius: 6px 6px 0 0;
  background: #6332f6;
}

.shape__body--black {
  border-radius: 6px 6px 0 0;
  background: #1a1a1a;
}

.shape__body--yellow {
  border-radius: 100px 100px 0 0;
  background: #eab308;
}

.orange {
  left: 0;
  bottom: 0;
  z-index: 4;
  width: 180px;
  height: 90px;
}

.purple {
  left: 40px;
  bottom: 0;
  z-index: 1;
  width: 110px;
  height: 250px;
  animation-delay: 0.1s;
}

.black {
  right: 64px;
  bottom: 0;
  z-index: 2;
  width: 64px;
  height: 170px;
  animation-delay: 0.2s;
}

.yellow {
  right: 0;
  bottom: 0;
  z-index: 4;
  width: 100px;
  height: 140px;
  animation-delay: 0.3s;
}

.face {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  will-change: transform;
}

.orange-face {
  top: 24px;
  left: 60px;
}

.purple-face {
  top: 28px;
  left: 34px;
}

.black-face {
  top: 32px;
  left: 16px;
}

.yellow-face {
  top: 34px;
  left: 26px;
}

.eyes {
  display: flex;
  gap: 18px;
  margin-bottom: 12px;
}

.eyes--tight {
  gap: 10px;
}

.eye {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #ffffff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.pupil {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #111111;
  will-change: transform;
}

.eye--solid {
  width: 10px;
  height: 10px;
  background: #111111;
}

.eye--solid::after {
  display: none;
}

.mouth {
  width: 22px;
  height: 10px;
  border-radius: 0 0 22px 22px;
  background: #111111;
  transition: transform 0.25s ease, border-radius 0.25s ease, background 0.25s ease;
}

.mouth--light {
  background: rgba(255, 255, 255, 0.82);
}

.mouth--thin {
  width: 18px;
  height: 2px;
  border-radius: 999px;
}

.mouth--short {
  width: 20px;
  height: 4px;
  border-radius: 999px;
}

.mouth--flat {
  height: 3px;
  border-radius: 999px;
}

.mouth--sad {
  background: transparent;
  border-top: 3px solid currentColor;
  border-radius: 18px 18px 0 0;
}

.orange.error,
.yellow.error {
  color: #111111;
}

.purple.error {
  color: rgba(255, 255, 255, 0.9);
}

.shape.password-mode,
.shape.error {
  transition: transform 0.18s ease, filter 0.18s ease;
}

.shape.password-mode .face,
.shape.error .face,
.shape.password-mode .pupil,
.shape.error .pupil {
  transition: transform 0.18s ease;
}

.login-page2__form {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48px 40px;
  background: rgba(255, 255, 255, 0.32);
}

.login-page2__form-inner {
  width: min(420px, 100%);
}

.login-brand-logo {
  display: block;
  width: clamp(80px, 12vw, 60px);
  max-width: 100%;
  height: auto;
  margin: 0 auto 28px;
  object-fit: contain;
}

.login-copy {
  text-align: center;
  margin-bottom: 36px;
}

.login-copy h1 {
  margin: 0 0 10px;
  font-size: 36px;
  font-weight: 700;
  color: #303133;
}

.login-copy p {
  margin: 0;
  color: #606266;
  font-size: 14px;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.login-form__field {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.login-form__field > span {
  font-weight: 600;
  color: #303133;
}

.login-form__control {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 34px;
  padding-bottom: 8px;
  border-bottom: 2px solid rgba(148, 163, 184, 0.24);
  transition: border-color 0.2s ease, color 0.2s ease;
}

.login-form__field-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  height: 20px;
  color: #94a3b8;
  font-size: 18px;
  line-height: 1;
}

.login-form__field-icon .el-icon {
  font-size: 18px;
}

.login-form__field input,
.login-form__password input {
  flex: 1 1 auto;
  min-width: 0;
  width: 100%;
  border: none;
  padding: 0;
  font-size: 16px;
  color: #303133;
  outline: none;
  background: transparent;
  transition: color 0.2s ease;
}

.login-form__control:focus-within {
  border-bottom-color: #409eff;
}

.login-form__control:focus-within .login-form__field-icon {
  color: #409eff;
}

.login-form__password {
  padding-right: 4px;
}

.login-form__password.is-error {
  border-bottom-color: #ef4444;
}

.login-form__password.is-error input,
.login-form__password.is-error .login-form__field-icon,
.login-form__password.is-error .login-form__eye {
  color: #dc2626;
}

.login-form__eye {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  height: 20px;
  border: none;
  background: transparent;
  color: #909399;
  cursor: pointer;
  padding: 0;
  font-size: 18px;
  line-height: 1;
}

.login-form__eye .el-icon {
  font-size: 18px;
}

.login-form__password .login-form__field-icon,
.login-form__password .login-form__eye {
  transform: translateY(1px);
}

.login-form__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: -8px;
}

.remember-check {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #606266;
  font-size: 14px;
}

.login-form__error {
  margin-top: -8px;
  color: #dc2626;
  font-size: 13px;
}

.login-form__submit {
  width: 100%;
  height: 56px;
  border-radius: 999px;
  font-size: 18px;
  cursor: pointer;
  transition: transform 0.2s ease, background 0.2s ease;
}

.login-form__submit {
  border: none;
  background: linear-gradient(180deg, #409eff 0%, #337ecc 100%);
  color: #ffffff;
  box-shadow: 0 12px 24px rgba(64, 158, 255, 0.22);
}

.login-form__submit:disabled {
  opacity: 0.7;
  cursor: wait;
}
.login-form__submit:hover {
  transform: translateY(-1px);
}

@keyframes dropIn {
  0% {
    opacity: 0;
    transform: translateY(-540px) scaleY(2) scaleX(0.5);
  }

  55% {
    opacity: 1;
    transform: translateY(0) scaleY(0.6) scaleX(1.35);
  }

  75% {
    transform: translateY(0) scaleY(1.15) scaleX(0.9);
  }

  100% {
    opacity: 1;
    transform: translateY(0) scaleY(1) scaleX(1);
  }
}

@media (max-width: 980px) {
  .login-page2__visual {
    display: none;
  }

  .login-page2__form {
    width: 100%;
    padding: 40px 24px;
  }
}
</style>
