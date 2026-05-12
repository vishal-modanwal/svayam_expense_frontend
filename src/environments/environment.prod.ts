export const environment = {
  production: true,
  appName: 'SvayamExpense',
  apiBaseUrl: '/api',
  /**
   * Origin only if uploads live on another host; never include `/uploads` (path is added in code).
   * Empty: same deployment serves `/api` and `/uploads` (relative `apiBaseUrl`).
   */
  uploadsOrigin: ''
};
