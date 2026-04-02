import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { DOMParser, type Document as XmlDocument, type Element as XmlElement } from '@xmldom/xmldom';
import type { DocxTemplateDefinition, TemplateFieldDefinition, TemplateSectionDefinition } from '@exam-workflow/shared';
import {
  EditableDocx,
  SignatureImagePayload,
  fillRepeatingRows,
  formatCheckboxLine,
  formatDocDate,
  formatMultiCheckboxLine,
  formatSquareCheckboxLine,
  getBodyParagraphs,
  getCell,
  getCells,
  getRows,
  getTables,
  loadEditableDocx,
  saveEditableDocx,
  setCellParagraphs,
  setCellParagraphsWithSignature,
  setParagraphText,
  setTableCellText,
} from '../utils/docx-template.js';

interface TemplateOption {
  label: string;
  value: string;
}

type TemplateField = TemplateFieldDefinition;
type TemplateSection = TemplateSectionDefinition;
type TemplateDefinition = DocxTemplateDefinition;

interface ImportedDocxTemplateResult {
  templateId: string;
  payload: Record<string, unknown>;
  importedFieldPaths: string[];
}

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

function resolveTemplatePublicDir() {
  const searchRoots = [process.cwd(), MODULE_DIR];

  for (const start of searchRoots) {
    let current = start;
    while (true) {
      const workspaceCandidate = path.join(current, 'packages', 'client', 'public');
      if (existsSync(workspaceCandidate)) {
        return workspaceCandidate;
      }

      const monorepoChildCandidate = path.join(current, 'client', 'public');
      if (existsSync(monorepoChildCandidate)) {
        return monorepoChildCandidate;
      }

      const parent = path.dirname(current);
      if (parent === current) {
        break;
      }
      current = parent;
    }
  }

  throw new Error('无法定位模板资源目录 packages/client/public');
}

const TEMPLATE_PUBLIC_DIR = resolveTemplatePublicDir();
const SIGNATURE_DIR = path.join(TEMPLATE_PUBLIC_DIR, '签名');

const analysisReviewMethodOptions: TemplateOption[] = [
  { label: '集体流水作业', value: 'collective' },
  { label: '个人评阅', value: 'personal' },
];

const finalDecisionOptions: TemplateOption[] = [
  { label: '同意', value: 'agree' },
  { label: '不同意', value: 'disagree' },
];

const rationalityDirectorConclusionOptions: TemplateOption[] = [
  { label: '合理', value: 'reasonable' },
  { label: '基本合理', value: 'mostly_reasonable' },
  { label: '不合理', value: 'unreasonable' },
];

const rationalityComplianceOptions: TemplateOption[] = [
  { label: '符合', value: 'match' },
  { label: '基本符合', value: 'mostly_match' },
  { label: '不符合', value: 'not_match' },
];

const rationalitySupportOptions: TemplateOption[] = [
  { label: '强', value: 'strong' },
  { label: '中等', value: 'medium' },
  { label: '弱', value: 'weak' },
];

const rationalityReasonableOptions: TemplateOption[] = [
  { label: '合理', value: 'reasonable' },
  { label: '基本合理', value: 'mostly_reasonable' },
  { label: '不合理', value: 'unreasonable' },
];

const rationalityRequirementOptions: TemplateOption[] = [
  { label: '符合要求', value: 'match_requirement' },
  { label: '基本符合要求', value: 'mostly_match_requirement' },
  { label: '不符合要求', value: 'not_match_requirement' },
];

const assessmentTypeOptions: TemplateOption[] = [
  { label: '闭卷', value: 'closed_book' },
  { label: '开卷', value: 'open_book' },
  { label: '笔试', value: 'written' },
  { label: '机试', value: 'computer' },
  { label: '口试', value: 'oral' },
];

