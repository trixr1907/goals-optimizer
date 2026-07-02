export const APP_BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export function appPath(path: string): string {
  if (!path.startsWith('/')) return `${APP_BASE_PATH}/${path}`;
  return `${APP_BASE_PATH}${path}`;
}

export function apiPath(path: string): string {
  return appPath(path);
}
