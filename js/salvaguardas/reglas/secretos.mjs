// Niega lo que puede sacar el valor de un secreto: leerlo desde la shell, volcar el entorno, enumerar un almacén,
// leer un archivo portador o escribir un valor. El motivo nunca repite el comando: lo volvería a exponer.
import { tramos } from '../lib/comando.mjs';

const P = (...partes) => partes.join('');
const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Prefijos de valores reales, armados por partes para que este archivo no lleve uno literal.
const PREFIJOS = [P('sbp', '_v0_'), P('sb', '_secret_'), P('sb', '_publishable_'), P('gh', 'p_'), P('gh', 'o_'), P('github', '_pat_'), P('eyJhb', 'GciOi')];
const VALOR_EN_LINEA = new RegExp(`\\b(?:${PREFIJOS.map(escapar).join('|')})`);
const VALOR_EN_ARCHIVO = new RegExp(
  `\\b(?:${[P('gh', 'p_'), P('gh', 'o_'), P('github', '_pat_'), P('sbp', '_v0_'), P('sb', '_secret_')].map(escapar).join('|')})[A-Za-z0-9_]{20,}` +
  `|\\b${escapar(P('eyJhb', 'GciOi'))}[A-Za-z0-9_-]{20,}`,
);

// Nombres que se tratan como secretos aunque el repo no tenga controles.json.
const NOMBRES = [
  'CLAUDE_[A-Z0-9_]*(?:GITHUB|SUPABASE|CLOUDFLARE|VERCEL|TOKEN|KEY|PAT|SECRET)[A-Z0-9_]*',
  '(?:[A-Z][A-Z0-9_]*)?(?:TOKEN|SECRET|SECRETO|PASSWORD|PASSWD|PASS|PASSPHRASE|APIKEY|_KEY|_PAT)[A-Z0-9_]*',
  'CLOUDFLARE_API_TOKEN', 'SUPABASE_(?:ACCESS_TOKEN|SECRET|SERVICE_ROLE[A-Z_]*|ANON_KEY)', 'SERVICE_ROLE[A-Z_]*',
  'GEMINI_API_KEY', 'TELEGRAM_[A-Z_]*', 'BOT_TOKEN', 'GITHUB_TOKEN', 'GH_TOKEN', 'TURNSTILE_[A-Z_]*', 'SMTP_[A-Z_]*', 'RESEND_[A-Z_]*',
].join('|');

const cache = new WeakMap();
/** Las expresiones que dependen de los nombres del repo, construidas una vez por config. */
function expresiones(proyecto) {
  const clave = proyecto ?? cache;
  if (cache.has(clave)) return cache.get(clave);
  const n = proyecto?.fragmentoSecretos ? `(?:${NOMBRES}|${proyecto.fragmentoSecretos})` : `(?:${NOMBRES})`;
  const r = {
    // En Bash y en el código, los nombres distinguen mayúsculas: $token es una variable local, no el entorno.
    shell: new RegExp(`\\$\\{?${n}`),
    insensible: new RegExp([
      `%${n}%`, `\\$env:${n}`, `\\bEnv:\\\\?${n}`,
      `process\\.env(?:\\.|\\[\\s*['"\`])${n}`, `GetEnvironmentVariable\\s*\\(\\s*['"]${n}`, `getenv\\s*\\(\\s*['"]${n}`,
      `obtenerSecreto\\s*\\(\\s*['"]${n}`, `Deno\\.env\\.get\\s*\\(\\s*['"]${n}`, `environ(?:\\[|\\.get\\s*\\()\\s*['"]${n}`,
    ].join('|'), 'i'),
    captura: new RegExp(`${n}\\s*=\\s*['"]?(?:\\$\\(|\`|\\$\\{)`, 'i'),
  };
  cache.set(clave, r);
  return r;
}

