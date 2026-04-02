<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { CirclePlus, Delete, Upload } from '@element-plus/icons-vue';
import PageCard from '@/components/common/PageCard.vue';
import { apiGet, downloadFileByPost, uploadFile } from '@/api';

type TemplateFieldType = 'text' | 'textarea' | 'date' | 'number' | 'radio' | 'checkboxGroup' | 'signature' | 'repeater';

interface TemplateOption {
  label: string;
  value: string;
}

interface TemplateField {
  id: string;
  label: string;
  type: TemplateFieldType;
  required?: boolean;
  placeholder?: string;
  helpText?: string;
  minRows?: number;
  maxRows?: number;
  addLabel?: string;
  options?: TemplateOption[];
  fields?: TemplateField[];
}

interface TemplateSection {
  id: string;
  title: string;
  description?: string;
  fields: TemplateField[];
}

interface TemplateDefinition {
  id: string;
  name: string;
  fileName: string;
  description: string;
  sections: TemplateSection[];
}

interface DocxTemplateResponse {
  templates: TemplateDefinition[];
  signatures: string[];
}

interface ImportedDocxTemplateResult {
  templateId: string;
  payload: Record<string, unknown>;
  importedFieldPaths: string[];
}

interface RationalityReviewRow {
  fieldId: string;
  label: string;
}

const rationalityExamRows: RationalityReviewRow[] = [
  { fieldId: 'directorExamOutlineMatch', label: '考核内容符合课程教学大纲要求' },
  { fieldId: 'directorExamGoalSupport', label: '考核内容支撑课程目标达成情况' },
  { fieldId: 'directorExamDifficulty', label: '题量、命题难度' },
  { fieldId: 'directorExamType', label: '题型' },
  { fieldId: 'directorExamClarity', label: '试卷文字、公式、图表等清晰准确' },
  { fieldId: 'directorExamAnswer', label: '参考答案和评分标准细则' },
  { fieldId: 'directorExamABMatch', label: 'A/B 试卷重复率、难度' },
];

const rationalityOtherRows: RationalityReviewRow[] = [
  { fieldId: 'directorOtherOutlineMatch', label: '考核内容符合课程教学大纲要求' },
  { fieldId: 'directorOtherContentSupport', label: '考核内容支撑课程目标达成情况' },
  { fieldId: 'directorOtherMethodSupport', label: '考核方式支撑课程目标达成情况' },
];

const loading = ref(false);
const generating = ref(false);
const importing = ref(false);
const templates = ref<TemplateDefinition[]>([]);
const signatures = ref<string[]>([]);
const currentTemplateId = ref('');
const formState = reactive<Record<string, unknown>>({});
const importedFieldPathSet = ref<Set<string>>(new Set());

const currentTemplate = computed(() => templates.value.find((item) => item.id === currentTemplateId.value) ?? null);
const isRationalityTemplate = computed(() => currentTemplate.value?.id === 'rationality-review');

function buildDefaultFieldValue(field: TemplateField): unknown {
  if (field.type === 'checkboxGroup') {
    return [];
  }
  if (field.type === 'repeater') {
    const minRows = Math.max(field.minRows ?? 1, 1);
    return Array.from({ length: minRows }, () => buildRepeaterRow(field.fields ?? []));
  }
  return '';
}

function buildRepeaterRow(fields: TemplateField[]) {
  return fields.reduce<Record<string, unknown>>((result, field) => {
    result[field.id] = buildDefaultFieldValue(field);
    return result;
  }, {});
}

function normalizeImportedFieldValue(field: TemplateField, value: unknown): unknown {
  if (field.type === 'checkboxGroup') {
    return Array.isArray(value) ? value : [];
  }
  if (field.type === 'repeater') {
    const rows = Array.isArray(value) ? value as Array<Record<string, unknown>> : [];
    if (!rows.length) {
      return buildDefaultFieldValue(field);
    }
    return rows.map((row) => buildRepeaterRowFromPayload(field.fields ?? [], row));
  }
  return value == null ? '' : value;
}

