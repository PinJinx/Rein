"use client"

import { useConnection } from "../contexts/ConnectionProvider"

export const useRemoteConnection = () => {
	const { wsRef, status, platform, send, subscribe } = useConnection()

	const sendCombo = (msg: string[]) => {
		send({
			type: "combo",
			keys: msg,
		})
	}
	const sendConfigUpdate = (sensitivity: number, invertScroll: boolean) => {
		send({
			type: "update-settings",
			config: { sensitivity, invertScroll },
		})
	}

	return {
		status,
		platform,
		send,
		sendCombo,
		sendConfigUpdate,
		wsRef,
		subscribe,
	}
}
