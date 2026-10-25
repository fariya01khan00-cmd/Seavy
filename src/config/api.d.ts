export const API_URL: string;
export function buildApiUrl(path: string): string;
export function getApiEndpoint(path: string): string;
export function apiFetch(pathOrUrl: string, options?: RequestInit): Promise<Response>;