function buildRepeaterRowFromPayload(fields: TemplateField[], payload: Record<string, unknown>) {
  return fields.reduce<Record<string, unknown>>((result, field) => {
    result[field.id] = normalizeImportedFieldValue(field, payload[field.id]);
    return result;
  }, {});
}

function buildTemplateState(template: TemplateDefinition, payload?: Record<string, unknown>) {
  return template.sections.reduce<Record<string, unknown>>((result, section) => {
    section.fields.forEach((field) => {
      result[field.id] = normalizeImportedFieldValue(field, payload?.[field.id]);
    });
    return result;
  }, {});
}

function replaceFormState(nextState: Record<string, unknown>) {
  Object.keys(formState).forEach((key) => {
    delete formState[key];
  });
  Object.assign(formState, nextState);
}

function resetImportedHighlights() {
  importedFieldPathSet.value = new Set();
}

function resetFormState() {
  const template = currentTemplate.value;
  if (!template) {
    replaceFormState({});
    resetImportedHighlights();
    return;
  }
  replaceFormState(buildTemplateState(template));
  resetImportedHighlights();
}

function getRepeaterRows(fieldId: string) {
  const value = formState[fieldId];
  return Array.isArray(value) ? (value as Array<Record<string, unknown>>) : [];
}

function hasImportedField(path: string) {
  return importedFieldPathSet.value.has(path);
}

function isFieldPending(field: TemplateField, value: unknown) {
  if (!field.required) {
    return false;
  }
  if (field.type === 'checkboxGroup') {
    return !Array.isArray(value) || value.length === 0;
  }
  if (field.type === 'repeater') {
    return !Array.isArray(value) || value.length === 0;
  }
  return value == null || String(value).trim() === '';
}

function getFieldItemClass(field: TemplateField, path: string, value: unknown) {
  return {
    'template-form-item--imported': hasImportedField(path),
    'template-form-item--pending': isFieldPending(field, value),
  };
}

function getMatrixLabelClass(fieldId: string) {
  const field = getFieldDefinition(fieldId);
  const value = formState[fieldId];
  return {
    'template-rationality__label--imported': hasImportedField(fieldId),
    'template-rationality__label--pending': field ? isFieldPending(field, value) : false,
  };
}

function getFieldDefinition(fieldId: string) {
  return currentTemplate.value?.sections.flatMap((section) => section.fields).find((field) => field.id === fieldId) ?? null;
}

function getFieldOptions(fieldId: string) {
  return getFieldDefinition(fieldId)?.options ?? [];
}

function getSingleValue(fieldId: string) {
  return String(formState[fieldId] ?? '');
}

function setSingleValue(fieldId: string, value: string) {
  formState[fieldId] = value;
}

function isRationalityReviewSection(section: TemplateSection) {
  return isRationalityTemplate.value && section.id === 'review';
}

function addRepeaterItem(field: TemplateField) {
  const rows = getRepeaterRows(field.id);
  if (field.maxRows && rows.length >= field.maxRows) {
    ElMessage.warning(`${field.label}最多支持 ${field.maxRows} 项`);
    return;
  }
  rows.push(buildRepeaterRow(field.fields ?? []));
}

function removeRepeaterItem(field: TemplateField, index: number) {
  const rows = getRepeaterRows(field.id);
  const minRows = Math.max(field.minRows ?? 1, 1);
  if (rows.length <= minRows) {
    ElMessage.warning(`${field.label}至少保留 ${minRows} 项`);
    return;
  }
  rows.splice(index, 1);
}

function isEmptyValue(value: unknown) {
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  return value == null || String(value).trim() === '';
}

