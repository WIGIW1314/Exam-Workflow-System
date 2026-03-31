<template>
  <section class="page-card" :class="{ 'page-card--fill': fill }">
    <div class="page-card__header" v-if="($slots.header || title) && showTitle || $slots.actions">
      <div v-if="showTitle && ($slots.header || title)">
        <div class="page-card__eyebrow" v-if="eyebrow">{{ eyebrow }}</div>
        <h3>{{ title }}</h3>
      </div>
      <div class="page-card__actions" v-if="$slots.actions">
        <slot name="actions" />
      </div>
    </div>
    <div class="page-card__body">
      <slot />
    </div>
  </section>
</template>

<script setup lang="ts">
defineProps<{
  title?: string;
  eyebrow?: string;
  showTitle?: boolean;
  fill?: boolean;
}>();
</script>
