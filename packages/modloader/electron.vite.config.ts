import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "electron-vite"

// Path aliases matching the TsConfig
const srcRoot = path.resolve(__dirname, "src")
const mainRoot = path.resolve(srcRoot, "main")
const preloadRoot = path.resolve(srcRoot, "preload")
const rendererRoot = path.resolve(srcRoot, "renderer")

// Every bundle lands under a single output root
const outRoot = path.resolve(__dirname, "dist", "app")

/**
 * Path aliases for module resolution.
 */
const aliases = {
    "@": srcRoot,
    "@main": mainRoot,
    "@preload": preloadRoot,
    "@renderer": rendererRoot,
}

export default defineConfig({
    main: {
        resolve: { alias: aliases },
        build: { outDir: path.join(outRoot, "main") },
    },
    preload: {
        resolve: { alias: aliases },
        build: { outDir: path.join(outRoot, "preload") },
    },
    renderer: {
        root: rendererRoot,
        base: "./",
        resolve: { alias: aliases },
        plugins: [react(), tailwindcss()],
        build: {
            outDir: path.join(outRoot, "renderer"),
            rollupOptions: {
                input: path.resolve(rendererRoot, "index.html"),
            },
        },
    },
})
