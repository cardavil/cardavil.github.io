#!/usr/bin/env node
// Publica el sitio en GitHub Pages: revisa que la rama no lleve nada privado y hace git push a origin con el
// token de CLAUDE_CV_GITHUB, que nunca se imprime ni se guarda. git lo pide por GIT_ASKPASS
// (scripts/credencial-git.sh), que se lo entrega por la tubería; cualquier otro gestor de credenciales queda
// desactivado para que no se abran ventanas.
// Uso: node scripts/subir.mjs [rama]   (por defecto main)
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const rama = process.argv[2] ?? 'main';
const git = (...args) => execFileSync('git', args, { cwd: RAIZ, encoding: 'utf8' }).trim();
const fallar = (msg) => { console.error(`subir: ${msg}`); process.exit(1); };

if (!process.env.CLAUDE_CV_GITHUB) fallar('CLAUDE_CV_GITHUB no está definida en el entorno de este proceso');

// 1. Nada privado en la rama: contexto, material de trabajo, documentos de referencia, copias sin verificar.
const PRIVADO = /^(CLAUDE\.md|trabajo\/|capturas\/|infra\/)|\.(pdf|docx)$|settings\.local\.json$/i;
const privados = git('ls-tree', '-r', '--name-only', rama).split('\n').filter((f) => PRIVADO.test(f));
if (privados.length) fallar(`la rama ${rama} lleva archivos privados: ${privados.join(', ')}`);

// 2. Ni datos personales ni nombres de clientes en el contenido. Las marcas a buscar viven en
//    trabajo/marcas-privadas.txt (una expresión regular por línea), que no se publica: escribirlas aquí
//    las expondría. Sin ese archivo no se publica.
const archivoMarcas = join(RAIZ, 'trabajo', 'marcas-privadas.txt');
if (!existsSync(archivoMarcas)) fallar('falta trabajo/marcas-privadas.txt con las marcas privadas a buscar');
const hallado = spawnSync('git', ['grep', '-I', '-l', '-E', '-f', archivoMarcas, rama, '--', '.'], { cwd: RAIZ, encoding: 'utf8' });
if (hallado.status === 0) fallar(`hay datos privados en: ${hallado.stdout.trim().split('\n').join(', ')}`);
if (hallado.status !== 1) fallar('no se pudo revisar el contenido con git grep');

// 3. Push con el token por GIT_ASKPASS (barras normales: Git para Windows ejecuta el script con su sh).
const askpass = join(RAIZ, 'scripts', 'credencial-git.sh').replace(/\\/g, '/');
const push = spawnSync('git', ['-c', 'credential.helper=', 'push', '-u', 'origin', rama], {
  cwd: RAIZ,
  stdio: ['ignore', 'inherit', 'inherit'],
  env: { ...process.env, GIT_ASKPASS: askpass, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' },
  timeout: 120_000,
});
if (push.status !== 0) fallar('git push falló (revisa que el token tenga permiso de escritura sobre Contents)');

console.log(`subir: ${rama} publicado → ${git('rev-parse', '--short', rama)}`);
