// Combina las decisiones de las reglas: deny gana a ask. Una regla que falla pide confirmación y su error no se
// muestra, porque podría llevar el texto del comando.

/** La decisión combinada para una llamada, o null si ninguna regla tiene nada que decir. */
export function decidir(evento, contexto, reglas) {
  const niegan = [];
  const preguntan = [];
  for (const regla of reglas) {
    let r;
    try {
      r = regla.evaluar(evento, contexto);
    } catch {
      r = { decision: 'ask', motivo: `la regla ${regla.nombre} falló al revisar esta llamada; confirma tú.` };
    }
    if (!r) continue;
    (r.decision === 'deny' ? niegan : preguntan).push(r.motivo);
  }
  if (niegan.length) return { decision: 'deny', motivo: niegan.join(' ') };
  if (preguntan.length) return { decision: 'ask', motivo: preguntan.join(' ') };
  return null;
}
