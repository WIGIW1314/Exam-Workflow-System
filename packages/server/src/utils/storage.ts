import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import mammoth from 'mammoth';
import { env } from '../config/env.js';

export async function ensureDir(targetDir: string) {
  await fs.mkdir(targetDir, { recursive: true });
}

export async function getFileHash(filePath: string) {
  const buffer = await fs.readFile(filePath);
  return createHash('sha256').update(buffer).digest('hex');
}

export async function getPreviewHtml(filePath: string) {
  const buffer = await fs.readFile(filePath);
  const result = await mammoth.convertToHtml({ buffer });
  return result.value;
}

export function buildPaperDir(semesterCode: string, departmentCode: string, teacherName: string) {
  return path.join(env.uploadDir, semesterCode, departmentCode, teacherName);
}

export async function copyFile(source: string, target: string) {
  await ensureDir(path.dirname(target));
  await fs.copyFile(source, target);
}
