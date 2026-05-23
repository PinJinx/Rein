"use client"
/**
 * Mirror Stream Receiver Hook
 * This hook handles subscribing to the incoming WebRTC media stream and binding
 * it directly to a video element for display.
 */

import { useConnection } from "@/contexts/ConnectionProvider"
import { useEffect, useRef, useState } from "react"

export function useMirrorStream(
	videoRef: React.RefObject<HTMLVideoElement | null>, // switch from canvas to video
	status: "connecting" | "connected" | "disconnected",
) {
	const { subscribeMirrorStream, send } = useConnection()
	const [hasStream, setHasStream] = useState(false)

	const sendRef = useRef(send)
	sendRef.current = send

	const subRef = useRef(subscribeMirrorStream)
	subRef.current = subscribeMirrorStream

	useEffect(() => {
		if (status !== "connected") return

		sendRef.current({ type: "start-mirror" })

		const unsub = subRef.current((stream) => {
			console.log("[RTC] mirror-stream received")
			if (videoRef.current) {
				videoRef.current.srcObject = stream
				if (stream) {
					videoRef.current.play().catch(() => {})
					setHasStream(true)
				} else {
					setHasStream(false)
				}
			}
		})

		return () => {
			unsub()
			sendRef.current({ type: "stop-mirror" })
		}
	}, [status, videoRef])

	return { hasStream }
}
