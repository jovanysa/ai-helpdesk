/** What a handler wants sent back; the Express router turns it into a response. */
export interface ApiResult {
  status: number;
  body?: unknown;
  setCookie?: string;
}
