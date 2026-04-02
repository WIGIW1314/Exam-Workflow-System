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
  const result = await mammoth.convertToHtml(
    { buffer },
    {
      // Keep intentional blank lines in exam papers for better visual parity.
      ignoreEmptyParagraphs: false,
      styleMap: [
        "p[style-name='标题 1'] => h1:fresh",
        "p[style-name='标题 2'] => h2:fresh",
        "p[style-name='标题 3'] => h3:fresh",
        "p[style-name='Heading 1'] => h1:fresh",
        "p[style-name='Heading 2'] => h2:fresh",
        "p[style-name='Heading 3'] => h3:fresh",
      ],
    },
  );
  return result.value;
}

export function buildPaperDir(semesterCode: string, departmentCode: string, teacherName: string) {
  return path.join(env.uploadDir, semesterCode, departmentCode, teacherName);
}

export async function copyFile(source: string, target: string) {
  await ensureDir(path.dirname(target));
  await fs.copyFile(source, target);
}
