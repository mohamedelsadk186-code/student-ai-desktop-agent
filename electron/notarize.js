const { notarize } = require('@electron/notarize');
const path = require('node:path');

module.exports = async function notarizeRelease(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const { appOutDir } = context;
  const appPath = path.join(appOutDir, `${context.packager.appInfo.productFilename}.app`);
  const appleId = process.env.APPLE_ID;
  const appleIdPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD;
  const teamId = process.env.APPLE_TEAM_ID;

  if (!appleId || !appleIdPassword || !teamId) {
    console.warn('Skipping macOS notarization: set APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, and APPLE_TEAM_ID.');
    return;
  }

  await notarize({ appBundleId: context.packager.appInfo.id, appPath, appleId, appleIdPassword, teamId });
};