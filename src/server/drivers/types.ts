export interface TouchContact {
	id: number
	x: number
	y: number
	state: "down" | "move" | "up"
}

export interface InputConfig {
	sensitivity: number
	invertScroll: boolean
	acceleration: boolean
}

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
	contacts?: TouchContact[]
}
