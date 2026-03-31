import dayjs from 'dayjs';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../utils/errors.js';

export async function generatePaperNumber(semesterId: string) {
  return prisma.$transaction(async (tx) => {
    const rule = await tx.numberRule.findUnique({ where: { semesterId } });
    if (!rule) {
      throw new AppError('当前学期尚未配置试卷编号规则', 400);
    }

    const nextSeq = rule.currentSeq + 1;
    const datePart = dayjs().format(rule.dateFormat);
    const seqPart = String(nextSeq).padStart(rule.seqLength, '0');
    const paperNumber = `${rule.prefix}${rule.separator}${datePart}${rule.separator}${seqPart}`;

    await tx.numberRule.update({
      where: { id: rule.id },
      data: {
        currentSeq: nextSeq,
        example: `${rule.prefix}${rule.separator}${datePart}${rule.separator}${String(1).padStart(rule.seqLength, '0')}`,
      },
    });

    return paperNumber;
  });
}
