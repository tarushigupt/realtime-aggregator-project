// src/utils/httpRetry.ts
import axios, { AxiosRequestConfig, AxiosResponse } from "axios";

export async function axiosGetWithRetry<T>(
  url: string,
  config: AxiosRequestConfig = {},
  maxRetries = 5,
  baseDelayMs = 500
): Promise<AxiosResponse<T>> {
  let attempt = 0;
  while (true) {
    try {
      const resp = await axios.get<T>(url, config);
      return resp;
    } catch (err: any) {
      attempt++;
      const status = err?.response?.status;
      // Retry on network errors, 429, and 5xx
      const shouldRetry =
        !err.response || status === 429 || (status >= 500 && status < 600);

      if (!shouldRetry || attempt > maxRetries) {
        throw err;
      }

      // Exponential backoff with jitter
      const delay = Math.round(baseDelayMs * Math.pow(2, attempt - 1));
      const jitter = Math.round(Math.random() * baseDelayMs);
      const sleepMs = delay + jitter;
      await new Promise((r) => setTimeout(r, sleepMs));
    }
  }
}
