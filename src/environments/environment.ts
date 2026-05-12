// This file can be replaced during build by using the `fileReplacements` array.
// `ng build` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

export const environment = {
  production: false,
  appName: 'SvayamExpense',
  apiBaseUrl: 'http://localhost:3000/api',
  /**
   * Optional **origin only** (e.g. `http://localhost:3000`) when `/uploads/...` must be prefixed manually.
   * Do **not** include `/uploads` here — paths already use `/uploads/{receipt_path}`.
   * Empty string: receipt URLs come from `apiBaseUrl` origin + `/uploads/...`, or same-host `/uploads/...` via proxy.
   */
  uploadsOrigin: ''
};

/*
 * For easier debugging in development mode, you can import the following file
 * to ignore zone related error stack frames such as `zone.run`, `zoneDelegate.invokeTask`.
 *
 * This import should be commented out in production mode because it will have a negative impact
 * on performance if an error is thrown.
 */
// import 'zone.js/plugins/zone-error';  // Included with Angular CLI.
