<script setup lang="ts">
import { computed } from 'vue';
import { CirclePlus, Delete } from '@element-plus/icons-vue';
import type { DocxTemplateDefinition, TemplateFieldDefinition, TemplateSectionDefinition } from '@exam-workflow/shared';
import { buildRepeaterRow, getTemplateField } from '@/utils/template-workflow';

const props = withDefaults(
  defineProps<{
    template: DocxTemplateDefinition | null;
    modelValue: Record<string, unknown>;
    role: 'teacher' | 'director' | 'academic_dean';
    signatures?: string[];
    compact?: boolean;
  }>(),
  {
    signatures: () => [],
    compact: false,
  },
);

const rationalityExamRows = [
  { fieldId: 'directorExamOutlineMatch', label: '考核内容符合课程教学大纲要求' },
  { fieldId: 'directorExamGoalSupport', label: '考核内容支撑课程目标达成情况' },
  { fieldId: 'directorExamDifficulty', label: '题量、命题难度' },
  { fieldId: 'directorExamType', label: '题型' },
  { fieldId: 'directorExamClarity', label: '试卷文字、公式、图表等清晰准确' },
  { fieldId: 'directorExamAnswer', label: '参考答案和评分标准细则' },
  { fieldId: 'directorExamABMatch', label: 'A/B 试卷重复率、难度' },
];

const rationalityOtherRows = [
  { fieldId: 'directorOtherOutlineMatch', label: '考核内容符合课程教学大纲要求' },
  { fieldId: 'directorOtherContentSupport', label: '考核内容支撑课程目标达成情况' },
  { fieldId: 'directorOtherMethodSupport', label: '考核方式支撑课程目标达成情况' },
];

const visibleSections = computed(() =>
  (props.template?.sections ?? []).filter((section) =>
    section.fields.some((field) => field.owner === 'system' || field.owner === props.role),
  ),
);

function isFieldVisible(field: TemplateFieldDefinition) {
  return field.owner === 'system' || field.owner === props.role;
}

function isFieldReadOnly(field: TemplateFieldDefinition) {
  return field.owner === 'system';
}

function visibleFields(section: TemplateSectionDefinition) {
  return section.fields.filter(isFieldVisible);
}

function fieldValue(fieldId: string) {
  return props.modelValue[fieldId];
}

function setFieldValue(fieldId: string, value: unknown) {
  props.modelValue[fieldId] = value;
}

function getFieldOptions(fieldId: string) {
  return getTemplateField(props.template, fieldId)?.options ?? [];
}

function repeaterRows(fieldId: string) {
  const value = props.modelValue[fieldId];
  return Array.isArray(value) ? (value as Array<Record<string, unknown>>) : [];
}

function addRepeaterItem(field: TemplateFieldDefinition) {
  const rows = repeaterRows(field.id);
  if (field.maxRows && rows.length >= field.maxRows) {
    return;
  }
  rows.push(buildRepeaterRow(field.fields ?? []));
}

function removeRepeaterItem(field: TemplateFieldDefinition, index: number) {
  const rows = repeaterRows(field.id);
  const minRows = Math.max(field.minRows ?? 1, 1);
  if (rows.length <= minRows) {
    return;
  }
  rows.splice(index, 1);
}

function renderFieldLabel(field: TemplateFieldDefinition) {
  return `${field.label}${field.required ? ' *' : ''}`;
}

function isRationalityReviewSection(section: TemplateSectionDefinition) {
  return props.template?.id === 'rationality-review' && section.id === 'review';
}
</script>

