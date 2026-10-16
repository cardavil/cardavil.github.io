// Niega dar acceso por otra vía que no sea un token del proyecto: inicios de sesión interactivos, guardar
// credenciales en git y usuario o clave dentro de una URL.
import { tramos, subcomandoGit } from '../lib/comando.mjs';

const URL_CON_CREDENCIAL = /\bhttps?:\/\/[^\s/@'"]+@/i;
const AYUDANTES_QUE_GUARDAN = /^(store|cache|manager|manager-core|wincred|osxkeychain|libsecret)\b/i;
const LANZADORES = new Set(['npx', 'pnpm', 'bunx', 'yarn']);
const LOGIN_SIMPLE = new Set(['wrangler', 'vercel', 'netlify', 'firebase', 'docker', 'heroku', 'az']);

const niega = (motivo) => ({ decision: 'deny', motivo: `${motivo} El acceso va solo por el token del proyecto, en su variable de entorno.` });

/** La CLI y sus argumentos, aunque vaya lanzada por npx, pnpm dlx o yarn. */
function cli(t) {
  if (!LANZADORES.has(t.nombre)) return { nombre: t.nombre, args: t.args };
  const i = t.args.findIndex((a) => !a.startsWith('-') && a !== 'dlx' && a !== 'exec');
  return i === -1 ? { nombre: '', args: [] } : { nombre: t.args[i].toLowerCase(), args: t.args.slice(i + 1) };
}

function iniciaSesion({ nombre, args }) {
  const [a, b, c] = args;
  if (nombre === 'gh') return a === 'auth' && ['login', 'token', 'setup-git', 'refresh'].includes(b);
  if (LOGIN_SIMPLE.has(nombre)) return a === 'login';
  if (nombre === 'npm') return a === 'login' || a === 'adduser';
  if (nombre === 'supabase') return a === 'login' && !args.includes('--token');
  if (nombre === 'aws') return a === 'configure' || a === 'login' || (a === 'sso' && b === 'login');
  if (nombre === 'gcloud') return a === 'auth' && (b === 'login' || (b === 'application-default' && c === 'login'));
  return false;
}

function guardaCredencial(git) {
  if (git.nombre === 'credential' && ['approve', 'store'].includes(git.args[0])) return true;
  if (/^credential-/.test(git.nombre)) return true;
  for (let i = 1; i < git.globales.length; i++) {
    const m = git.globales[i - 1] === '-c' && /^credential\.(?:.*\.)?helper=(.*)$/i.exec(git.globales[i]);
    if (m && AYUDANTES_QUE_GUARDAN.test(m[1])) return true;
  }
  if (git.nombre !== 'config') return false;
  const clave = git.args.findIndex((a) => /^credential\.(?:.*\.)?helper$/i.test(a));
  return clave !== -1 && AYUDANTES_QUE_GUARDAN.test(git.args[clave + 1] ?? '');
}

export function evaluar(evento) {
  const nombre = evento?.tool_name;
  const comando = evento?.tool_input?.command;
  if ((nombre !== 'Bash' && nombre !== 'PowerShell') || typeof comando !== 'string') return null;
  if (URL_CON_CREDENCIAL.test(comando)) return niega('El comando lleva usuario o clave dentro de una URL.');
  for (const t of tramos(comando, nombre)) {
    if (iniciaSesion(cli(t))) return niega('El comando inicia una sesión interactiva o pide un token a la CLI.');
    const git = subcomandoGit(t);
    if (git && guardaCredencial(git)) return niega('El comando guarda credenciales en git.');
  }
  return null;
}
