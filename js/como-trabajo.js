// Demo de "How I work": corre en el navegador las mismas reglas del plugin Controles (copiadas por
// trabajo/scripts/salvaguardas-web.mjs) sobre un comando y muestra qué decidiría el hook. Nada se ejecuta: solo se lee
// el texto del comando. Sin JavaScript el bloque queda oculto y la tabla de decisiones sigue siendo el contenido.
import { decidir } from './salvaguardas/lib/decision.mjs';
import { opaco } from './salvaguardas/lib/comando.mjs';
import { evaluar as secretos } from './salvaguardas/reglas/secretos.mjs';
import { evaluar as destructivos } from './salvaguardas/reglas/destructivos.mjs';
import { evaluar as git } from './salvaguardas/reglas/git.mjs';
import { evaluar as produccion } from './salvaguardas/reglas/produccion.mjs';
import { evaluar as soloTokens } from './salvaguardas/reglas/solo-tokens.mjs';
import { evaluar as configuracion } from './salvaguardas/reglas/configuracion.mjs';

const MOTIVO_OPACO = 'El comando va codificado y no se puede revisar.';

// Las mismas reglas, en el mismo orden que el despachador del plugin.
const REGLAS = [
  { nombre: 'opaco', evaluar: (ev) => (opaco(ev.tool_input.command) ? { decision: 'ask', motivo: MOTIVO_OPACO } : null) },
  { nombre: 'secretos', evaluar: secretos },
  { nombre: 'destructivos', evaluar: destructivos },
  { nombre: 'git', evaluar: git },
  { nombre: 'produccion', evaluar: produccion },
  { nombre: 'solo-tokens', evaluar: soloTokens },
  { nombre: 'configuracion', evaluar: configuracion },
];

// Un repo de ejemplo, sin controles.json, con su scratchpad: el mismo contexto que arma el plugin.
const CONTEXTO = {
  raiz: 'c:/repo',
  tempClaude: 'c:/users/u/appdata/local/temp/claude',
  home: 'c:/users/u',
  proyecto: null,
  configInvalida: false,
};

const espanol = document.documentElement.lang === 'es';

const TEXTOS = espanol
  ? {
      decision: { deny: 'Se niega', ask: 'Pide aprobación', allow: 'Se permite: el hook no dice nada' },
      regla: { opaco: 'Comando codificado', secretos: 'Secretos', destructivos: 'Comandos destructivos', git: 'Git', produccion: 'Producción', 'solo-tokens': 'Solo tokens', configuracion: 'Configuración' },
      vacio: 'Escribe un comando o elige un ejemplo.',
    }
  : {
      decision: { deny: 'Denied', ask: 'Asks for approval', allow: 'Allowed: the hook stays silent' },
      regla: { opaco: 'Encoded command', secretos: 'Secrets', destructivos: 'Destructive commands', git: 'Git', produccion: 'Production', 'solo-tokens': 'Tokens only', configuracion: 'Configuration' },
      vacio: 'Type a command or pick an example.',
    };

// Los motivos del plugin están en español; en la página en inglés se muestra su traducción.
const SOLO_SIGUE = '. Solo sigue con un sí del propietario a esta acción concreta.';
const SOLO_TOKEN = ' El acceso va solo por el token del proyecto, en su variable de entorno.';
const LIMPIO = ': no se ejecuta. En un clon desechable del scratchpad sí se puede, con su ruta literal (git -C <ruta> …).';
const TRADUCCIONES = {
  'El comando lleva un valor de credencial escrito en la línea. Los secretos viajan por el env o el stdin del proceso destino, nunca por el shell.':
    'The command contains a credential value. Secrets travel through the target process’s environment or stdin, never through the shell.',
  'El comando enumera un almacén de secretos (registro de Windows, Env:, api-keys) y eso emite valores. Para saber si un secreto existe o cuánto mide, usa un script que solo devuelva nombre y longitud.':
    'The command lists a secret store (Windows registry, Env:, api-keys), which prints values. To check that a secret exists, use a script that returns only its name and length.',
  'El comando vuelca el entorno o el helper de credenciales, y eso emite todos los valores. Para saber si un secreto existe o cuánto mide, usa un script que solo devuelva nombre y longitud.':
    'The command dumps the environment or the credential helper, which prints every value. To check that a secret exists, use a script that returns only its name and length.',
  'El comando arma la credencial de un proceso hijo capturando la salida de otro comando: el valor queda en la línea. Esa invocación va por un script que pasa el token por el env del hijo.':
    'The command builds a child process’s credential from another command’s output, which leaves the value on the command line. That call goes through a script that passes the token in the child’s environment.',
  'El comando lee un secreto desde la shell. Toda operación con secretos pasa por un script que recibe el valor por env y jamás lo imprime; en la shell solo se nombra, nunca se resuelve.':
    'The command reads a secret from the shell. Every operation with secrets goes through a script that receives the value in its environment and never prints it; in the shell a secret is only named, never resolved.',
  'La ruta es de un archivo portador de credenciales. Leerlo mete el valor en el contexto y desde ahí ningún hook puede quitarlo.':
    'The path is a credential file. Reading it puts the value in the agent’s context, and no hook can take it out from there.',
  'CLI de proveedor invocada a secas: toma las credenciales del ambiente y esta máquina tiene varias cuentas. La vía del proyecto es un script que le pasa el token por el env del proceso hijo.':
    'A provider CLI called directly picks up whatever credentials are in the environment, and this machine has several accounts. The project’s way is a script that passes the token in the child process’s environment.',
  'El comando borra en recursivo la raíz o la carpeta del usuario: no tiene vuelta atrás y no se ejecuta. Si de verdad hace falta, lo corre el propietario a mano.':
    'The command recursively deletes a root or the user’s home folder: there’s no way back, so it doesn’t run. If it’s really needed, the owner runs it by hand.',
  [`El comando git reset --hard borra cambios sin commitear, también los de otra sesión${LIMPIO}`]:
    'git reset --hard deletes uncommitted changes, including another session’s, so it doesn’t run. In a throwaway clone in the scratchpad it can, by its literal path (git -C <path> …).',
  [`El comando git clean -f borra archivos que git no sigue, .env incluido${LIMPIO}`]:
    'git clean -f deletes files git doesn’t track, .env included, so it doesn’t run. In a throwaway clone in the scratchpad it can, by its literal path (git -C <path> …).',
  [`El comando descarta todos los cambios del árbol${LIMPIO}`]:
    'The command discards every change in the working tree, so it doesn’t run. In a throwaway clone in the scratchpad it can, by its literal path (git -C <path> …).',
  'Cambiar core.hooksPath apagaría los hooks de git: solo se permite .githooks.':
    'Changing core.hooksPath would switch git hooks off: only .githooks is allowed.',
  'Saltarse los hooks de git (--no-verify) está prohibido: si un hook falla, se arregla la causa.':
    'Skipping git hooks (--no-verify) is forbidden: if a hook fails, the cause gets fixed.',
  'El push forzado está prohibido en cualquier rama: reescribe la historia remota.':
    'Force push is forbidden on every branch: it rewrites remote history.',
  'Esto cambia los candados o la configuración de Claude (controles.json, settings, .mcp.json, hooks). Solo sigue con un sí del propietario.':
    'This changes the guardrails or Claude’s configuration (controles.json, settings, .mcp.json, hooks). It only goes ahead with the owner’s yes.',
  [MOTIVO_OPACO]: 'The command is encoded and can’t be reviewed.',
};
const PRODUCCION = {
  'git push sube al remoto': 'git push uploads to the remote',
  'Este comando parece desplegar o escribir en producción': 'This command looks like a deploy or a production write',
  'Este comando escribe en Cloudflare': 'This command writes to Cloudflare',
  'Este comando escribe en Supabase': 'This command writes to Supabase',
  'Este comando corre pruebas de navegador, que pueden escribir en producción': 'This command runs browser tests, which can write to production',
};
const TOKENS = {
  'El comando lleva usuario o clave dentro de una URL.': 'The command puts a user or password inside a URL.',
  'El comando inicia una sesión interactiva o pide un token a la CLI.': 'The command starts an interactive login or asks the CLI for a token.',
  'El comando guarda credenciales en git.': 'The command stores credentials in git.',
};

