import {
	RTCPeerConnection,
	RTCRtpCodecParameters,
	MediaStreamTrack,
} from "werift"
import { WebSocketServer, WebSocket } from "ws"
import dgram from "node:dgram"
import { InputHandler } from "./InputHandler"
import logger from "../utils/logger"
import type { InputMessage, InputConfig } from "./types"
import fs from "node:fs"

interface ClientSession {
	ws: WebSocket
	pc: RTCPeerConnection
	videoTrack: MediaStreamTrack
	inputHandler: InputHandler
	sessionId: string
}

import type { IncomingMessage } from "node:http"
import type { Duplex } from "node:stream"
import type { EventEmitter } from "node:events"

export class WebRTCManager {
	private wss: WebSocketServer
	private udpSocket: dgram.Socket
	private clients = new Map<string, ClientSession>()

	constructor(server: EventEmitter) {
		this.wss = new WebSocketServer({ noServer: true })
		this.udpSocket = dgram.createSocket("udp4")

		server.on(
			"upgrade",
			(request: IncomingMessage, socket: Duplex, head: Buffer) => {
				try {
					const url = new URL(
						request.url || "",
						`http://${request.headers.host || "localhost"}`,
					)
					if (url.pathname === "/ws") {
						this.wss.handleUpgrade(request, socket, head, (ws) => {
							this.wss.emit("connection", ws, request)
						})
					}
				} catch (_err) {
					// Ignore invalid URLs or non-matching upgrades
				}
			},
		)

		this.setupUdpSocket()
		this.setupWebSocketServer()
	}

	private setupUdpSocket() {
		this.udpSocket.on("error", (err) => {
			logger.error(`UDP socket error:\n${err.stack}`)
			this.udpSocket.close()
		})

		this.udpSocket.on("message", (msg) => {
			for (const client of this.clients.values()) {
				try {
					client.videoTrack.writeRtp(msg)
				} catch (_err) {
					// Ignore individual track write errors
				}
			}
		})

		this.udpSocket.bind(5004, "127.0.0.1", () => {
			logger.info("UDP socket listening for RTP packets on 127.0.0.1:5004")
		})
	}

	private getInitialConfig(): Partial<InputConfig> {
		try {
			const configPath = "./src/server-config.json"
			if (fs.existsSync(configPath)) {
				const cfg = JSON.parse(fs.readFileSync(configPath, "utf-8"))
				return {
					sensitivity:
						typeof cfg.sensitivity === "number" ? cfg.sensitivity : 1.0,
					invertScroll:
						typeof cfg.invertScroll === "boolean" ? cfg.invertScroll : false,
				}
			}
		} catch (e) {
			logger.warn(
				`Failed to read initial config from server-config.json: ${String(e)}`,
			)
		}
		return { sensitivity: 1.0, invertScroll: false }
	}

	private setupWebSocketServer() {
		this.wss.on("connection", async (ws) => {
			const sessionId = Math.random().toString(36).substring(7)
			logger.info(`Viewer connected via WebSocket: ${sessionId}`)

			const pc = new RTCPeerConnection({
				iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
			})

			const videoTrack = new MediaStreamTrack({
				kind: "video",
				codec: new RTCRtpCodecParameters({
					mimeType: "video/VP8",
					clockRate: 90000,
					payloadType: 96,
				}),
			})
			pc.addTrack(videoTrack)

			const inputHandler = new InputHandler(
				this.getInitialConfig(),
				8,
				(errorType, message) => {
					logger.error(`InputHandler error: ${errorType} - ${message}`)
					try {
						if (ws.readyState === WebSocket.OPEN) {
							ws.send(
								JSON.stringify({
									type: "error",
									errorType,
									message,
								}),
							)
						}
					} catch (e) {
						logger.error(
							`Failed to transmit error frame to client: ${String(e)}`,
						)
					}
				},
			)

			const dcUnordered = pc.createDataChannel("input-unordered", {
				ordered: false,
				maxRetransmits: 0,
			})
			const dcOrdered = pc.createDataChannel("input-ordered", { ordered: true })

			const handleDataMessage = (msg: Buffer | string) => {
				try {
					const raw = typeof msg === "string" ? msg : msg.toString()
					const parsed = JSON.parse(raw)
					if (parsed.type === "ping") {
						const pong = JSON.stringify({
							type: "pong",
							timestamp: parsed.timestamp,
						})
						dcUnordered.send(pong)
						dcOrdered.send(pong)
						return
					}
					inputHandler.handleMessage(parsed as InputMessage).catch((err) => {
						logger.error(`Input handler processing error: ${String(err)}`)
					})
				} catch (err) {
					logger.error(`Input parse error: ${String(err)}`)
				}
			}

			dcUnordered.onMessage.subscribe((msg) => handleDataMessage(msg))
			dcOrdered.onMessage.subscribe((msg) => handleDataMessage(msg))

			const client: ClientSession = {
				ws,
				pc,
				videoTrack,
				inputHandler,
				sessionId,
			}
			this.clients.set(sessionId, client)

			pc.iceConnectionStateChange.subscribe((state) => {
				logger.info(`WebRTC ICE state for ${sessionId}: ${state}`)
				if (
					state === "disconnected" ||
					state === "failed" ||
					state === "closed"
				) {
					this.cleanupClient(sessionId)
				}
			})

			pc.onIceCandidate.subscribe((candidate) => {
				if (candidate) {
					ws.send(
						JSON.stringify({ type: "ice", candidate: candidate.toJSON() }),
					)
				}
			})

			ws.on("message", async (data) => {
				try {
					const msg = JSON.parse(data.toString())
					if (msg.type === "answer") {
						await pc.setRemoteDescription(msg.sdp)
					} else if (msg.type === "ice" && msg.candidate) {
						await pc.addIceCandidate(msg.candidate)
					} else if (msg.type === "ping") {
						ws.send(JSON.stringify({ type: "pong" }))
					}
				} catch (err) {
					logger.error(`WebSocket message handling error: ${String(err)}`)
				}
			})

			ws.on("close", () => {
				this.cleanupClient(sessionId)
			})

			try {
				const offer = await pc.createOffer()
				await pc.setLocalDescription(offer)
				ws.send(JSON.stringify({ type: "offer", sdp: offer }))
			} catch (err) {
				logger.error(`Failed to create offer: ${String(err)}`)
				this.cleanupClient(sessionId)
			}
		})
	}

	private cleanupClient(sessionId: string) {
		const client = this.clients.get(sessionId)
		if (client) {
			logger.info(`Cleaning up client session: ${sessionId}`)
			try {
				client.pc.close()
			} catch (_e) {}
			try {
				client.inputHandler.destroy()
			} catch (_e) {}
			this.clients.delete(sessionId)
		}
	}

	public updateConfig(config: Partial<InputConfig>) {
		for (const client of this.clients.values()) {
			client.inputHandler.updateConfig(config)
		}
	}

	public shutdown() {
		this.wss.close()
		this.udpSocket.close()
		for (const sessionId of this.clients.keys()) {
			this.cleanupClient(sessionId)
		}
	}
}
