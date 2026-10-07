// Visor de capturas de las páginas de proyecto. Cada miniatura de .capturas es un enlace a la imagen completa; con
// este módulo, el clic abre la imagen en un <dialog> nativo en vez de navegar a ella:
// ESC (propio del <dialog>), el botón Cerrar o un clic fuera de la imagen lo cierran, y las flechas pasan de captura.
// Sin JavaScript, el enlace sigue abriendo la imagen.

const enlaces = [...document.querySelectorAll('.capturas a')];

if (enlaces.length) {
  const espanol = document.documentElement.lang === 'es';
  const textos = espanol
    ? { anterior: '← Anterior', siguiente: 'Siguiente →', cerrar: 'Cerrar', visor: 'Visor de capturas' }
    : { anterior: '← Previous', siguiente: 'Next →', cerrar: 'Close', visor: 'Screenshot viewer' };

  const visor = document.createElement('dialog');
  visor.className = 'visor';
  visor.setAttribute('aria-label', textos.visor);
  const figura = document.createElement('figure');
  const imagen = document.createElement('img');
  const leyenda = document.createElement('figcaption');
  const controles = document.createElement('div');
  controles.className = 'visor-controles';
  const boton = (texto, accion) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = texto;
    b.addEventListener('click', accion);
    controles.append(b);
    return b;
  };

  let actual = 0;
  let origen = null;
  const mostrar = (indice) => {
    actual = (indice + enlaces.length) % enlaces.length;
    const enlace = enlaces[actual];
    const miniatura = enlace.querySelector('img');
    imagen.src = enlace.href;
    imagen.alt = miniatura ? miniatura.alt : '';
    leyenda.textContent = enlace.closest('figure')?.querySelector('figcaption')?.textContent ?? '';
  };

  boton(textos.anterior, () => mostrar(actual - 1));
  const cerrar = boton(textos.cerrar, () => visor.close());
  boton(textos.siguiente, () => mostrar(actual + 1));
  figura.append(imagen, leyenda, controles);
  visor.append(figura);
  document.body.append(visor);

  enlaces.forEach((enlace, indice) => {
    enlace.addEventListener('click', (evento) => {
      // Ctrl/Cmd/Mayús + clic o clic central conservan el comportamiento normal (abrir en otra pestaña).
      if (evento.button !== 0 || evento.ctrlKey || evento.metaKey || evento.shiftKey || evento.altKey) return;
      evento.preventDefault();
      origen = enlace;
      mostrar(indice);
      visor.showModal();
      cerrar.focus();
    });
  });

  visor.addEventListener('keydown', (evento) => {
    if (evento.key === 'ArrowLeft') mostrar(actual - 1);
    if (evento.key === 'ArrowRight') mostrar(actual + 1);
  });
  // Un clic en el fondo (fuera de la imagen y de los botones) cae sobre el propio <dialog>.
  visor.addEventListener('click', (evento) => { if (evento.target === visor) visor.close(); });
  // Al cerrar, el foco vuelve a la miniatura que abrió el visor.
  visor.addEventListener('close', () => { origen?.focus(); });
}
