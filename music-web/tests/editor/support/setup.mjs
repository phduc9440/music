/** Nạp trước mọi test Editor: DOM XML tối giản, bảng chuỗi i18n và hook giải tên module. */
import { readdirSync, readFileSync } from 'node:fs';
import { register } from 'node:module';
import { fileURLToPath } from 'node:url';

import './dom.mjs';

const localesDir = fileURLToPath(new URL('../../../src/locales/', import.meta.url));
const modules = {};
for (const lang of readdirSync(localesDir)) {
  for (const file of readdirSync(localesDir + lang)) {
    if (file.endsWith('.json')) {
      modules[`../locales/${lang}/${file}`] = {
        default: JSON.parse(readFileSync(`${localesDir}${lang}/${file}`, 'utf8')),
      };
    }
  }
}
globalThis.__I18N_MODULES__ = modules;

register('./hooks.mjs', import.meta.url);
