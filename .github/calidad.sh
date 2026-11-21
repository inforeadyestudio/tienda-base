#!/usr/bin/env bash
# Pruebas automáticas de Ready Studio (las corre GitHub Actions en cada push).
# Uso: bash .github/calidad.sh <instalar|build|tipos|lint|tests|auditoria>
# No editar este archivo ni el workflow para que un cambio pase.
set -uo pipefail
paso="${1:?Indica el paso: instalar, build, tipos, lint, tests o auditoria}"

tiene_script() { node -e "const s=require('./package.json').scripts||{};process.exit(s['$1']?0:1)"; }
tiene_dep() { node -e "const p=require('./package.json');const d={...p.dependencies,...p.devDependencies};process.exit(d['$1']?0:1)"; }

case "$paso" in
  instalar)
    if [ -f package-lock.json ]; then
      npm ci --no-audit --no-fund || npm install --no-audit --no-fund
    else
      bun install
    fi
    ;;

  build)
    npm run build
    ;;

  tipos)
    if tiene_script typecheck; then npm run typecheck
    elif [ -f tsconfig.app.json ]; then npx tsc --noEmit -p tsconfig.app.json
    else npx tsc --noEmit
    fi
    ;;

  lint)
    # Máximo 5 minutos: en algunos repos el lint es muy lento y no vale la pena gastar minutos de GitHub en él.
    if tiene_script lint; then
      timeout 300 npm run lint; code=$?
      if [ $code -eq 124 ]; then echo "El lint tardó más de 5 minutos y se detuvo"; fi
      exit $code
    else echo "Sin script de lint"; fi
    ;;

  tests)
    # Tests unitarios del repo. Se excluyen: los de navegador (Playwright), los de Deno (edge functions con
    # imports remotos) y los de integración que se conectan a la base de datos real (nunca se corren en CI).
    mapfile -t archivos < <(git ls-files | grep -E '\.(test|spec)\.(ts|tsx|js|mjs)$' | grep -vE '(^|/)node_modules/' || true)
    vitest=(); bunt=()
    for f in "${archivos[@]}"; do
      if grep -qE "@playwright/test|https://deno\.land|https://esm\.sh|from ['\"]jsr:|from ['\"]npm:" "$f"; then continue; fi
      if grep -qE "LOVABLE_BROWSER|process\.env\.(VITE_)?SUPABASE|SUPABASE_SERVICE_ROLE" "$f"; then echo "  (integración, no se corre en CI) $f"; continue; fi
      if grep -qE "from ['\"]vitest['\"]" "$f"; then vitest+=("$f"); else bunt+=("./$f"); fi
    done
    if [ ${#vitest[@]} -eq 0 ] && [ ${#bunt[@]} -eq 0 ]; then echo "Este repo aún no tiene tests unitarios"; exit 0; fi
    # Si el repo no trae .env, se usan valores de mentira (apuntan a localhost) para que el cliente de Supabase cargue.
    if [ ! -f .env ]; then
      export VITE_SUPABASE_URL="${VITE_SUPABASE_URL:-http://127.0.0.1:54321}"
      export VITE_SUPABASE_PUBLISHABLE_KEY="${VITE_SUPABASE_PUBLISHABLE_KEY:-clave-de-prueba}"
      export VITE_SUPABASE_ANON_KEY="${VITE_SUPABASE_ANON_KEY:-clave-de-prueba}"
      export VITE_SUPABASE_PROJECT_ID="${VITE_SUPABASE_PROJECT_ID:-prueba}"
    fi
    fallo=0
    if [ ${#vitest[@]} -gt 0 ]; then
      echo "▶ Vitest: ${#vitest[@]} archivos"
      if tiene_dep vitest; then npx vitest run "${vitest[@]}" || fallo=1
      else npx --yes vitest@3 run "${vitest[@]}" || fallo=1
      fi
    fi
    if [ ${#bunt[@]} -gt 0 ]; then
      echo "▶ Bun test: ${#bunt[@]} archivos"
      bun test "${bunt[@]}" || fallo=1
    fi
    exit $fallo
    ;;

  auditoria)
    if [ -f package-lock.json ]; then npm audit --omit=dev --audit-level=high
    else bun audit --audit-level=high
    fi
    ;;

  *)
    echo "Paso desconocido: $paso"; exit 2
    ;;
esac
