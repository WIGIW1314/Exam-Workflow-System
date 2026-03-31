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