const VOLCADOS = [
  /process\.env(?!\s*(?:\.|\[|\?\.)\s*\w)/,
  /\/proc\/(?:self|\d+)\/environ/i,
  /(^|[;&|]\s*)(export|declare)\s+-[px]\b/,
  /(^|[;&|]\s*)compgen\s+-e\b/,
  /\bgit\s+credential(?:-[\w-]+)?\s+(fill|get)\b/i,
  /\bDeno\.env\.toObject\s*\(/,
  /\bos\.environ\b(?!\s*(?:\[|\.get\s*\())/,
];

const ALMACENES = [
  /HK(CU|LM|EY_CURRENT_USER|EY_LOCAL_MACHINE)[:\\][^\n]*Environment/i,
  /(Get-ChildItem|Get-Item|Get-ItemProperty|Get-Content|gci|gc|ls|dir|cat|type)\s+(-\w+\s+)*Env:/i,
  /GetEnvironmentVariables\s*\(/i,
  /\/v1\/projects\/[^\s]*\/api-keys/i,
];

const RUTAS_SECRETAS = [
  /(^|[\\/])\.env(\.|$)/i,
  /\.(pem|key|p12|pfx)$/i,
  /(^|[\\/])id_(rsa|dsa|ecdsa|ed25519)(\.|$)/i,
  /(^|[\\/])credentials(\.|$)/i,
  /(^|[\\/])\.git-credentials$/i,
  /[\\/]Users[\\/][^\\/]+[\\/]\.npmrc$/i, // el del usuario; el de un repo es configuración de build
];
const GLOB_SECRETO = /\.env|\.(pem|key|p12|pfx)\b|id_(rsa|dsa|ecdsa|ed25519)|credentials|\.npmrc/i;
// Windows abre el mismo archivo con un punto o un espacio al final, o con su flujo ::$DATA.
const limpiarRuta = (r) => String(r).replace(/::?\$DATA$/i, '').replace(/[. ]+$/, '');
const esRutaSecreta = (r) => RUTAS_SECRETAS.some((p) => p.test(limpiarRuta(r)));

const VER_SIN_LEER = new Set(['ls', 'dir', 'gci', 'get-childitem', 'test-path']);
const CLI_PROVEEDOR = new Set(['wrangler', 'supabase', 'gh', 'vercel', 'az', 'aws', 'gcloud']);
const LANZADORES = new Set(['npx', 'pnpm', 'bunx', 'yarn']);

const MOTIVO = {
  valor: 'El comando lleva un valor de credencial escrito en la línea. Los secretos viajan por el env o el stdin del proceso destino, nunca por el shell.',
  almacen: 'El comando enumera un almacén de secretos (registro de Windows, Env:, api-keys) y eso emite valores. Para saber si un secreto existe o cuánto mide, usa un script que solo devuelva nombre y longitud.',
  volcado: 'El comando vuelca el entorno o el helper de credenciales, y eso emite todos los valores. Para saber si un secreto existe o cuánto mide, usa un script que solo devuelva nombre y longitud.',
  captura: 'El comando arma la credencial de un proceso hijo capturando la salida de otro comando: el valor queda en la línea. Esa invocación va por un script que pasa el token por el env del hijo.',
  lectura: 'El comando lee un secreto desde la shell. Toda operación con secretos pasa por un script que recibe el valor por env y jamás lo imprime; en la shell solo se nombra, nunca se resuelve.',
  archivo: 'La ruta es de un archivo portador de credenciales. Leerlo mete el valor en el contexto y desde ahí ningún hook puede quitarlo.',
  escritura: 'El contenido a escribir lleva un valor de credencial. Los secretos viajan por el env del proceso que los necesita, nunca escritos en un archivo.',
  cli: 'CLI de proveedor invocada a secas: toma las credenciales del ambiente y esta máquina tiene varias cuentas. La vía del proyecto es un script que le pasa el token por el env del proceso hijo.',
};

const niega = (motivo) => ({ decision: 'deny', motivo });

function evaluarArchivo(nombre, entrada) {
  if (nombre === 'Read' || nombre === 'Grep') {
    const ruta = entrada.file_path ?? entrada.notebook_path ?? entrada.path ?? '';
    if (esRutaSecreta(ruta)) return niega(MOTIVO.archivo);
    if (nombre === 'Grep' && typeof entrada.glob === 'string' && GLOB_SECRETO.test(entrada.glob)) return niega(MOTIVO.archivo);
    return null;
  }
  const texto = `${entrada.content ?? ''}\n${entrada.new_string ?? ''}\n${entrada.new_source ?? ''}`;
  return VALOR_EN_ARCHIVO.test(texto) ? niega(MOTIVO.escritura) : null;
}

function evaluarComando(comando, herramienta, proyecto) {
  if (VALOR_EN_LINEA.test(comando)) return niega(MOTIVO.valor);
  if (ALMACENES.some((p) => p.test(comando))) return niega(MOTIVO.almacen);
  if (VOLCADOS.some((p) => p.test(comando))) return niega(MOTIVO.volcado);
  const r = expresiones(proyecto);
  if (r.captura.test(comando)) return niega(MOTIVO.captura);
  if (r.shell.test(comando) || r.insensible.test(comando)) return niega(MOTIVO.lectura);

  const lista = tramos(comando, herramienta);
  for (const t of lista) {
    const vuelca = (t.nombre === 'printenv') || ((t.nombre === 'env' || t.nombre === 'set') && t.args.length === 0);
    if (vuelca) return niega(MOTIVO.volcado);
    if (!VER_SIN_LEER.has(t.nombre) && t.args.some(esRutaSecreta)) return niega(MOTIVO.archivo);
  }
  for (const t of lista) {
    const cli = LANZADORES.has(t.nombre) ? t.args.find((a) => !a.startsWith('-') && a !== 'dlx' && a !== 'exec') : t.nombre;
    if (cli && CLI_PROVEEDOR.has(cli.toLowerCase())) return { decision: 'ask', motivo: MOTIVO.cli };
  }
  return null;
}

export function evaluar(evento, contexto) {
  const nombre = evento?.tool_name;
  const entrada = evento?.tool_input ?? {};
  if (['Read', 'Grep', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(nombre)) return evaluarArchivo(nombre, entrada);
  if ((nombre === 'Bash' || nombre === 'PowerShell') && typeof entrada.command === 'string') {
    return evaluarComando(entrada.command, nombre, contexto?.proyecto);
  }
  return null;
}
