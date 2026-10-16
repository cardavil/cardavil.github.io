// Niega saltarse los candados de git: --no-verify, cambiar core.hooksPath, el push forzado, escribir en la rama
// principal por el MCP de GitHub y tocar .git/config o .git/hooks con cualquier herramienta.
import { tramos, subcomandoGit } from '../lib/comando.mjs';

const ESCRIBEN_EN_GITHUB = /^mcp__.+__(push_files|create_or_update_file|delete_file)$/;
const RUTA_GIT = /(^|[\\/])\.git[\\/](config|hooks)\b/i;
const FORZADO_LARGO = /^--(force(-with-lease|-if-includes)?(=.*)?|mirror)$/;

const niega = (motivo) => ({ decision: 'deny', motivo });
const mismoHooksPath = (valor, permitido) => valor.replace(/[\\/]+$/, '') === permitido.replace(/[\\/]+$/, '');

function hooksPathProhibido(git, permitido) {
  for (let i = 0; i < git.globales.length; i++) {
    const m = git.globales[i - 1] === '-c' && /^core\.hookspath=(.*)$/i.exec(git.globales[i]);
    if (m && !mismoHooksPath(m[1], permitido)) return true;
  }
  if (git.nombre !== 'config') return false;
  const clave = git.args.findIndex((a) => /^core\.hookspath$/i.test(a));
  if (clave === -1) return false;
  const quita = git.args.some((a) => /^(--unset(-all)?|--replace-all|--add)$/.test(a)) || git.args[0] === 'unset';
  const valor = git.args[clave + 1];
  return quita || (valor !== undefined && !valor.startsWith('-') && !mismoHooksPath(valor, permitido));
}

export function evaluar(evento, contexto) {
  const nombre = evento?.tool_name ?? '';
  const entrada = evento?.tool_input ?? {};
  const principal = contexto?.proyecto?.git.ramaPrincipal ?? 'main';
  const permitido = contexto?.proyecto?.git.hooksPath ?? '.githooks';

  if (ESCRIBEN_EN_GITHUB.test(nombre)) {
    if (!entrada.branch || entrada.branch === principal) return niega(`Escribir en ${principal} (o sin rama) desde el MCP de GitHub se salta la rama, el PR y el CI.`);
    return null;
  }
  if (nombre !== 'Bash' && nombre !== 'PowerShell') {
    const ruta = [entrada.file_path, entrada.notebook_path, entrada.path].find((v) => typeof v === 'string') ?? '';
    return RUTA_GIT.test(ruta) ? niega('Tocar la configuración o los hooks de .git apagaría los candados de git.') : null;
  }
  if (typeof entrada.command !== 'string') return null;

  for (const t of tramos(entrada.command, nombre)) {
    const git = subcomandoGit(t);
    if (!git) continue;
    if (hooksPathProhibido(git, permitido)) return niega(`Cambiar core.hooksPath apagaría los hooks de git: solo se permite ${permitido}.`);
    const cortas = git.args.filter((a) => /^-[A-Za-z]+$/.test(a)).join('');
    if (git.args.includes('--no-verify') || (git.nombre === 'commit' && cortas.includes('n'))) {
      return niega('Saltarse los hooks de git (--no-verify) está prohibido: si un hook falla, se arregla la causa.');
    }
    if (git.nombre === 'push' && (cortas.includes('f') || git.args.some((a) => FORZADO_LARGO.test(a) || a.startsWith('+')))) {
      return niega('El push forzado está prohibido en cualquier rama: reescribe la historia remota.');
    }
  }
  return null;
}
