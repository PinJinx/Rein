import { useCallback, useEffect, useRef, useState } from "react"
import { useConnection } from "../contexts/ConnectionProvider"

export function useWebRTCProvider(wsRef: React.RefObject<WebSocket | null>) {
	const { status } = useConnection()
	const [isSharing, setIsSharing] = useState(false)
	const pcRef = useRef<RTCPeerConnection | null>(null)
	const streamRef = useRef<MediaStream | null>(null)

	const stopSharing = useCallback(() => {
		pcRef.current?.close()
		pcRef.current = null
		for (const track of streamRef.current?.getTracks() ?? []) track.stop()
		streamRef.current = null
		wsRef.current?.send(JSON.stringify({ type: "stop-provider" }))
		setIsSharing(false)
	}, [wsRef])

	const startSharing = useCallback(async () => {
		const ws = wsRef.current
		if (!ws || ws.readyState !== WebSocket.OPEN) {
			console.warn("[Provider] WS not open, aborting")
			return
		}
		try {
			const stream = await navigator.mediaDevices.getDisplayMedia({
				video: true,
				audio: false,
			})

			streamRef.current = stream

			const pc = new RTCPeerConnection()
			pcRef.current = pc

			for (const track of stream.getTracks()) {
				pc.addTrack(track, stream)
			}

			pc.onicecandidate = ({ candidate }) => {
				if (candidate) {
					wsRef.current?.send(JSON.stringify({ type: "rtc-ice", candidate }))
				} else {
				}
			}

			pc.onconnectionstatechange = () => {}

			pc.onsignalingstatechange = () => {}

			stream.getVideoTracks()[0].onended = stopSharing

			wsRef.current?.send(JSON.stringify({ type: "provider-ready" }))
			setIsSharing(true)
		} catch (err) {
			console.error("[Provider] getDisplayMedia failed:", err)
			setIsSharing(false)
		}
	}, [wsRef, stopSharing])

	useEffect(() => {
		if (status !== "connected") {
			return
		}
		const ws = wsRef.current
		if (!ws) {
			console.warn("[Provider] status=connected but wsRef.current is null!")
			return
		}

		const handler = async (event: MessageEvent) => {
			// Skip binary frames
			if (event.data instanceof ArrayBuffer || event.data instanceof Blob)
				return

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

			const pc = pcRef.current
			if (!pc) {
				console.warn(
					"[Provider] Got message",
					msg.type,
					"but pcRef.current is null — not sharing yet?",
				)
				return
			}
			if (msg.type === "mirror-ready") {
				if (!pcRef.current) {
					console.log(
						"[Provider] mirror-ready received but not sharing yet, ignoring",
					)
					return
				}
				console.log(
					"[Provider] mirror-ready received — re-sending provider-ready to late consumer",
				)
				ws.send(JSON.stringify({ type: "provider-ready" }))
			} else if (msg.type === "request-offer") {
				const offer = await pc.createOffer()
				await pc.setLocalDescription(offer)
				ws.send(JSON.stringify({ type: "rtc-offer", sdp: offer }))
			} else if (msg.type === "rtc-answer") {
				if (!msg.sdp) {
					console.warn("[Provider] rtc-answer has no sdp!")
					return
				}
				await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp))
			} else if (msg.type === "rtc-ice" && msg.candidate) {
				await pc.addIceCandidate(new RTCIceCandidate(msg.candidate))
			}
		}

		ws.addEventListener("message", handler)

		return () => {
			ws.removeEventListener("message", handler)
		}
	}, [wsRef, status])

	useEffect(
		() => () => {
			pcRef.current?.close()
			for (const track of streamRef.current?.getTracks() ?? []) track.stop()
		},
		[],
	)

	return { isSharing, startSharing, stopSharing }
}
