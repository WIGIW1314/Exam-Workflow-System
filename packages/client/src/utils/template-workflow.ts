import type { DocxTemplateDefinition, TemplateFieldDefinition } from '@exam-workflow/shared';

export interface WorkflowCourseContext {
  departmentName: string;
  courseName: string;
  semesterName: string;
  creditHours: string;
  teacherName: string;
  classNames: string[];
  courseCode?: string;
}

function buildDefaultFieldValue(field: TemplateFieldDefinition): unknown {
  if (field.type === 'checkboxGroup') {
    return [];
  }
  if (field.type === 'repeater') {
    const minRows = Math.max(field.minRows ?? 1, 1);
    return Array.from({ length: minRows }, () => buildRepeaterRow(field.fields ?? []));
  }
  return '';
}

function normalizeImportedFieldValue(field: TemplateFieldDefinition, value: unknown): unknown {
  if (field.type === 'checkboxGroup') {
    return Array.isArray(value) ? value : [];
  }
  if (field.type === 'repeater') {
    const rows = Array.isArray(value) ? (value as Array<Record<string, unknown>>) : [];
    if (!rows.length) {
      return buildDefaultFieldValue(field);
    }
    return rows.map((row) => buildRepeaterRowFromPayload(field.fields ?? [], row));
  }
  return value == null ? '' : value;
}

export function buildRepeaterRow(fields: TemplateFieldDefinition[]) {
  return fields.reduce<Record<string, unknown>>((result, field) => {
    result[field.id] = buildDefaultFieldValue(field);
    return result;
  }, {});
}

export function buildRepeaterRowFromPayload(fields: TemplateFieldDefinition[], payload: Record<string, unknown>) {
  return fields.reduce<Record<string, unknown>>((result, field) => {
    result[field.id] = normalizeImportedFieldValue(field, payload[field.id]);
    return result;
  }, {});
}

export function buildTemplateState(template: DocxTemplateDefinition, payload?: Record<string, unknown>) {
  return template.sections.reduce<Record<string, unknown>>((result, section) => {
    section.fields.forEach((field) => {
      result[field.id] = normalizeImportedFieldValue(field, payload?.[field.id]);
    });
    return result;
  }, {});
}

export function buildWorkflowSystemPayload(templateId: string, context: WorkflowCourseContext) {
  const classText = context.classNames.join('、');
  if (templateId === 'rationality-review') {
    return {
      departmentName: context.departmentName,
      courseName: context.courseName,
      semesterName: context.semesterName,
      majorGrade: classText,
      creditHours: context.creditHours,
      teacherName: context.teacherName,
      paperTeacherName: context.teacherName,
    };
  }

  if (templateId === 'paper-review') {
    return {
      collegeName: context.departmentName,
      semesterLabel: context.semesterName,
      courseName: context.courseName,
      creditHours: context.creditHours,
      paperTeacherName: context.teacherName,
      departmentName: context.departmentName,
      classNames: classText,
    };
  }

  return {
    collegeName: context.departmentName,
    semesterLabel: context.semesterName,
    courseName: context.courseName,
    courseCode: context.courseCode ?? '',
    majorClass: classText,
    teacherName: context.teacherName,
  };
}

export function getTemplateField(template: DocxTemplateDefinition | null | undefined, fieldId: string) {
  return template?.sections.flatMap((section) => section.fields).find((field) => field.id === fieldId) ?? null;
}