<template>
  <div class="workflow-template-form" :class="{ 'workflow-template-form--compact': compact }">
    <el-form label-position="top">
      <section v-for="section in visibleSections" :key="section.id" class="workflow-template-section">
        <div class="workflow-template-section__head">
          <div>
            <div class="page-kicker">模板分区</div>
            <h4>{{ section.title }}</h4>
          </div>
          <p v-if="section.description">{{ section.description }}</p>
        </div>

        <div v-if="isRationalityReviewSection(section)" class="workflow-template-rationality">
          <div v-if="role === 'director'" class="workflow-template-rationality__block">
            <div class="workflow-template-rationality__title">结课考试考核内容与课程目标对应分析</div>
            <table class="workflow-template-rationality__matrix">
              <tbody>
                <tr v-for="row in rationalityExamRows" :key="row.fieldId">
                  <th>{{ row.label }}</th>
                  <td v-for="option in getFieldOptions(row.fieldId)" :key="`${row.fieldId}-${option.value}`">
                    <button
                      type="button"
                      class="workflow-template-rationality__choice"
                      :class="{ 'is-active': fieldValue(row.fieldId) === option.value }"
                      @click="setFieldValue(row.fieldId, option.value)"
                    >
                      <span>{{ option.label }}</span>
                      <span class="workflow-template-rationality__box">{{ fieldValue(row.fieldId) === option.value ? '√' : '' }}</span>
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div v-if="role === 'director'" class="workflow-template-rationality__block">
            <div class="workflow-template-rationality__title">其他考核方式、考核内容与课程目标对应分析</div>
            <table class="workflow-template-rationality__matrix">
              <tbody>
                <tr v-for="row in rationalityOtherRows" :key="row.fieldId">
                  <th>{{ row.label }}</th>
                  <td v-for="option in getFieldOptions(row.fieldId)" :key="`${row.fieldId}-${option.value}`">
                    <button
                      type="button"
                      class="workflow-template-rationality__choice"
                      :class="{ 'is-active': fieldValue(row.fieldId) === option.value }"
                      @click="setFieldValue(row.fieldId, option.value)"
                    >
                      <span>{{ option.label }}</span>
                      <span class="workflow-template-rationality__box">{{ fieldValue(row.fieldId) === option.value ? '√' : '' }}</span>
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="workflow-template-grid">
            <template v-for="field in visibleFields(section).filter((item) => ![...rationalityExamRows, ...rationalityOtherRows].some((row) => row.fieldId === item.id))" :key="field.id">
              <el-form-item :label="renderFieldLabel(field)" class="workflow-template-item" :class="{ 'workflow-template-item--full': field.type === 'textarea' }">
                <el-input
                  v-if="field.type === 'text' || field.type === 'number'"
                  :model-value="fieldValue(field.id) as any"
                  :disabled="isFieldReadOnly(field)"
                  :placeholder="field.placeholder || `请输入${field.label}`"
                  @update:model-value="setFieldValue(field.id, $event)"
                />
                <el-input
                  v-else-if="field.type === 'textarea'"
                  :model-value="fieldValue(field.id) as any"
                  type="textarea"
                  :rows="compact ? 3 : 4"
                  :disabled="isFieldReadOnly(field)"
                  :placeholder="field.placeholder || `请输入${field.label}`"
                  @update:model-value="setFieldValue(field.id, $event)"
                />
                <el-date-picker
                  v-else-if="field.type === 'date'"
                  :model-value="fieldValue(field.id) as any"
                  type="date"
                  format="YYYY-MM-DD"
                  value-format="YYYY-MM-DD"
                  :disabled="isFieldReadOnly(field)"
                  placeholder="选择日期"
                  style="width: 100%"
                  @update:model-value="setFieldValue(field.id, $event)"
                />
                <el-radio-group
                  v-else-if="field.type === 'radio'"
                  :model-value="fieldValue(field.id) as any"
                  class="workflow-template-option-group"
                  :disabled="isFieldReadOnly(field)"
                  @update:model-value="setFieldValue(field.id, $event)"
                >
                  <el-radio v-for="option in field.options ?? []" :key="option.value" :label="option.value">{{ option.label }}</el-radio>
                </el-radio-group>
                <el-select
                  v-else-if="field.type === 'signature'"
                  :model-value="fieldValue(field.id) as any"
                  clearable
                  filterable
                  :disabled="isFieldReadOnly(field)"
                  placeholder="选择签名人"
                  style="width: 100%"
                  @update:model-value="setFieldValue(field.id, $event)"
                >
                  <el-option v-for="signature in signatures" :key="signature" :label="signature" :value="signature" />
                </el-select>
              </el-form-item>
            </template>
          </div>
        </div>

        <div v-else class="workflow-template-grid">
          <template v-for="field in visibleFields(section)" :key="field.id">
            <div v-if="field.type === 'repeater'" class="workflow-template-repeater">
              <div class="workflow-template-repeater__head">
                <div>
                  <strong>{{ field.label }}</strong>
                  <p v-if="field.helpText">{{ field.helpText }}</p>
                </div>
                <el-button v-if="!isFieldReadOnly(field)" type="primary" plain :icon="CirclePlus" @click="addRepeaterItem(field)">
                  {{ field.addLabel || '新增一项' }}
                </el-button>
              </div>
              <div class="workflow-template-repeater__list">
                <div v-for="(item, itemIndex) in repeaterRows(field.id)" :key="`${field.id}-${itemIndex}`" class="workflow-template-repeater__item">
                  <div class="workflow-template-repeater__item-head">
                    <strong>{{ field.label }} {{ itemIndex + 1 }}</strong>
                    <el-button v-if="!isFieldReadOnly(field)" link type="danger" :icon="Delete" @click="removeRepeaterItem(field, itemIndex)">删除</el-button>
                  </div>
                  <div class="workflow-template-grid">
                    <el-form-item
                      v-for="childField in field.fields ?? []"
                      :key="`${field.id}-${itemIndex}-${childField.id}`"
                      :label="renderFieldLabel(childField)"
                      class="workflow-template-item"
                      :class="{ 'workflow-template-item--full': childField.type === 'textarea' }"
                    >
                      <el-input
                        v-if="childField.type === 'text' || childField.type === 'number'"
                        :model-value="item[childField.id] as any"
                        :disabled="isFieldReadOnly(field)"
                        :placeholder="childField.placeholder || `请输入${childField.label}`"
                        @update:model-value="item[childField.id] = $event"
                      />
                      <el-input
                        v-else-if="childField.type === 'textarea'"
                        :model-value="item[childField.id] as any"
                        type="textarea"
                        :rows="compact ? 3 : 4"
                        :disabled="isFieldReadOnly(field)"
                        :placeholder="childField.placeholder || `请输入${childField.label}`"
                        @update:model-value="item[childField.id] = $event"
                      />
                      <el-date-picker
                        v-else-if="childField.type === 'date'"
                        :model-value="item[childField.id] as any"
                        type="date"
                        format="YYYY-MM-DD"
                        value-format="YYYY-MM-DD"
                        :disabled="isFieldReadOnly(field)"
                        placeholder="选择日期"
                        style="width: 100%"
                        @update:model-value="item[childField.id] = $event"
                      />
                    </el-form-item>
                  </div>
                </div>
              </div>
            </div>

            <el-form-item v-else :label="renderFieldLabel(field)" class="workflow-template-item" :class="{ 'workflow-template-item--full': field.type === 'textarea' }">
              <el-input
                v-if="field.type === 'text' || field.type === 'number'"
                :model-value="fieldValue(field.id) as any"
                :disabled="isFieldReadOnly(field)"
                :placeholder="field.placeholder || `请输入${field.label}`"
                @update:model-value="setFieldValue(field.id, $event)"
              />
              <el-input
                v-else-if="field.type === 'textarea'"
                :model-value="fieldValue(field.id) as any"
                type="textarea"
                :rows="compact ? 3 : 4"
                :disabled="isFieldReadOnly(field)"
                :placeholder="field.placeholder || `请输入${field.label}`"
                @update:model-value="setFieldValue(field.id, $event)"
              />
              <el-date-picker
                v-else-if="field.type === 'date'"
                :model-value="fieldValue(field.id) as any"
                type="date"
                format="YYYY-MM-DD"
                value-format="YYYY-MM-DD"
                :disabled="isFieldReadOnly(field)"
                placeholder="选择日期"
                style="width: 100%"
                @update:model-value="setFieldValue(field.id, $event)"
              />
              <el-radio-group
                v-else-if="field.type === 'radio'"
                :model-value="fieldValue(field.id) as any"
                class="workflow-template-option-group"
                :disabled="isFieldReadOnly(field)"
                @update:model-value="setFieldValue(field.id, $event)"
              >
                <el-radio v-for="option in field.options ?? []" :key="option.value" :label="option.value">{{ option.label }}</el-radio>
              </el-radio-group>
              <el-checkbox-group
                v-else-if="field.type === 'checkboxGroup'"
                :model-value="fieldValue(field.id) as any"
                class="workflow-template-option-group"
                :disabled="isFieldReadOnly(field)"
                @update:model-value="setFieldValue(field.id, $event)"
              >
                <el-checkbox v-for="option in field.options ?? []" :key="option.value" :label="option.value">{{ option.label }}</el-checkbox>
              </el-checkbox-group>
              <el-select
                v-else-if="field.type === 'signature'"
                :model-value="fieldValue(field.id) as any"
                clearable
                filterable
                :disabled="isFieldReadOnly(field)"
                placeholder="选择签名人"
                style="width: 100%"
                @update:model-value="setFieldValue(field.id, $event)"
              >
                <el-option v-for="signature in signatures" :key="signature" :label="signature" :value="signature" />
              </el-select>
            </el-form-item>
          </template>
        </div>
      </section>
    </el-form>
  </div>
