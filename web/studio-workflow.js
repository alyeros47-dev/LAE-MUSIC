// Presentation adapter for the original lyrics/voice/music handlers.
// A recording is local until an explicit save; no auto-training or provider calls.
export function pcmWav(samples, sampleRate) {
  if (
    !Number.isInteger(sampleRate) ||
    sampleRate < 8000 ||
    sampleRate > 192000 ||
    samples.length > sampleRate * 60 ||
    samples.length * 2 + 44 > 12000000
  )
    throw Error(
      "Record up to 60 seconds at a supported microphone sample rate.",
    );
  const bytes = new ArrayBuffer(44 + samples.length * 2),
    view = new DataView(bytes);
  const text = (offset, value) =>
    [...value].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, bytes.byteLength - 8, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, i) => {
    const s = Math.max(-1, Math.min(1, Number(sample) || 0));
    view.setInt16(44 + i * 2, s < 0 ? s * 32768 : s * 32767, true);
  });
  return new Blob([bytes], { type: "audio/wav" });
}
export function bindStudioWorkflow({
  form,
  lyricsForm = form,
  musicForm = form,
  artistId,
  voiceProfile,
  api,
  active,
  toast,
  storageReady = false,
}) {
  const by = (id) => form.querySelector("#" + id);
  let captureVersion = 0;
  let disposed = false,
    speech = null,
    stream = null,
    context = null,
    source = null,
    processor = null,
    timer = null,
    sample = null,
    previewURL = null;
  if(!navigator.mediaDevices?.getUserMedia||!(window.AudioContext||window.webkitAudioContext)){by('studio-record-voice').hidden=true;by('studio-stop-voice').hidden=true;}
  const canAct = () => !disposed && active() && form.isConnected;
  const persist = () =>
    lyricsForm.dispatchEvent(new Event("input", { bubbles: true }));
  function setUploadCode(code, title) {
    const valid = /^[A-F0-9]{36}$/.test(code || "");
    by("studio-upload-code").value = valid ? code : "";
    by("copy-studio-code").disabled = !valid;
    by("studio-code-status").textContent = valid
      ? "Your upload code is ready. Keep it with “" +
        title +
        "”. The server checks ownership, title and one-time use. The server also checks the generated audio and your artist-plan entitlement."
      : "Upload codes are available for each successfully generated song below. Lyrics generation alone does not issue a publishing code.";
  }
  try {
    const draft = JSON.parse(
      localStorage.getItem("lae_studio_draft:" + artistId),
    );
    if (draft?.uploadCode)
      setUploadCode(draft.uploadCode, draft.title || "your song");
  } catch {}
  by("copy-studio-code").onclick = async () => {
    try {
      await navigator.clipboard.writeText(by("studio-upload-code").value);
      toast("Upload code copied");
    } catch {
      by("studio-upload-code").focus();
      by("studio-upload-code").select();
      toast("Select and copy your upload code.");
    }
  };
  document.querySelectorAll("[data-studio-step]").forEach((button) => {
    button.onclick = () => {
      const target = by(button.dataset.studioStep);
      target.focus({ preventScroll: true });
      target.scrollIntoView({
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "start",
      });
    };
  });
  const lyricsOutput = by("lyrics-output"),
    styleOutput = by("style-output");
  for (const [button, output] of [
    ["copy-studio-lyrics", lyricsOutput],
    ["copy-studio-style", styleOutput],
  ]) {
    by(button).onclick = async () => {
      if (!output.value.trim())
        return toast("Generate or restore a draft first.");
      try {
        await navigator.clipboard.writeText(output.value);
        toast(
          button === "copy-studio-lyrics" ? "Lyrics copied" : "Style copied",
        );
      } catch {
        output.focus();
        output.select();
        toast("Select and copy this text manually.");
      }
    };
    output.addEventListener("input", persist);
  }
  const musicKey = "lae_music_studio_draft:" + artistId;
  try {
    const saved = JSON.parse(localStorage.getItem(musicKey));
    for (const name of ["title", "lyrics", "style", "duration"])
      if (typeof saved?.[name] === "string")
        musicForm.elements[name].value = saved[name];
  } catch {}
  musicForm.addEventListener("input", () => {
    try {
      localStorage.setItem(
        musicKey,
        JSON.stringify(
          Object.fromEntries(
            ["title", "lyrics", "style", "duration"].map((name) => [
              name,
              musicForm.elements[name].value,
            ]),
          ),
        ),
      );
    } catch {}
  });
  by("send-to-music").onclick = () => {
    const values = {
      title: lyricsForm.elements.title.value,
      lyrics: lyricsOutput.value,
      style: styleOutput.value,
      duration: lyricsForm.elements.duration.value || "3 minutes",
    };
    if (!values.lyrics.trim() || !values.style.trim())
      return toast("Generate or restore both lyrics and style first.");
    const changed = Object.entries(values).some(
      ([name, value]) =>
        name !== "duration" &&
        musicForm.elements[name].value.trim() &&
        musicForm.elements[name].value !== value,
    );
    if (
      changed &&
      !window.confirm(
        "Replace the current Music Studio title, lyrics and style with this draft?",
      )
    )
      return;
    for (const [name, value] of Object.entries(values))
      musicForm.elements[name].value = value;
    musicForm.dispatchEvent(new Event("input", { bubbles: true }));
    musicForm.elements.lyrics.focus();
    musicForm.scrollIntoView({
      block: "start",
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
    toast(
      "Lyrics and style transferred. No generation or credit charge was started.",
    );
  };
  const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
  const dictation = by("studio-dictation-status"),
    dictate = by("studio-dictate");
  if (!Speech) {
    dictate.hidden = true;
    dictation.textContent =
      "Speech dictation is unavailable in this browser. Use your phone keyboard’s microphone or type your idea.";
  } else
    dictate.onclick = () => {
      if (speech) {
        speech.stop();
        return;
      }
      const recognition = new Speech();
      speech = recognition;
      recognition.lang = document.documentElement.lang || "en";
      recognition.continuous = true;
      recognition.interimResults = false;
      const initial = lyricsForm.elements.idea.value;
      recognition.onresult = (event) => {
        if (!canAct()) return;
        const transcript = Array.from(event.results)
          .filter((r) => r.isFinal)
          .map((r) => r[0].transcript)
          .join(" ");
        lyricsForm.elements.idea.value = [initial, transcript]
          .filter(Boolean)
          .join(" ")
          .slice(0, 1200);
        persist();
        dictation.textContent =
          "Added your spoken idea. Review the text before generating.";
      };
      recognition.onerror = () => {
        if (canAct())
          dictation.textContent =
            "Dictation could not continue. Check microphone permission, use keyboard dictation, or type your idea.";
      };
      recognition.onend = () => {
        if (speech === recognition) speech = null;
        if (canAct()) {
          dictate.textContent = "🎙 Dictate my song idea";
          dictate.setAttribute("aria-pressed", "false");
        }
      };
      try {
        recognition.start();
        dictate.textContent = "Stop dictation";
        dictate.setAttribute("aria-pressed", "true");
        dictation.textContent =
          "Listening to your idea. Your browser may send speech to its online recognition service. Press Stop when finished.";
      } catch {
        speech = null;
        dictation.textContent =
          "Dictation could not start. You can type your idea instead.";
      }
    };
  const voiceStatus = by("studio-voice-status"),
    save = by("studio-save-voice"),
    record = by("studio-record-voice"),
    stop = by("studio-stop-voice");
  let savingVoice = false;
  const refreshSave = () => {
    save.disabled =
      !storageReady ||
      savingVoice ||
      !sample ||
      ["training", "submitting", "verification_required"].includes(
        voiceProfile.status,
      ) ||
      !by("studio-voice-consent").checked;
  };
  function clearSample() {
    if (previewURL) URL.revokeObjectURL(previewURL);
    previewURL = null;
    sample = null;
    by("studio-voice-preview").removeAttribute("src");
    by("studio-voice-preview").hidden = true;
    refreshSave();
  }
  function useSample(file) {
    clearSample();
    sample = file;
    previewURL = URL.createObjectURL(file);
    by("studio-voice-preview").src = previewURL;
    by("studio-voice-preview").hidden = false;
    refreshSave();
  }
  by("studio-voice-file").onchange = () => {
    const file = by("studio-voice-file").files[0];
    if (!file) return;
    const type =
      file.type ||
      (/\.mp3$/i.test(file.name)
        ? "audio/mpeg"
        : /\.wav$/i.test(file.name)
          ? "audio/wav"
          : "");
    if (
      !["audio/mpeg", "audio/wav", "audio/x-wav"].includes(type) ||
      file.size < 10000 ||
      file.size > 12000000
    ) {
      voiceStatus.textContent =
        "Choose a clear MP3 or WAV recording between 10 KB and 12 MB.";
      clearSample();
      return;
    }
    useSample(
      new Blob([file], { type: type === "audio/x-wav" ? "audio/wav" : type }),
    );
    voiceStatus.textContent =
      "Local sample ready to preview. " +
      (storageReady
        ? "Confirm your consent before saving."
        : "Uploading and training remain pending safe storage verification.");
  };
  function endCapture() {
    captureVersion++;
    clearTimeout(timer);
    timer = null;
    if (processor) {
      processor.onaudioprocess = null;
      processor.disconnect();
      processor = null;
    }
    source?.disconnect();
    source = null;
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    const previous = context;
    context = null;
    previous?.close().catch(() => {});
    if (canAct()) {
      record.disabled = false;
      stop.disabled = true;
    }
  }
  let finish = null;
  record.disabled =
    !navigator.mediaDevices?.getUserMedia ||
    !(window.AudioContext || window.webkitAudioContext);
  record.onclick = async () => {
    clearSample();
    const ticket = ++captureVersion;
    record.disabled = true;
    voiceStatus.textContent = "Requesting microphone permission…";
    try {
      const granted = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      if (!canAct() || ticket !== captureVersion) {
        granted.getTracks().forEach((track) => track.stop());
        return;
      }
      stream = granted;
      const Audio = window.AudioContext || window.webkitAudioContext;
      context = new Audio();
      await context.resume();
      if (!canAct() || ticket !== captureVersion) {
        if (ticket === captureVersion) endCapture();
        return;
      }
      const rate = context.sampleRate,
        chunks = [];
      const maxSamples = Math.min(rate * 60, Math.floor((12000000 - 44) / 2));
      let count = 0;
      source = context.createMediaStreamSource(stream);
      processor = context.createScriptProcessor(4096, 1, 1);
      finish = () => {
        const data = new Float32Array(count);
        let offset = 0;
        for (const chunk of chunks) {
          data.set(chunk, offset);
          offset += chunk.length;
        }
        endCapture();
        if (canAct()) {
          if (count < rate * 15) {
            voiceStatus.textContent =
              "Record at least 15 seconds of solo singing. No sample was uploaded.";
            return;
          }
          useSample(pcmWav(data, rate));
          voiceStatus.textContent =
            "Your singing sample is ready for local preview. " +
            (storageReady
              ? "Confirm consent to save and train."
              : "Upload and training remain pending safe storage verification.");
        }
      };
      processor.onaudioprocess = (event) => {
        if (!canAct()) {
          endCapture();
          return;
        }
        const input = event.inputBuffer.getChannelData(0),
          left = maxSamples - count;
        if (left > 0) {
          const copy = input.slice(0, left);
          chunks.push(copy);
          count += copy.length;
        }
        if (count >= maxSamples) finish();
      };
      source.connect(processor);
      processor.connect(context.destination); // output stays silent; capture input only.
      stop.disabled = false;
      voiceStatus.textContent =
        "Recording your singing voice locally. Sing alone for 15–60 seconds, then press Stop recording.";
      timer = setTimeout(() => finish?.(), 60000);
    } catch {
      if (ticket !== captureVersion) return;
      endCapture();
      if (canAct())
        voiceStatus.textContent =
          "Recording could not start. Check microphone permission or choose an MP3/WAV file.";
    }
  };
  stop.onclick = () => finish?.();
  by("studio-clear-voice").onclick = () => {
    endCapture();
    clearSample();
    by("studio-voice-file").value = "";
    voiceStatus.textContent =
      "Local preview cleared. Any submitted voice profile is unchanged.";
  };
  by("studio-voice-consent").onchange = refreshSave;
  async function refreshVoice() {
    const result = await api("/api/voice/status");
    if (!canAct()) return;
    const ready = result.status === "ready";
    voiceProfile.status = result.status;
    voiceProfile.hasVoice = ready;
    const customOption = lyricsForm.elements.voice?.querySelector(
      'option[value="custom"]',
    );
    if(customOption&&!ready)customOption.remove();
    if(ready&&!customOption&&lyricsForm.elements.voice)lyricsForm.elements.voice.add(new Option('My saved voice profile','custom'));
    musicForm.elements.useVoice.closest('label').hidden=!ready;
    const voicePanel=by('studio-voice');if(voicePanel&&ready)voicePanel.hidden=false;
    const voiceNav=form.querySelector('[data-voice-navigation]');if(voiceNav&&ready)voiceNav.hidden=false;
    if (!ready && lyricsForm.elements.voice?.value === "custom")
      lyricsForm.elements.voice.value = "";
    refreshSave();
    musicForm.elements.useVoice.disabled = !ready;
    if (!ready) musicForm.elements.useVoice.checked = false;
    voiceStatus.textContent = ready
      ? "Your singing voice is ready. Select “Use my saved voice profile” to use it."
      : result.status === "training"
        ? "Your voice profile is training. Check again shortly."
        : "Voice profile status: " +
          result.status +
          ". Standard voice generation is still available.";
  }
  by("studio-refresh-voice").onclick = async () => {
    try {
      await pollVoice();
    } catch (error) {
      if (canAct()) voiceStatus.textContent = error.message;
    }
  };
  let voicePoll;
  const pollVoice = async () => {
    clearTimeout(voicePoll);
    try {
      await refreshVoice();
      if (canAct() && voiceProfile.status === "training")
        voicePoll = setTimeout(pollVoice, 15000);
    } catch (error) {
      if (canAct())
        voiceStatus.textContent =
          error.message +
          " Select Check voice profile to retry the status check; do not submit training again.";
    }
  };
  save.onclick = async () => {
    if (!storageReady || !sample || !by("studio-voice-consent").checked) return;
    if (
      savingVoice ||
      ["submitting", "training", "verification_required"].includes(
        voiceProfile.status,
      )
    )
      return;
    savingVoice = true;
    refreshSave();
    voiceStatus.textContent = "Saving your voice sample…";
    try {
      const upload = await api("/api/voice/upload", "POST", {
        type: sample.type,
        bytes: sample.size,
        consent: true,
      });
      if (
        !/^https:\/\//.test(upload.url) &&
        !/^\/api\/voice\/sample\?reference=[a-f0-9-]{36}$/.test(upload.url)
      )
        throw Error("Secure upload URL was not returned.");
      const response = await fetch(upload.url, {
        method: "PUT",
        headers: { "Content-Type": sample.type },
        body: sample,
        credentials: upload.url.startsWith("/") ? "same-origin" : "omit",
        signal: AbortSignal.timeout(90000),
      });
      if (!response.ok) {
        let message =
          "Voice upload failed. Your local sample is kept; training was not started.";
        try {
          message = (await response.json()).error || message;
        } catch {}
        throw Error(message);
      }
      voiceStatus.textContent = "Voice sample saved. Creating your profile…";
      const trained = await api("/api/voice/train", "POST", {});
      voiceProfile.status = trained.status;
      if (canAct()) {
        voiceStatus.textContent =
          "Voice training submitted. Checking automatically; you can keep editing your music.";
        void pollVoice();
      }
    } catch (error) {
      if (canAct()) {
        voiceStatus.textContent = error.message;
        // Recheck the authoritative state after a lost response. A storage/config
        // error must not invent an ambiguous provider reservation in the browser.
        try {
          const current = await api("/api/voice/profile");
          Object.assign(voiceProfile, current);
        } catch {}
      }
    } finally {
      savingVoice = false;
      if (canAct()) refreshSave();
    }
  };
  function dispose() {
    if (disposed) return;
    disposed = true;
    clearTimeout(voicePoll);
    speech?.abort();
    speech = null;
    endCapture();
    clearSample();
    observer.disconnect();
    window.removeEventListener("pagehide", dispose);
  }
  const observer = new MutationObserver(() => {
    if (!form.isConnected) dispose();
  });
  observer.observe(form.ownerDocument.body, { childList: true, subtree: true });
  window.addEventListener("pagehide", dispose);
  return { setUploadCode, dispose };
}
