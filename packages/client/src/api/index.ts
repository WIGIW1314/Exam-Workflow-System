import { saveAs } from 'file-saver';
import { http } from './http';

export async function apiGet<T>(url: string, params?: Record<string, unknown>) {
  const { data } = await http.get<{ data: T }>(url, { params });
  return data.data;
}

export async function apiPost<T>(url: string, body?: unknown, config?: Record<string, unknown>) {
  const { data } = await http.post<{ data: T }>(url, body, config);
  return data.data;
}

export async function apiPut<T>(url: string, body?: unknown) {
  const { data } = await http.put<{ data: T }>(url, body);
  return data.data;
}

export async function apiDelete<T>(url: string) {
  const { data } = await http.delete<{ data: T }>(url);
  return data.data;
}

export async function downloadFile(url: string, filename: string, params?: Record<string, unknown>) {
  const response = await http.get(url, {
    params,
    responseType: 'blob',
  });
  saveAs(response.data, filename);
}

export async function fetchFileBuffer(url: string, params?: Record<string, unknown>) {
  const response = await http.get<ArrayBuffer>(url, {
    params,
    responseType: 'arraybuffer',
  });
  return response.data;
}

function resolveDownloadFilename(headerValue: string | undefined, fallbackName: string) {
  if (!headerValue) {
    return fallbackName;
  }
  const utf8Match = headerValue.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1]);
  }
  const plainMatch = headerValue.match(/filename="?([^"]+)"?/i);
  return plainMatch?.[1] ?? fallbackName;
}

export async function downloadFileByPost(url: string, body: unknown, fallbackName: string) {
  const response = await http.post<Blob>(url, body, {
    responseType: 'blob',
  });
  const contentDisposition = response.headers['content-disposition'] as string | undefined;
  saveAs(response.data, resolveDownloadFilename(contentDisposition, fallbackName));
}

export async function uploadFile<T>(url: string, file: File, extraFields?: Record<string, string>) {
  const formData = new FormData();
  formData.append('file', file);
  Object.entries(extraFields ?? {}).forEach(([key, value]) => {
    formData.append(key, value);
  });
  const { data } = await http.post<{ data: T }>(url, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return data.data;
}
