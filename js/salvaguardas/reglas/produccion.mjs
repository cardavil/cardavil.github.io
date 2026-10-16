// Pide confirmación antes de lo que escribe en producción: los comandos que el repo declara, el SQL que escribe,
// las escrituras por MCP y, si el repo lo pide, cada push. Sin controles.json pregunta por todo lo que puede serlo.
import { tramos, subcomandoGit } from '../lib/comando.mjs';

// Un tramo que empieza por uno de estos solo nombra el script; no lo ejecuta.
const SOLO_NOMBRA = new Set(['grep', 'rg', 'sed', 'awk', 'cat', 'head', 'tail', 'less', 'wc', 'ls', 'dir', 'type', 'git', 'get-content', 'gc', 'select-string', 'sls', 'test-path', 'get-childitem', 'gci']);

const SIN_CONFIG = [
  { patron: /\b(desplegar|deploy|db-remoto|migra\w*|conectar-|configurar-|sembrar|purgar)/i, motivo: 'parece desplegar o escribir en producción' },
  { patron: /\bwrangler(\.cmd)?\s+(deploy|publish|secret|pages\s+deploy|d1\s+execute|r2)\b/i, motivo: 'escribe en Cloudflare' },
  { patron: /\bfunctions\s+deploy\b|\bdb\s+push\b/i, motivo: 'escribe en Supabase' },
  { patron: /npm run e2e|playwright(\.cmd)?\s+test\b(?!.*--list)/, motivo: 'corre pruebas de navegador, que pueden escribir en producción' },
];

const ESCRITURAS_MCP = new Set([
  'apply_migration', 'deploy_edge_function', 'create_project', 'pause_project', 'restore_project', 'delete_branch',
  'merge_branch', 'reset_branch', 'rebase_branch', 'update_storage_config', 'push_files', 'create_or_update_file', 'delete_file',
]);

const ESCRITURA_SQL =
  /\b(insert|update|delete|merge|truncate|alter|drop|create|grant|revoke|comment\s+on|copy|call|do|refresh|vacuum|reindex|cluster|security\s+label|lock)\b|\bcron\s*\.\s*(schedule|unschedule|alter_job)\b|\bnet\s*\.\s*http_/i;

/** El SQL sin comentarios, sin textos y con el cuerpo de las funciones en blanco. */
function sinTextos(sql) {
  return sql
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\$([A-Za-z_]*)\$[\s\S]*?\$\1\$/g, ' ')
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/"(?:[^"]|"")*"/g, '""');
}

/** ¿Escribe este SQL? Un ensayo que termina en rollback; sin commit dentro no escribe. */
export function sqlEscribe(sql) {
  const limpio = sinTextos(String(sql ?? ''));
  if (!ESCRITURA_SQL.test(limpio)) return false;
  const ensayo = /\bbegin\b/i.test(limpio) && /\brollback\s*;?\s*$/i.test(limpio.trim()) && !/\b(commit|end)\s*;/i.test(limpio);
  return !ensayo;
}

const pregunta = (motivo) => ({ decision: 'ask', motivo: `${motivo}. Solo sigue con un sí del propietario a esta acción concreta.` });

export function evaluar(evento, contexto) {
  const nombre = evento?.tool_name ?? '';
  const entrada = evento?.tool_input ?? {};
  const proyecto = contexto?.proyecto ?? null;

  const mcp = /^mcp__.+__([^_].*)$/.exec(nombre);
  if (mcp) {
    const accion = mcp[1];
    if (accion === 'execute_sql') return sqlEscribe(entrada.query) ? pregunta('Este SQL escribe en la base de producción') : null;
    if (accion === 'merge_pull_request') return !proyecto || proyecto.produccion.preguntarAntesDeMerge ? pregunta('Este merge publica en la rama principal') : null;
    return ESCRITURAS_MCP.has(accion) ? pregunta(`La herramienta ${accion} escribe fuera del repo`) : null;
  }
  if ((nombre !== 'Bash' && nombre !== 'PowerShell') || typeof entrada.command !== 'string') return null;

  const patrones = proyecto ? proyecto.produccion.comandos : SIN_CONFIG;
  const preguntarPush = !proyecto || proyecto.produccion.preguntarAntesDePush;
  for (const t of tramos(entrada.command, nombre)) {
    if (preguntarPush && subcomandoGit(t)?.nombre === 'push') return pregunta('git push sube al remoto');
    if (SOLO_NOMBRA.has(t.nombre)) continue;
    const coincide = patrones.find(({ patron }) => patron.test(t.texto));
    if (coincide) return pregunta(`Este comando ${coincide.motivo}`);
  }
  return null;
}
