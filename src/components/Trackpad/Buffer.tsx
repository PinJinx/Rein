import React from "react";

interface BufferBarProps {
	bufferText: string;
}

export const BufferBar: React.FC<BufferBarProps> = ({ bufferText }) => {
	if (!bufferText) return null;

	return (
		<div
			className="shrink-0 flex items-center gap-2 px-3 py-[5px] overflow-x-auto"
			style={{
				background: "linear-gradient(90deg, #1a1040, #0f1a2e)",
				borderTop: "1px solid rgba(139, 92, 246, 0.3)",
				borderBottom: "1px solid rgba(139, 92, 246, 0.15)",
			}}
		>
			<span
				style={{
					fontSize: 10,
					fontFamily: "monospace",
					color: "#a78bfa",
					fontWeight: 700,
					letterSpacing: "0.08em",
					textTransform: "uppercase",
					opacity: 0.7,
					whiteSpace: "nowrap",
				}}
			>
				COMBO
			</span>
			<div className="flex items-center gap-[5px] flex-wrap">
				{bufferText.split(" + ").map((key, i) => (
					<span
						key={i}
						style={{
							background: "rgba(139,92,246,0.2)",
							border: "1px solid rgba(139,92,246,0.5)",
							borderRadius: 5,
							padding: "2px 7px",
							fontSize: 11,
							fontFamily: "monospace",
							fontWeight: 700,
							color: "#c4b5fd",
							letterSpacing: "0.05em",
							textTransform: "uppercase",
							boxShadow: "0 0 6px rgba(139,92,246,0.3)",
						}}
					>
						{key}
					</span>
				))}
			</div>
		</div>
	);
};
