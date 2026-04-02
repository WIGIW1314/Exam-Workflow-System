import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { uploadDocx } from '../middlewares/upload.js';
import { generateDocxTemplate, importDocxTemplate, listDocxTemplateDefinitions, listSignatureNames } from '../services/docx-template-service.js';
import { AppError } from '../utils/errors.js';
import { ok } from '../utils/response.js';

const router = Router();

router.use(requireAuth);

router.get('/', async (_req, res, next) => {
  try {
    const [templates, signatures] = await Promise.all([
      Promise.resolve(listDocxTemplateDefinitions()),
      listSignatureNames(),
    ]);
    ok(res, {
      templates,
      signatures,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/import', ...uploadDocx, async (req, res, next) => {
  try {
    if (!req.file) {
      throw new AppError('请上传 DOCX 文件', 400);
    }
    const result = await importDocxTemplate(req.file.buffer);
    ok(res, result, 'DOCX 识别成功');
  } catch (error) {
    next(error);
  }
});

router.post('/:templateId/generate', async (req, res, next) => {
  try {
    const templateId = String(req.params.templateId);
    const payload = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : null;
    if (!payload) {
      throw new AppError('模板表单数据无效', 400);
    }

    const result = await generateDocxTemplate(templateId, payload);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(result.fileName)}`);
    res.send(result.buffer);
  } catch (error) {
    next(error);
  }
});

export default router;