const templateDefinitions: TemplateDefinition[] = [
  {
    id: 'rationality-review',
    name: '合理性审核表',
    fileName: '合理性审核表.docx',
    description: '用于生成课程考核内容/方式合理性审核表，支持课程目标、命题内容、审核结论与签名插入。',
    sections: [
      {
        id: 'basic',
        title: '课程基本信息',
        fields: [
          { id: 'departmentName', label: '开课单位', type: 'text', required: true, owner: 'system', autoFill: true },
          { id: 'courseName', label: '课程名称', type: 'text', required: true, owner: 'system', autoFill: true },
          { id: 'semesterName', label: '学年学期', type: 'text', required: true, owner: 'system', autoFill: true },
          { id: 'majorGrade', label: '适用年级/专业', type: 'text', required: true, owner: 'system', autoFill: true },
          { id: 'creditHours', label: '学时/学分', type: 'text', required: true, owner: 'system', autoFill: true },
          { id: 'teacherName', label: '授课教师', type: 'text', required: true, owner: 'system', autoFill: true },
          { id: 'paperTeacherName', label: '命题教师', type: 'text', required: true, owner: 'system', autoFill: true },
        ],
      },
      {
        id: 'assessment',
        title: '考核方式与考核内容',
        fields: [
          {
            id: 'assessmentItems',
            label: '课程目标对应项',
            type: 'repeater',
            owner: 'teacher',
            minRows: 3,
            addLabel: '新增课程目标对应项',
            fields: [
              { id: 'goalName', label: '课程目标', type: 'text', required: true, placeholder: '如：课程目标1', owner: 'teacher' },
              { id: 'assessmentMethod', label: '考核方式（占比）', type: 'text', required: true, owner: 'teacher' },
              { id: 'assessmentContent', label: '考核内容', type: 'textarea', required: true, owner: 'teacher' },
            ],
          },
        ],
      },
      {
        id: 'exam',
        title: '结课考试试卷命题内容',
        fields: [
          {
            id: 'examItems',
            label: '命题内容行',
            type: 'repeater',
            owner: 'teacher',
            minRows: 3,
            addLabel: '新增命题内容行',
            fields: [
              { id: 'goalName', label: '课程目标', type: 'text', required: true, owner: 'teacher' },
              { id: 'knowledgePoint', label: '考核知识点', type: 'textarea', required: true, owner: 'teacher' },
              { id: 'scoreValue', label: '所占分值', type: 'text', required: true, owner: 'teacher' },
              { id: 'partOne', label: '一', type: 'text', owner: 'teacher' },
              { id: 'partTwo', label: '二', type: 'text', owner: 'teacher' },
              { id: 'partThree', label: '三', type: 'text', owner: 'teacher' },
              { id: 'partFour', label: '四', type: 'text', owner: 'teacher' },
              { id: 'partFive', label: '五', type: 'text', owner: 'teacher' },
              { id: 'partSix', label: '六', type: 'text', owner: 'teacher' },
              { id: 'partSeven', label: '七', type: 'text', owner: 'teacher' },
            ],
          },
        ],
      },
      {
        id: 'review',
        title: '审核意见',
        fields: [
          { id: 'directorExamOutlineMatch', label: '结课考试考核内容符合课程教学大纲要求', type: 'radio', required: true, options: rationalityComplianceOptions, owner: 'director' },
          { id: 'directorExamGoalSupport', label: '结课考试考核内容支撑课程目标达成情况', type: 'radio', required: true, options: rationalitySupportOptions, owner: 'director' },
          { id: 'directorExamDifficulty', label: '结课考试题量、命题难度', type: 'radio', required: true, options: rationalityReasonableOptions, owner: 'director' },
          { id: 'directorExamType', label: '结课考试题型', type: 'radio', required: true, options: rationalityReasonableOptions, owner: 'director' },
          { id: 'directorExamClarity', label: '结课考试试卷文字、公式、图表等清晰准确', type: 'radio', required: true, options: rationalityComplianceOptions, owner: 'director' },
          { id: 'directorExamAnswer', label: '结课考试参考答案和评分标准细则', type: 'radio', required: true, options: rationalityReasonableOptions, owner: 'director' },
          { id: 'directorExamABMatch', label: 'A/B 试卷重复率、难度', type: 'radio', required: true, options: rationalityRequirementOptions, owner: 'director' },
          { id: 'directorOtherOutlineMatch', label: '其他考核方式考核内容符合课程教学大纲要求', type: 'radio', required: true, options: rationalityComplianceOptions, owner: 'director' },
          { id: 'directorOtherContentSupport', label: '其他考核内容支撑课程目标达成情况', type: 'radio', required: true, options: rationalitySupportOptions, owner: 'director' },
          { id: 'directorOtherMethodSupport', label: '其他考核方式支撑课程目标达成情况', type: 'radio', required: true, options: rationalitySupportOptions, owner: 'director' },
          { id: 'directorConclusion', label: '教研室主任审核结论', type: 'radio', required: true, options: rationalityDirectorConclusionOptions, owner: 'director' },
          { id: 'directorSigner', label: '教研室主任签名', type: 'signature', required: true, owner: 'director' },
          { id: 'directorDate', label: '教研室主任签字日期', type: 'date', required: true, owner: 'director' },
          { id: 'deanDecision', label: '教学院长审核结论', type: 'radio', required: true, options: finalDecisionOptions, owner: 'academic_dean' },
          { id: 'deanSigner', label: '教学院长签名', type: 'signature', required: true, owner: 'academic_dean' },
          { id: 'deanDate', label: '教学院长签字日期', type: 'date', required: true, owner: 'academic_dean' },
        ],
      },
    ],
  },
  {
    id: 'exam-analysis',
    name: '试卷分析模板',
    fileName: '试卷分析模板.docx',
    description: '用于生成考查课试卷分析表，支持成绩统计、题型分值、分析改进意见与签名插入。',
    sections: [
      {
        id: 'basic',
        title: '基本信息',
        fields: [
          { id: 'collegeName', label: '院（系）', type: 'text', required: true, owner: 'system', autoFill: true },
          { id: 'semesterLabel', label: '学年学期', type: 'text', required: true, owner: 'system', autoFill: true },
          { id: 'courseName', label: '课程名称', type: 'text', required: true, owner: 'system', autoFill: true },
          { id: 'courseCode', label: '课程编码', type: 'text', required: true, owner: 'system', autoFill: true },
          { id: 'majorClass', label: '专业、班级', type: 'text', required: true, owner: 'system', autoFill: true },
          { id: 'teacherName', label: '任课教师', type: 'text', required: true, owner: 'system', autoFill: true },
          { id: 'assessmentMethod', label: '考核方式', type: 'text', required: true, owner: 'teacher' },
          { id: 'shouldAttendCount', label: '应考人数', type: 'number', required: true, owner: 'teacher' },
          { id: 'actualAttendCount', label: '实考人数', type: 'number', required: true, owner: 'teacher' },
          { id: 'absentCount', label: '缓（缺）考人数', type: 'number', required: true, owner: 'teacher' },
          { id: 'reviewMethod', label: '试卷评阅方式', type: 'radio', required: true, options: analysisReviewMethodOptions, owner: 'teacher' },
        ],
      },
      {
        id: 'score',
        title: '成绩统计',
        fields: [
          { id: 'highestScore', label: '最高分', type: 'text', required: true },
          { id: 'lowestScore', label: '最低分', type: 'text', required: true },
          { id: 'averageScore', label: '平均分', type: 'text', required: true },
          { id: 'standardDeviation', label: '标准差', type: 'text', required: true },
          { id: 'excellentCount', label: '优（≥90）人数', type: 'number', required: true },
          { id: 'goodCount', label: '良（80-89）人数', type: 'number', required: true },
          { id: 'mediumCount', label: '中（70-79）人数', type: 'number', required: true },
          { id: 'passCount', label: '及格（60-69）人数', type: 'number', required: true },
          { id: 'failCount', label: '不及格（＜60）人数', type: 'number', required: true },
          { id: 'excellentRate', label: '优比例（%）', type: 'text', required: true },
          { id: 'goodRate', label: '良比例（%）', type: 'text', required: true },
          { id: 'mediumRate', label: '中比例（%）', type: 'text', required: true },
          { id: 'passRate', label: '及格比例（%）', type: 'text', required: true },
          { id: 'failRate', label: '不及格比例（%）', type: 'text', required: true },
        ],
      },
      {
        id: 'questions',
        title: '卷面题型及分值',
        fields: [
          {
            id: 'questionItems',
            label: '题型与分值',
            type: 'repeater',
            owner: 'teacher',
            minRows: 6,
            maxRows: 8,
            addLabel: '新增题型',
            helpText: '模板当前最多支持 8 个题型槽位。',
            fields: [
              { id: 'questionType', label: '题型名称', type: 'text', required: true, owner: 'teacher' },
              { id: 'scoreValue', label: '分值', type: 'text', required: true, owner: 'teacher' },
            ],
          },
          { id: 'objectiveScore', label: '客观题（总分）', type: 'text', owner: 'teacher' },
          { id: 'subjectiveScore', label: '主观题（总分值）', type: 'text', owner: 'teacher' },
        ],
      },
      {
        id: 'analysis',
        title: '试卷分析及改进措施',
        fields: [
          { id: 'analysisPartOne', label: '分析部分 1-2', type: 'textarea', required: true, helpText: '建议填写试题覆盖面、难易度、成绩分布、基础知识掌握情况。', owner: 'teacher' },
          { id: 'analysisPartTwo', label: '分析部分 3-4', type: 'textarea', required: true, helpText: '建议填写考生能力分析、试题特点及不足。', owner: 'teacher' },
          { id: 'directorOpinion', label: '教研室（或专业、课程）负责人意见', type: 'textarea', required: true, owner: 'director' },
          { id: 'directorSigner', label: '负责人签名', type: 'signature', required: true, owner: 'director' },
          { id: 'directorDate', label: '负责人签字日期', type: 'date', required: true, owner: 'director' },
          { id: 'collegeOpinion', label: '院（系）负责人意见', type: 'textarea', required: true, owner: 'academic_dean' },
          { id: 'collegeSigner', label: '院（系）负责人签名', type: 'signature', required: true, owner: 'academic_dean' },
          { id: 'collegeDate', label: '院（系）负责人签字日期', type: 'date', required: true, owner: 'academic_dean' },
        ],
      },
    ],
  },
  {
    id: 'paper-review',
    name: '试卷命题审查表',
    fileName: '试卷命题审查表.docx',
    description: '用于生成试卷命题审查表，支持命题审查选项、总体意见、签名和审批意见。',
    sections: [
      {
        id: 'basic',
        title: '基本信息',
        fields: [
          { id: 'collegeName', label: '学院', type: 'text', required: true, owner: 'system', autoFill: true },
          { id: 'semesterLabel', label: '学年学期', type: 'text', required: true, owner: 'system', autoFill: true },
          { id: 'courseName', label: '课程名称', type: 'text', required: true, owner: 'system', autoFill: true },
          { id: 'creditHours', label: '学时', type: 'text', required: true, owner: 'system', autoFill: true },
          { id: 'paperTeacherName', label: '命题教师', type: 'text', required: true, owner: 'system', autoFill: true },
          { id: 'departmentName', label: '教师所在教研室', type: 'text', required: true, owner: 'system', autoFill: true },
          { id: 'classNames', label: '试卷使用班级', type: 'textarea', required: true, owner: 'system', autoFill: true },
          { id: 'assessmentTypes', label: '考核方式', type: 'checkboxGroup', required: true, options: assessmentTypeOptions, owner: 'teacher' },
          { id: 'teacherSigner', label: '命题教师签名', type: 'signature', required: true, owner: 'teacher' },
          { id: 'teacherDate', label: '命题教师签字日期', type: 'date', required: true, owner: 'teacher' },
        ],
      },
      {
        id: 'review',
        title: '命题审查',
        fields: [
          { id: 'scopeResult', label: '命题范围', type: 'radio', required: true, owner: 'director', options: [
            { label: '符合教学大纲要求', value: 'match_outline' },
            { label: '超过教学大纲要求', value: 'above_outline' },
            { label: '低于教学大纲要求', value: 'below_outline' },
          ] },
          { id: 'difficultyResult', label: '命题难度', type: 'radio', required: true, owner: 'director', options: [
            { label: '太易', value: 'too_easy' },
            { label: '适中', value: 'appropriate' },
            { label: '太难', value: 'too_hard' },
          ] },
          { id: 'weightResult', label: '命题份量', type: 'radio', required: true, owner: 'director', options: [
            { label: '太轻', value: 'too_light' },
            { label: '适中', value: 'appropriate' },
            { label: '太重', value: 'too_heavy' },
          ] },
          { id: 'errorResult', label: '命题差错情况', type: 'radio', required: true, owner: 'director', options: [
            { label: '有', value: 'has_error' },
            { label: '无', value: 'no_error' },
          ] },
          { id: 'errorFixResult', label: '有差错的更改情况', type: 'radio', required: true, owner: 'director', options: [
            { label: '已更改', value: 'fixed' },
            { label: '未更改', value: 'not_fixed' },
          ] },
          { id: 'answerResult', label: '参考答案、评分标准', type: 'radio', required: true, owner: 'director', options: [
            { label: '不合理', value: 'unreasonable' },
            { label: '合理', value: 'reasonable' },
          ] },
          { id: 'abCoverageResult', label: 'A、B 两套试卷覆盖面、难易程度、份量', type: 'radio', required: true, owner: 'director', options: [
            { label: '相当', value: 'similar' },
            { label: '不相当', value: 'different' },
          ] },
          { id: 'repeatRateResult', label: 'A、B 两套试卷试题重复率', type: 'radio', required: true, owner: 'director', options: [
            { label: '大于20％', value: 'gt20' },
            { label: '小于20％', value: 'lt20' },
          ] },
          { id: 'unifiedPaperResult', label: '统一命题情况', type: 'radio', required: true, owner: 'director', options: [
            { label: '使用相同教学大纲的班级统一命题', value: 'unified' },
            { label: '使用相同教学大纲的班级未按规定统一命题', value: 'not_unified' },
          ] },
          { id: 'overallResult', label: '总体意见', type: 'radio', required: true, owner: 'director', options: [
            { label: '退回修改', value: 'return_revision' },
            { label: '交付印刷', value: 'print' },
          ] },
          { id: 'directorSigner', label: '教研室主任签名', type: 'signature', required: true, owner: 'director' },
          { id: 'directorDate', label: '教研室主任签字日期', type: 'date', required: true, owner: 'director' },
          { id: 'deanOpinion', label: '教学院长审批意见', type: 'textarea', required: true, owner: 'academic_dean' },
          { id: 'deanSigner', label: '教学院长签名', type: 'signature', required: true, owner: 'academic_dean' },
          { id: 'deanDate', label: '教学院长签字日期', type: 'date', required: true, owner: 'academic_dean' },
        ],
      },
    ],
  },
];

function textValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value);
}

function listValue(value: unknown) {
  return Array.isArray(value) ? value : [];
}

async function readSignatureImage(signatureName?: string | null) {
  const name = textValue(signatureName);
  if (!name) {
    return null;
  }
  const target = path.join(SIGNATURE_DIR, `${name}.png`);
  try {
    const buffer = await fs.readFile(target);
    return {
      buffer,
      extension: 'png',
    } satisfies SignatureImagePayload;
  } catch {
    return null;
  }
}

function repeatRows<T>(value: unknown) {
  return Array.isArray(value) ? value as T[] : [];
}

function rowText(row: Record<string, unknown>, key: string) {
  return textValue(row?.[key]);
}

function setRowValues(row: XmlElement, values: string[]) {
  const cells = getCells(row);
  for (let index = 0; index < cells.length; index += 1) {
    setCellParagraphs(cells[index], [{ text: values[index] ?? '' }]);
  }
}

function getRowText(row: XmlElement) {
  return getCells(row)
    .map((cell) => cell.textContent?.replace(/\s+/g, ' ').trim() ?? '')
    .join(' ');
}

function findRowIndex(table: XmlElement, keyword: string) {
  return getRows(table).findIndex((row) => getRowText(row).includes(keyword));
}

function buildOpinionParagraphs(items: Array<{ label: string; options: TemplateOption[]; value: string }>) {
  return items.map((item) => ({
    text: `${item.label}    ${formatSquareCheckboxLine(item.options, item.value)}`,
  }));
}

function buildApprovalPrefix(options: TemplateOption[], value: string) {
  return `审核结论：     ${formatSquareCheckboxLine(options, value)}           签字：`;
}

function parseDocumentXml(xml: string) {
  return new DOMParser().parseFromString(xml, 'application/xml');
}

async function loadDocxDocumentFromBuffer(buffer: Buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const documentXml = await zip.file('word/document.xml')?.async('string');
  if (!documentXml) {
    throw new Error('DOCX 文档结构不完整');
  }
  return parseDocumentXml(documentXml);
}