function validateField(field: TemplateField, value: unknown, labelPrefix = field.label): string | null {
  if (field.type === 'repeater') {
    const rows = Array.isArray(value) ? (value as Array<Record<string, unknown>>) : [];
    if (field.required && rows.length === 0) {
      return `请填写${labelPrefix}`;
    }
    if (field.minRows && rows.length < field.minRows) {
      return `${labelPrefix}至少填写 ${field.minRows} 项`;
    }
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex] ?? {};
      for (const childField of field.fields ?? []) {
        const childError = validateField(childField, row[childField.id], `${labelPrefix}第 ${rowIndex + 1} 项 ${childField.label}`);
        if (childError) {
          return childError;
        }
      }
    }
    return null;
  }

  if (!field.required) {
    return null;
  }

  if (field.type === 'checkboxGroup') {
    return Array.isArray(value) && value.length > 0 ? null : `请填写${labelPrefix}`;
  }

  return isEmptyValue(value) ? `请填写${labelPrefix}` : null;
}

function validateCurrentTemplate() {
  const template = currentTemplate.value;
  if (!template) {
    return '未选择模板';
  }
  for (const section of template.sections) {
    for (const field of section.fields) {
      const error = validateField(field, formState[field.id], field.label);
      if (error) {
        return error;
      }
    }
  }
  return null;
}

async function loadTemplateDefinitions() {
  loading.value = true;
  try {
    const response = await apiGet<DocxTemplateResponse>('/docx-templates');
    templates.value = response.templates;
    signatures.value = response.signatures;
    if (!currentTemplateId.value && templates.value.length) {
      currentTemplateId.value = templates.value[0].id;
      return;
    }
    resetFormState();
  } finally {
    loading.value = false;
  }
}

async function generateDocument() {
  const template = currentTemplate.value;
  const validationError = validateCurrentTemplate();
  if (validationError) {
    ElMessage.warning(validationError);
    return;
  }
  if (!template) {
    return;
  }

  generating.value = true;
  try {
    await downloadFileByPost(
      `/docx-templates/${template.id}/generate`,
      JSON.parse(JSON.stringify(formState)),
      `${template.name}.docx`,
    );
    ElMessage.success('模板文档已生成并开始下载');
  } finally {
    generating.value = false;
  }
}

async function importExistingDocx(file: File) {
  importing.value = true;
  try {
    const result = await uploadFile<ImportedDocxTemplateResult>('/docx-templates/import', file);
    const template = templates.value.find((item) => item.id === result.templateId);
    if (!template) {
      ElMessage.warning('识别到了模板，但当前页面未加载到对应定义');
      return false;
    }
    currentTemplateId.value = template.id;
    replaceFormState(buildTemplateState(template, result.payload));
    importedFieldPathSet.value = new Set(result.importedFieldPaths);
    ElMessage.success(`已识别并回填为“${template.name}”`);
  } finally {
    importing.value = false;
  }
  return false;
}

watch(currentTemplateId, () => {
  resetFormState();
});

onMounted(() => {
  void loadTemplateDefinitions();
});
</script>

