import fs from "node:fs"
import { fileURLToPath } from "node:url"
import QRCode from "qrcode"
import { getOrCreateActiveToken } from "../server/tokenStore"
import { i18n } from "./i18n"
import { getLanIp } from "./net"

const str = i18n.en.server

export async function printWelcome(port: number): Promise<void> {
	const local = `http://localhost:${port}`
	const lanIp = getLanIp()
	const network = `http://${lanIp}:${port}`
	const debug = `${local}/debug`

	const token = getOrCreateActiveToken()
	const remoteUrl = `${network}/trackpad?token=${encodeURIComponent(token)}`

	const bold = (t: string) => `\x1b[1m${t}\x1b[0m`
	const cyan = (t: string) => `\x1b[36m${t}\x1b[0m`
	const green = (t: string) => `\x1b[32m${t}\x1b[0m`
	const gray = (t: string) => `\x1b[90m${t}\x1b[0m`
	const divider = gray("────────────────────────────────────────────────────")
	const row = (label: string, value: string, color = green) =>
		`${gray(label.padEnd(10))} ${color(value)}`

	const configPath = fileURLToPath(
		new URL("../server-config.json", import.meta.url),
	)
	// If logs enabled dont print welcomescreen
	try {
		const raw = fs.readFileSync(configPath, "utf-8")
		const cfg = JSON.parse(raw) as { verboseLogs?: boolean }
		if (cfg.verboseLogs === true) return
	} catch {
		// ignore
	}

	let qrLines: string[] = []
	try {
		const qrStr = await QRCode.toString(remoteUrl, {
			type: "terminal",
			small: true,
		})
		qrLines = qrStr.split("\n").filter((l) => l.trim().length > 0)
	} catch {
		// ignore QR error
	}

	const output: string[] = [
		"",
		`  ${bold(cyan("REIN"))}`,
		`  ${divider}`,
		"",
		`  ${row(str.localLabel, local, cyan)}`,
		`  ${row(str.networkLabel, network)}`,
		`  ${row("Remote", remoteUrl, green)}`,
		`  ${row(str.debugLabel, debug, cyan)}`,
		"",
		`  ${divider}`,
		`  ${row(str.statusLabel, str.runningLabel, green)}`,
		`  ${row(str.portLabel, String(port), cyan)}`,
	]

	if (qrLines.length > 0) {
		output.push("", `  ${gray("Scan QR code to connect the client:")}`, "")
		for (const qline of qrLines) {
			output.push(`  ${qline}`)
		}
	}

	output.push("", "")

	process.stdout.write(output.join("\n"))
}