function getTableCellText(table: XmlElement, rowIndex: number, cellIndex: number) {
  const row = getRows(table)[rowIndex];
  const cell = row ? getCells(row)[cellIndex] : null;
  return cell?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

function getDocumentLines(document: XmlDocument) {
  const paragraphLines = getBodyParagraphs(document)
    .map((item) => item.textContent?.replace(/\s+/g, ' ').trim() ?? '')
    .filter(Boolean);
  const tableLines = getTables(document)
    .flatMap((table) => getRows(table).map((row) => getRowText(row).trim()))
    .filter(Boolean);

  return [...paragraphLines, ...tableLines];
}

function findFirstMatchingLine(lines: string[], keywords: string[]) {
  return lines.find((line) => keywords.every((keyword) => line.includes(keyword))) ?? '';
}

function getRowCellTextByKeyword(table: XmlElement, keyword: string, cellIndex: number, fallbackRowIndex: number) {
  const rows = getRows(table);
  const matchedRow = rows.find((row) => getRowText(row).includes(keyword));
  const fallbackRow = rows[fallbackRowIndex];
  const targetRow = matchedRow ?? fallbackRow;
  const cell = targetRow ? getCells(targetRow)[cellIndex] : null;
  return cell?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

function parseDocDateLine(text: string) {
  const normalized = text.replace(/\s+/g, ' ');
  const directDate = normalized.match(/(\d{4})\s*[-年./]\s*(\d{1,2})\s*[-月./]\s*(\d{1,2})/);
  if (directDate) {
    const [, year, month, day] = directDate;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  return '';
}

function parseParagraphTextBeforeKeyword(text: string, keyword: string) {
  const index = text.indexOf(keyword);
  return index >= 0 ? text.slice(0, index).trim() : text.trim();
}

function parseSignerName(text: string, keyword: string) {
  const normalized = text.replace(/\s+/g, ' ');
  const index = normalized.indexOf(keyword);
  if (index < 0) {
    return '';
  }
  const tail = normalized.slice(index + keyword.length).trim();
  const beforeDate = tail.split(/\d{4}\s*[-年./]/)[0]?.trim() ?? '';
  return beforeDate.replace(/^[:：]/, '').trim();
}

function parseSquareCheckboxValue(text: string, options: TemplateOption[]) {
  const inlineGap = '[ \\t\\u00A0\\u3000]{0,2}';
  for (const option of options) {
    const escaped = option.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const checkedPatterns = [
      new RegExp(`${escaped}${inlineGap}[☑√■▣]`),
      new RegExp(`[☑√■▣]${inlineGap}${escaped}`),
    ];
    if (checkedPatterns.some((pattern) => pattern.test(text))) {
      return option.value;
    }
  }
  return '';
}

function parseInlineCheckboxValue(text: string, options: TemplateOption[]) {
  const inlineGap = '[ \\t\\u00A0\\u3000]{0,2}';
  for (const option of options) {
    const escaped = option.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const checkedPatterns = [
      new RegExp(`[（(]${inlineGap}[√☑■▣]${inlineGap}[)）]${inlineGap}${escaped}`),
      new RegExp(`${escaped}[（(]${inlineGap}[√☑■▣]${inlineGap}[)）]`),
    ];
    if (checkedPatterns.some((pattern) => pattern.test(text))) {
      return option.value;
    }
  }
  return '';
}

function parseMultiInlineCheckboxValues(text: string, options: TemplateOption[]) {
  const inlineGap = '[ \\t\\u00A0\\u3000]{0,2}';
  return options
    .filter((option) => {
      const escaped = option.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const checkedPatterns = [
        new RegExp(`[（(]${inlineGap}[√☑■▣]${inlineGap}[)）]${inlineGap}${escaped}`),
        new RegExp(`${escaped}[（(]${inlineGap}[√☑■▣]${inlineGap}[)）]`),
      ];
      return checkedPatterns.some((pattern) => pattern.test(text));
    })
    .map((option) => option.value);
}

function parseRationalityOpinionRows(text: string, rows: Array<{ fieldId: string; label: string; options: TemplateOption[] }>) {
  const result: Record<string, string> = {};
  for (const row of rows) {
    const matchedLine = text
      .split(/[\r\n]+/)
      .map((line) => line.trim())
      .find((line) => line.includes(row.label));
    result[row.fieldId] = parseSquareCheckboxValue(matchedLine ?? text, row.options);
  }
  return result;
}

async function parseImportedRationalityReview(document: XmlDocument) {
  const table = getTables(document)[0];
  if (!table) {
    throw new Error('合理性审核表模板结构异常');
  }

  const reviewHeaderIndex = findRowIndex(table, '教研室主任审核意见');
  const deanHeaderIndex = findRowIndex(table, '教学院长审核意见');
  const examHeaderIndex = findRowIndex(table, '结课考试试卷命题内容');
  if (reviewHeaderIndex < 0 || deanHeaderIndex < 0 || examHeaderIndex < 0) {
    throw new Error('未能识别合理性审核表结构');
  }

  const assessmentRows: Record<string, unknown>[] = [];
  for (let rowIndex = 4; rowIndex < examHeaderIndex; rowIndex += 1) {
    const goalName = getTableCellText(table, rowIndex, 1);
    const assessmentMethod = getTableCellText(table, rowIndex, 2);
    const assessmentContent = getTableCellText(table, rowIndex, 3);
    if (!goalName && !assessmentMethod && !assessmentContent) {
      continue;
    }
    if (goalName.includes('……')) {
      continue;
    }
    assessmentRows.push({ goalName, assessmentMethod, assessmentContent });
  }

  const examRows: Record<string, unknown>[] = [];
  for (let rowIndex = examHeaderIndex + 1; rowIndex < reviewHeaderIndex; rowIndex += 1) {
    const goalName = getTableCellText(table, rowIndex, 1);
    const knowledgePoint = getTableCellText(table, rowIndex, 2);
    const scoreValue = getTableCellText(table, rowIndex, 3);
    if (!goalName && !knowledgePoint && !scoreValue) {
      continue;
    }
    if (goalName.includes('……')) {
      continue;
    }
    examRows.push({
      goalName,
      knowledgePoint,
      scoreValue,
      partOne: getTableCellText(table, rowIndex, 4),
      partTwo: getTableCellText(table, rowIndex, 5),
      partThree: getTableCellText(table, rowIndex, 6),
      partFour: getTableCellText(table, rowIndex, 7),
      partFive: getTableCellText(table, rowIndex, 8),
      partSix: getTableCellText(table, rowIndex, 9),
      partSeven: getTableCellText(table, rowIndex, 10),
    });
  }

  const examOpinionText = getTableCellText(table, reviewHeaderIndex + 1, 1);
  const otherOpinionText = getTableCellText(table, reviewHeaderIndex + 3, 1);
  const directorApprovalText = getTableCellText(table, reviewHeaderIndex + 4, 1);
  const deanApprovalText = getTableCellText(table, deanHeaderIndex, 1);

  return {
    templateId: 'rationality-review',
    payload: {
      departmentName: getTableCellText(table, 0, 2),
      courseName: getTableCellText(table, 0, 4),
      semesterName: getTableCellText(table, 1, 2),
      majorGrade: getTableCellText(table, 1, 4),
      creditHours: getTableCellText(table, 2, 2),
      teacherName: getTableCellText(table, 2, 4),
      paperTeacherName: getTableCellText(table, 2, 6),
      assessmentItems: assessmentRows,
      examItems: examRows,
      ...parseRationalityOpinionRows(examOpinionText, [
        { fieldId: 'directorExamOutlineMatch', label: '考核内容符合课程教学大纲要求', options: rationalityComplianceOptions },
        { fieldId: 'directorExamGoalSupport', label: '考核内容支撑课程目标达成情况', options: rationalitySupportOptions },
        { fieldId: 'directorExamDifficulty', label: '题量、命题难度', options: rationalityReasonableOptions },
        { fieldId: 'directorExamType', label: '题型', options: rationalityReasonableOptions },
        { fieldId: 'directorExamClarity', label: '试卷文字、公式、图表等清晰准确', options: rationalityComplianceOptions },
        { fieldId: 'directorExamAnswer', label: '参考答案和评分标准细则', options: rationalityReasonableOptions },
        { fieldId: 'directorExamABMatch', label: 'A/B 试卷重复率、难度', options: rationalityRequirementOptions },
      ]),
      ...parseRationalityOpinionRows(otherOpinionText, [
        { fieldId: 'directorOtherOutlineMatch', label: '考核内容符合课程教学大纲要求', options: rationalityComplianceOptions },
        { fieldId: 'directorOtherContentSupport', label: '考核内容支撑课程目标达成情况', options: rationalitySupportOptions },
        { fieldId: 'directorOtherMethodSupport', label: '考核方式支撑课程目标达成情况', options: rationalitySupportOptions },
      ]),
      directorConclusion: parseSquareCheckboxValue(directorApprovalText, rationalityDirectorConclusionOptions),
      directorSigner: parseSignerName(directorApprovalText, '签字：'),
      directorDate: parseDocDateLine(directorApprovalText),
      deanDecision: parseSquareCheckboxValue(deanApprovalText, finalDecisionOptions),
      deanSigner: parseSignerName(deanApprovalText, '签字：'),
      deanDate: parseDocDateLine(deanApprovalText),
    },
  };
}

async function parseImportedExamAnalysis(document: XmlDocument) {
  const bodyParagraphs = getBodyParagraphs(document);
  const documentLines = getDocumentLines(document);
  const table1 = getTables(document)[0];
  const table2 = getTables(document)[1];
  if (!table1 || !table2) {
    throw new Error('未能识别试卷分析模板结构');
  }

  const questionItems: Record<string, unknown>[] = [];
  const typeRow = getRows(table1)[8];
  const scoreRow = getRows(table1)[9];
  if (typeRow && scoreRow) {
    const typeCells = getCells(typeRow);
    const scoreCells = getCells(scoreRow);
    for (let index = 1; index < typeCells.length; index += 1) {
      const questionType = typeCells[index]?.textContent?.trim() ?? '';
      const scoreValue = scoreCells[index]?.textContent?.trim() ?? '';
      if (questionType || scoreValue) {
        questionItems.push({ questionType, scoreValue });
      }
    }
  }

  const summaryLine = findFirstMatchingLine(documentLines, ['学期']);
  const collegeSummaryLine =
    findFirstMatchingLine(documentLines, ['院（系）'])
    || findFirstMatchingLine(documentLines, ['院(系)']);
  const directorCellText =
    getTableCellText(table2, 1, 0)
    || findFirstMatchingLine(documentLines, ['负责人签名']);
  const collegeCellText =
    getTableCellText(table2, 2, 0)
    || findFirstMatchingLine(documentLines, ['院（系）负责人'])
    || findFirstMatchingLine(documentLines, ['院(系)负责人']);

  return {
    templateId: 'exam-analysis',
    payload: {
      collegeName: getTableCellText(table1, 0, 1) || (collegeSummaryLine.match(/院[（(]系[)）][:：]?\s*(.+)$/)?.[1]?.trim() ?? ''),
      semesterLabel: bodyParagraphs[1]?.textContent?.trim() || summaryLine.match(/学[年期].*$/)?.[0]?.trim() || '',
      courseName: getTableCellText(table1, 0, 3),
      courseCode: getTableCellText(table1, 0, 5),
      majorClass: getTableCellText(table1, 1, 1),
      teacherName: getTableCellText(table1, 1, 3),
      assessmentMethod: getTableCellText(table1, 1, 5),
      shouldAttendCount: getTableCellText(table1, 2, 1),
      actualAttendCount: getTableCellText(table1, 2, 3),
      absentCount: getTableCellText(table1, 2, 5),
      reviewMethod: parseSquareCheckboxValue(getRowCellTextByKeyword(table1, '试卷评阅方式', 7, 2), analysisReviewMethodOptions),
      highestScore: getTableCellText(table1, 3, 2),
      lowestScore: getTableCellText(table1, 3, 4),
      averageScore: getTableCellText(table1, 3, 6),
      standardDeviation: getTableCellText(table1, 3, 8),
      excellentCount: getTableCellText(table1, 5, 2),
      goodCount: getTableCellText(table1, 5, 3),
      mediumCount: getTableCellText(table1, 5, 4),
      passCount: getTableCellText(table1, 5, 5),
      failCount: getTableCellText(table1, 5, 6),
      excellentRate: getTableCellText(table1, 6, 2),
      goodRate: getTableCellText(table1, 6, 3),
      mediumRate: getTableCellText(table1, 6, 4),
      passRate: getTableCellText(table1, 6, 5),
      failRate: getTableCellText(table1, 6, 6),
      questionItems,
      objectiveScore: getTableCellText(table1, 10, 1),
      subjectiveScore: getTableCellText(table1, 10, 3),
      analysisPartOne: getTableCellText(table1, 11, 1),
      analysisPartTwo: getTableCellText(table2, 0, 1),
      directorOpinion: parseParagraphTextBeforeKeyword(directorCellText, '负责人签名：'),
      directorSigner: parseSignerName(directorCellText, '负责人签名：'),
      directorDate: parseDocDateLine(directorCellText),
      collegeOpinion: parseParagraphTextBeforeKeyword(collegeCellText, '负责人签名：'),
      collegeSigner: parseSignerName(collegeCellText, '负责人签名：'),
      collegeDate: parseDocDateLine(collegeCellText),
    },
  };
}

async function parseImportedPaperReview(document: XmlDocument) {
  const bodyParagraphs = getBodyParagraphs(document);
  const documentLines = getDocumentLines(document);
  const table = getTables(document)[0];
  if (!table) {
    throw new Error('未能识别试卷命题审查表结构');
  }

  const titleLine =
    findFirstMatchingLine(documentLines, ['学院', '学年学期'])
    || bodyParagraphs[1]?.textContent?.replace(/\s+/g, ' ').trim()
    || '';
  const collegeName = titleLine.match(/学院：(.+?)\s+学年学期：/)?.[1]?.trim() ?? '';
  const semesterLabel = titleLine.match(/学年学期：(.+)$/)?.[1]?.trim() ?? '';
  const teacherSignLine = getTableCellText(table, 4, 0) || findFirstMatchingLine(documentLines, ['命题教师签名']);
  const directorSignLine = getTableCellText(table, 14, 0) || findFirstMatchingLine(documentLines, ['教研室主任', '签名']);
  const deanLine = getTableCellText(table, 15, 0) || findFirstMatchingLine(documentLines, ['教学院长审批意见']);

  return {
    templateId: 'paper-review',
    payload: {
      collegeName,
      semesterLabel,
      courseName: getRowCellTextByKeyword(table, '课程名称', 1, 0),
      creditHours: getRowCellTextByKeyword(table, '学时', 3, 0),
      paperTeacherName: getRowCellTextByKeyword(table, '命题教师', 1, 1),
      departmentName: getRowCellTextByKeyword(table, '教研室', 3, 1),
      classNames: getRowCellTextByKeyword(table, '试卷使用班级', 1, 2),
      assessmentTypes: parseMultiInlineCheckboxValues(getRowCellTextByKeyword(table, '考核方式', 1, 3), assessmentTypeOptions),
      teacherSigner: parseSignerName(teacherSignLine, '命题教师签名'),
      teacherDate: parseDocDateLine(teacherSignLine),
      scopeResult: parseInlineCheckboxValue(getRowCellTextByKeyword(table, '命题范围', 1, 5), templateDefinitions[2].sections[1].fields[0].options ?? []),
      difficultyResult: parseInlineCheckboxValue(getRowCellTextByKeyword(table, '命题难度', 1, 6), templateDefinitions[2].sections[1].fields[1].options ?? []),
      weightResult: parseInlineCheckboxValue(getRowCellTextByKeyword(table, '命题份量', 1, 7), templateDefinitions[2].sections[1].fields[2].options ?? []),
      errorResult: parseInlineCheckboxValue(getRowCellTextByKeyword(table, '命题差错情况', 1, 8), templateDefinitions[2].sections[1].fields[3].options ?? []),
      errorFixResult: parseInlineCheckboxValue(getRowCellTextByKeyword(table, '命题差错情况', 1, 8), templateDefinitions[2].sections[1].fields[4].options ?? []),
      answerResult: parseInlineCheckboxValue(getRowCellTextByKeyword(table, '参考答案', 1, 9), templateDefinitions[2].sections[1].fields[5].options ?? []),
      abCoverageResult: parseInlineCheckboxValue(getRowCellTextByKeyword(table, 'A、B 两套试卷覆盖面', 1, 10), templateDefinitions[2].sections[1].fields[6].options ?? []),
      repeatRateResult: parseInlineCheckboxValue(getRowCellTextByKeyword(table, 'A、B 两套试卷试题重复率', 1, 11), templateDefinitions[2].sections[1].fields[7].options ?? []),
      unifiedPaperResult: parseInlineCheckboxValue(getRowCellTextByKeyword(table, '统一命题情况', 1, 12), templateDefinitions[2].sections[1].fields[8].options ?? []),
      overallResult: parseInlineCheckboxValue(getRowCellTextByKeyword(table, '总体意见', 1, 13), templateDefinitions[2].sections[1].fields[9].options ?? []),
      directorSigner: parseSignerName(directorSignLine, '签名：'),
      directorDate: parseDocDateLine(directorSignLine),
      deanOpinion: parseParagraphTextBeforeKeyword(deanLine.replace(/^教学院长审批意见：/, '').trim(), '签名：'),
      deanSigner: parseSignerName(deanLine, '签名：'),
      deanDate: parseDocDateLine(deanLine),
    },
  };
}

function hasFilledValue(value: unknown) {
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  return !(value == null || String(value).trim() === '');
}

function collectImportedFieldPaths(fields: TemplateField[], payload: Record<string, unknown>, prefix = '') {
  const paths: string[] = [];
  for (const field of fields) {
    const path = prefix ? `${prefix}.${field.id}` : field.id;
    const value = payload[field.id];
    if (field.type === 'repeater') {
      const rows = Array.isArray(value) ? value as Array<Record<string, unknown>> : [];
      if (rows.length) {
        paths.push(path);
      }
      rows.forEach((row, rowIndex) => {
        paths.push(...collectImportedFieldPaths(field.fields ?? [], row, `${path}.${rowIndex}`));
      });
      continue;
    }
    if (hasFilledValue(value)) {
      paths.push(path);
    }
  }
  return paths;
}

function buildImportedResult(templateId: string, payload: Record<string, unknown>): ImportedDocxTemplateResult {
  const template = templateDefinitions.find((item) => item.id === templateId);
  if (!template) {
    throw new Error('模板不存在');
  }
  return {
    templateId,
    payload,
    importedFieldPaths: collectImportedFieldPaths(template.sections.flatMap((section) => section.fields), payload),
  };
}

export async function importDocxTemplate(buffer: Buffer) {
  const document = await loadDocxDocumentFromBuffer(buffer);
  const bodyText = [
    ...getBodyParagraphs(document).map((item) => item.textContent?.replace(/\s+/g, ' ').trim() ?? ''),
    ...getTables(document).flatMap((table) => getRows(table).map((row) => getRowText(row))),
  ].join(' ');

  if (bodyText.includes('课程考核内容/方式合理性审核表')) {
    const result = await parseImportedRationalityReview(document);
    return buildImportedResult(result.templateId, result.payload);
  }
  if (bodyText.includes('试卷分析表')) {
    const result = await parseImportedExamAnalysis(document);
    return buildImportedResult(result.templateId, result.payload);
  }
  if (bodyText.includes('命题审查表')) {
    const result = await parseImportedPaperReview(document);
    return buildImportedResult(result.templateId, result.payload);
  }

  throw new Error('暂未识别该 DOCX 模板类型');
}

async function populateRationalityReview(editableDocx: EditableDocx, payload: Record<string, unknown>) {
  const tables = getTables(editableDocx.document);
  const table = tables[0];
  if (!table) {
    throw new Error('合理性审核表模板结构异常');
  }

  const assessmentHeaderIndex = findRowIndex(table, '考核方式与考核内容');
  const examHeaderIndex = findRowIndex(table, '结课考试试卷命题内容');
  const reviewHeaderIndex = findRowIndex(table, '教研室主任审核意见');
  const deanHeaderIndex = findRowIndex(table, '教学院长审核意见');
  if (assessmentHeaderIndex < 0 || examHeaderIndex < 0 || reviewHeaderIndex < 0 || deanHeaderIndex < 0) {
    throw new Error('合理性审核表模板定位失败');
  }

  const assessmentStartRow = assessmentHeaderIndex + 1;
  const examStartRow = examHeaderIndex + 1;
  const assessmentPlaceholderCount = examHeaderIndex - assessmentStartRow;
  const examPlaceholderCount = reviewHeaderIndex - examStartRow;
  const assessmentItems = repeatRows<Record<string, unknown>>(payload.assessmentItems);
  const examItems = repeatRows<Record<string, unknown>>(payload.examItems);
  const effectiveAssessmentRowCount = Math.max(assessmentItems.length, 1);

  setTableCellText(table, 0, 2, textValue(payload.departmentName));
  setTableCellText(table, 0, 4, textValue(payload.courseName));
  setTableCellText(table, 1, 2, textValue(payload.semesterName));
  setTableCellText(table, 1, 4, textValue(payload.majorGrade));
  setTableCellText(table, 2, 2, textValue(payload.creditHours));
  setTableCellText(table, 2, 4, textValue(payload.teacherName));
  setTableCellText(table, 2, 6, textValue(payload.paperTeacherName));

  fillRepeatingRows(table, assessmentStartRow, assessmentPlaceholderCount, assessmentItems, (row, item) => {
    setRowValues(row, [
      '',
      rowText(item ?? {}, 'goalName'),
      rowText(item ?? {}, 'assessmentMethod'),
      rowText(item ?? {}, 'assessmentContent'),
    ]);
  });

  const shiftedExamStartRow = examStartRow - (assessmentPlaceholderCount - effectiveAssessmentRowCount);
  fillRepeatingRows(table, shiftedExamStartRow, examPlaceholderCount, examItems, (row, item) => {
    setRowValues(row, [
      '',
      rowText(item ?? {}, 'goalName'),
      rowText(item ?? {}, 'knowledgePoint'),
      rowText(item ?? {}, 'scoreValue'),
      rowText(item ?? {}, 'partOne'),
      rowText(item ?? {}, 'partTwo'),
      rowText(item ?? {}, 'partThree'),
      rowText(item ?? {}, 'partFour'),
      rowText(item ?? {}, 'partFive'),
      rowText(item ?? {}, 'partSix'),
      rowText(item ?? {}, 'partSeven'),
    ]);
  });

  const nextReviewHeaderIndex = findRowIndex(table, '教研室主任审核意见');
  const nextDeanHeaderIndex = findRowIndex(table, '教学院长审核意见');
  if (nextReviewHeaderIndex < 0 || nextDeanHeaderIndex < 0) {
    throw new Error('合理性审核表审核区定位失败');
  }

  setCellParagraphs(
    getCell(table, nextReviewHeaderIndex + 1, 1),
    buildOpinionParagraphs([
      { label: '考核内容符合课程教学大纲要求', options: rationalityComplianceOptions, value: textValue(payload.directorExamOutlineMatch) },
      { label: '考核内容支撑课程目标达成情况', options: rationalitySupportOptions, value: textValue(payload.directorExamGoalSupport) },
      { label: '题量、命题难度', options: rationalityReasonableOptions, value: textValue(payload.directorExamDifficulty) },
      { label: '题型', options: rationalityReasonableOptions, value: textValue(payload.directorExamType) },
      { label: '试卷文字、公式、图表等清晰准确', options: rationalityComplianceOptions, value: textValue(payload.directorExamClarity) },
      { label: '参考答案和评分标准细则', options: rationalityReasonableOptions, value: textValue(payload.directorExamAnswer) },
      { label: 'A/B 试卷重复率、难度', options: rationalityRequirementOptions, value: textValue(payload.directorExamABMatch) },
    ]),
  );
  setCellParagraphs(
    getCell(table, nextReviewHeaderIndex + 3, 1),
    buildOpinionParagraphs([
      { label: '考核内容符合课程教学大纲要求', options: rationalityComplianceOptions, value: textValue(payload.directorOtherOutlineMatch) },
      { label: '考核内容支撑课程目标达成情况', options: rationalitySupportOptions, value: textValue(payload.directorOtherContentSupport) },
      { label: '考核方式支撑课程目标达成情况', options: rationalitySupportOptions, value: textValue(payload.directorOtherMethodSupport) },
    ]),
  );
  setCellParagraphsWithSignature(editableDocx, getCell(table, nextReviewHeaderIndex + 4, 1), [
    {
      prefix: buildApprovalPrefix(rationalityDirectorConclusionOptions, textValue(payload.directorConclusion)),
      signatureImage: await readSignatureImage(textValue(payload.directorSigner)),
      signerName: textValue(payload.directorSigner),
      suffix: `      ${formatDocDate(textValue(payload.directorDate))}`,
    },
  ]);
  setCellParagraphsWithSignature(editableDocx, getCell(table, nextDeanHeaderIndex, 1), [
    {
      prefix: buildApprovalPrefix(finalDecisionOptions, textValue(payload.deanDecision)),
      signatureImage: await readSignatureImage(textValue(payload.deanSigner)),
      signerName: textValue(payload.deanSigner),
      suffix: `      ${formatDocDate(textValue(payload.deanDate))}`,
    },
  ]);
}

async function populateExamAnalysis(editableDocx: EditableDocx, payload: Record<string, unknown>) {
  const bodyParagraphs = getBodyParagraphs(editableDocx.document);
  if (bodyParagraphs[1]) {
    setParagraphText(bodyParagraphs[1], textValue(payload.semesterLabel));
  }

  const tables = getTables(editableDocx.document);
  const table1 = tables[0];
  const table2 = tables[1];
  if (!table1 || !table2) {
    throw new Error('试卷分析模板结构异常');
  }

  setTableCellText(table1, 0, 1, textValue(payload.collegeName));
  setTableCellText(table1, 0, 3, textValue(payload.courseName));
  setTableCellText(table1, 0, 5, textValue(payload.courseCode));
  setTableCellText(table1, 1, 1, textValue(payload.majorClass));
  setTableCellText(table1, 1, 3, textValue(payload.teacherName));
  setTableCellText(table1, 1, 5, textValue(payload.assessmentMethod));
  setTableCellText(table1, 2, 1, textValue(payload.shouldAttendCount));
  setTableCellText(table1, 2, 3, textValue(payload.actualAttendCount));
  setTableCellText(table1, 2, 5, textValue(payload.absentCount));
  setTableCellText(table1, 2, 7, formatSquareCheckboxLine(analysisReviewMethodOptions, textValue(payload.reviewMethod)));

  setTableCellText(table1, 3, 2, textValue(payload.highestScore));
  setTableCellText(table1, 3, 4, textValue(payload.lowestScore));
  setTableCellText(table1, 3, 6, textValue(payload.averageScore));
  setTableCellText(table1, 3, 8, textValue(payload.standardDeviation));
  setTableCellText(table1, 5, 2, textValue(payload.excellentCount));
  setTableCellText(table1, 5, 3, textValue(payload.goodCount));
  setTableCellText(table1, 5, 4, textValue(payload.mediumCount));
  setTableCellText(table1, 5, 5, textValue(payload.passCount));
  setTableCellText(table1, 5, 6, textValue(payload.failCount));
  setTableCellText(table1, 6, 2, textValue(payload.excellentRate));
  setTableCellText(table1, 6, 3, textValue(payload.goodRate));
  setTableCellText(table1, 6, 4, textValue(payload.mediumRate));
  setTableCellText(table1, 6, 5, textValue(payload.passRate));
  setTableCellText(table1, 6, 6, textValue(payload.failRate));

  const questionItems = repeatRows<Record<string, unknown>>(payload.questionItems).slice(0, 8);
  const questionTypeRow = getRows(table1)[8];
  const scoreRow = getRows(table1)[9];
  if (questionTypeRow && scoreRow) {
    const questionTypeCells = getCells(questionTypeRow);
    const scoreCells = getCells(scoreRow);
    for (let index = 1; index < questionTypeCells.length; index += 1) {
      const item = questionItems[index - 1];
      setCellParagraphs(questionTypeCells[index], [{ text: rowText(item ?? {}, 'questionType') }]);
      setCellParagraphs(scoreCells[index], [{ text: rowText(item ?? {}, 'scoreValue') }]);
    }
  }

  setTableCellText(table1, 10, 1, textValue(payload.objectiveScore));
  setTableCellText(table1, 10, 3, textValue(payload.subjectiveScore));
  setCellParagraphs(getCell(table1, 11, 1), [{ text: textValue(payload.analysisPartOne) }]);
  setCellParagraphs(getCell(table2, 0, 1), [{ text: textValue(payload.analysisPartTwo) }]);
  setCellParagraphsWithSignature(editableDocx, getCell(table2, 1, 0), [
    { text: textValue(payload.directorOpinion) },
    {
      prefix: '负责人签名：',
      signatureImage: await readSignatureImage(textValue(payload.directorSigner)),
      signerName: textValue(payload.directorSigner),
      suffix: `    ${formatDocDate(textValue(payload.directorDate))}`,
      align: 'right',
    },
  ]);
  setCellParagraphsWithSignature(editableDocx, getCell(table2, 2, 0), [
    { text: textValue(payload.collegeOpinion) },
    {
      prefix: '负责人签名：',
      signatureImage: await readSignatureImage(textValue(payload.collegeSigner)),
      signerName: textValue(payload.collegeSigner),
      suffix: `    ${formatDocDate(textValue(payload.collegeDate))}`,
      align: 'right',
    },
  ]);
}

async function populatePaperReview(editableDocx: EditableDocx, payload: Record<string, unknown>) {
  const bodyParagraphs = getBodyParagraphs(editableDocx.document);
  if (bodyParagraphs[1]) {
    setParagraphText(bodyParagraphs[1], `学院：${textValue(payload.collegeName)}                                  学年学期：${textValue(payload.semesterLabel)}`);
  }

  const table = getTables(editableDocx.document)[0];
  if (!table) {
    throw new Error('试卷命题审查表模板结构异常');
  }

  setTableCellText(table, 0, 1, textValue(payload.courseName));
  setTableCellText(table, 0, 3, textValue(payload.creditHours));
  setTableCellText(table, 1, 1, textValue(payload.paperTeacherName));
  setTableCellText(table, 1, 3, textValue(payload.departmentName));
  setTableCellText(table, 2, 1, textValue(payload.classNames));
  setTableCellText(table, 3, 1, formatMultiCheckboxLine(assessmentTypeOptions, listValue(payload.assessmentTypes).map((item) => String(item))));
  setCellParagraphsWithSignature(editableDocx, getCell(table, 4, 0), [
    {
      text: `以上由命题教师填写              命题教师签名`,
    },
    {
      prefix: '',
      signatureImage: await readSignatureImage(textValue(payload.teacherSigner)),
      signerName: textValue(payload.teacherSigner),
      suffix: `    ${formatDocDate(textValue(payload.teacherDate))}`,
      align: 'right',
    },
  ]);

  setTableCellText(table, 5, 1, formatCheckboxLine(templateDefinitions[2].sections[1].fields[0].options ?? [], textValue(payload.scopeResult)));
  setTableCellText(table, 6, 1, formatCheckboxLine(templateDefinitions[2].sections[1].fields[1].options ?? [], textValue(payload.difficultyResult)));
  setTableCellText(table, 7, 1, formatCheckboxLine(templateDefinitions[2].sections[1].fields[2].options ?? [], textValue(payload.weightResult)));
  setTableCellText(
    table,
    8,
    1,
    `${formatCheckboxLine(templateDefinitions[2].sections[1].fields[3].options ?? [], textValue(payload.errorResult))}  有差错的更改情况：${formatCheckboxLine(templateDefinitions[2].sections[1].fields[4].options ?? [], textValue(payload.errorFixResult))}`,
  );
  setTableCellText(table, 9, 1, formatCheckboxLine(templateDefinitions[2].sections[1].fields[5].options ?? [], textValue(payload.answerResult)));
  setTableCellText(table, 10, 1, formatCheckboxLine(templateDefinitions[2].sections[1].fields[6].options ?? [], textValue(payload.abCoverageResult)));
  setTableCellText(table, 11, 1, formatCheckboxLine(templateDefinitions[2].sections[1].fields[7].options ?? [], textValue(payload.repeatRateResult)));
  setTableCellText(table, 12, 1, formatCheckboxLine(templateDefinitions[2].sections[1].fields[8].options ?? [], textValue(payload.unifiedPaperResult)));
  setTableCellText(table, 13, 1, formatCheckboxLine(templateDefinitions[2].sections[1].fields[9].options ?? [], textValue(payload.overallResult)));
  setCellParagraphsWithSignature(editableDocx, getCell(table, 14, 0), [
    {
      text: '以上由教研室主任审核填写',
    },
    {
      prefix: '签名：',
      signatureImage: await readSignatureImage(textValue(payload.directorSigner)),
      signerName: textValue(payload.directorSigner),
      suffix: `    ${formatDocDate(textValue(payload.directorDate))}`,
      align: 'right',
    },
  ]);
  setCellParagraphsWithSignature(editableDocx, getCell(table, 15, 0), [
    { text: `教学院长审批意见：${textValue(payload.deanOpinion)}` },
    {
      prefix: '签名：',
      signatureImage: await readSignatureImage(textValue(payload.deanSigner)),
      signerName: textValue(payload.deanSigner),
      suffix: `    ${formatDocDate(textValue(payload.deanDate))}`,
      align: 'right',
    },
  ]);
}

const templatePopulators: Record<string, (editableDocx: EditableDocx, payload: Record<string, unknown>) => Promise<void>> = {
  'rationality-review': populateRationalityReview,
  'exam-analysis': populateExamAnalysis,
  'paper-review': populatePaperReview,
};

export function listDocxTemplateDefinitions() {
  return templateDefinitions;
}

export function getDocxTemplateDefinition(templateId: string) {
  return templateDefinitions.find((item) => item.id === templateId) ?? null;
}

function cloneTemplateValue(field: TemplateField, value: unknown): unknown {
  if (field.type === 'checkboxGroup') {
    return Array.isArray(value) ? value.map((item) => String(item)) : [];
  }
  if (field.type === 'repeater') {
    const rows = Array.isArray(value) ? value as Array<Record<string, unknown>> : [];
    return rows.map((row) =>
      (field.fields ?? []).reduce<Record<string, unknown>>((result, childField) => {
        result[childField.id] = cloneTemplateValue(childField, row?.[childField.id]);
        return result;
      }, {}),
    );
  }
  return value == null ? '' : String(value);
}

export function createTemplatePayloadDefaults(templateId: string) {
  const template = getDocxTemplateDefinition(templateId);
  if (!template) {
    throw new Error('模板不存在');
  }
  return template.sections.reduce<Record<string, unknown>>((result, section) => {
    section.fields.forEach((field) => {
      result[field.id] = field.type === 'checkboxGroup' ? [] : field.type === 'repeater' ? [] : '';
    });
    return result;
  }, {});
}

export function mergeTemplatePayloadByOwners(
  templateId: string,
  basePayload: Record<string, unknown>,
  incomingPayload: Record<string, unknown>,
  allowedOwners: string[],
) {
  const template = getDocxTemplateDefinition(templateId);
  if (!template) {
    throw new Error('模板不存在');
  }
  const allowedOwnerSet = new Set(allowedOwners);
  const nextPayload = { ...basePayload };

  const mergeField = (field: TemplateField, container: Record<string, unknown>, source: Record<string, unknown>) => {
    const owner = field.owner ?? 'teacher';
    if (!allowedOwnerSet.has(owner)) {
      return;
    }
    container[field.id] = cloneTemplateValue(field, source[field.id]);
  };

  for (const section of template.sections) {
    for (const field of section.fields) {
      mergeField(field, nextPayload, incomingPayload);
    }
  }

  return nextPayload;
}

export async function listSignatureNames() {
  const entries = await fs.readdir(SIGNATURE_DIR, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.png'))
    .map((entry) => entry.name.replace(/\.png$/i, ''))
    .sort((left, right) => left.localeCompare(right, 'zh-CN'));
}

export async function generateDocxTemplate(templateId: string, payload: Record<string, unknown>) {
  const templateDefinition = templateDefinitions.find((item) => item.id === templateId);
  const templatePopulator = templatePopulators[templateId];
  if (!templateDefinition || !templatePopulator) {
    throw new Error('模板不存在');
  }

  const editableDocx = await loadEditableDocx(path.join(TEMPLATE_PUBLIC_DIR, templateDefinition.fileName));
  await templatePopulator(editableDocx, payload);
  const buffer = await saveEditableDocx(editableDocx);

  return {
    buffer,
    fileName: `${templateDefinition.name}-${Date.now()}.docx`,
  };
}
