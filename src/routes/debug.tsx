import { createFileRoute } from "@tanstack/react-router"
import {
	Activity,
	Server,
	Users,
	Wifi,
	Terminal,
	ShieldCheck,
	Zap,
} from "lucide-react"

export const Route = createFileRoute("/debug")({
	component: DebugScreen,
})

function DebugScreen() {
	return (
		<div className="min-h-screen bg-base-300 text-base-content p-6 font-sans">
			<div className="max-w-7xl mx-auto space-y-6">
				{/* Header */}
				<header className="flex items-center justify-between pb-4 border-b border-base-200">
					<div className="flex items-center gap-3">
						<div className="p-2 bg-primary/10 rounded-lg border border-primary/20">
							<Terminal className="w-6 h-6 text-primary" />
						</div>
						<div>
							<h1 className="text-2xl font-bold text-primary">
								System Debug Console
							</h1>
							<p className="text-sm text-base-content/60">
								Real-time system diagnostics and metrics
							</p>
						</div>
					</div>
					<div className="flex items-center gap-2 px-3 py-1.5 bg-success/10 border border-success/20 rounded-full text-success text-sm font-medium">
						<div className="w-2 h-2 rounded-full bg-success animate-pulse"></div>
						System Online
					</div>
				</header>

				<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
					{/* Network Status Panel */}
					<div className="bg-base-100 border border-base-200 rounded-box p-6 shadow-sm transition-all hover:border-primary/30 duration-300">
						<div className="flex items-center gap-3 mb-6">
							<Wifi className="w-5 h-5 text-primary" />
							<h2 className="text-lg font-semibold">Network Metrics</h2>
						</div>

						{/* Mock Graph Area */}
						<div className="relative h-48 w-full bg-base-200 rounded-xl border border-base-300 p-4 mb-4 overflow-hidden flex items-end">
							{/* Mock Line Graph */}
							<svg
								viewBox="0 0 100 40"
								className="w-full h-full preserve-3d drop-shadow-md text-primary overflow-visible"
								preserveAspectRatio="none"
							>
								<title>Network Activity Graph</title>
								<path
									d="M0 40 L0 30 Q 10 25 20 28 T 40 20 T 60 15 T 80 25 T 100 10 L 100 40 Z"
									fill="url(#gradient)"
									className="opacity-20"
								/>
								<path
									d="M0 30 Q 10 25 20 28 T 40 20 T 60 15 T 80 25 T 100 10"
									fill="none"
									stroke="currentColor"
									strokeWidth="1.5"
								/>
								<defs>
									<linearGradient id="gradient" x1="0" x2="0" y1="0" y2="1">
										<stop offset="0%" stopColor="currentColor" />
										<stop offset="100%" stopColor="transparent" />
									</linearGradient>
								</defs>
							</svg>
							{/* Grid lines overlay */}
							<div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-10">
								{[...Array(5)].map((_, i) => (
									// biome-ignore lint/suspicious/noArrayIndexKey: Static decorative lines
									<div key={i} className="w-full h-[1px] bg-current"></div>
								))}
							</div>
						</div>

						<div className="grid grid-cols-3 gap-4">
							<div className="bg-base-200 rounded-xl p-3 border border-base-300">
								<p className="text-xs text-base-content/70 mb-1">Latency</p>
								<p className="text-xl font-bold text-success">
									8
									<span className="text-sm font-medium text-base-content/50 ml-1">
										ms
									</span>
								</p>
							</div>
							<div className="bg-base-200 rounded-xl p-3 border border-base-300">
								<p className="text-xs text-base-content/70 mb-1">Sent</p>
								<p className="text-xl font-bold text-info">
									1.2
									<span className="text-sm font-medium text-base-content/50 ml-1">
										MB/s
									</span>
								</p>
							</div>
							<div className="bg-base-200 rounded-xl p-3 border border-base-300">
								<p className="text-xs text-base-content/70 mb-1">Received</p>
								<p className="text-xl font-bold text-primary">
									4.5
									<span className="text-sm font-medium text-base-content/50 ml-1">
										MB/s
									</span>
								</p>
							</div>
						</div>
					</div>

					{/* Health Screen Panel */}
					<div className="bg-base-100 border border-base-200 rounded-box p-6 shadow-sm transition-all hover:border-success/30 duration-300 flex flex-col">
						<div className="flex items-center gap-3 mb-6">
							<Activity className="w-5 h-5 text-success" />
							<h2 className="text-lg font-semibold">System Health</h2>
						</div>

						<div className="flex-1 flex flex-col gap-4">
							<div className="flex items-center justify-between p-4 bg-base-200 rounded-xl border border-base-300">
								<div className="flex items-center gap-3">
									<ShieldCheck className="w-8 h-8 text-success" />
									<div>
										<p className="font-medium">GStreamer Pipeline</p>
										<p className="text-xs text-base-content/60">
											Running smoothly
										</p>
									</div>
								</div>
								<span className="badge badge-success badge-sm badge-outline">
									Active
								</span>
							</div>

							<div className="flex items-center justify-between p-4 bg-base-200 rounded-xl border border-base-300">
								<div className="flex items-center gap-3">
									<Zap className="w-8 h-8 text-warning" />
									<div>
										<p className="font-medium">Hardware Acceleration</p>
										<p className="text-xs text-base-content/60">
											NVENC Encoding
										</p>
									</div>
								</div>
								<span className="badge badge-warning badge-sm badge-outline">
									Enabled
								</span>
							</div>

							<div className="flex items-center justify-between p-4 bg-base-200 rounded-xl border border-base-300">
								<div className="flex items-center gap-3">
									<Server className="w-8 h-8 text-info" />
									<div>
										<p className="font-medium">WebRTC Signaling</p>
										<p className="text-xs text-base-content/60">
											Listening on port 3000
										</p>
									</div>
								</div>
								<span className="badge badge-info badge-sm badge-outline">
									Connected
								</span>
							</div>
						</div>
					</div>

					{/* Server Log Panel */}
					<div className="bg-base-100 border border-base-200 rounded-box p-6 shadow-sm transition-all hover:border-base-content/30 duration-300">
						<div className="flex items-center justify-between mb-4">
							<div className="flex items-center gap-3">
								<Server className="w-5 h-5 text-base-content/60" />
								<h2 className="text-lg font-semibold">Server Log</h2>
							</div>
							<button
								type="button"
								className="btn btn-ghost btn-xs text-base-content/60"
							>
								Clear
							</button>
						</div>

						<div className="bg-base-300 rounded-xl border border-base-200 p-4 h-64 overflow-y-auto font-mono text-xs space-y-2">
							<div className="text-base-content/70">
								[10:42:01] <span className="text-info font-bold">INFO</span>{" "}
								Server initialized successfully
							</div>
							<div className="text-base-content/70">
								[10:42:03] <span className="text-info font-bold">INFO</span>{" "}
								Signaling channel ready
							</div>
							<div className="text-base-content/70">
								[10:42:05] <span className="text-warning font-bold">WARN</span>{" "}
								High CPU usage detected during startup
							</div>
							<div className="text-base-content/70">
								[10:42:10]{" "}
								<span className="text-success font-bold">SUCCESS</span> Pipeline
								attached
							</div>
							<div className="text-base-content/70">
								[10:43:12] <span className="text-info font-bold">INFO</span>{" "}
								Waiting for incoming connections...
							</div>
							<div className="text-base-content/70">
								[10:44:00]{" "}
								<span className="text-success font-bold">SUCCESS</span> Peer
								connected: 192.168.1.45
							</div>
						</div>
					</div>

					{/* Client Log Panel */}
					<div className="bg-base-100 border border-base-200 rounded-box p-6 shadow-sm transition-all hover:border-secondary/30 duration-300">
						<div className="flex items-center gap-3 mb-4">
							<Users className="w-5 h-5 text-secondary" />
							<h2 className="text-lg font-semibold">Client Sessions</h2>
						</div>

						<div className="space-y-3 h-64 overflow-y-auto pr-2">
							{/* Client 1 Mock */}
							<div className="bg-base-200 rounded-xl border border-base-300 p-4">
								<div className="flex justify-between items-start mb-2">
									<div className="flex items-center gap-2">
										<div className="w-2 h-2 rounded-full bg-success animate-pulse"></div>
										<h3 className="font-medium text-sm">Client 1 (iPad Pro)</h3>
									</div>
									<span className="text-xs text-base-content/60">
										192.168.1.45
									</span>
								</div>
								<div className="bg-base-300 rounded-lg p-2 font-mono text-xs text-base-content/70">
									<div>
										<span className="text-secondary">➔</span> ICE Connection:
										connected
									</div>
									<div>
										<span className="text-secondary">➔</span> Input DataChannel:
										open
									</div>
									<div>
										<span className="text-secondary">➔</span> Res: 2388x1668 @
										120Hz
									</div>
								</div>
							</div>

							{/* Client 2 Mock */}
							<div className="bg-base-200 rounded-xl border border-base-300 p-4 opacity-60 grayscale hover:grayscale-0 transition-all">
								<div className="flex justify-between items-start mb-2">
									<div className="flex items-center gap-2">
										<div className="w-2 h-2 rounded-full bg-warning"></div>
										<h3 className="font-medium text-sm">
											Client 2 (iPhone 13)
										</h3>
									</div>
									<span className="text-xs text-base-content/60">
										192.168.1.102
									</span>
								</div>
								<div className="bg-base-300 rounded-lg p-2 font-mono text-xs text-base-content/70">
									<div>
										<span className="text-secondary">➔</span> ICE Connection:
										disconnected
									</div>
									<div>
										<span className="text-secondary">➔</span> Last seen: 2 mins
										ago
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	)
}
