// Learn more: https://docs.expo.dev/guides/customizing-metro/
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const packagesDir = path.resolve(projectRoot, '../../packages');

const config = getDefaultConfig(projectRoot);

// The shared packages (@platform/contracts, @platform/api-client) are linked from ../../packages,
// so Metro has to watch them.
config.watchFolders = [...(config.watchFolders ?? []), packagesDir];

// This app is NOT an npm workspace (Expo pins its own React version, the web app uses another).
// A bare import from a shared package (e.g. `zod`) must therefore resolve from THIS app's
// node_modules, not the repo root's, so the bundle holds one copy of each library.
const defaultResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = defaultResolve ?? context.resolveRequest;
  const isBare = !moduleName.startsWith('.') && !path.isAbsolute(moduleName);
  if (isBare && context.originModulePath.startsWith(packagesDir)) {
    return resolve(
      { ...context, originModulePath: path.join(projectRoot, 'package.json') },
      moduleName,
      platform,
    );
  }
  return resolve(context, moduleName, platform);
};

module.exports = config;
