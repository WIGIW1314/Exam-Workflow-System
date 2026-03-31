import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);
dayjs.extend(timezone);

export const APP_TIMEZONE = 'Asia/Shanghai';

export function formatDateTime(input?: string | Date | null, pattern = 'YYYY-MM-DD HH:mm:ss') {
  if (!input) {
    return '';
  }
  return dayjs(input).tz(APP_TIMEZONE).format(pattern);
}

export function formatDateTimeShort(input?: string | Date | null) {
  return formatDateTime(input, 'MM-DD HH:mm');
}
