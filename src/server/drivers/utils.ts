import { SHIFTED_CHARS } from "./keyMap.ts"
import type { InputConfig } from "./types.ts"

export function applyMotion(
	dx: number,
	dy: number,
	config: InputConfig,
): { ax: number; ay: number } {
	const sdx = dx * config.sensitivity
	const sdy = dy * config.sensitivity

	if (!config.acceleration) return { ax: sdx, ay: sdy }

	const mag = Math.sqrt(sdx * sdx + sdy * sdy)
	if (mag < 1) return { ax: sdx, ay: sdy }

	const acc = mag ** 1.2 * 0.8
	const ratio = acc / mag
	return { ax: sdx * ratio, ay: sdy * ratio }
}

export function resolveChar(
	ch: string,
	map: Record<string, number>,
): { code?: number; shifted: boolean } {
	if (ch >= "A" && ch <= "Z") {
		return { code: map[ch.toLowerCase()], shifted: true }
	}
	const direct = map[ch]
	if (direct !== undefined) return { code: direct, shifted: false }
	const base = SHIFTED_CHARS[ch]
	if (base !== undefined) {
		return { code: map[base], shifted: true }
	}
	return { code: undefined, shifted: false }
}
