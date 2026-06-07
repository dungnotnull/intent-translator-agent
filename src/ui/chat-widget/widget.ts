(function () {
  const script = document.currentScript as HTMLScriptElement | null;
  const baseUrl = script?.getAttribute("data-base-url") || window.location.origin;
  const domain = script?.getAttribute("data-domain") || "university";
  const lang = script?.getAttribute("data-lang") || "vi";
  const position = script?.getAttribute("data-position") || "bottom-right";
  const theme = script?.getAttribute("data-theme") || "blue";
  const title = script?.getAttribute("data-title") || "Trợ lý ảo";
  const placeholder = script?.getAttribute("data-placeholder") || "Nhập tin nhắn...";

  const COLORS: Record<string, { primary: string; primaryLight: string; bg: string; text: string }> = {
    blue: { primary: "#2563eb", primaryLight: "#dbeafe", bg: "#ffffff", text: "#1e293b" },
    green: { primary: "#16a34a", primaryLight: "#dcfce7", bg: "#ffffff", text: "#1e293b" },
    red: { primary: "#dc2626", primaryLight: "#fee2e2", bg: "#ffffff", text: "#1e293b" },
  };
  const C = COLORS[theme] || COLORS.blue!;

  let sessionId = "";
  let isOpen = false;
  let isRecording = false;
  let mediaRecorder: MediaRecorder | null = null;
  let audioChunks: Blob[] = [];

  // ── DOM ──
  const container = document.createElement("div");
  container.id = "ita-chat-widget";
  container.innerHTML = `
    <style>
      #ita-chat-widget { position:fixed; z-index:99999; font-family:system-ui,-apple-system,sans-serif; }
      ${position === "bottom-right" ? "bottom:20px;right:20px;" : "bottom:20px;left:20px;"}
      #ita-toggle { width:56px;height:56px;border-radius:50%;background:${C.primary};border:none;cursor:pointer;
        color:#fff;font-size:24px;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(0,0,0,.15); }
      #ita-toggle:hover { transform:scale(1.05); }
      #ita-panel { display:none;position:absolute;bottom:70px;${position.includes("right") ? "right:0" : "left:0"};
        width:360px;max-height:520px;background:${C.bg};border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,.12);
        overflow:hidden;flex-direction:column; }
      #ita-panel.ita-open { display:flex; }
      #ita-header { background:${C.primary};color:#fff;padding:14px 16px;font-weight:600;font-size:15px;
        display:flex;align-items:center;gap:10px; }
      #ita-header-close { margin-left:auto;background:none;border:none;color:#fff;cursor:pointer;font-size:20px;line-height:1; }
      #ita-messages { flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px;max-height:340px; }
      .ita-msg { max-width:85%;padding:10px 14px;border-radius:14px;font-size:14px;line-height:1.5;word-break:break-word; }
      .ita-msg-agent { align-self:flex-start;background:${C.primaryLight};color:${C.text};border-bottom-left-radius:4px; }
      .ita-msg-user { align-self:flex-end;background:${C.primary};color:#fff;border-bottom-right-radius:4px; }
      .ita-msg-typing { align-self:flex-start;background:${C.primaryLight};color:#94a3b8;font-style:italic;padding:8px 14px; }
      #ita-input-row { display:flex;padding:10px;gap:8px;border-top:1px solid #e2e8f0; }
      #ita-input { flex:1;border:1px solid #e2e8f0;border-radius:20px;padding:10px 16px;font-size:14px;outline:none; }
      #ita-input:focus { border-color:${C.primary}; }
      #ita-send { width:40px;height:40px;border-radius:50%;background:${C.primary};color:#fff;border:none;cursor:pointer;font-size:16px; }
      #ita-mic { width:40px;height:40px;border-radius:50%;background:#f1f5f9;color:${C.text};border:none;cursor:pointer;font-size:16px; }
      #ita-mic.ita-recording { background:#ef4444;color:#fff;animation:pulse 1.5s infinite; }
      @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.5} }
      @media (max-width:400px) { #ita-panel { width:calc(100vw-32px);right:-8px; } }
    </style>
    <button id="ita-toggle" aria-label="Mở trợ lý ảo" title="${title}">💬</button>
    <div id="ita-panel" role="dialog" aria-label="${title}">
      <div id="ita-header"><span>🤖</span> ${title} <button id="ita-header-close" aria-label="Đóng">×</button></div>
      <div id="ita-messages"></div>
      <div id="ita-input-row">
        <button id="ita-mic" aria-label="Ghi âm" title="Nhấn để nói">🎤</button>
        <input id="ita-input" type="text" placeholder="${placeholder}" aria-label="Tin nhắn">
        <button id="ita-send" aria-label="Gửi">➤</button>
      </div>
    </div>
  `;
  document.body.appendChild(container);

  const toggle = document.getElementById("ita-toggle")!;
  const panel = document.getElementById("ita-panel")!;
  const closeBtn = document.getElementById("ita-header-close")!;
  const messages = document.getElementById("ita-messages")!;
  const input = document.getElementById("ita-input") as HTMLInputElement;
  const sendBtn = document.getElementById("ita-send")!;
  const micBtn = document.getElementById("ita-mic")!;

  toggle.addEventListener("click", () => { isOpen = !isOpen; panel.classList.toggle("ita-open", isOpen); if (isOpen) input.focus(); });
  closeBtn.addEventListener("click", () => { isOpen = false; panel.classList.remove("ita-open"); });
  toggle.setAttribute("aria-expanded", "false");

  function toggleAria() { isOpen = !isOpen; panel.classList.toggle("ita-open", isOpen); toggle.setAttribute("aria-expanded", String(isOpen)); if (isOpen) input.focus(); }
  toggle.removeEventListener("click", () => {});
  toggle.addEventListener("click", toggleAria);

  // ── Messages ──
  function addMessage(text: string, role: "user" | "agent") {
    const div = document.createElement("div");
    div.className = `ita-msg ita-msg-${role}`;
    div.textContent = text;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
  }

  function addTyping() {
    const div = document.createElement("div");
    div.className = "ita-msg-typing";
    div.textContent = "Đang xử lý...";
    div.id = "ita-typing";
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
  }

  function removeTyping() { const el = document.getElementById("ita-typing"); if (el) el.remove(); }

  // ── Send ──
  async function sendMessage(text: string) {
    if (!text.trim()) return;
    addMessage(text, "user");
    input.value = "";
    addTyping();
    try {
      const res = await fetch(`${baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Session-Id": sessionId },
        body: JSON.stringify({ session_id: sessionId || undefined, message: text, domain, language: lang }),
      });
      const data = await res.json() as { session_id: string; response: string };
      sessionId = data.session_id;
      removeTyping();
      addMessage(data.response, "agent");
      if (data.response) {
        // Speak if Web Speech API available
        try {
          const u = new SpeechSynthesisUtterance(data.response);
          u.lang = "vi-VN";
          u.rate = 0.95;
          window.speechSynthesis.speak(u);
        } catch { /* no TTS */ }
      }
    } catch {
      removeTyping();
      addMessage("Có lỗi kết nối. Vui lòng thử lại.", "agent");
    }
  }

  sendBtn.addEventListener("click", () => sendMessage(input.value));
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") sendMessage(input.value); });

  // ── Voice ──
  micBtn.addEventListener("click", async () => {
    if (isRecording) {
      mediaRecorder?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      audioChunks = [];
      isRecording = true;
      micBtn.classList.add("ita-recording");
      micBtn.textContent = "⏹";
      mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);
      mediaRecorder.onstop = async () => {
        isRecording = false;
        micBtn.classList.remove("ita-recording");
        micBtn.textContent = "🎤";
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunks, { type: "audio/webm" });
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64 = (reader.result as string).split(",")[1];
          if (!base64) return;
          addTyping();
          try {
            const res = await fetch(`${baseUrl}/api/voice`, {
              method: "POST",
              headers: { "Content-Type": "application/json", "X-Session-Id": sessionId },
              body: JSON.stringify({ session_id: sessionId || undefined, audio_base64: base64, domain }),
            });
            const data = await res.json() as { session_id: string; response: string };
            sessionId = data.session_id;
            removeTyping();
            addMessage(data.response, "agent");
          } catch {
            removeTyping();
            addMessage("Không thể xử lý giọng nói.", "agent");
          }
        };
        reader.readAsDataURL(blob);
      };
      mediaRecorder.start();
    } catch {
      addMessage("Không thể truy cập microphone. Vui lòng nhập văn bản.", "agent");
    }
  });
})();
