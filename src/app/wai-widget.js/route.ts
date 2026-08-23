import { NextResponse } from "next/server";

// Served as a plain <script src="…/wai-widget.js" data-key="wai_xxx"> tag on any external
// site. Draws a floating bubble + slide-out iframe panel, and exposes window.WAI.open/close/
// toggle so the host page can trigger it from its own buttons/links, not just the bubble.
const SCRIPT = String.raw`
(function () {
  var current = document.currentScript;
  if (!current) return;
  var key = current.getAttribute("data-key");
  if (!key) {
    console.error("WAI widget: missing data-key attribute on the script tag.");
    return;
  }
  var origin = new URL(current.src).origin;

  var panel = document.createElement("div");
  panel.style.cssText = [
    "position:fixed", "bottom:96px", "right:24px", "z-index:2147483000",
    "width:400px", "height:600px", "max-width:calc(100vw - 32px)", "max-height:calc(100vh - 140px)",
    "border-radius:16px", "overflow:hidden", "box-shadow:0 20px 60px rgba(0,0,0,0.35)",
    "display:none", "background:#09090b",
  ].join(";");

  var iframe = document.createElement("iframe");
  iframe.src = origin + "/embed?key=" + encodeURIComponent(key);
  iframe.style.cssText = "border:none;width:100%;height:100%;";
  iframe.allow = "microphone";
  panel.appendChild(iframe);

  var bubble = document.createElement("button");
  bubble.setAttribute("aria-label", "Open WAI chat");
  bubble.style.cssText = [
    "position:fixed", "bottom:24px", "right:24px", "z-index:2147483000",
    "width:56px", "height:56px", "border-radius:50%", "border:none", "cursor:pointer",
    "background:linear-gradient(135deg,#38bdf8,#6366f1)", "box-shadow:0 8px 24px rgba(0,0,0,0.3)",
    "display:flex", "align-items:center", "justify-content:center",
  ].join(";");
  bubble.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"/></svg>';

  var open = false;
  function setOpen(v) {
    open = v;
    panel.style.display = open ? "block" : "none";
  }

  bubble.addEventListener("click", function () {
    setOpen(!open);
  });

  document.addEventListener("DOMContentLoaded", function () {
    document.body.appendChild(panel);
    document.body.appendChild(bubble);
  });
  if (document.readyState === "complete" || document.readyState === "interactive") {
    document.body.appendChild(panel);
    document.body.appendChild(bubble);
  }

  window.WAI = {
    open: function () { setOpen(true); },
    close: function () { setOpen(false); },
    toggle: function () { setOpen(!open); },
  };
})();
`;

export async function GET() {
  return new NextResponse(SCRIPT, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
