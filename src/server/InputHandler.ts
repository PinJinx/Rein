// lib/input/InputHandler.ts
import { Button, Key, Point, keyboard, mouse } from "@nut-tree-fork/nut-js"
import { KEY_MAP } from "./KeyMap"
import { moveRelative } from "./ydotool"
import os from "node:os"
import { WindowsInputInjector } from "./drivers/windows"

export interface InputMessage {
	type:
		| "move"
		| "paste"
		| "copy"
		| "click"
		| "scroll"
		| "key"
		| "text"
		| "zoom"
		| "combo"
		| "touch"
	dx?: number
	dy?: number
	button?: "left" | "right" | "middle"
	press?: boolean
	key?: string
	keys?: string[]
	text?: string
	delta?: number
	contacts?: Array<{
		id: number
		x: number
		y: number
		state: "down" | "move" | "up"
	}>
}

export interface InputConfig {
	sensitivity: number // 0.1 to 3.0
	invertScroll: boolean
	acceleration: boolean
}

export class InputHandler {
	private lastMoveTime = 0
	private lastScrollTime = 0
	private pendingMove: InputMessage | null = null
	private pendingScroll: InputMessage | null = null
	private moveTimer: ReturnType<typeof setTimeout> | null = null
	private scrollTimer: ReturnType<typeof setTimeout> | null = null
	private throttleMs: number
	private modifier: Key
	private isWindows: boolean
	private winInjector: WindowsInputInjector | null = null

	constructor(config: Partial<InputConfig> = {}, throttleMs = 8) {
		mouse.config.mouseSpeed = 1000
		this.isWindows = os.platform() === "win32"
		this.modifier = os.platform() === "darwin" ? Key.LeftSuper : Key.LeftControl
		this.throttleMs = throttleMs

		if (this.isWindows) {
			this.winInjector = new WindowsInputInjector(config)
		}
	}

	updateConfig(config: Partial<InputConfig>): void {
		if (this.isWindows && this.winInjector) {
			this.winInjector.updateConfig(config)
		}
	}

	setThrottleMs(ms: number) {
		this.throttleMs = ms
	}

	private isFiniteNumber(value: unknown): value is number {
		return typeof value === "number" && Number.isFinite(value)
	}

	private clamp(value: number, min: number, max: number): number {
		return Math.max(min, Math.min(max, value))
	}

