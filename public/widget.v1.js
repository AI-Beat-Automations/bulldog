(function () {
  var script = document.currentScript;
  var base = new URL(script.src).origin;
  var color = script.getAttribute("data-color") || "#3f5ec2";
  var title = script.getAttribute("data-title") || "Chat";

  // Host + shadow root: aísla el CSS del sitio anfitrión.
  var host = document.createElement("div");
  host.style.cssText = "position:fixed;z-index:2147483000";
  document.body.appendChild(host);
  var root = host.attachShadow({ mode: "open" });

  var btn = document.createElement("button");
  btn.setAttribute("aria-label", "Abrir chat");
  btn.textContent = "💬";
  btn.style.cssText =
    "position:fixed;bottom:20px;right:20px;width:56px;height:56px;border:0;" +
    "border-radius:9999px;cursor:pointer;color:#fff;font-size:24px;" +
    "box-shadow:0 4px 14px rgba(0,0,0,.25);background:" + color;
  root.appendChild(btn);

  var iframe = null; // lazy: se crea en el primer click
  var open = false;

  function mountIframe() {
    iframe = document.createElement("iframe");
    iframe.src = base + "/widget?title=" + encodeURIComponent(title);
    iframe.title = title;
    iframe.style.cssText =
      "position:fixed;bottom:88px;right:20px;width:380px;height:560px;border:0;" +
      "border-radius:16px;background:#fff;box-shadow:0 12px 40px rgba(0,0,0,.28);" +
      "max-width:calc(100vw - 40px);max-height:calc(100vh - 120px)";
    root.appendChild(iframe);
  }

  function setOpen(next) {
    open = next;
    if (open && !iframe) mountIframe(); // ← carga la app solo aquí (lazy)
    if (iframe) iframe.style.display = open ? "block" : "none";
  }

  btn.addEventListener("click", function () { setOpen(!open); });

  // Handshake: el iframe pide cerrarse / redimensionarse. Validamos origin.
  window.addEventListener("message", function (e) {
    if (e.origin !== base || !e.data || typeof e.data !== "object") return;
    if (e.data.type === "bulldog-chat:close") setOpen(false);
    if (e.data.type === "bulldog-chat:resize" && iframe && e.data.height) {
      iframe.style.height =
        Math.min(e.data.height, window.innerHeight - 120) + "px";
    }
  });
})();
