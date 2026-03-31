import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone.js';
import utc from 'dayjs/plugin/utc.js';

dayjs.extend(utc);
dayjs.extend(timezone);

export const APP_TIMEZONE = 'Asia/Shanghai';

export function toAppTime(input?: dayjs.ConfigType) {
  return input ? dayjs(input).tz(APP_TIMEZONE) : dayjs().tz(APP_TIMEZONE);
}

export function formatDateTime(input: dayjs.ConfigType, pattern = 'YYYY-MM-DD HH:mm:ss') {
  return toAppTime(input).format(pattern);
}

export function formatIsoOffset(input: dayjs.ConfigType) {
  return toAppTime(input).format();
}
