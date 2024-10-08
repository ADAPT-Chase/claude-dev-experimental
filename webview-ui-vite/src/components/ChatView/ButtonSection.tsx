import React, { useState } from "react"
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react"
import { Button } from "../ui/button"
import { vscode } from "@/utils/vscode"
import { cn } from "@/lib/utils"

interface ButtonSectionProps {
	primaryButtonText: string | undefined
	secondaryButtonText: string | undefined
	enableButtons: boolean
	handlePrimaryButtonClick: () => void
	handleSecondaryButtonClick: () => void
	isRequestRunning: boolean
}

const ButtonSection: React.FC<ButtonSectionProps> = ({
	primaryButtonText,
	secondaryButtonText,
	enableButtons,
	handlePrimaryButtonClick,
	isRequestRunning,
	handleSecondaryButtonClick,
}) => {
	const [isCancelling, setIsCancelling] = useState(false)

	return (
		<div
			style={{
				padding: "8px 16px 0px 15px",
			}}
			className="flex flex-col gap-2">
			{/* <Button
				disabled={isCancelling}
				onClick={() => {
					setIsCancelling(true)
					vscode.postMessage({ type: "cancelCurrentRequest" })
					setIsCancelling(false)
				}}
				className={cn("w-24", !isRequestRunning && "hidden")}
				size="sm"
				variant="destructive">
				Abort Request
			</Button> */}
			<div
				style={{
					opacity: primaryButtonText || secondaryButtonText ? (enableButtons ? 1 : 0.5) : 0,
					display: "flex",
				}}>
				{primaryButtonText && (
					<VSCodeButton
						appearance="primary"
						disabled={!enableButtons}
						style={{
							flex: secondaryButtonText ? 1 : 2,
							marginRight: secondaryButtonText ? "6px" : "0",
						}}
						onClick={handlePrimaryButtonClick}>
						{primaryButtonText}
					</VSCodeButton>
				)}
				{secondaryButtonText && (
					<VSCodeButton
						appearance="secondary"
						disabled={!enableButtons}
						style={{ flex: 1, marginLeft: "6px" }}
						onClick={handleSecondaryButtonClick}>
						{secondaryButtonText}
					</VSCodeButton>
				)}
			</div>
		</div>
	)
}

export default ButtonSection