</template>

<style scoped>
.workflow-template-form {
  display: grid;
  gap: 16px;
}

.workflow-template-section {
  padding: 16px 18px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.54);
  border: 1px solid rgba(255, 255, 255, 0.72);
}

.workflow-template-section__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.workflow-template-section__head h4 {
  margin: 4px 0 0;
  font-size: 18px;
}

.workflow-template-section__head p {
  margin: 2px 0 0;
  max-width: 420px;
  color: #909399;
  font-size: 13px;
  line-height: 1.6;
}

.workflow-template-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 14px 16px;
}

.workflow-template-item {
  margin-bottom: 0;
}

.workflow-template-item--full,
.workflow-template-repeater {
  grid-column: 1 / -1;
}

.workflow-template-repeater__head,
.workflow-template-repeater__item-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.workflow-template-repeater__head {
  margin-bottom: 12px;
}

.workflow-template-repeater__head p {
  margin: 6px 0 0;
  color: #909399;
  font-size: 13px;
}

.workflow-template-repeater__list {
  display: grid;
  gap: 12px;
}

.workflow-template-repeater__item {
  padding: 14px;
  border-radius: 6px;
  background: rgba(248, 250, 252, 0.82);
  border: 1px solid rgba(148, 163, 184, 0.14);
}

.workflow-template-rationality {
  display: grid;
  gap: 14px;
}

