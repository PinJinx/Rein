import { useRef, useState, useCallback } from "react"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TouchContact {
	id: number
	x: number
	y: number
	state: "down" | "move" | "up"
}

interface Point {
	x: number
	y: number
}

type SendFn = (msg: unknown) => void

// ---------------------------------------------------------------------------
// Gesture constants — tune here, not scattered throughout logic
// ---------------------------------------------------------------------------
const SCROLL_SENSITIVITY = 1.0 // multiplier for 2-finger scroll delta
const ZOOM_SENSITIVITY = 0.01 // pinch distance → zoom delta
const SWIPE_3F_MIN_PX = 10 // min movement before a 3-finger swipe fires

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function midpoint(a: Point, b: Point): Point {
	return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

function distance(a: Point, b: Point): number {
	return Math.hypot(a.x - b.x, a.y - b.y)
}

// ---------------------------------------------------------------------------
// Canvas coordinate transform
// ---------------------------------------------------------------------------

function getCanvasCoords(
	touch: globalThis.Touch,
	canvas: HTMLCanvasElement,
): Point {
	const rect = canvas.getBoundingClientRect()
	const scaleX = canvas.width / rect.width
	const scaleY = canvas.height / rect.height
	return {
		x: (touch.clientX - rect.left) * scaleX,
		y: (touch.clientY - rect.top) * scaleY,
	}
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * useWindowsTouch
 *
 * Converts browser TouchEvents into Win32-compatible messages.
 *
 * Gesture dispatch:
 *  1 finger  → raw touch contacts (pointer events, cursor move / click)
 *  2 fingers → scroll (MOUSEEVENTF_WHEEL via "scroll" msg)
 *  2 fingers spread/pinch → zoom (via "zoom" msg)
 *  3+ fingers → raw touch contacts (Windows handles multitasking gestures)
 *
 * All raw touch frames are also forwarded as { type: "touch" } so the
 * Windows InjectPointerInput path always has a complete picture.
 */
export function useWindowsTouch(
	send: SendFn,
	canvasRef: React.RefObject<HTMLCanvasElement | null>,
) {
	const [isTracking, setIsTracking] = useState(false)

	// Live contact map — source of truth for current finger positions
	const contacts = useRef<Map<number, TouchContact>>(new Map())

	// 2-finger gesture tracking
	const prevMid = useRef<Point | null>(null)
	const prevDist = useRef<number | null>(null)

	// 3-finger gesture tracking
	const prev3fMid = useRef<Point | null>(null)

	// -----------------------------------------------------------------------
	// Frame builder — produces the full contact array for this tick
	// -----------------------------------------------------------------------

	const buildFrame = useCallback(
		(changedIds: number[], state: "down" | "move" | "up"): TouchContact[] => {
			const map = contacts.current
			// Mark changed contacts with their new state
			for (const id of changedIds) {
				const existing = map.get(id)
				if (existing) map.set(id, { ...existing, state })
			}
			// Return full snapshot (all fingers, unchanged ones carry "move")
			return Array.from(map.values())
		},
		[],
	)

	// -----------------------------------------------------------------------
	// Post-frame cleanup
	// -----------------------------------------------------------------------

	const cleanupFrame = useCallback(() => {
		const map = contacts.current
		for (const [id, c] of map) {
			if (c.state === "up") {
				map.delete(id)
			} else if (c.state === "down") {
				map.set(id, { ...c, state: "move" })
			}
		}
		setIsTracking(map.size > 0)
	}, [])

	// -----------------------------------------------------------------------
	// Gesture: 2-finger scroll + pinch zoom
	// -----------------------------------------------------------------------

	const handle2Finger = useCallback(
		(pts: [Point, Point], isEnd: boolean) => {
			if (isEnd) {
				prevMid.current = null
				prevDist.current = null
				return
			}

			const mid = midpoint(pts[0], pts[1])
			const dist = distance(pts[0], pts[1])

			if (prevMid.current !== null && prevDist.current !== null) {
				const dx = (mid.x - prevMid.current.x) * SCROLL_SENSITIVITY
				const dy = (mid.y - prevMid.current.y) * SCROLL_SENSITIVITY

				// Scroll — invert so content follows fingers (natural scroll)
				if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
					send({ type: "scroll", dx, dy })
				}

				// Pinch zoom
				const distDelta = (dist - prevDist.current) * ZOOM_SENSITIVITY
				if (Math.abs(distDelta) > 0.001) {
					send({ type: "zoom", delta: distDelta })
				}
			}

			prevMid.current = mid
			prevDist.current = dist
		},
		[send],
	)

	// -----------------------------------------------------------------------
	// Gesture: 3-finger swipe → raw touch (let Windows handle it)
	// -----------------------------------------------------------------------

	const handle3PlusFingers = useCallback((pts: Point[], isEnd: boolean) => {
		if (isEnd) {
			prev3fMid.current = null
			return
		}
		// We just forward raw contacts — Windows' PTP driver interprets
		// 3-finger swipe as Mission Control / Task View / etc.
		prev3fMid.current = midpoint(pts[0], pts[1])
	}, [])

	// -----------------------------------------------------------------------
	// Core event handler
	// -----------------------------------------------------------------------

	const handleTouch = useCallback(
		(e: React.TouchEvent, state: "down" | "move" | "up") => {
			e.preventDefault()
			const canvas = canvasRef.current
			if (!canvas) return

			const map = contacts.current

			// Register / update all changed touches
			for (let i = 0; i < e.changedTouches.length; i++) {
				const t = e.changedTouches[i]
				const pos = getCanvasCoords(t, canvas)

				if (state === "up") {
					const existing = map.get(t.identifier)
					if (existing) map.set(t.identifier, { ...existing, state: "up" })
				} else {
					map.set(t.identifier, { id: t.identifier, x: pos.x, y: pos.y, state })
				}
			}

			const activeContacts = Array.from(map.values())
			const count = activeContacts.length

			// Always send raw touch frame — Windows InjectPointerInput needs it
			const frame = buildFrame(
				Array.from(e.changedTouches).map((t) => t.identifier),
				state,
			)
			if (frame.length > 0) send({ type: "touch", contacts: frame })

			// Gesture layer
			const isEnd = state === "up" && map.size <= e.changedTouches.length

			if (count === 2) {
				const pts = activeContacts.map((c) => ({ x: c.x, y: c.y })) as [
					Point,
					Point,
				]
				handle2Finger(pts, isEnd)
			} else if (count >= 3) {
				handle3PlusFingers(
					activeContacts.map((c) => ({ x: c.x, y: c.y })),
					isEnd,
				)
			} else {
				// 1-finger — reset 2-finger state
				prevMid.current = null
				prevDist.current = null
			}

			cleanupFrame()
		},
		[
			canvasRef,
			send,
			buildFrame,
			cleanupFrame,
			handle2Finger,
			handle3PlusFingers,
		],
	)

	// -----------------------------------------------------------------------
	// Public API
	// -----------------------------------------------------------------------

	return {
		isTracking,
		handlers: {
			onTouchStart: (e: React.TouchEvent) => handleTouch(e, "down"),
			onTouchMove: (e: React.TouchEvent) => handleTouch(e, "move"),
			onTouchEnd: (e: React.TouchEvent) => handleTouch(e, "up"),
			onTouchCancel: (e: React.TouchEvent) => handleTouch(e, "up"),
		},
	}
}
