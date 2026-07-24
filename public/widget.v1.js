(function () {
  var script = document.currentScript;
  var base = new URL(script.src).origin;
  // Paleta Bulldog: azul del CTA "Book Now!" del sitio.
  var color = script.getAttribute("data-color") || "#02A5F5";
  var title = script.getAttribute("data-title") || "Chat";

  // Host + shadow root: aísla el CSS del sitio anfitrión.
  var host = document.createElement("div");
  host.style.cssText = "position:fixed;z-index:2147483000";
  document.body.appendChild(host);
  var root = host.attachShadow({ mode: "open" });

  // Estilos dentro del shadow: transiciones e iconos necesitan reglas reales.
  var style = document.createElement("style");
  style.textContent =
    ".bd-btn{position:fixed;bottom:20px;right:20px;width:60px;height:60px;border:0;" +
    "border-radius:9999px;cursor:pointer;padding:0;display:grid;place-items:center;" +
    "background:" + color + ";color:#fff;" +
    "box-shadow:0 10px 26px rgba(0,0,0,.18),0 4px 10px rgba(0,0,0,.12);" +
    "transition:transform .18s ease,box-shadow .18s ease,filter .18s ease}" +
    ".bd-btn:hover{transform:translateY(-2px) scale(1.04);filter:brightness(1.06);" +
    "box-shadow:0 14px 32px rgba(0,0,0,.22),0 6px 12px rgba(0,0,0,.14)}" +
    ".bd-btn:active{transform:scale(.96)}" +
    // Anillo de foco en rosa: sobre el botón azul, un azul claro no se vería.
    ".bd-btn:focus-visible{outline:3px solid #EB3471;outline-offset:3px}" +
    ".bd-ico{position:absolute;width:28px;height:28px;" +
    "transition:opacity .18s ease,transform .22s ease}" +
    ".bd-btn[data-open='false'] .bd-close,.bd-btn[data-open='true'] .bd-chat" +
    "{opacity:0;transform:scale(.6) rotate(-45deg)}" +
    ".bd-btn[data-open='true'] .bd-close,.bd-btn[data-open='false'] .bd-chat" +
    "{opacity:1;transform:scale(1) rotate(0)}" +
    ".bd-frame{position:fixed;bottom:92px;right:20px;width:380px;height:560px;border:0;" +
    "border-radius:18px;background:#fff;overflow:hidden;" +
    "box-shadow:0 20px 48px rgba(77,62,68,.28),0 4px 12px rgba(77,62,68,.16);" +
    "max-width:calc(100vw - 40px);max-height:calc(100vh - 124px);" +
    "transform-origin:bottom right;transition:opacity .18s ease,transform .18s ease}" +
    ".bd-frame[data-open='false']{opacity:0;transform:translateY(8px) scale(.97);" +
    "pointer-events:none}" +
    ".bd-frame[data-open='true']{opacity:1;transform:none}" +
    "@media (max-width:480px){.bd-frame{right:12px;left:12px;width:auto;" +
    "bottom:88px;max-height:calc(100vh - 108px)}}" +
    "@media (prefers-reduced-motion:reduce){.bd-btn,.bd-ico,.bd-frame" +
    "{transition:none}}";
  root.appendChild(style);

  var btn = document.createElement("button");
  btn.className = "bd-btn";
  btn.setAttribute("data-open", "false");
  btn.setAttribute("aria-label", "Open chat");
  btn.setAttribute("aria-expanded", "false");
  btn.innerHTML =
    '<svg class="bd-ico bd-chat" viewBox="0 0 24 24" fill="none" ' +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
    'stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>' +
    "</svg>" +
    '<svg class="bd-ico bd-close" viewBox="0 0 24 24" fill="none" ' +
    'stroke="currentColor" stroke-width="2.2" stroke-linecap="round" ' +
    'aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';
  root.appendChild(btn);

  var iframe = null; // lazy: se crea en el primer click
  var open = false;

  function mountIframe() {
    iframe = document.createElement("iframe");
    iframe.className = "bd-frame";
    iframe.setAttribute("data-open", "false");
    iframe.src = base + "/widget?title=" + encodeURIComponent(title);
    iframe.title = title;
    root.appendChild(iframe);
    // Fuerza un frame antes de animar la entrada.
    requestAnimationFrame(function () {
      iframe.setAttribute("data-open", "true");
    });
  }

  function setOpen(next) {
    open = next;
    btn.setAttribute("data-open", String(open));
    btn.setAttribute("aria-expanded", String(open));
    btn.setAttribute("aria-label", open ? "Close chat" : "Open chat");
    if (open && !iframe) {
      mountIframe(); // ← carga la app solo aquí (lazy)
      return;
    }
    if (iframe) iframe.setAttribute("data-open", String(open));
  }

  btn.addEventListener("click", function () { setOpen(!open); });

  // Handshake: el iframe pide cerrarse / redimensionarse. Validamos origin.
  window.addEventListener("message", function (e) {
    if (e.origin !== base || !e.data || typeof e.data !== "object") return;
    if (e.data.type === "bulldog-chat:close") setOpen(false);
    if (e.data.type === "bulldog-chat:resize" && iframe && e.data.height) {
      iframe.style.height =
        Math.min(e.data.height, window.innerHeight - 124) + "px";
    }
  });
})();
