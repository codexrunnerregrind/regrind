(cancelPath) => {
	"use strict";

	if (window.__regrindOauthClose) return;
	window.__regrindOauthClose = true;

	const BUTTON_ID = "regrind-oauth-close";

	const cancel = () => {
		try {
			location.replace(new URL(cancelPath, location.origin).href);
		} catch {}
	};

	const style = `
		/* The window covers the screen, status bar included, and no page of the
		   flow expects that. */
		html {
			padding-top: env(safe-area-inset-top, 0px) !important;
			padding-bottom: env(safe-area-inset-bottom, 0px) !important;
			box-sizing: border-box !important;
		}

		/* Sized in vw so a page served at desktop width, which the phone then
		   scales down, still gets a thumb-sized button. */
		#${BUTTON_ID} {
			position: fixed;
			top: calc(env(safe-area-inset-top, 0px) + 2.5vw);
			right: calc(env(safe-area-inset-right, 0px) + 2.5vw);
			z-index: 2147483647;
			display: flex;
			align-items: center;
			justify-content: center;
			width: clamp(36px, 9vw, 80px);
			height: clamp(36px, 9vw, 80px);
			padding: 0;
			border: max(1px, 0.25vw) solid rgba(255, 255, 255, 0.3);
			border-radius: 999px;
			background: rgba(0, 0, 0, 0.6);
			color: #ffffff;
			font: 500 clamp(17px, 4.5vw, 38px)/1 system-ui, -apple-system,
				sans-serif;
			box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
			cursor: pointer;
			-webkit-tap-highlight-color: transparent;
		}
	`;

	const mount = () => {
		const root = document.documentElement;
		if (!root || document.getElementById(BUTTON_ID)) return;

		const styleEl = document.createElement("style");
		styleEl.textContent = style;

		const button = document.createElement("button");
		button.id = BUTTON_ID;
		button.type = "button";
		button.setAttribute("aria-label", "Cancel sign-in");
		button.textContent = "✕";
		button.addEventListener("click", cancel);

		root.append(styleEl, button);
	};

	mount();
	document.addEventListener("DOMContentLoaded", mount);

	// Pages of the flow rewrite the document under the button.
	try {
		new MutationObserver(mount).observe(document.documentElement, {
			childList: true,
		});
	} catch {}
}
