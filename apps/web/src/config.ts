import { loadWebConfig } from '@construction-erp/config';

export const webConfig = loadWebConfig({
  MODE: import.meta.env.MODE,
  VITE_APP_NAME: import.meta.env.VITE_APP_NAME,
  VITE_API_BASE_URL: import.meta.env.VITE_API_BASE_URL
});
