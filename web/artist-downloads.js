// Artist-owned studio exports only; listeners are not given catalog download links.
export function bindArtistDownloads({ toast }) {
  document.addEventListener("click", async (event) => {
    const link = event.target.closest?.("a[download]");
    if (
      !link ||
      event.button !== 0 ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    const url = new URL(link.href, location.href);
    if (
      url.origin !== location.origin ||
      !(
        url.pathname === "/api/music/sonic/output" ||
        /^\/api\/platform\/studio\/releases\/[1-9][0-9]*\/download$/.test(
          url.pathname,
        )
      )
    )
      return;
    event.preventDefault();
    if (link.dataset.preparing === "1") return;
    link.dataset.preparing = "1";
    link.setAttribute("aria-busy", "true");
    const label = link.textContent,
      original = link.href;
    link.textContent = "Preparing your file…";
    try {
      const response = await fetch(original, {
        credentials: "same-origin",
        signal: AbortSignal.timeout(120000),
      });
      if (!response.ok) {
        let message =
          "Your file could not be saved. Try again without generating another song.";
        try {
          const x = await response.json();
          if (x.error) message = x.error;
        } catch {}
        throw Error(message);
      }
      const type = (response.headers.get("content-type") || "").split(";")[0];
      const extension = {
        "audio/mpeg": "mp3",
        "audio/mp4": "m4a",
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
      }[type];
      if (!extension)
        throw Error(
          "The server did not return an audio or artwork file. No new generation was requested.",
        );
      const limit = type.startsWith("image/")
        ? 3 * 1024 * 1024
        : 30 * 1024 * 1024;
      if (Number(response.headers.get("content-length")) > limit)
        throw Error("This file exceeds the supported download size.");
      const reader = response.body.getReader(),
        chunks = [];
      let size = 0;
      try {
        for (;;) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.byteLength;
          if (size > limit)
            throw Error("This file exceeds the supported download size.");
          chunks.push(part.value);
        }
      } finally {
        await reader.cancel().catch(() => {});
      }
      if (!size)
        throw Error(
          "The returned file was empty. Try again without generating another song.",
        );
      const disposition = response.headers.get("content-disposition") || "";
      let filename = "LAE-MUSIC." + extension;
      const named = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
      if (named)
        try {
          filename =
            decodeURIComponent(named[1])
              .replace(/[\\/\x00-\x1f]/g, "")
              .slice(0, 180) || filename;
        } catch {}
      const blob = URL.createObjectURL(new Blob(chunks, { type }));
      link.href = blob;
      link.download = filename;
      link.textContent = "Save ready file ↓";
      delete link.dataset.preparing;
      link.removeAttribute("aria-busy");
      link.click();
      toast(
        "Your file is ready. If your browser did not save it, tap “Save ready file”.",
      );
      setTimeout(() => {
        URL.revokeObjectURL(blob);
        if (link.isConnected) {
          link.href = original;
          link.textContent = label;
        }
      }, 120000);
      return;
    } catch (error) {
      toast(error.message, true);
    } finally {
      delete link.dataset.preparing;
      link.removeAttribute("aria-busy");
      if (link.href === original) link.textContent = label;
    }
  });
}
