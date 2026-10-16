// Pide confirmación antes de cambiar los propios candados: controles.json, la configuración de Claude, .mcp.json,
// los hooks de Claude y los de git. Leerlos o prepararlos para un commit no pregunta.
import { tramos, subcomandoGit, normalizarRuta } from '../lib/comando.mjs';

const PROTEGIDA = /(^|\/)\.claude\/(controles\.json|settings(\.local)?\.json|hooks\/)|(^|\/)\.mcp\.json$|(^|\/)\.githooks\//;
const EDITAN = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const LECTORES = new Set(['cat', 'type', 'gc', 'get-content', 'less', 'more', 'head', 'tail', 'grep', 'rg', 'select-string', 'sls', 'findstr', 'ls', 'dir', 'gci', 'get-childitem', 'test-path', 'jq', 'wc', 'diff']);
const GIT_SOLO_LEE = new Set(['add', 'diff', 'log', 'show', 'status', 'blame', 'ls-files', 'grep']);

const esProtegida = (ruta) => typeof ruta === 'string' && PROTEGIDA.test(normalizarRuta(ruta));
const pregunta = { decision: 'ask', motivo: 'Esto cambia los candados o la configuración de Claude (controles.json, settings, .mcp.json, hooks). Solo sigue con un sí del propietario.' };

export function evaluar(evento) {
  const nombre = evento?.tool_name;
  const entrada = evento?.tool_input ?? {};
  if (EDITAN.has(nombre)) return esProtegida(entrada.file_path ?? entrada.notebook_path) ? pregunta : null;
  if ((nombre !== 'Bash' && nombre !== 'PowerShell') || typeof entrada.command !== 'string') return null;

  for (const t of tramos(entrada.command, nombre)) {
    const indices = t.palabras.map((p, i) => (esProtegida(p) ? i : -1)).filter((i) => i !== -1);
    if (!indices.length) continue;
    if (indices.some((i) => /^\d?>>?$/.test(t.palabras[i - 1] ?? ''))) return pregunta;
    if (LECTORES.has(t.nombre)) continue;
    const git = subcomandoGit(t);
    if (git && GIT_SOLO_LEE.has(git.nombre)) continue;
    return pregunta;
  }
  return null;
}
