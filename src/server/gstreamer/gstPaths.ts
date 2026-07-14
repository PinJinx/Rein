/**
 * GStreamer path resolution.
 *
 * Resolves the path to `gst-launch-1.0` and the required environment variables
 * for running a GStreamer pipeline. Prefers the locally bundled GStreamer
 * install at `<project-root>/bin/gstreamer/` and falls back to the
 * system-installed GStreamer.
 */

import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { fileURLToPath } from "node:url"
import logger from "../../utils/logger"

function resolveProjectRoot(): string {
	const currentFile = fileURLToPath(import.meta.url)
	let dir = path.dirname(currentFile)
	for (let i = 0; i < 10; i++) {
		if (fs.existsSync(path.join(dir, "package.json"))) {
			return dir
		}
		const parent = path.dirname(dir)
		if (parent === dir) break
		dir = parent
	}
	// Fallback: cwd
	return process.cwd()
}

const PROJECT_ROOT = resolveProjectRoot()
const BUNDLED_GSTREAMER_ROOT = path.join(PROJECT_ROOT, "bin", "gstreamer")

// ---------------------------------------------------------------------------
// Platform-specific binary names
// ---------------------------------------------------------------------------

const GST_LAUNCH =
	os.platform() === "win32" ? "gst-launch-1.0.exe" : "gst-launch-1.0"

const GST_INSPECT =
	os.platform() === "win32" ? "gst-inspect-1.0.exe" : "gst-inspect-1.0"

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface GstPaths {
	/** Absolute path to the `gst-launch-1.0` executable. */
	gstLaunch: string
	/** Absolute path to `gst-inspect-1.0` */
	gstInspect: string
	/** Whether we are using the locally bundled GStreamer. */
	isBundled: boolean
	/**
	 * Environment variables to merge into the spawned process env.
	 * Only populated when using the bundled install (sets GST_PLUGIN_PATH etc.).
	 */
	env: Record<string, string>
}

/**
 * Detect whether the locally bundled GStreamer exists and is usable.
 * Returns `true` if the main executable is present.
 */
function hasBundledGstreamer(): boolean {
	const exe = path.join(BUNDLED_GSTREAMER_ROOT, "bin", GST_LAUNCH)
	return fs.existsSync(exe)
}

/**
 * Build the GStreamer paths object for the **bundled** install.
 */
function bundledPaths(): GstPaths {
	const binDir = path.join(BUNDLED_GSTREAMER_ROOT, "bin")
	const pluginDir = path.join(BUNDLED_GSTREAMER_ROOT, "lib", "gstreamer-1.0")
	const pluginScannerDir = path.join(
		BUNDLED_GSTREAMER_ROOT,
		"libexec",
		"gstreamer-1.0",
	)
	const registryPath = path.join(BUNDLED_GSTREAMER_ROOT, "registry.bin")

	const env: Record<string, string> = {
		GST_PLUGIN_PATH: pluginDir,
		GST_PLUGIN_SCANNER: path.join(
			pluginScannerDir,
			os.platform() === "win32"
				? "gst-plugin-scanner.exe"
				: "gst-plugin-scanner",
		),
		GST_REGISTRY: registryPath,
	}

	// On Windows the DLLs live alongside gst-launch; make sure they are on PATH.
	if (os.platform() === "win32") {
		const existingPath = process.env.PATH ?? ""
		env.PATH = `${binDir};${existingPath}`
	}

	return {
		gstLaunch: path.join(binDir, GST_LAUNCH),
		gstInspect: path.join(binDir, GST_INSPECT),
		isBundled: true,
		env,
	}
}

/**
 * Build the GStreamer paths object for the **system** install.
 * Assumes `gst-launch-1.0` is on `PATH`.
 */
function systemPaths(): GstPaths {
	return {
		gstLaunch: GST_LAUNCH, // rely on PATH
		gstInspect: GST_INSPECT,
		isBundled: false,
		env: {},
	}
}

/**
 * Resolve the GStreamer paths. Prefers the bundled install; falls back to system.
 */
export function resolveGstPaths(): GstPaths {
	if (hasBundledGstreamer()) {
		logger.info(`Using bundled GStreamer at ${BUNDLED_GSTREAMER_ROOT}`)
		return bundledPaths()
	}

	logger.info(
		"Bundled GStreamer not found — falling back to system-installed GStreamer",
	)
	return systemPaths()
}
