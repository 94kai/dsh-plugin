import { readdir, readFile, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const root = new URL('../', import.meta.url);
async function check(directory) {
  for (const entry of await readdir(new URL(directory, root), { withFileTypes: true })) {
    const name = `${directory}${entry.name}`;
    if (entry.isDirectory()) await check(`${name}/`);
    else if (/\.(js|mjs)$/.test(name)) {
      const result = spawnSync(process.execPath, ['--check', new URL(name, root).pathname], { stdio: 'inherit' });
      if (result.status !== 0) throw new Error(`Syntax check failed: ${name}`);
    }
  }
}
for (const directory of ['features/', 'scripts/', 'tests/', 'dist/']) await check(directory);
const pkg = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
for (const path of Object.values(pkg.exports)) if (!path.includes('*')) await access(new URL(path, root));
for (const [key, path] of Object.entries(pkg.exports)) {
  if (!key.includes('locale')) continue;
  for (const language of ['zh', 'en']) {
    const value = JSON.parse(await readFile(new URL(path.replace('*', language), root), 'utf8'));
    if (!value.meta?.title || !value.meta?.description) throw new Error(`Missing localized metadata: ${key} (${language})`);
  }
}
console.log('Syntax, exported runtime resources and localized metadata checked.');