<template>
  <PageCard fill title="模板文档生成" eyebrow="DOCX 表单" show-title>
    <template #actions>
      <el-upload
        :show-file-list="false"
        accept=".docx"
        :auto-upload="false"
        :on-change="({ raw }: any) => raw && importExistingDocx(raw)"
      >
        <el-button :icon="Upload" :loading="importing">导入现有 DOCX</el-button>
      </el-upload>
      <el-button @click="resetFormState">重置表单</el-button>
      <el-button type="primary" :loading="generating" @click="generateDocument">生成并下载 DOCX</el-button>
    </template>

    <div class="template-builder">
      <aside class="template-builder__sidebar">
        <div class="template-builder__sidebar-head">
          <div class="page-kicker">模板目录</div>
          <h4>选择要生成的文档模板</h4>
          <p>当前已识别 3 个模板，表单字段、复选框、签名和日期都会按模板结构回写到 DOCX 中。</p>
        </div>

        <div class="template-list">
          <button
            v-for="template in templates"
            :key="template.id"
            type="button"
            class="template-list__item"
            :class="{ 'template-list__item--active': currentTemplateId === template.id }"
            @click="currentTemplateId = template.id"
          >
            <strong>{{ template.name }}</strong>
            <span>{{ template.description }}</span>
          </button>
        </div>

        <div class="template-signature-card">
          <div class="page-kicker">签名资源</div>
          <strong>可用签名 {{ signatures.length }} 个</strong>
          <span>支持导入现有 DOCX 自动识别填充；签名图片仍来自 `public/签名`，下拉选择姓名后会自动插入对应 PNG。</span>
        </div>
      </aside>

      <section class="template-builder__content">
        <div v-if="loading" class="template-loading">正在读取模板定义，请稍候...</div>
        <div v-else-if="currentTemplate" class="template-form-shell">
          <div class="template-hero">
            <div>
              <div class="page-kicker">当前模板</div>
              <h3>{{ currentTemplate.name }}</h3>
              <p>{{ currentTemplate.description }}</p>
            </div>
            <div class="template-hero__meta">
              <el-tag effect="light" type="success">自动识别 {{ importedFieldPathSet.size }} 项</el-tag>
              <el-tag effect="light" type="success">绿色表示已自动回填</el-tag>
              <el-tag effect="light" type="warning">黄色表示仍需补充</el-tag>
              <el-tag effect="light" type="info">{{ currentTemplate.fileName }}</el-tag>
            </div>
          </div>

          <div class="template-form-scroll">
            <el-form label-position="top">
              <section
                v-for="section in currentTemplate.sections"
                :key="section.id"
                class="template-section"
              >
                <header class="template-section__head">
                  <div>
                    <div class="page-kicker">表单分区</div>
                    <h4>{{ section.title }}</h4>
                  </div>
                  <p v-if="section.description">{{ section.description }}</p>
                </header>

                <div v-if="isRationalityReviewSection(section)" class="template-rationality">
                  <div class="template-rationality__editor">
                    <div class="template-rationality__block">
                      <div class="template-rationality__title">结课考试考核内容与课程目标对应分析</div>
                      <table class="template-rationality__matrix">
                        <tbody>
                          <tr v-for="row in rationalityExamRows" :key="row.fieldId">
                            <th :class="getMatrixLabelClass(row.fieldId)">{{ row.label }}</th>
                            <td
                              v-for="option in getFieldOptions(row.fieldId)"
                              :key="`${row.fieldId}-${option.value}`"
                            >
                              <button
                                type="button"
                                class="template-rationality__choice"
                                :class="{ 'template-rationality__choice--active': getSingleValue(row.fieldId) === option.value }"
                                @click="setSingleValue(row.fieldId, option.value)"
                              >
                                <span>{{ option.label }}</span>
                                <span class="template-rationality__box">{{ getSingleValue(row.fieldId) === option.value ? '√' : '' }}</span>
                              </button>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <div class="template-rationality__block">
                      <div class="template-rationality__title">其他考核方式、考核内容与课程目标对应分析</div>
                      <table class="template-rationality__matrix">
                        <tbody>
                          <tr v-for="row in rationalityOtherRows" :key="row.fieldId">
                            <th :class="getMatrixLabelClass(row.fieldId)">{{ row.label }}</th>
                            <td
                              v-for="option in getFieldOptions(row.fieldId)"
                              :key="`${row.fieldId}-${option.value}`"
                            >
                              <button
                                type="button"
                                class="template-rationality__choice"
                                :class="{ 'template-rationality__choice--active': getSingleValue(row.fieldId) === option.value }"
                                @click="setSingleValue(row.fieldId, option.value)"
                              >
                                <span>{{ option.label }}</span>
                                <span class="template-rationality__box">{{ getSingleValue(row.fieldId) === option.value ? '√' : '' }}</span>
                              </button>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <div class="template-rationality__meta">
                      <el-form-item label="教研室主任审核结论 *" class="template-form-item" :class="getFieldItemClass(getFieldDefinition('directorConclusion')!, 'directorConclusion', formState.directorConclusion)">
                        <el-radio-group v-model="formState.directorConclusion" class="template-option-group">
                          <el-radio v-for="option in getFieldOptions('directorConclusion')" :key="option.value" :label="option.value">
                            {{ option.label }}
                          </el-radio>
                        </el-radio-group>
                      </el-form-item>

                      <el-form-item label="教研室主任签名 *" class="template-form-item" :class="getFieldItemClass(getFieldDefinition('directorSigner')!, 'directorSigner', formState.directorSigner)">
                        <el-select
                          v-model="formState.directorSigner"
                          clearable
                          filterable
                          placeholder="选择签名人"
                          style="width: 100%"
                        >
                          <el-option v-for="signature in signatures" :key="signature" :label="signature" :value="signature" />
                        </el-select>
                      </el-form-item>

                      <el-form-item label="教研室主任签字日期 *" class="template-form-item" :class="getFieldItemClass(getFieldDefinition('directorDate')!, 'directorDate', formState.directorDate)">
                        <el-date-picker
                          v-model="formState.directorDate"
                          type="date"
                          format="YYYY-MM-DD"
                          value-format="YYYY-MM-DD"
                          placeholder="选择日期"
                          style="width: 100%"
                        />
                      </el-form-item>

                      <el-form-item label="教学院长审核结论 *" class="template-form-item" :class="getFieldItemClass(getFieldDefinition('deanDecision')!, 'deanDecision', formState.deanDecision)">
                        <el-radio-group v-model="formState.deanDecision" class="template-option-group">
                          <el-radio v-for="option in getFieldOptions('deanDecision')" :key="option.value" :label="option.value">
                            {{ option.label }}
                          </el-radio>
                        </el-radio-group>
                      </el-form-item>

                      <el-form-item label="教学院长签名 *" class="template-form-item" :class="getFieldItemClass(getFieldDefinition('deanSigner')!, 'deanSigner', formState.deanSigner)">
                        <el-select
                          v-model="formState.deanSigner"
                          clearable
                          filterable
                          placeholder="选择签名人"
                          style="width: 100%"
                        >
                          <el-option v-for="signature in signatures" :key="signature" :label="signature" :value="signature" />
                        </el-select>
                      </el-form-item>

                      <el-form-item label="教学院长签字日期 *" class="template-form-item" :class="getFieldItemClass(getFieldDefinition('deanDate')!, 'deanDate', formState.deanDate)">
                        <el-date-picker
                          v-model="formState.deanDate"
                          type="date"
                          format="YYYY-MM-DD"
                          value-format="YYYY-MM-DD"
                          placeholder="选择日期"
                          style="width: 100%"
                        />
                      </el-form-item>
                    </div>
                  </div>
                </div>

                <div v-else class="template-form-grid">
                  <template v-for="field in section.fields" :key="field.id">
                    <div v-if="field.type === 'repeater'" class="template-repeater">
                      <div class="template-repeater__head">
                        <div>
                          <strong>{{ field.label }}</strong>
                          <p v-if="field.helpText">{{ field.helpText }}</p>
                        </div>
                        <el-button type="primary" plain :icon="CirclePlus" @click="addRepeaterItem(field)">
                          {{ field.addLabel || '新增一项' }}
                        </el-button>
                      </div>

                      <div class="template-repeater__list">
                        <div
                          v-for="(item, itemIndex) in getRepeaterRows(field.id)"
                          :key="`${field.id}-${itemIndex}`"
                          class="template-repeater__item"
                        >
                          <div class="template-repeater__item-head">
                            <strong>{{ field.label }} {{ itemIndex + 1 }}</strong>
                            <el-button
                              link
                              type="danger"
                              :icon="Delete"
                              @click="removeRepeaterItem(field, itemIndex)"
                            >
                              删除
                            </el-button>
                          </div>

                          <div class="template-form-grid">
                            <el-form-item
                              v-for="childField in field.fields ?? []"
                              :key="`${field.id}-${itemIndex}-${childField.id}`"
                              :label="`${childField.label}${childField.required ? ' *' : ''}`"
                              class="template-form-item"
                              :class="[
                                { 'template-form-item--full': childField.type === 'textarea' },
                                getFieldItemClass(childField, `${field.id}.${itemIndex}.${childField.id}`, item[childField.id]),
                              ]"
                            >
                              <el-input
                                v-if="childField.type === 'text' || childField.type === 'number'"
                                v-model="item[childField.id]"
                                :placeholder="childField.placeholder || `请输入${childField.label}`"
                              />
                              <el-input
                                v-else-if="childField.type === 'textarea'"
                                v-model="item[childField.id]"
                                type="textarea"
                                :rows="4"
                                :placeholder="childField.placeholder || `请输入${childField.label}`"
                              />
                              <el-date-picker
                                v-else-if="childField.type === 'date'"
                                v-model="item[childField.id]"
                                type="date"
                                format="YYYY-MM-DD"
                                value-format="YYYY-MM-DD"
                                placeholder="选择日期"
                                style="width: 100%"
                              />
                              <div v-else class="template-unsupported">
                                当前重复项暂不支持 {{ childField.type }} 类型
                              </div>
                              <div v-if="childField.helpText" class="template-field-help">{{ childField.helpText }}</div>
                            </el-form-item>
                          </div>
                        </div>
                      </div>
                    </div>

                    <el-form-item
                      v-else
                      :label="`${field.label}${field.required ? ' *' : ''}`"
                      class="template-form-item"
                      :class="[
                        { 'template-form-item--full': field.type === 'textarea' },
                        getFieldItemClass(field, field.id, formState[field.id]),
                      ]"
                    >
                      <el-input
                        v-if="field.type === 'text' || field.type === 'number'"
                        v-model="formState[field.id]"
                        :placeholder="field.placeholder || `请输入${field.label}`"
                      />

                      <el-input
                        v-else-if="field.type === 'textarea'"
                        v-model="formState[field.id]"
                        type="textarea"
                        :rows="5"
                        :placeholder="field.placeholder || `请输入${field.label}`"
                      />

                      <el-date-picker
                        v-else-if="field.type === 'date'"
                        v-model="formState[field.id]"
                        type="date"
                        format="YYYY-MM-DD"
                        value-format="YYYY-MM-DD"
                        placeholder="选择日期"
                        style="width: 100%"
                      />

                      <el-radio-group v-else-if="field.type === 'radio'" v-model="formState[field.id]" class="template-option-group">
                        <el-radio v-for="option in field.options ?? []" :key="option.value" :label="option.value">
                          {{ option.label }}
                        </el-radio>
                      </el-radio-group>

                      <el-checkbox-group v-else-if="field.type === 'checkboxGroup'" v-model="formState[field.id]" class="template-option-group">
                        <el-checkbox v-for="option in field.options ?? []" :key="option.value" :label="option.value">
                          {{ option.label }}
                        </el-checkbox>
                      </el-checkbox-group>

                      <el-select
                        v-else-if="field.type === 'signature'"
                        v-model="formState[field.id]"
                        clearable
                        filterable
                        placeholder="选择签名人"
                        style="width: 100%"
                      >
                        <el-option v-for="signature in signatures" :key="signature" :label="signature" :value="signature" />
                      </el-select>

                      <div v-else class="template-unsupported">
                        当前字段类型 {{ field.type }} 暂未适配
                      </div>

                      <div v-if="field.helpText" class="template-field-help">{{ field.helpText }}</div>
                    </el-form-item>
                  </template>
                </div>
              </section>
            </el-form>
          </div>
        </div>

        <div v-else class="template-loading">当前没有可用模板</div>
      </section>
    </div>
  </PageCard>
</template>
