import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const modelDirectory = join(projectRoot, 'node_modules', '@spotify', 'basic-pitch', 'model');
const targetDirectory = join(projectRoot, 'public', 'models', 'basic-pitch');
const modelPath = join(modelDirectory, 'model.json');
const model = JSON.parse(await readFile(modelPath, 'utf8'));
const weightFiles = [...new Set(model.weightsManifest.flatMap((group) => group.paths))];

await mkdir(dirname(targetDirectory), { recursive: true });
await mkdir(targetDirectory, { recursive: true });
await copyFile(modelPath, join(targetDirectory, 'model.json'));
await Promise.all(weightFiles.map((file) => copyFile(join(modelDirectory, file), join(targetDirectory, file))));
