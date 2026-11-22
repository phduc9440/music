/**
 * Hook nạp module cho test Editor trên Node:
 * - import tương đối không đuôi ('../core/commands') → thử thêm .ts rồi /index.ts như Vite;
 * - src/i18n/core.ts dùng import.meta.glob của Vite → thay bằng bảng chuỗi do setup.mjs nạp sẵn.
 */
import { existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const isFile = (url) => {
  try {
    return statSync(fileURLToPath(url)).isFile();
  } catch {
    return false;
  }
};

export async function resolve(specifier, context, nextResolve) {
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL?.startsWith('file:')) {
    const base = new URL(specifier, context.parentURL);
    if (!isFile(base)) {
      for (const suffix of ['.ts', '.tsx', '/index.ts']) {
        const candidate = new URL(base.href + suffix);
        if (existsSync(fileURLToPath(candidate))) return nextResolve(candidate.href, context);
      }
    }
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context);
  if (url.endsWith('/src/i18n/core.ts')) {
    const source = String(result.source).replace(/import\.meta\.glob<[^(]*\([^)]*\)/, 'globalThis.__I18N_MODULES__');
    return { ...result, source };
  }
  return result;
}
