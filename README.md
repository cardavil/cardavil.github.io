# CV y portafolio — Carlos Davila

Sitio estático plano (HTML, CSS y JavaScript, sin compilación) publicado en GitHub Pages como sitio de usuario: https://cardavil.github.io/

## Estructura

| Ruta | Contenido |
|---|---|
| `index.html` · `es/index.html` | Perfil: resumen, contacto, educación y certificaciones (inglés en la raíz, español bajo `/es/`) |
| `cv/` · `es/cv/` | Experiencia y habilidades |
| `projects/` · `es/proyectos/` | Índice, un caso de estudio por proyecto y los proyectos académicos |
| `css/tokens.css` | Fuentes propias, color, tipografía, espaciado, radios y sombras |
| `css/proyectos.css` | Paletas de marca de cada proyecto (`[data-proyecto="…"]`) |
| `css/componentes.css` | Componentes compartidos, por secciones; las de una página llevan su prefijo |
| `archivos/<proyecto>/` | Copias revisadas de archivos de infraestructura (sin identificadores ni datos sensibles) |
| `assets/fuentes/` | Inter y JetBrains Mono (licencia OFL junto a cada fuente) |

## Convenciones

- El texto vive en el HTML; cada página en español tiene su par en inglés con `hreflang` recíproco.
- Enlaces internos relativos. Las URLs absolutas (canonical, hreflang, Open Graph) usan una sola base: `https://cardavil.github.io/`.
- Sin scripts ni estilos en línea: la CSP va en un `<meta>` de cada página (`script-src 'self'; style-src 'self'`).
- Colores solo desde `css/tokens.css` y `css/proyectos.css`.
- JS: identificadores en español en camelCase, `const`/`let`, módulos ES (`<script type="module">`).
- Encabezado y pie se repiten en cada página entre los marcadores `<!-- encabezado:inicio/fin -->` y `<!-- pie:inicio/fin -->`.

## Ver en local

`fetch` y los módulos ES no funcionan con `file://`; hay que servir la carpeta:

```
npx http-server -p 8080 -c-1 .
```

y abrir http://localhost:8080.
