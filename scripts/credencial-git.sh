#!/bin/sh
# GIT_ASKPASS de scripts/subir.mjs: git pregunta usuario y clave, y este script responde por la tubería
# hacia git con el token de CLAUDE_CV_GITHUB. El valor nunca llega a la consola ni a un archivo.
case "$1" in
  *sername*) echo "x-access-token" ;;
  *) printf '%s\n' "$CLAUDE_CV_GITHUB" ;;
esac
