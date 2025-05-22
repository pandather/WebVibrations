// ==UserScript==
// @name         Buttplug API Demo - Audio to Vibration
// @namespace    http://tampermonkey.net/
// @version      2.12
// @description  BP auto RMS with burn-in/fade, robust silence/manual/auto switch. Now with a draggable header.
// @author       Mark Kuebel
// @match        *://*/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // --- Panel HTML ---
    const panelHTML = `
      <div id="bp-grab-bar"
        style="width:100%;height:22px;cursor:grab;user-select:none;
               margin-bottom:5px;background:rgba(20,20,30,0.25);
               border-radius:8px 8px 0 0;display:flex;align-items:center;">
        <span style="flex:1;font-weight:bold;font-size:15px;padding-left:6px;letter-spacing:0.5px;">
          🔊 BP Control
        </span>
      </div>
      <div id="bp-header-main" style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
        <button id="bp-connect" style="font-size:14px;"
          title="Connect/disconnect to Buttplug Websocket server (Intiface Central or Playground)">
          Connect
        </button>
        <span id="bp-status" style="margin-right:8px;" title="Current Buttplug connection status.">🔴 Disconnected</span>
        <span id="bp-devices" title="Number of connected toys">Devices: 0</span>
        <label style="display:flex;align-items:center;"
          title="The minimum RMS (volume) value considered for the audio-to-vibration mapping. Move up if you want less sensitivity to quiet audio.">
          Min: <input type="range" id="bp-rmsmin" min="50" max="150" value="100" style="margin:0 5px;width:55px;">
          <span id="bp-minval">100.00</span>
        </label>
        <label style="display:flex;align-items:center;"
          title="The maximum RMS (volume) value for mapping audio to maximum toy intensity. Lower for more sensitivity to loud audio.">
          Max: <input type="range" id="bp-rmsmax" min="120" max="255" value="185" style="margin:0 5px;width:55px;">
          <span id="bp-maxval">185.00</span>
        </label>
        <label style="display:flex;align-items:center;"
          title="Curve exponent for the volume-to-intensity mapping. Higher = more sensitive to loud peaks, less to quiet. 1 = linear.">
          Curve: <input type="range" id="bp-curve" min="1.00" max="3.00" step="0.01" value="1.30" style="margin:0 5px;width:55px;">
          <span id="bp-curveval">1.30</span>
        </label>
        <label style="display:flex;align-items:center;"
          title="Minimum output intensity to send to the device. Sets a floor, so the toy always vibrates at least this much when active.">
          Min Out: <input type="range" id="bp-minout" min="0.00" max="0.95" step="0.01" value="0.00" style="margin:0 5px;width:55px;">
          <span id="bp-minoutval">0.00</span>
        </label>
        <label style="display:flex;align-items:center;"
          title="Maximum output intensity to send to the device. Sets a ceiling, so the toy never vibrates above this.">
          Max Out: <input type="range" id="bp-maxout" min="0.05" max="1.00" step="0.01" value="1.00" style="margin:0 5px;width:55px;">
          <span id="bp-maxoutval">1.00</span>
        </label>
        <label style="display:flex;align-items:center;"
          title="Panel opacity. Lower for more see-through.">
          Opacity: <input type="range" id="bp-opacity" min="0.10" max="1.00" step="0.01" value="0.70" style="margin:0 5px;width:55px;">
          <span id="bp-opacityval">0.70</span>
        </label>
        <label style="display:flex;align-items:center;"
          title="FFT size for the audio analyzer. Larger values are slower but more accurate for complex signals.">
          FFT:
          <select id="bp-fft" style="margin:0 5px;">
            <option>32</option><option>64</option><option>128</option><option>256</option><option>512</option><option>1024</option>
          </select>
        </label>
        <label style="display:flex;align-items:center;"
          title="Amount of smoothing for RMS calculation. Higher = slower response, less jitter. Lower = more responsive. 1.0 = never updates, just freezes.">
          Smooth: <input type="range" id="bp-smooth" min="0.00" max="1.00" step="0.01" value="0.05" style="margin:0 5px;width:55px;">
          <span id="bp-smoothval">0.05</span>
        </label>
        <label style="display:flex;align-items:center;"
          title="Enables 'attack' spikes for sudden increases in audio volume. Set to 0 to disable. Higher = stronger effect.">
          Attack Max: <input type="range" id="bp-atkmax" min="0.00" max="0.5" step="0.01" value="0.00" style="margin:0 5px;width:55px;">
          <span id="bp-atkmaxval">0.00</span>
        </label>
      </div>
      <div id="bp-header-rms" style="display:flex;align-items:center;gap:18px;margin-top:4px;">
        <label style="display:flex;align-items:center;font-size:13px;"
          title="Automatically adjust Min/Max RMS window for changing audio levels. Good for streaming with volume variation.">
          <input type="checkbox" id="bp-rmsauto" style="margin-right:3px;" checked>Auto RMS
        </label>
        <label style="display:flex;align-items:center;font-size:13px;"
          title="With burn-in, auto RMS does not activate until the window is filled, then fades from manual to auto values over 2s. If unchecked, min/max always follow auto instantly.">
          <input type="checkbox" id="bp-rmsburnin" style="margin-right:3px;" checked>Burn-in/Fade
        </label>
        <label style="display:flex;align-items:center;font-size:12px;"
          title="Window size (seconds) for auto RMS history. Larger = slower, more stable adaption.">
          Window (s): <input type="range" id="bp-rmsautowin" min="0.50" max="20.00" step="0.01" value="2.50" style="margin:0 4px;width:90px;">
          <span id="bp-rmsautowinval">2.50</span>
        </label>
        <label style="display:flex;align-items:center;font-size:12px;"
          title="Sensitivity of auto RMS adaption. Higher = more responsive, lower = more stable.">
          Sensitivity: <input type="range" id="bp-rmsautosens" min="0.05" max="1.0" step="0.01" value="0.60" style="margin:0 4px;width:55px;">
          <span id="bp-rmsautosensval">0.60</span>
        </label>
        <label style="display:flex;align-items:center;font-size:12px;"
          title="Minimum allowed distance between min and max RMS. Prevents collapse in silent sections.">
          Min Δ: <input type="range" id="bp-rmsautominsep" min="10" max="80" step="1" value="30" style="margin:0 4px;width:50px;">
          <span id="bp-rmsautominsepval">30</span>
        </label>
        <span style="margin-left:15px;font-size:13px;"
          title="Live toy intensity (0-100%). Mapped to Min/Max Out.">
          Intensity:
          <span id="bp-intbar-wrap" style="display:inline-block;width:70px;height:10px;background:#222;border-radius:4px;vertical-align:middle;overflow:hidden;">
            <span id="bp-intbar" style="display:inline-block;height:100%;background:#41e;width:0"></span>
          </span>
          <span id="bp-intout" style="font-size:15px;margin:0 5px;width:38px;display:inline-block;">0</span>
        </span>
        <span id="bp-rmsheader" style="font-size:15px;" title="Raw RMS (volume) value from audio input.">RMS: 0</span>
      </div>
    `;
    const panel = document.createElement('div');
    panel.id = "bp-panel";
    panel.style.position = "fixed";
    panel.style.top = "0";
    panel.style.left = "0";
    panel.style.zIndex = "99999";
    panel.style.background = "rgba(30,30,40,0.70)";
    panel.style.color = "#fff";
    panel.style.fontFamily = "sans-serif";
    panel.style.borderRadius = "0 0 12px 0";
    panel.style.boxShadow = "0 4px 14px rgba(0,0,0,0.18)";
    panel.style.padding = "14px 22px 10px 18px";
    panel.style.display = "flex";
    panel.style.flexDirection = "column";
    panel.style.gap = "2px";
    panel.style.userSelect = "none";
    panel.style.transition = "background 0.2s";
    panel.style.minWidth = "720px";
    panel.innerHTML = panelHTML;
    document.body.appendChild(panel);

    // --- Make only the grab bar draggable ---
    (function makeDraggable(panel) {
        const grabBar = panel.querySelector("#bp-grab-bar");
        let offsetX = 0, offsetY = 0, startX = 0, startY = 0, dragging = false;

        grabBar.onmousedown = function(e) {
            if (e.button !== 0) return;
            dragging = true;
            grabBar.style.cursor = "grabbing";
            startX = e.clientX;
            startY = e.clientY;
            offsetX = panel.offsetLeft;
            offsetY = panel.offsetTop;
            document.onmousemove = function(e2) {
                if (!dragging) return;
                panel.style.top = (offsetY + (e2.clientY - startY)) + "px";
                panel.style.left = (offsetX + (e2.clientX - startX)) + "px";
                panel.style.zIndex = 99999;
            };
            document.onmouseup = function() {
                dragging = false;
                grabBar.style.cursor = "grab";
                document.onmousemove = null;
                document.onmouseup = null;
            };
        };
        // Initial position/z
        panel.style.top = "0px";
        panel.style.left = "0px";
        panel.style.zIndex = 99999;
    })(panel);

    // --- UI element references ---
    function $(id) { return document.getElementById(id); }
    const rmsHeader = $('bp-rmsheader');
    const rmsMinInput = $('bp-rmsmin');
    const rmsMaxInput = $('bp-rmsmax');
    const curveInput = $('bp-curve');
    const minOutInput = $('bp-minout');
    const minOutVal = $('bp-minoutval');
    const maxOutInput = $('bp-maxout');
    const maxOutVal = $('bp-maxoutval');
    const rmsMinVal = $('bp-minval');
    const rmsMaxVal = $('bp-maxval');
    const curveVal = $('bp-curveval');
    const statusEl = $('bp-status');
    const devicesEl = $('bp-devices');
    const connectBtn = $('bp-connect');
    const opacityInput = $('bp-opacity');
    const opacityVal = $('bp-opacityval');
    const fftInput = $('bp-fft');
    const smoothInput = $('bp-smooth');
    const smoothVal = $('bp-smoothval');
    const atkMaxInput = $('bp-atkmax');
    const atkMaxVal = $('bp-atkmaxval');
    const intBar = $('bp-intbar');
    const intOut = $('bp-intout');
    const rmsAutoCheck = $('bp-rmsauto');
    const rmsBurninCheck = $('bp-rmsburnin');
    const rmsAutoWin = $('bp-rmsautowin');
    const rmsAutoWinVal = $('bp-rmsautowinval');
    const rmsAutoSens = $('bp-rmsautosens');
    const rmsAutoSensVal = $('bp-rmsautosensval');
    const rmsAutoMinSep = $('bp-rmsautominsep');
    const rmsAutoMinSepVal = $('bp-rmsautominsepval');

    // --- Default/initial values ---
    window.bpVars = {
      rmsMin: parseInt(rmsMinInput.value),
      rmsMax: parseInt(rmsMaxInput.value),
      curvePow: parseFloat(curveInput.value),
      minOut: parseFloat(minOutInput.value),
      maxOut: parseFloat(maxOutInput.value),
      opacity: parseFloat(opacityInput.value),
      fftSize: parseInt(fftInput.value),
      smoothing: parseFloat(smoothInput.value),
      atkMax: parseFloat(atkMaxInput.value),
      lastIntensity: 0,
    };

    window.bpRMSAuto = {
      enabled: true,
      burnIn: true,
      window: Math.round(parseFloat(rmsAutoWin.value) * 1000), // ms
      sensitivity: parseFloat(rmsAutoSens.value),
      minSeparation: parseInt(rmsAutoMinSep.value)
    };

    // --- UI update handler ---
    function updateVars() {
      window.bpVars.rmsMin = parseInt(rmsMinInput.value);
      window.bpVars.rmsMax = parseInt(rmsMaxInput.value);
      window.bpVars.curvePow = parseFloat(curveInput.value);
      window.bpVars.minOut = parseFloat(minOutInput.value);
      window.bpVars.maxOut = parseFloat(maxOutInput.value);
      window.bpVars.opacity = parseFloat(opacityInput.value);
      window.bpVars.fftSize = parseInt(fftInput.value);
      window.bpVars.smoothing = parseFloat(smoothInput.value);
      window.bpVars.atkMax = parseFloat(atkMaxInput.value);

      rmsMinVal.textContent = (+rmsMinInput.value).toFixed(2);
      rmsMaxVal.textContent = (+rmsMaxInput.value).toFixed(2);
      curveVal.textContent = (+curveInput.value).toFixed(2);
      minOutVal.textContent = (+minOutInput.value).toFixed(2);
      maxOutVal.textContent = (+maxOutInput.value).toFixed(2);
      opacityVal.textContent = (+opacityInput.value).toFixed(2);
      smoothVal.textContent = (+smoothInput.value).toFixed(2);
      atkMaxVal.textContent = (+atkMaxInput.value).toFixed(2);

      $('bp-panel').style.background = `rgba(30,30,40,${window.bpVars.opacity})`;

      window.bpRMSAuto.enabled = rmsAutoCheck.checked;
      window.bpRMSAuto.burnIn = rmsBurninCheck.checked;
      window.bpRMSAuto.window = Math.round(parseFloat(rmsAutoWin.value) * 1000);
      window.bpRMSAuto.sensitivity = parseFloat(rmsAutoSens.value);
      window.bpRMSAuto.minSeparation = parseInt(rmsAutoMinSep.value);

      rmsAutoWinVal.textContent = parseFloat(rmsAutoWin.value).toFixed(2);
      rmsAutoSensVal.textContent = (+rmsAutoSens.value).toFixed(2);
      rmsAutoMinSepVal.textContent = rmsAutoMinSep.value;
    }

    [
      rmsMinInput, rmsMaxInput, curveInput, minOutInput, maxOutInput, opacityInput, fftInput, smoothInput,
      atkMaxInput, rmsAutoCheck, rmsBurninCheck, rmsAutoWin, rmsAutoSens, rmsAutoMinSep
    ].forEach(el => el.addEventListener('input', updateVars));
    [rmsAutoCheck, rmsBurninCheck].forEach(el => el.addEventListener('change', updateVars));
    updateVars();

    // --- Audio/RMS/Intensity visual logic ---
    let analyser = null, ctx = null, source = null, gain = null, data = null;
    let lastRMS = 0, attackBoost = 0, attackDecay = 0.75;
    let rmsHistory = [];

    // Fade state
    let fadeState = { fading: false, steps: 0, maxSteps: 20, from: null, to: null };
    let inManualDueToSilence = true;

    function getOrInitAudio() {
      return new Promise(resolve => {
        function check() {
          const el = document.querySelector("audio,video");
          if (el) resolve(el);
          else setTimeout(check, 500);
        }
        check();
      });
    }

    (async function audioVizLoop() {
      const media = await getOrInitAudio();
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === "suspended") {
        document.body.addEventListener("click", () => ctx.resume(), { once: true });
      }
      source = ctx.createMediaElementSource(media);
      analyser = ctx.createAnalyser();
      gain = ctx.createGain();
      gain.gain.value = 1.0;
      analyser.fftSize = window.bpVars.fftSize;
      analyser.smoothingTimeConstant = window.bpVars.smoothing;
      source.connect(analyser);
      analyser.connect(gain);
      gain.connect(ctx.destination);
      data = new Uint8Array(analyser.frequencyBinCount);

      fftInput.addEventListener('change', () => {
        analyser.fftSize = window.bpVars.fftSize = parseInt(fftInput.value);
        data = new Uint8Array(analyser.frequencyBinCount);
      });
      smoothInput.addEventListener('input', () => {
        analyser.smoothingTimeConstant = window.bpVars.smoothing = parseFloat(smoothInput.value);
      });
      atkMaxInput.addEventListener('input', () => {
        window.bpVars.atkMax = parseFloat(atkMaxInput.value);
      });

      let lastMediaSrc = media.src;

      setInterval(() => {
        // Detect new media (e.g., song changed)
        if (media.src !== lastMediaSrc) {
          rmsHistory = [];
          lastMediaSrc = media.src;
          fadeState.fading = false;
          inManualDueToSilence = true;
        }

        const v = window.bpVars;
        analyser.getByteFrequencyData(data);
        const rms = Math.sqrt(data.reduce((sum, val) => sum + val * val, 0) / data.length);

        // --- Auto RMS Detection with Burn-in/Fade ---
        const now = Date.now();
        rmsHistory.push({ t: now, v: rms });
        const winMs = window.bpRMSAuto.window;
        rmsHistory = rmsHistory.filter(obj => now - obj.t <= winMs);

        let readyForAuto = rmsHistory.length >= Math.max(5, Math.floor(winMs / 100));
        let isSilent = rmsHistory.length > 10 && rmsHistory.every(obj => obj.v < 1e-2);

        if (!window.bpRMSAuto.enabled) {
          // Manual mode always
          v.rmsMin = parseInt(rmsMinInput.value);
          v.rmsMax = parseInt(rmsMaxInput.value);
          fadeState.fading = false;
          inManualDueToSilence = true;
        } else if (isSilent) {
          // Silence detected: switch back to manual immediately, stop any fade/burn-in
          v.rmsMin = parseInt(rmsMinInput.value);
          v.rmsMax = parseInt(rmsMaxInput.value);
          fadeState.fading = false;
          inManualDueToSilence = true;
        } else if (window.bpRMSAuto.burnIn) {
          // Auto RMS with burn-in/fade
          if (inManualDueToSilence && readyForAuto && !fadeState.fading) {
            // First moment window fills after silence/beginning: start fade!
            // Compute auto RMS min/max
            const sorted = rmsHistory.map(obj => obj.v).sort((a, b) => a - b);
            const minIdx = Math.floor(sorted.length * 0.10);
            const maxIdx = Math.floor(sorted.length * 0.98);
            let autoMin = sorted[minIdx] || 0;
            let autoMax = sorted[maxIdx] || 255;
            if (autoMax - autoMin < window.bpRMSAuto.minSeparation) autoMax = autoMin + window.bpRMSAuto.minSeparation;
            fadeState = {
              fading: true,
              steps: 0,
              maxSteps: 20,
              from: { min: v.rmsMin, max: v.rmsMax },
              to: { min: autoMin, max: autoMax }
            };
            inManualDueToSilence = false;
          }

          // If fade is active, interpolate
          if (fadeState.fading) {
            let t = (fadeState.steps + 1) / fadeState.maxSteps;
            v.rmsMin = fadeState.from.min + (fadeState.to.min - fadeState.from.min) * t;
            v.rmsMax = fadeState.from.max + (fadeState.to.max - fadeState.from.max) * t;
            fadeState.steps++;
            if (fadeState.steps >= fadeState.maxSteps) {
              fadeState.fading = false;
              v.rmsMin = fadeState.to.min;
              v.rmsMax = fadeState.to.max;
            }
          }
          // If fade is done, or burn-in has completed, just follow live auto
          else if (!inManualDueToSilence && !fadeState.fading) {
            const sorted = rmsHistory.map(obj => obj.v).sort((a, b) => a - b);
            const minIdx = Math.floor(sorted.length * 0.10);
            const maxIdx = Math.floor(sorted.length * 0.98);
            let autoMin = sorted[minIdx] || 0;
            let autoMax = sorted[maxIdx] || 255;
            v.rmsMin += (autoMin - v.rmsMin) * window.bpRMSAuto.sensitivity;
            v.rmsMax += (autoMax - v.rmsMax) * window.bpRMSAuto.sensitivity;
            if (v.rmsMax - v.rmsMin < window.bpRMSAuto.minSeparation) {
              v.rmsMax = v.rmsMin + window.bpRMSAuto.minSeparation;
            }
          }
        } else {
          // Auto RMS instant mode (no burn-in)
          const sorted = rmsHistory.map(obj => obj.v).sort((a, b) => a - b);
          const minIdx = Math.floor(sorted.length * 0.10);
          const maxIdx = Math.floor(sorted.length * 0.98);
          let autoMin = sorted[minIdx] || 0;
          let autoMax = sorted[maxIdx] || 255;
          v.rmsMin += (autoMin - v.rmsMin) * window.bpRMSAuto.sensitivity;
          v.rmsMax += (autoMax - v.rmsMax) * window.bpRMSAuto.sensitivity;
          if (v.rmsMax - v.rmsMin < window.bpRMSAuto.minSeparation) {
            v.rmsMax = v.rmsMin + window.bpRMSAuto.minSeparation;
          }
          fadeState.fading = false;
          inManualDueToSilence = false;
        }

        // UI always follows current values
        rmsMinInput.value = v.rmsMin.toFixed(2);
        rmsMaxInput.value = v.rmsMax.toFixed(2);
        rmsMinVal.textContent = (+v.rmsMin).toFixed(2);
        rmsMaxVal.textContent = (+v.rmsMax).toFixed(2);

        // --- Special Attack Mode ---
        let attackBonus = 0;
        if (v.atkMax > 0) {
          const rmsJump = rms - lastRMS;
          if (rmsJump > 8) {
            attackBoost = Math.min(attackBoost + (rmsJump / (v.rmsMax-v.rmsMin)), v.atkMax);
          }
          attackBoost *= Math.pow(attackDecay, 0.1);
          attackBonus = attackBoost;
        } else {
          attackBoost = 0;
        }
        lastRMS = rms;

        // --- Intensity Calculation (no multiplier, just min/max out mapping) ---
        let unclamped = (rms - v.rmsMin) / (v.rmsMax - v.rmsMin);
        unclamped = Math.max(0, Math.min(1, unclamped));
        unclamped = Math.pow(unclamped, v.curvePow);
        unclamped = unclamped + attackBonus;
        unclamped = Math.max(0, Math.min(1, unclamped));

        // Map intensity to [minOut, maxOut]
        let minOut = Math.max(0, Math.min(1, v.minOut || 0));
        let maxOut = Math.max(minOut + 0.01, Math.min(1, v.maxOut || 1));
        let outIntensity = minOut + (maxOut - minOut) * unclamped;
        outIntensity = Math.max(0, Math.min(1, outIntensity));
        v.lastIntensity = outIntensity;

        const pctDisplay = Math.round(100 * outIntensity);

        if (intBar) intBar.style.width = pctDisplay + "%";
        if (intOut) intOut.textContent = pctDisplay;
        if (rmsHeader) rmsHeader.textContent = "RMS: " + Math.round(rms);

      }, 100);
    })();

    // --- Buttplug logic (connect/disconnect) ---
    const mainCode = `
      (function() {
        function $(id) { return document.getElementById(id); }
        const statusEl = $('bp-status');
        const devicesEl = $('bp-devices');
        const connectBtn = $('bp-connect');
        let client = null, connector = null, interval = null;
        let connected = false, scanning = false;
        let lastDeviceCount = 0;

        window.bpVars = window.bpVars || {
          rmsMin: 100,
          rmsMax: 185,
          curvePow: 1.3,
          minOut: 0,
          maxOut: 1,
          opacity: 0.7,
          fftSize: 64,
          smoothing: 0.6,
          atkMax: 0.10,
          lastIntensity: 0
        };

        function setStatus(txt, color) {
          if (statusEl) {
            statusEl.innerHTML = color ? '<span style="color:' + color + '">' + txt + '</span>' : txt;
          }
        }
        function updateDevices(count) {
          if (devicesEl) devicesEl.textContent = 'Devices: ' + count;
        }

        async function connectButtplug() {
          setStatus('🟡 Connecting...', '#ffc107');
          try {
            // Lazy-load Buttplug library
            if (!window.buttplug) {
              await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = 'https://cdn.jsdelivr.net/npm/buttplug@3.2.2/dist/web/buttplug.min.js';
                script.onload = resolve;
                script.onerror = reject;
                document.body.appendChild(script);
              });
            }
            connector = new window.buttplug.ButtplugBrowserWebsocketClientConnector("ws://localhost:12345");
            client = new window.buttplug.ButtplugClient("Audio Intensity");
            window.bpClient = client;

            client.addListener("deviceadded", () => {
              updateDevices(client.devices.length);
              setStatus('🟢 Connected', '#0f0');
            });
            client.addListener("deviceremoved", () => {
              updateDevices(client.devices.length);
              setStatus(
                client.devices.length ? '🟢 Connected' : '🟡 No devices',
                client.devices.length ? '#0f0' : '#ffc107'
              );
            });

            await client.connect(connector);
            await client.startScanning();
            scanning = true;
            updateDevices(client.devices.length);
            if (client.devices.length === 0) {
              setStatus('🟡 No devices', '#ffc107');
            } else {
              setStatus('🟢 Connected', '#0f0');
            }

            // --- Send intensity to device, using actual mapped output intensity ---
            clearInterval(interval);
            interval = setInterval(() => {
              if (!client || !client.devices || !client.devices.length) {
                updateDevices(0);
                setStatus('🟡 No devices', '#ffc107');
                return;
              }
              // Find computed intensity from window.bpVars (set by live audio viz above)
              let v = window.bpVars;
              let outIntensity = typeof v.lastIntensity === "number" ? v.lastIntensity : 0;
              outIntensity = Math.max(0, Math.min(1, outIntensity)); // Device always expects 0-1
              client.devices.forEach(device => {
                if (device && device.messageAttributes) {
                  device.vibrate(outIntensity).catch(e => {});
                }
              });
              if (client.devices.length !== lastDeviceCount) {
                updateDevices(client.devices.length);
                lastDeviceCount = client.devices.length;
              }
              setStatus(
                client.devices.length ? '🟢 Connected' : '🟡 No devices',
                client.devices.length ? '#0f0' : '#ffc107'
              );
            }, 100);

            connected = true;
            connectBtn.textContent = "Disconnect";
          } catch (e) {
            setStatus('🔴 Failed', '#f00');
            updateDevices(0);
            connected = false;
            connectBtn.textContent = "Connect";
          }
        }

        async function disconnectButtplug() {
          setStatus('🔴 Disconnected', '#f00');
          updateDevices(0);
          if (client) {
            try { await client.disconnect(); } catch (e) {}
          }
          client = null;
          scanning = false;
          connected = false;
          clearInterval(interval);
          connectBtn.textContent = "Connect";
        }

        connectBtn.addEventListener('click', async () => {
          if (connected) {
            await disconnectButtplug();
          } else {
            await connectButtplug();
          }
        });

      })();
    `;

    // --- Inject code into page ---
    const script = document.createElement('script');
    script.textContent = mainCode;
    document.documentElement.appendChild(script);
    script.remove();
})();
