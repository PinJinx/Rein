import koffi from "koffi"

const lib = koffi.load("user32.dll")

// ---- Struct Definitions ----
const POINT = koffi.struct("POINT", {
	x: "long",
	y: "long",
})

const RECT = koffi.struct("RECT", {
	left: "long",
	top: "long",
	right: "long",
	bottom: "long",
})

const POINTER_INFO = koffi.struct("POINTER_INFO", {
	pointerType: "uint32",
	pointerId: "uint32",
	frameId: "uint32",
	pointerFlags: "uint32",
	sourceDevice: "void *",
	hwndTarget: "void *",
	ptPixelLocation: POINT,
	ptHimetricLocation: POINT,
	ptPixelLocationRaw: POINT,
	ptHimetricLocationRaw: POINT,
	dwTime: "uint32",
	historyCount: "uint32",
	InputData: "int32",
	dwKeyStates: "uint32",
	PerformanceCount: "uint64",
	ButtonChangeType: "int32",
})

const POINTER_TOUCH_INFO = koffi.struct("POINTER_TOUCH_INFO", {
	pointerInfo: POINTER_INFO,
	touchFlags: "uint32",
	touchMask: "uint32",
	rcContact: RECT,
	rcContactRaw: RECT,
	orientation: "uint32",
	pressure: "uint32",
})

const POINTER_TYPE_INFO = koffi.struct("POINTER_TYPE_INFO", {
	type: "uint32",
	touchInfo: POINTER_TOUCH_INFO,
})

const MOUSEINPUT = koffi.struct("MOUSEINPUT", {
	dx: "long",
	dy: "long",
	mouseData: "uint32",
	dwFlags: "uint32",
	time: "uint32",
	dwExtraInfo: "uintptr",
})

const KEYBDINPUT = koffi.struct("KEYBDINPUT", {
	wVk: "uint16",
	wScan: "uint16",
	dwFlags: "uint32",
	time: "uint32",
	dwExtraInfo: "uintptr",
})

const INPUT_UNION = koffi.union("INPUT_UNION", {
	mi: MOUSEINPUT,
	ki: KEYBDINPUT,
})

const INPUT = koffi.struct("INPUT", {
	type: "uint32",
	__pad: "uint32",
	u: INPUT_UNION,
})

// ---- Native Function Bindings ----
const _CreateSyntheticPointerDevice = lib.func(
	"void * CreateSyntheticPointerDevice(uint32 pointerType, uint32 maxCount, uint32 mode)",
)

const _InjectPointerInput = lib.func(
	"int InjectPointerInput(void * device, const POINTER_TYPE_INFO * pointerInfo, uint32 count)",
)

const _SendInput = lib.func(
	"uint32 SendInput(uint32 nInputs, const INPUT * pInputs, int cbSize)",
)

const _MapVirtualKeyW = lib.func(
	"uint32 MapVirtualKeyW(uint32 uCode, uint32 uMapType)",
)

// ---- Exports ----
export const INPUT_STRUCT_SIZE = koffi.sizeof(INPUT)

export function SendInput(
	count: number,
	events: unknown,
	size: number,
): number {
	return _SendInput(count, events, size) as number
}

export function CreateSyntheticPointerDevice(
	pointerType: number,
	maxCount: number,
	mode: number,
): unknown {
	return _CreateSyntheticPointerDevice(pointerType, maxCount, mode)
}

export function InjectPointerInput(
	device: unknown,
	pointerInfo: unknown,
	count: number,
): number {
	return _InjectPointerInput(device, pointerInfo, count) as number
}

export function MapVirtualKeyW(uCode: number, uMapType: number): number {
	return _MapVirtualKeyW(uCode, uMapType) as number
}
