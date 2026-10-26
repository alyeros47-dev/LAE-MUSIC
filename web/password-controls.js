// Shared by signup, sign-in, password changes, recovery and administrator dialogs.
export function installPasswordControls(root = document) {
  let serial = 0;
  const enhance = () =>
    root
      .querySelectorAll('input[type="password"]:not([data-password-control])')
      .forEach((input) => {
        input.dataset.passwordControl = "true";
        if (!input.id) input.id = "lae-password-" + ++serial;
        const label = (
          input.closest("label")?.childNodes[0]?.textContent ||
          input.name ||
          "password"
        ).trim();
        const wrap = document.createElement("span");
        wrap.className = "password-control";
        const ownerLabel = input.closest("label");
        if (ownerLabel) {
          ownerLabel.htmlFor = input.id;
          if (!ownerLabel.id) ownerLabel.id = input.id + "-label";
          ownerLabel.after(wrap);
        } else input.before(wrap);
        wrap.append(input);
        const button = document.createElement("button");
        button.type = "button";
        button.className = "password-visibility";
        button.setAttribute("aria-controls", input.id);
        if (ownerLabel) button.setAttribute("aria-describedby", ownerLabel.id);
        button.setAttribute("aria-pressed", "false");
        button.innerHTML =
          '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
        const paint = () => {
          const visible = input.type === "text";
          button.setAttribute(
            "aria-label",
            (visible ? "Hide" : "Show") + " password",
          );
          button.title = (visible ? "Hide" : "Show") + " password";
          button.setAttribute("aria-pressed", String(visible));
        };
        button.onclick = () => {
          const start = input.selectionStart,
            end = input.selectionEnd;
          input.type = input.type === "password" ? "text" : "password";
          paint();
          input.focus({ preventScroll: true });
          try {
            input.setSelectionRange(start, end);
          } catch {}
        };
        wrap.append(button);
        paint();
      });
  enhance();
  const observer = new MutationObserver(enhance);
  observer.observe(root.body || root, { childList: true, subtree: true });
  root.addEventListener(
    "submit",
    (event) => {
      event.target
        .querySelectorAll("input[data-password-control]")
        .forEach((input) => {
          input.type = "password";
          const button = input.parentElement.querySelector("button");
          button?.setAttribute("aria-pressed", "false");
          button?.setAttribute(
            "aria-label",
            button.getAttribute("aria-label").replace(/^Hide /, "Show "),
          );
        });
    },
    true,
  );
  return () => observer.disconnect();
}
export function bindPasswordConfirmation(form) {
  const password = form.elements.password || form.elements.newPassword,
    confirmation = form.elements.confirmPassword || form.elements.confirmation;
  if (!password || !confirmation) return;
  const check = () => {
    const mismatch =
      !!confirmation.value && confirmation.value !== password.value;
    confirmation.setCustomValidity(
      mismatch
        ? "Passwords do not match. Use the eye buttons to check both fields."
        : "",
    );
    confirmation.setAttribute("aria-invalid", String(mismatch));
    const status = form.querySelector(".form-status");
    if (status) {
      status.textContent = mismatch
        ? "Passwords do not match. Re-enter the confirmation or use the eye buttons."
        : "";
      status.classList.toggle("error", mismatch);
    }
  };
  password.addEventListener("input", check);
  confirmation.addEventListener("input", check);
}
