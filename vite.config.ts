// Configuración pura de TanStack Start + Nitro (sin paquetes de Lovable).
// En Vercel, Nitro detecta la plataforma solo (salida `.vercel/output`);
// localmente compila para Node (`.output`).
import { defineConfig, loadEnv } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";

export default defineConfig(({ mode, command }) => {
  // Las variables VITE_* quedan disponibles también en el código del servidor.
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const envDefine: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    envDefine[`import.meta.env.${key}`] = JSON.stringify(value);
  }

  return {
    define: envDefine,
    css: { transformer: "lightningcss" as const },
    resolve: {
      alias: { "@": `${process.cwd()}/src` },
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-query",
        "@tanstack/query-core",
      ],
    },
    server: { host: "::", port: 8080 },
    plugins: [
      tailwindcss(),
      tsConfigPaths({ projects: ["./tsconfig.json"] }),
      tanstackStart({
        // Entrada del servidor: src/server.ts (envoltura de errores de SSR).
        server: { entry: "server" },
        importProtection: {
          behavior: "error",
          client: { files: ["**/server/**"], specifiers: ["server-only"] },
        },
      }),
      ...(command === "build" ? [nitro()] : []),
      viteReact(),
    ],
    build: {
      rollupOptions: {
        output: {
          // GSAP core y sus plugins deben quedar en un solo chunk: separados, el orden de
          // inicialización rompe ScrollTrigger en producción ("sc is not a function").
          manualChunks(id: string) {
            if (id.includes("node_modules/gsap") || id.includes("node_modules/@gsap")) return "gsap";
          },
        },
      },
    },
  };
});