.workflow-template-rationality__block {
  overflow-x: auto;
}

.workflow-template-rationality__title {
  margin-bottom: 10px;
  font-weight: 600;
}

.workflow-template-rationality__matrix {
  width: 100%;
  border-collapse: collapse;
}

.workflow-template-rationality__matrix th,
.workflow-template-rationality__matrix td {
  border: 1px solid rgba(148, 163, 184, 0.24);
  padding: 0;
  background: rgba(255, 255, 255, 0.72);
}

.workflow-template-rationality__matrix th {
  min-width: 230px;
  padding: 12px 14px;
  text-align: left;
  font-weight: 500;
}

.workflow-template-rationality__choice {
  display: flex;
  width: 100%;
  min-width: 140px;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 14px;
  border: none;
  background: transparent;
  cursor: pointer;
}

.workflow-template-rationality__choice.is-active {
  background: rgba(64, 158, 255, 0.09);
  color: #1d4ed8;
}

.workflow-template-rationality__box {
  display: inline-flex;
  width: 22px;
  height: 22px;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(100, 116, 139, 0.4);
  font-weight: 700;
}

.workflow-template-option-group {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 18px;
}

.workflow-template-form--compact .workflow-template-section {
  padding: 14px 16px;
}

.workflow-template-form--compact .workflow-template-grid {
  gap: 12px 14px;
}
</style>
