// logger.js

const originalConsole = {
  log: console.log,
  warn: console.warn,
  info: console.info,
  error: console.error
};

export const IS_PRODUCTION = !(
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1' ||
  window.location.hostname === '[::1]' ||
  window.location.hostname === '0.0.0.0' ||
  window.location.hostname.startsWith('192.168.') ||
  window.location.hostname.startsWith('10.') ||
  window.location.hostname.startsWith('172.') ||
  window.location.hostname.endsWith('.local')
);

export const logger = {
  log: (...args) => {
    if (!IS_PRODUCTION) {
      originalConsole.log('[APP]', ...args);
    }
  },
  info: (...args) => {
    if (!IS_PRODUCTION) {
      originalConsole.info('[APP]', ...args);
    }
  },
  warn: (...args) => {
    if (!IS_PRODUCTION) {
      originalConsole.warn('[APP]', ...args);
    }
  },
  error: (...args) => {
    originalConsole.error('[APP]', ...args);
  }
};

// Silence third-party warnings and debug logs in production
if (IS_PRODUCTION) {
  console.log = () => {};
  console.warn = () => {};
  console.info = () => {};
}
