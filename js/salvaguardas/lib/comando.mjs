// Lee un comando como lo vería la shell: tramos ejecutables, palabras sin comillas (sin vaciarlas) y, como tramos
// propios, lo que va en $(…), `…`, <(…), >(…), bash -c, pwsh -Command, cmd /c y un heredoc hacia un intérprete.

const INTERPRETES = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh', 'node', 'deno', 'python', 'python3', 'py', 'pwsh', 'powershell', 'cmd', 'ruby', 'perl', 'php']);
const SHELLS = { bash: 'Bash', sh: 'Bash', zsh: 'Bash', dash: 'Bash', ksh: 'Bash', pwsh: 'PowerShell', powershell: 'PowerShell', cmd: 'Cmd' };
const ENVOLTORIOS = new Set(['sudo', 'env', 'command', 'exec', 'time', 'nohup', 'nice', 'call', '&', '.', 'builtin', 'start-process']);
const ASIGNACION = /^[A-Za-z_][A-Za-z0-9_]*=/;
const OPCION_ENCODED = /\s-(?:e|ec|en|enc|enco|encod|encode|encoded|encodedc|encodedco|encodedcom|encodedcomm|encodedcomma|encodedcomman|encodedcommand)(?=\s|$)/i;

/** Busca el cierre de un paréntesis abierto en `desde - 1`, respetando comillas y anidamiento. */
function cierreParentesis(s, desde) {
  let nivel = 1;
  let comilla = null;
  for (let i = desde; i < s.length; i++) {
    const c = s[i];
    if (comilla) {
      if (c === comilla) comilla = null;
      continue;
    }
    if (c === "'" || c === '"') comilla = c;
    else if (c === '(') nivel++;
    else if (c === ')' && --nivel === 0) return i;
  }
  return s.length;
}

