import { cosmiconfigSync } from 'cosmiconfig';
import defaultsDeep from 'lodash.defaultsdeep';
import path from 'path';
import { SettingsOptions, InitializationOptions } from './types';
import { getDefaultConfig } from './validations';

function getConfig(initializationOptions: InitializationOptions = {}): SettingsOptions {
  const explorerSync = cosmiconfigSync('elder');
  const explorerSearch = explorerSync.search();
  let loadedConfig: InitializationOptions = {};
  if (explorerSearch && explorerSearch.config) {
    loadedConfig = explorerSearch.config;
  }

  const config: SettingsOptions = defaultsDeep(initializationOptions, loadedConfig, getDefaultConfig());

  const rootDir = config.rootDir === 'process.cwd()' ? process.cwd() : path.resolve(config.rootDir);
  config.rootDir = rootDir;
  config.srcDir = path.resolve(rootDir, `./${config.srcDir}`);
  config.distDir = path.resolve(rootDir, `./${config.distDir}`);

  config.context = typeof initializationOptions.context !== 'undefined' ? initializationOptions.context : 'unknown';
  config.server = initializationOptions.context === 'server' && config.server;
  config.build = initializationOptions.context === 'build' && config.build;
  config.worker = !!initializationOptions.worker;

  const ssrComponents = path.resolve(config.rootDir, './___ELDER___/compiled/');
  const clientComponents = path.resolve(config.distDir, './svelte/');

  config.$$internal = {
    ssrComponents,
    clientComponents,
  };

  if (config.origin === '') {
    console.error(
      `WARN: Remember to put a valid "origin" in your elder.config.js. This should be a fully qualified domain. This is frequently used plugins and leaving it blank can cause SEO headaches.`,
    );
  }

  return config;
}

export default getConfig;
