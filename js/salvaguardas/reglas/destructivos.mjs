// Niega lo que no tiene vuelta atrás: borrar en recursivo una raíz o la carpeta del usuario, y descartar con git el
// trabajo sin commitear. Descartar el árbol se permite dentro de un clon desechable del scratchpad.
import { tramos, subcomandoGit, normalizarRuta, resolverRuta, dentroDe } from '../lib/comando.mjs';

const BORRAR = new Set(['rm', 'rmdir', 'rd', 'del', 'erase', 'ri', 'remove-item']);
const BORRAR_CMD = new Set(['rd', 'rmdir', 'del', 'erase']);
const RECURSIVA = /^(?:--recursive|-[a-zA-Z]*[rR][a-zA-Z]*(?::\S*)?|\/s)$/i;
// Raíz: *, /, \, ~, ~usuario, $HOME, ${HOME}, $env:USERPROFILE, %USERPROFILE%, ., .., una unidad (C:, /c), solos o
// seguidos de una barra y de *.
const RAIZ = /^(?:\*|(?:~[\w-]*|\$HOME|\$\{HOME\}|\$env:USERPROFILE|%USERPROFILE%|\.\.?|[A-Za-z]:|\/[A-Za-z])?(?:[/\\]\*?)?)$/i;
const ARBOL_ENTERO = new Set(['.', './', ':/', '*', ':/*']);
const CAMBIAR_DIR = new Set(['cd', 'chdir', 'set-location', 'sl', 'pushd', 'push-location']);

function borraRaiz(t) {
  if (!BORRAR.has(t.nombre)) return false;
  const flagCmd = (a) => BORRAR_CMD.has(t.nombre) && /^\/[a-zA-Z]$/.test(a);
  if (!t.args.some((a) => RECURSIVA.test(a))) return false;
  return t.args.some((a) => a !== '' && !a.startsWith('-') && !flagCmd(a) && RAIZ.test(a));
}

/** Por qué este comando de git descarta trabajo, o null. */
function descarta(git) {
  const cortas = git.args.filter((a) => /^-[A-Za-z]+$/.test(a)).join('');
  if (git.nombre === 'reset' && git.args.includes('--hard')) return 'git reset --hard borra cambios sin commitear, también los de otra sesión';
  if (git.nombre === 'clean' && (cortas.includes('f') || git.args.some((a) => a === '--force'))) return 'git clean -f borra archivos que git no sigue, .env incluido';
  if ((git.nombre === 'checkout' || git.nombre === 'restore') && ARBOL_ENTERO.has(git.args.at(-1))) return 'descarta todos los cambios del árbol';
  return null;
}

export function evaluar(evento, contexto) {
  const nombre = evento?.tool_name;
  const comando = evento?.tool_input?.command;
  if ((nombre !== 'Bash' && nombre !== 'PowerShell') || typeof comando !== 'string') return null;

  const temp = contexto?.tempClaude ? normalizarRuta(contexto.tempClaude) : null;
  let cwd = normalizarRuta(evento.cwd ?? contexto?.raiz ?? '');
  for (const t of tramos(comando, nombre)) {
    if (borraRaiz(t)) {
      return { decision: 'deny', motivo: 'El comando borra en recursivo la raíz o la carpeta del usuario: no tiene vuelta atrás y no se ejecuta. Si de verdad hace falta, lo corre el propietario a mano.' };
    }
    if (!t.anidado && CAMBIAR_DIR.has(t.nombre)) {
      const destino = t.args.find((a) => !a.startsWith('-'));
      cwd = resolverRuta(cwd, destino);
      continue;
    }
    const git = subcomandoGit(t);
    const motivo = git && descarta(git);
    if (!motivo) continue;
    const dir = git.dir == null ? cwd : resolverRuta(cwd, git.dir);
    if (temp && dentroDe(dir, temp)) continue;
    return { decision: 'deny', motivo: `El comando ${motivo}: no se ejecuta. En un clon desechable del scratchpad sí se puede, con su ruta literal (git -C <ruta> …).` };
  }
  return null;
}
