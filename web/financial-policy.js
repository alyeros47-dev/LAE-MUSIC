export function refundConditions(policy, e, kind) {
  return `<section class="notice"><strong>Refund conditions</strong><p>${e(kind === "listener" ? policy.premium : policy.artist)}</p>${kind !== "listener" ? `<p>${e(policy.studio)}</p>` : ""}<p>${e(policy.currency)}</p></section><label class="check"><input name="policy_accepted" type="checkbox" required><span>I have read and accept these refund conditions.</span></label>`;
}