	async handleMessage(msg: InputMessage) {
		// --- Input sanitisation ---
		if (typeof msg.text === "string" && msg.text.length > 500) {
			msg.text = msg.text.substring(0, 500)
		}
		const MAX_COORD = 2000
		msg.dx = this.isFiniteNumber(msg.dx)
			? this.clamp(msg.dx, -MAX_COORD, MAX_COORD)
			: 0
		msg.dy = this.isFiniteNumber(msg.dy)
			? this.clamp(msg.dy, -MAX_COORD, MAX_COORD)
			: 0
		msg.delta = this.isFiniteNumber(msg.delta)
			? this.clamp(msg.delta, -MAX_COORD, MAX_COORD)
			: 0

		// --- Throttle high-frequency events ---
		if (msg.type === "move" || msg.type === "scroll") {
			const key = msg.type === "move" ? "lastMoveTime" : "lastScrollTime"
			const pending = msg.type === "move" ? "pendingMove" : "pendingScroll"
			const timer = msg.type === "move" ? "moveTimer" : "scrollTimer"
			const now = Date.now()

			if (now - this[key] < this.throttleMs) {
				this[pending] = msg
				if (!this[timer]) {
					this[timer] = setTimeout(() => {
						this[timer] = null
						const p = this[pending]
						if (p) {
							this[pending] = null
							this.handleMessage(p).catch(console.error)
						}
					}, this.throttleMs)
				}
				return
			}
			this[key] = now
		}

		switch (msg.type) {
			// ---------------------------------------------------------------
			case "move":
				if (msg.dx === 0 && msg.dy === 0) break
				if (this.isWindows && this.winInjector) {
					// Use new Windows injector which applies sensitivity/acceleration
					this.winInjector.injectMouseMove(msg.dx, msg.dy)
					break
				}
				try {
					const success = await moveRelative(msg.dx, msg.dy)
					if (!success) {
						const pos = await mouse.getPosition()
						await mouse.setPosition(
							new Point(Math.round(pos.x + msg.dx), Math.round(pos.y + msg.dy)),
						)
					}
				} catch (err) {
					console.error("Move event failed:", err)
				}
				break

			// ---------------------------------------------------------------
			case "click": {
				const VALID = ["left", "right", "middle"] as const
				if (
					!msg.button ||
					!VALID.includes(msg.button as (typeof VALID)[number])
				)
					break
				const button = msg.button as "left" | "right" | "middle"

				if (this.isWindows && this.winInjector) {
					this.winInjector.injectMouseButton(button, !!msg.press)
					break
				}

				const btn =
					button === "left"
						? Button.LEFT
						: button === "right"
							? Button.RIGHT
							: Button.MIDDLE
				try {
					if (msg.press) await mouse.pressButton(btn)
					else await mouse.releaseButton(btn)
				} catch (err) {
					console.error("Click event failed:", err)
					await mouse.releaseButton(btn).catch(() => {})
				}
				break
			}

			// ---------------------------------------------------------------
			case "copy":
				if (this.isWindows && this.winInjector) {
					this.winInjector.injectCombo(["control", "c"])
					break
				}
				try {
					await keyboard.pressKey(this.modifier, Key.C)
				} catch (e) {
					console.warn("Copy failed:", e)
				} finally {
					await Promise.allSettled([
						keyboard.releaseKey(Key.C),
						keyboard.releaseKey(this.modifier),
					])
				}
				break

			case "paste":
				if (this.isWindows && this.winInjector) {
					this.winInjector.injectCombo(["control", "v"])
					break
				}
				try {
					await keyboard.pressKey(this.modifier, Key.V)
				} catch (e) {
					console.warn("Paste failed:", e)
				} finally {
					await Promise.allSettled([
						keyboard.releaseKey(Key.V),
						keyboard.releaseKey(this.modifier),
					])
				}
				break

			// ---------------------------------------------------------------
			case "scroll":
				if (this.isWindows && this.winInjector) {
					// Windows injector handles invertScroll setting
					this.winInjector.injectMouseWheel(msg.dx, msg.dy)
					break
				}
				{
					const MAX_SCROLL = 100
					const promises: Promise<unknown>[] = []
					if (this.isFiniteNumber(msg.dy) && Math.round(msg.dy) !== 0) {
						const amt = this.clamp(Math.round(msg.dy), -MAX_SCROLL, MAX_SCROLL)
						promises.push(
							amt > 0 ? mouse.scrollDown(amt) : mouse.scrollUp(-amt),
						)
					}
					if (this.isFiniteNumber(msg.dx) && Math.round(msg.dx) !== 0) {
						const amt = this.clamp(Math.round(msg.dx), -MAX_SCROLL, MAX_SCROLL)
						promises.push(
							amt > 0 ? mouse.scrollRight(amt) : mouse.scrollLeft(-amt),
						)
					}
					if (promises.length) {
						const results = await Promise.allSettled(promises)
						for (const r of results)
							if (r.status === "rejected")
								console.error("Scroll failed:", r.reason)
					}
				}
				break

			// ---------------------------------------------------------------
			case "zoom":
				// On Windows zoom is handled by the touch layer (pinch contacts).
				if (this.isWindows) break
				if (!this.isFiniteNumber(msg.delta) || msg.delta === 0) break
				{
					const MAX_ZOOM_STEP = 5
					const scaledDelta =
						Math.sign(msg.delta) *
						Math.min(Math.abs(msg.delta) * 0.5, MAX_ZOOM_STEP)
					const amount = Math.round(-scaledDelta)
					if (amount !== 0) {
						await keyboard.pressKey(Key.LeftControl)
						try {
							amount > 0
								? await mouse.scrollDown(amount)
								: await mouse.scrollUp(-amount)
						} finally {
							await keyboard.releaseKey(Key.LeftControl)
						}
					}
				}
				break

			// ---------------------------------------------------------------
			case "key":
				if (!msg.key || typeof msg.key !== "string" || msg.key.length > 50)
					break
				if (this.isWindows && this.winInjector) {
					this.winInjector.injectKey(msg.key)
					break
				}
				{
					const nutKey = KEY_MAP[msg.key.toLowerCase()]
					try {
						if (nutKey !== undefined) {
							await keyboard.pressKey(nutKey)
							await keyboard.releaseKey(nutKey)
						} else if (msg.key === " " || msg.key.toLowerCase() === "space") {
							await keyboard.pressKey(KEY_MAP.space)
							await keyboard.releaseKey(KEY_MAP.space)
						} else if (msg.key.length === 1) {
							await keyboard.type(msg.key)
						} else {
							console.log("Unmapped key:", msg.key)
						}
					} catch (err) {
						console.warn("Key press failed:", err)
						if (nutKey !== undefined)
							await keyboard.releaseKey(nutKey).catch(() => {})
					}
				}
				break

			// ---------------------------------------------------------------
			case "combo":
				if (
					!Array.isArray(msg.keys) ||
					msg.keys.length === 0 ||
					msg.keys.length > 10
				)
					break
				if (this.isWindows && this.winInjector) {
					this.winInjector.injectCombo(msg.keys)
					break
				}
				{
					const nutKeys: Key[] = []
					const charKeys: string[] = []
					for (const k of msg.keys) {
						const nutKey = KEY_MAP[k.toLowerCase()]
						if (nutKey !== undefined) nutKeys.push(nutKey)
						else if (k.length === 1) charKeys.push(k)
						else console.warn("Unknown combo key:", k)
					}
					const pressed: Key[] = []
					try {
						for (const k of nutKeys) {
							await keyboard.pressKey(k)
							pressed.push(k)
						}
						for (const c of charKeys) await keyboard.type(c)
						await new Promise((r) => setTimeout(r, 10))
					} catch (err) {
						console.error("Combo failed:", err)
					} finally {
						await Promise.allSettled(
							pressed.reverse().map((k) => keyboard.releaseKey(k)),
						)
					}
				}
				break

			// ---------------------------------------------------------------
			case "text":
				if (!msg.text || typeof msg.text !== "string") break
				if (this.isWindows && this.winInjector) {
					console.log("Injecting text via Windows injector:", msg.text)
					this.winInjector.injectText(msg.text)
					break
				}
				try {
					await keyboard.type(msg.text)
				} catch (e) {
					console.error("Type failed:", e)
				}
				break

			// ---------------------------------------------------------------
			case "touch":
				if (this.isWindows && this.winInjector && msg.contacts) {
					this.winInjector.injectTouch(msg.contacts)
				}
				break
		}
	}
}
