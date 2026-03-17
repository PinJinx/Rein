import { useEffect, useRef, useState } from "react"

export function useWebRTCMirror(
	wsRef: React.RefObject<WebSocket | null>,
	videoRef: React.RefObject<HTMLVideoElement | null>,
	status: "connecting" | "connected" | "disconnected",
) {
	const [hasStream, setHasStream] = useState(false)
	const pcRef = useRef<RTCPeerConnection | null>(null)

	useEffect(() => {
		const ws = wsRef.current
		if (!ws || status !== "connected") return

		const setupPc = () => {
			pcRef.current?.close()
			const pc = new RTCPeerConnection()
			pcRef.current = pc

			pc.ontrack = ({ streams }) => {
				if (videoRef.current && streams[0]) {
					videoRef.current.srcObject = streams[0]
					setHasStream(true)
				}
			}

			pc.onicecandidate = ({ candidate }) => {
				if (candidate) {
					ws.send(JSON.stringify({ type: "rtc-ice", candidate }))
				}
			}

			return pc
		}

		const handler = async (event: MessageEvent) => {
			let msg: {
				type: string
				sdp?: RTCSessionDescriptionInit
				candidate?: RTCIceCandidateInit
			}
			try {
				msg = JSON.parse(event.data)
			} catch {
				return
			}

			if (msg.type === "provider-ready") {
				const pc = setupPc()
				ws.send(JSON.stringify({ type: "request-offer" }))
				// suppress unused warning — pc used via pcRef
				void pc
			} else if (msg.type === "rtc-offer") {
				const pc = pcRef.current
				if (!pc || !msg.sdp) return
				await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp))
				const answer = await pc.createAnswer()
				await pc.setLocalDescription(answer)
				ws.send(JSON.stringify({ type: "rtc-answer", sdp: answer }))
			} else if (msg.type === "rtc-ice" && msg.candidate) {
				await pcRef.current?.addIceCandidate(new RTCIceCandidate(msg.candidate))
			} else if (msg.type === "stop-provider") {
				setHasStream(false)
			}
		}

		ws.addEventListener("message", handler)
		ws.send(JSON.stringify({ type: "start-mirror" }))
		ws.send(JSON.stringify({ type: "mirror-ready" }))

		return () => {
			ws.removeEventListener("message", handler)
			pcRef.current?.close()
			setHasStream(false)
		}
	}, [wsRef, status, videoRef])

	return { hasStream }
}