/** El motivo en el idioma de la página; null si falta su traducción. */
function traducir(motivo) {
  if (espanol) return motivo;
  if (TRADUCCIONES[motivo]) return TRADUCCIONES[motivo];
  if (motivo.endsWith(SOLO_SIGUE)) {
    const base = PRODUCCION[motivo.slice(0, -SOLO_SIGUE.length)];
    return base ? `${base}. It only goes ahead with the owner’s yes to this specific action.` : null;
  }
  if (motivo.endsWith(SOLO_TOKEN)) {
    const base = TOKENS[motivo.slice(0, -SOLO_TOKEN.length)];
    return base ? `${base} Access goes only through the project’s token, in its environment variable.` : null;
  }
  return null;
}

/** La decisión del despachador y, por regla, qué dijo cada una. */
function revisar(comando, shell) {
  const evento = { tool_name: shell, tool_input: { command: comando }, cwd: CONTEXTO.raiz };
  const combinada = decidir(evento, CONTEXTO, REGLAS);
  const porRegla = REGLAS.map((r) => ({ nombre: r.nombre, r: r.evaluar(evento, CONTEXTO) })).filter((x) => x.r);
  const decision = combinada ? combinada.decision : 'allow';
  return { decision, motivos: porRegla.filter((x) => x.r.decision === decision) };
}

const demo = document.querySelector('.demo-hooks');
if (demo) {
  const ejemplo = demo.querySelector('#demo-ejemplo');
  const shell = demo.querySelector('#demo-shell');
  const comando = demo.querySelector('#demo-comando');
  const boton = demo.querySelector('#demo-probar');
  const resultado = demo.querySelector('#demo-resultado');
  const titulo = resultado.querySelector('.demo-decision');
  const lista = resultado.querySelector('.demo-motivos');

  const mostrar = () => {
    const texto = comando.value.trim();
    lista.replaceChildren();
    if (!texto) {
      resultado.dataset.decision = '';
      titulo.textContent = TEXTOS.vacio;
      return;
    }
    const { decision, motivos } = revisar(texto, shell.value);
    resultado.dataset.decision = decision;
    resultado.dataset.traducido = 'si';
    titulo.textContent = TEXTOS.decision[decision];
    for (const { nombre, r } of motivos) {
      const item = document.createElement('li');
      const regla = document.createElement('strong');
      regla.textContent = `${TEXTOS.regla[nombre] ?? nombre}: `;
      const traducido = traducir(r.motivo);
      if (traducido === null) resultado.dataset.traducido = 'no';
      item.append(regla, traducido ?? r.motivo);
      lista.append(item);
    }
  };

  ejemplo.addEventListener('change', () => {
    const opcion = ejemplo.selectedOptions[0];
    if (!opcion || !opcion.value) return;
    comando.value = opcion.value;
    shell.value = opcion.dataset.shell ?? 'Bash';
    mostrar();
  });
  boton.addEventListener('click', mostrar);
  comando.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); mostrar(); } });
  shell.addEventListener('change', () => { if (comando.value.trim()) mostrar(); });

  titulo.textContent = TEXTOS.vacio;
  demo.hidden = false;
}
