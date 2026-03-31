import fs from 'node:fs/promises';
import path from 'node:path';
import multer from 'multer';
import type { NextFunction, Request, Response } from 'express';
import { fileTypeFromBuffer } from 'file-type';
import { MAX_UPLOAD_SIZE } from '@exam-workflow/shared';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_UPLOAD_SIZE,
  },
});

export const uploadDocx = [
  upload.single('file'),
  async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (!req.file) {
        throw new AppError('请上传 DOCX 文件', 400);
      }

      const type = await fileTypeFromBuffer(req.file.buffer);
      const extension = path.extname(req.file.originalname).toLowerCase();
      if (extension !== '.docx' || (type && type.mime !== 'application/zip' && !type.mime.includes('officedocument'))) {
        throw new AppError('仅支持上传 DOCX 格式文件', 400);
      }

      await fs.mkdir(env.uploadDir, { recursive: true });
      next();
    } catch (error) {
      next(error);
    }
  },
];
