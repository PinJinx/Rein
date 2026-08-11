import net from "node:net"
import { attachSignalingRoutes } from "./server"

// Nitro server plugin – wires up signaling API routes in production.
// Runs inside the compiled .output/server/index.mjs process spawned by Electron.
//
// Nitro v3 + srvx does NOT emit a "listen:node" hook, so we intercept
// net.Server.prototype.listen instead. Every HTTP/HTTPS server must call
// listen() to accept connections — srvx's server is no exception.
// We capture the server instance, attach our routes, then immediately restore
// the prototype method so nothing else is affected.
//
// biome-ignore lint/suspicious/noExplicitAny: prototype patching requires any
export default function (nitroApp: any) {
	const origListen = net.Server.prototype.listen
	// biome-ignore lint/suspicious/noExplicitAny: prototype patching requires any
	net.Server.prototype.listen = function (this: any, ...args: any[]) {
		// Restore immediately — only intercept the first listen() (the srvx server)
		net.Server.prototype.listen = origListen
		// Attach all /api/* handlers + WebRTC + GStreamer to this server
		attachSignalingRoutes(this)
		// biome-ignore lint/suspicious/noExplicitAny: forwarding variadic args
		return (origListen as any).apply(this, args)
	}
}
