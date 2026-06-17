import { URL, fileURLToPath } from "node:url"
import { devtools } from "@tanstack/devtools-vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import { nitro } from "nitro/vite"
import { defineConfig } from "vite"
import serverConfig from "./src/server-config.json"
import { attachSignalingRoutes } from "./src/server/server"

const config = defineConfig({
	base: "/",
	resolve: {
		alias: {
			"@": fileURLToPath(new URL("./src", import.meta.url)),
		},
	},
	plugins: [
		{
			name: "rein-server",
			async configureServer(server) {
				const httpServer = server.httpServer
				if (!httpServer) return
				attachSignalingRoutes(httpServer)
			},
			async configurePreviewServer(server) {
				const httpServer = server.httpServer
				if (!httpServer) return
				attachSignalingRoutes(httpServer)
			},
		},
		devtools(),
		nitro(),

		tanstackStart(),
		viteReact({
			reactCompiler: true,
		}),
	],
	server: {
		host: serverConfig.host === "0.0.0.0" ? true : serverConfig.host,
		port: serverConfig.frontendPort,
	},
})

export default config
