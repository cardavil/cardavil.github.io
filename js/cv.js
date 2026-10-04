// Página del CV: muestra el botón «Descargar PDF» y abre el diálogo de impresión.
// El formato del PDF lo da css/impresion.css. Sin JS el botón queda oculto (atributo hidden en el HTML).

const botonImprimir = document.querySelector('[data-accion="imprimir"]');

if (botonImprimir) {
  botonImprimir.hidden = false;
  botonImprimir.addEventListener('click', () => window.print());
}