/** Quita los cuerpos de heredoc y here-string; los que van a un intérprete vuelven como comandos aparte. */
function sacarCuerpos(comando, dialecto, extras) {
  let texto = comando;
  if (dialecto !== 'PowerShell') {
    texto = texto.replace(/<<(-?)\s*(['"]?)([A-Za-z_][\w-]*)\2([^\n]*)\n([\s\S]*?)(?:\n[ \t]*\3[ \t]*(?=\n|$)|$)/g,
      (todo, _guion, _comilla, _marca, resto, cuerpo, indice) => {
        const linea = texto.slice(texto.lastIndexOf('\n', indice) + 1, indice);
        const consumidor = palabras(linea.split(/[;&|(]/).pop() ?? '', dialecto);
        const nombre = nombreDe(consumidor.find((p) => !ASIGNACION.test(p) && !ENVOLTORIOS.has(p.toLowerCase())) ?? '');
        if (INTERPRETES.has(nombre)) extras.push({ texto: cuerpo, dialecto: 'Bash' });
        return ` ${resto}\n`;
      });
  }
  texto = texto.replace(/@(['"])\r?\n([\s\S]*?)\r?\n\1@/g, (_todo, _c, cuerpo, indice) => {
    const linea = texto.slice(texto.lastIndexOf('\n', indice) + 1, indice);
    if (/\b(iex|invoke-expression)\b/i.test(linea)) extras.push({ texto: cuerpo, dialecto: 'PowerShell' });
    return "''";
  });
  return texto;
}

/** Parte en tramos crudos y junta aparte el contenido de las sustituciones. */
function partir(texto, dialecto, extras) {
  const escape = dialecto === 'PowerShell' ? '`' : dialecto === 'Cmd' ? '^' : '\\';
  const tramos = [];
  let actual = '';
  let comilla = null;
  const cortar = () => {
    if (actual.trim()) tramos.push(actual.trim());
    actual = '';
  };
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    const sig = texto[i + 1];
    if (comilla === "'") {
      actual += c;
      if (c === "'") {
        if (dialecto === 'PowerShell' && sig === "'") { actual += sig; i++; } else comilla = null;
      }
      continue;
    }
    if (c === escape && sig !== undefined && (dialecto !== 'Bash' || /["'`$\\\s]/.test(sig))) {
      actual += c + sig;
      i++;
      continue;
    }
    if (dialecto !== 'Cmd' && c === '$' && sig === '(') {
      const fin = cierreParentesis(texto, i + 2);
      extras.push({ texto: texto.slice(i + 2, fin), dialecto });
      actual += ' __SUST__ ';
      i = fin;
      continue;
    }
    if (dialecto === 'Bash' && c === '`') {
      const fin = texto.indexOf('`', i + 1);
      const hasta = fin === -1 ? texto.length : fin;
      extras.push({ texto: texto.slice(i + 1, hasta), dialecto });
      actual += ' __SUST__ ';
      i = hasta;
      continue;
    }
    if (comilla === '"') {
      actual += c;
      if (c === '"') comilla = null;
      continue;
    }
    if (c === "'" || c === '"') {
      comilla = c;
      actual += c;
      continue;
    }
    if (dialecto === 'Bash' && (c === '<' || c === '>') && sig === '(') {
      const fin = cierreParentesis(texto, i + 2);
      extras.push({ texto: texto.slice(i + 2, fin), dialecto });
      actual += ' __SUST__ ';
      i = fin;
      continue;
    }
    const redireccion = c === '&' && (texto[i - 1] === '>' || texto[i - 1] === '<' || sig === '>');
    const llave = dialecto === 'PowerShell' && (c === '{' || c === '}');
    const parentesis = (c === '(' && !/[$@<>]/.test(texto[i - 1] ?? '')) || c === ')';
    if (!redireccion && (c === ';' || c === '\n' || c === '|' || c === '&' || llave || parentesis)) {
      cortar();
      continue;
    }
    actual += c === '\r' ? ' ' : c;
  }
  cortar();
  return tramos;
}

/** Palabras de un tramo, sin comillas; una palabra entre comillas vacías se conserva como ''. */
export function palabras(tramo, dialecto = 'Bash') {
  const escape = dialecto === 'PowerShell' ? '`' : dialecto === 'Cmd' ? '^' : '\\';
  const salida = [];
  let actual = '';
  let hay = false;
  let comilla = null;
  for (let i = 0; i < tramo.length; i++) {
    const c = tramo[i];
    const sig = tramo[i + 1];
    if (comilla === "'") {
      if (c === "'") {
        if (dialecto === 'PowerShell' && sig === "'") { actual += "'"; i++; } else comilla = null;
      } else actual += c;
      continue;
    }
    if (comilla === '"') {
      if (c === escape && sig !== undefined && (dialecto !== 'Bash' || /["\\$`]/.test(sig))) { actual += sig; i++; continue; }
      if (c === '"') comilla = null; else actual += c;
      continue;
    }
    if (c === escape && sig !== undefined && (dialecto !== 'Bash' || /["'`$\\\s]/.test(sig))) {
      actual += sig;
      hay = true;
      i++;
      continue;
    }
    if (c === "'" || c === '"') {
      comilla = c;
      hay = true;
      continue;
    }
    if (/\s/.test(c)) {
      if (hay || actual) salida.push(actual);
      actual = '';
      hay = false;
      continue;
    }
    actual += c;
  }
  if (hay || actual) salida.push(actual);
  return salida;
}

/** Nombre del ejecutable sin ruta ni extensión, en minúsculas. */
export function nombreDe(palabra) {
  return palabra.split(/[\\/]/).pop().toLowerCase().replace(/\.(exe|cmd|bat|ps1|com)$/, '');
}

/** Índice de la palabra que es el comando, saltando asignaciones y envoltorios; -1 si no hay. */
function indiceCabeza(lista) {
  let i = 0;
  let ultimo = -1;
  while (i < lista.length) {
    const p = lista[i];
    if (ASIGNACION.test(p)) { i++; continue; }
    if (ENVOLTORIOS.has(p.toLowerCase())) {
      ultimo = i;
      i++;
      while (i < lista.length && /^-/.test(lista[i])) i++;
      continue;
    }
    return i;
  }
  return ultimo;
}

/** Tramos ejecutables de un comando, cada uno con sus palabras, su nombre y sus argumentos. */
export function tramos(comando, herramienta = 'Bash', anidado = false) {
  const dialecto = herramienta === 'PowerShell' || herramienta === 'Cmd' ? herramienta : 'Bash';
  const extras = [];
  const crudos = partir(sacarCuerpos(String(comando ?? ''), dialecto, extras), dialecto, extras);
  const salida = [];
  for (const texto of crudos) {
    const lista = palabras(texto, dialecto);
    const i = indiceCabeza(lista);
    if (i === -1) continue;
    const tramo = { texto, palabras: lista, nombre: nombreDe(lista[i]), args: lista.slice(i + 1), dialecto, anidado };
    salida.push(tramo);
    salida.push(...comandoInterno(tramo));
  }
  for (const extra of extras) salida.push(...tramos(extra.texto, extra.dialecto, true));
  return salida;
}

/** Lo que un tramo manda a otra shell: bash -c "…", pwsh -Command …, cmd /c …. */
function comandoInterno({ nombre, args }) {
  const shell = SHELLS[nombre];
  if (!shell) return [];
  if (shell === 'Bash') {
    const i = args.findIndex((a) => /^-[a-z]*c[a-z]*$/.test(a));
    return i !== -1 && args[i + 1] !== undefined ? tramos(args[i + 1], 'Bash', true) : [];
  }
  if (shell === 'PowerShell') {
    const i = args.findIndex((a) => /^-c(o(m(m(a(n(d)?)?)?)?)?)?$/i.test(a));
    return i !== -1 ? tramos(args.slice(i + 1).join(' '), 'PowerShell', true) : [];
  }
  const i = args.findIndex((a) => /^\/[ck]$/i.test(a));
  return i !== -1 ? tramos(args.slice(i + 1).join(' '), 'Cmd', true) : [];
}

const GLOBALES_CON_VALOR = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--config-env', '--exec-path']);

/** El subcomando de git de un tramo, saltando las opciones globales; null si el tramo no es git. */
export function subcomandoGit(tramo) {
  if (!tramo || tramo.nombre !== 'git') return null;
  const { args } = tramo;
  const globales = [];
  let dir = null;
  let i = 0;
  while (i < args.length && args[i].startsWith('-')) {
    globales.push(args[i]);
    if (GLOBALES_CON_VALOR.has(args[i]) && i + 1 < args.length) {
      if (args[i] === '-C') dir = args[i + 1];
      globales.push(args[i + 1]);
      i++;
    }
    i++;
  }
  if (i >= args.length) return null;
  return { nombre: args[i], args: args.slice(i + 1), globales, dir };
}

/** Un comando de PowerShell codificado no se puede revisar. */
export function opaco(comando) {
  return /\b(pwsh|powershell)(\.exe)?\b/i.test(comando) && OPCION_ENCODED.test(comando);
}

/** Ruta comparable: barras /, unidad de Git Bash (/c/…) como C:/…, sin barra final, en minúsculas. */
export function normalizarRuta(ruta) {
  let r = String(ruta).replace(/\\/g, '/').replace(/\/{2,}/g, '/');
  r = r.replace(/^\/([a-zA-Z])(\/|$)/, (_t, unidad, barra) => `${unidad}:${barra || '/'}`);
  return r.replace(/\/+$/, '').toLowerCase();
}

/** Resuelve `ruta` desde `base`; null si depende de una variable, de ~ o de una base desconocida. */
export function resolverRuta(base, ruta) {
  if (!ruta || /[$%~]/.test(ruta)) return null;
  const n = normalizarRuta(ruta);
  const absoluta = /^[a-z]:(\/|$)/.test(n);
  if (!absoluta && base == null) return null;
  const partes = (absoluta ? n : `${base}/${n}`).split('/');
  const salida = [];
  for (const p of partes) {
    if (p === '' || p === '.') continue;
    if (p === '..') { if (salida.length > 1) salida.pop(); continue; }
    salida.push(p);
  }
  return salida.join('/');
}

/** ¿`ruta` es `base` o está debajo? Las dos ya normalizadas. */
export function dentroDe(ruta, base) {
  return ruta != null && base != null && (ruta === base || ruta.startsWith(`${base}/`));
}
