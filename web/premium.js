const dateTime = (value) =>
  new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "long",
  });
const accountAmount = (value, row = {}) =>
  new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: row.currency || "USD",
  }).format(Number(value || 0) / 100);
export class PremiumListeningTracker {
  constructor({ api, audio, listener }) {
    this.api = api;
    this.audio = audio;
    this.listener = listener;
    this.generation = 0;
    document.addEventListener("trackchange", (event) => {
      this.track = event.detail.id;
      this.skip=event.detail.playbackPending===true||event.detail.offline===true;this.begin();
    });
    document.addEventListener('playbacksource',event=>{this.skip=event.detail.offline===true;this.track=event.detail.track.id;this.begin();});
    audio.addEventListener("play", () => this.schedule());
    for (const event of ["pause", "ended"])
      audio.addEventListener(event, () => {
        clearInterval(this.timer);
        this.timer = null;
      });
  }
  refresh() {
    const listener = this.listener(),
      identity = listener
        ? [
            listener.id,
            listener.premium?.id || "",
            listener.premium?.expires_at || "",
          ].join(":")
        : null;
    if (identity !== this.listenerIdentity) {
      this.listenerIdentity = identity;
      this.begin();
    }
  }
  begin() {
    const generation = ++this.generation;
    this.ticket = null;
    clearInterval(this.timer);
    this.timer = null;
    if (this.skip || !this.track || !this.listener()) return;
    void this.api("/api/platform/premium/playback", "POST", {
      track_id: String(this.track),
    })
      .then((x) => {
        if (generation === this.generation && x.eligible) {
          this.ticket = { id: x.id, sequence: 0 };
          this.schedule();
        }
      })
      .catch(() => {});
  }
  schedule() {
    if (this.audio.paused || !this.ticket || this.timer) return;
    this.timer = setInterval(() => this.beat(), 10000);
  }
  async beat() {
    if (this.busy || this.audio.paused || !this.ticket) return;
    this.busy = true;
    const ticket = this.ticket,
      payload = {
        id: ticket.id,
        sequence: ticket.sequence + 1,
        position: this.audio.currentTime,
      };
    try {
      let result;
      try {
        result = await this.api(
          "/api/platform/premium/heartbeat",
          "POST",
          payload,
        );
      } catch (error) {
        if (error.status && error.status < 500) throw error;
        result = await this.api(
          "/api/platform/premium/heartbeat",
          "POST",
          payload,
        );
      }
      if (this.ticket === ticket) ticket.sequence = result.sequence;
      if (result.qualified) {
        clearInterval(this.timer);
        this.timer = null;
      }
    } catch {
      if (this.ticket === ticket) {
        this.ticket = null;
        clearInterval(this.timer);
        this.timer = null;
      }
    } finally {
      this.busy = false;
    }
  }
}
export async function premiumPage(view, url, ctx) {
  const {
    api,
    e,
    session,
    heading,
    notice,
    buttonLink,
    bindForm,
    keyFor,
    clearKey,
    toast,
    route,
    currencyDisplay,
  } = ctx;
  const plans = await api("/api/platform/premium/plans"),
    data = session.listener ? await api("/api/platform/premium/status") : null,
    approved = plans.price_status === "approved";
  const amount = (n, currency = "USD") =>
    new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      currencyDisplay: "code",
    }).format(
      Number(n) /
        10 **
          new Intl.NumberFormat("en", {
            style: "currency",
            currency,
          }).resolvedOptions().maximumFractionDigits,
    );
  const record = (o) =>
    `<article class="panel"><span class="eyebrow">${o.verified_at ? "VERIFIED · " + e(o.mode) : "PURCHASE RECORD"}</span><h2>${e(o.plan)} · ${e(amount(o.amount_minor, o.currency))}</h2>${o.charge_currency ? `<p>Original charge: ${e(amount(o.charge_minor, o.charge_currency))}</p>` : ""}${o.reference ? `<p class="code-link">${e(o.reference)}</p>` : ""}${o.checkout_url ? `<a class="button" href="${e(o.checkout_url)}" target="_blank" rel="noopener noreferrer">Open sandbox checkout ↗</a>` : ""}${o.attempt_id ? `<button class="button secondary" data-premium-verify="${e(o.attempt_id)}">Check original payment</button>` : approved && plans.providers.length > 0 && o.currency === "USD" ? `<button class="button secondary" data-premium-checkout="${e(o.id)}">Review payment options</button>` : ""}</article>`;
  if (
    !view.set(
      heading(
        "PREMIUM LISTENING",
        "A little more music. A direct connection.",
        "Listen worldwide. Support the artists behind your soundtrack.",
        buttonLink("/discover", "Keep listening for free", true),
      ) +
        notice(
          "Public streaming, playlists and favorites remain available. Premium does not grant commercial or public-performance rights.",
        ) +
        `<section class="panel premium-status"><span class="eyebrow">${data?.active ? "PREMIUM ACTIVE" : "YOUR LISTENING CHOICE"}</span><h2>${data?.active ? "Welcome to Premium." : "Your music stays yours."}</h2>${data?.active ? `<span class="badge">Premium</span><p>Activated ${e(dateTime(data.current.starts_at))} · Expires ${e(dateTime(data.current.expires_at))}</p>` : "<p>Choose a fixed-term pass. Verified renewals preserve your remaining cover.</p>"}<p>Ad-free playback without advertising interruptions · Premium badge · listening insights · in-app offline listening on supported browsers · support for artists through eligible streams.</p>${data ? `<span class="badge">${e(data.activity.premium_streams)} qualifying Premium plays this month</span>` : buttonLink("/join?role=listener&return=premium" + (url.searchParams.get("ref") ? "&ref=" + encodeURIComponent(url.searchParams.get("ref")) : ""), "Create a free listener account", true)}</section>` +
        (!approved
          ? notice(
              "USD price proposal awaiting approval. These proposed prices are not available for purchase.",
              true,
            )
          : "") +
        `<div class="price-grid premium-prices">${plans.plans.map((p) => `<article class="price-card ${p.code === "monthly" ? "featured" : ""}"><span class="eyebrow">${p.days} ${p.days === 1 ? "DAY" : "DAYS"}</span><h3>${e(p.name)}</h3><div class="price">${e(amount(p.amount_minor))}</div>${currencyDisplay.markup("premium_listener", p.code)}<p>${approved ? "Fixed USD base price." : "Proposed USD base price."} A fixed term with clear start and end dates.</p><button class="button secondary" data-premium-plan="${e(p.code)}" ${approved && plans.providers.length > 0 ? "" : "disabled"}>Review ${e(p.name)}</button></article>`).join("")}</div>` +
        currencyDisplay.info() +
        notice(
          "USD is our standard currency. Choose your country and preferred display currency above. Local prices are estimates; the final supported payment currency and amount are shown before confirmation. Automatic renewal is off.",
        ) +
        notice(
          plans.providers.length
            ? "Sandbox checkout only. Test payments never create withdrawable artist earnings."
            : "Payment checkout is unavailable until merchant accounts and supported currencies are verified.",
          true,
        ) +
        (data
          ? heading("YOUR PREMIUM", "Your subscriptions and purchase records") +
            data.orders.map(record).join("") +
            `<section class="panel"><h2>Your entitlement history</h2>${data.entitlements.length ? data.entitlements.map((t) => `<p>${e(t.plan)} · ${e(dateTime(t.starts_at))} → ${e(dateTime(t.expires_at))} · ${t.reversed ? "Reversed" : t.held ? "Under review" : "Paid cover"} · ${e(t.mode)}</p>`).join("") : "<p>No paid terms yet. Free listening stays available.</p>"}</section>`
          : ""),
    )
  )
    return;
  currencyDisplay.paint();
  document.querySelectorAll("[data-premium-plan]").forEach(
    (button) =>
      (button.onclick = () => {
        if (!session.listener) {
          ctx.navigate(
            "/join?role=listener&return=premium" +
              (url.searchParams.get("ref")
                ? "&ref=" + encodeURIComponent(url.searchParams.get("ref"))
                : ""),
          );
          return;
        }
        const p = plans.plans.find(
          (p) => p.code === button.dataset.premiumPlan,
        );
        ctx.actionDialog(
          `<h2>Review ${e(p.name)}.</h2><p>${e(amount(p.amount_minor))} base · ${p.days * 24} hours · manual renewal only.</p><form><label>Affiliate ID, if referred<input name="referrer_id" inputmode="numeric" value="${e(url.searchParams.get("ref") || "")}"></label><p>No registration reward. Verified listener-product referrals use 10% direct and up to 5% eligible indirect.</p><button type="submit" class="button">Save unpaid Premium record</button><p class="form-status" role="status"></p></form>`,
          (root) =>
            bindForm(root.querySelector("form"), async (b) => {
              const payload = {
                plan: p.code,
                referrer_id: b.referrer_id || null,
              };
              await api("/api/platform/premium/orders", "POST", payload, {
                headers: {
                  "Idempotency-Key": keyFor("premium-order", payload),
                },
              });
              clearKey("premium-order");
              document.getElementById("action-dialog").close();
              route(true);
            }),
        );
      }),
  );
  document.querySelectorAll("[data-premium-checkout]").forEach(
    (button) =>
      (button.onclick = () =>
        ctx.actionDialog(
          `<h2>Your payment options.</h2><form><label>Provider<select name="provider" aria-label="Provider">${plans.providers.map((p) => `<option value="${e(p.id)}">${e(p.id)}</option>`).join("")}</select></label><label>Payment currency<select name="currency" aria-label="Payment currency"></select></label><p class="payment-alternative"></p><button type="submit" class="button">Review final payment amount</button><p class="form-status" role="status"></p></form>`,
          (root) => {
            const form = root.querySelector("form"),
              provider = form.elements.provider,
              currency = form.elements.currency;
            const update = () => {
              const account = plans.providers.find(
                  (p) => p.id === provider.value,
                ),
                preferred = currencyDisplay.currency;
              currency.replaceChildren(
                ...account.currencies.map((c) => new Option(c, c)),
              );
              currency.value = account.currencies.includes(preferred)
                ? preferred
                : account.currencies.includes("USD")
                  ? "USD"
                  : account.currencies[0];
              root.querySelector(".payment-alternative").textContent =
                account.currencies.includes(preferred)
                  ? "Choose a supported payment currency."
                  : preferred +
                    " is unavailable on this merchant account. Supported alternatives: " +
                    account.currencies.join(", ") +
                    ".";
            };
            provider.onchange = update;
            update();
            bindForm(form, async (b) => {
              const q = await api("/api/platform/premium/quote", "POST", {
                order_id: button.dataset.premiumCheckout,
                ...b,
              });
              root.innerHTML = `<h2>Confirm your final payment amount.</h2><p class="price">${e(amount(q.charge_minor, q.charge_currency))}</p><p>USD base price: ${e(amount(q.base_minor))}</p><p>Exchange rate: 1 USD = ${e(q.rate)} ${e(q.charge_currency)} · ${e(dateTime(q.conversion_at))}</p><p>Quote expires ${e(dateTime(q.expires_at))}. No money has been charged.</p><form><button type="submit" class="button">Create sandbox reference</button><p class="form-status" role="status"></p></form>`;
              bindForm(root.querySelector("form"), async () => {
                const payload = { quote_id: q.id };
                await api("/api/platform/premium/checkout", "POST", payload, {
                  headers: {
                    "Idempotency-Key": keyFor(
                      "premium-checkout:" + q.id,
                      payload,
                    ),
                  },
                });
                document.getElementById("action-dialog").close();
                route(true);
              });
            });
          },
        )),
  );
  document.querySelectorAll("[data-premium-verify]").forEach(
    (button) =>
      (button.onclick = async () => {
        button.disabled = true;
        try {
          await api("/api/platform/premium/verify", "POST", {
            attempt_id: button.dataset.premiumVerify,
          });
          await ctx.refreshSession();
          toast("Original payment checked");
          route(true);
        } catch (error) {
          toast(error.message, true);
        } finally {
          button.disabled = false;
        }
      }),
  );
}
export async function artistRoyaltiesPage(view, url, intro, ctx) {
  const { api, e, heading, notice, table, bindForm, date } = ctx,
    month =
      url.searchParams.get("month") || new Date().toISOString().slice(0, 7),
    mode = url.searchParams.get("mode") || "live",
    currency = url.searchParams.get("currency") || "USD",
    price = (value) => accountAmount(value, { currency }),
    x = await api(
      "/api/platform/artist-royalties?" +
        new URLSearchParams({ month, mode, currency }),
    );
  if (
    !view.set(
      intro +
        heading(
          "STREAMING ROYALTIES",
          "Your sound. Your share.",
          "50% of attributable net eligible Premium Listener revenue, for every artist package.",
        ) +
        `<form id="royalty-filter" class="row-actions"><label>Accounting month<input type="month" name="month" value="${e(month)}" required></label><label>Records<select name="mode" aria-label="Records"><option value="live" ${mode === "live" ? "selected" : ""}>Live</option><option value="test" ${mode === "test" ? "selected" : ""}>Sandbox · not cash</option></select></label><label>Accounting currency<select name="currency"><option value="USD" ${currency === "USD" ? "selected" : ""}>USD</option><option value="NGN" ${currency === "NGN" ? "selected" : ""}>Legacy NGN</option></select></label><button type="submit" class="button secondary">View period</button><p class="form-status" role="status"></p></form><div class="metrics">${[
          ["TOTAL PLAYS", x.counts.total_plays],
          ["QUALIFYING PREMIUM PLAYS", x.counts.qualifying_premium_plays],
          ["RECORDED FREE PLAYS", x.counts.free_plays],
          ["ESTIMATED THIS PERIOD", price(x.estimated_minor)],
          ["PREVIOUS MONTH FINALIZED", price(x.previous_month_finalized_minor)],
          [
            "LIFETIME FINALIZED LESS ADJUSTMENTS",
            price(x.lifetime_finalized_minor - x.lifetime_adjustments_minor),
          ],
          [
            "AVAILABLE VERIFIED " + currency + " BALANCE",
            price(x.available_minor),
          ],
        ]
          .map(
            ([label, value]) =>
              `<div class="metric"><span>${e(label)}</span><strong>${e(value)}</strong></div>`,
          )
          .join("")}</div>` +
        notice(x.notice, true) +
        (x.estimate_issues
          ? notice(
              "This estimate has unresolved payment or eligibility review issues.",
              true,
            )
          : "") +
        heading("SONG PERFORMANCE", "Every song, accounted for.") +
        table(x.songs, [
          ["track_id", "Song ID"],
          ["streams", "Eligible plays"],
          ["amount_minor", "Estimated royalty", price],
        ]) +
        heading("FINALIZED STATEMENTS", "A permanent record.") +
        table(x.finalized, [
          ["month", "Month"],
          ["mode", "Records"],
          ["streams", "Plays"],
          ["amount_minor", "Finalized liability", accountAmount],
        ]) +
        heading("ADJUSTMENTS", "Corrections stay visible.") +
        table(x.adjustments, [
          ["month", "Month"],
          ["mode", "Records"],
          ["amount_minor", "Adjustment", accountAmount],
          ["resolution", "Recovery status"],
        ]) +
        heading("WITHDRAWALS", "Reserved and completed requests.") +
        table(x.withdrawals, [
          ["id", "Request"],
          ["currency", "Currency"],
          ["gross_minor", "Gross minor units"],
          ["fee_minor", "Fee minor units"],
          ["net_minor", "Net minor units"],
          ["status", "Status"],
          ["created_at", "Date", date],
        ]),
    )
  )
    return;
  bindForm(document.getElementById("royalty-filter"), async (b) =>
    ctx.navigate("/workspace?tab=royalties&" + new URLSearchParams(b)),
  );
}
export async function adminRoyaltiesPage(view, intro, ctx) {
  const {
      api,
      e,
      heading,
      notice,
      table,
      bindForm,
      keyFor,
      clearKey,
      toast,
      date,
    } = ctx,
    x = await api("/api/platform/admin/royalties");
  const form = (id, fields, label) =>
    `<section class="panel"><h2>${label}</h2><form id="${id}">${fields}<button class="button secondary" type="submit">${label}</button><p class="form-status" role="status"></p></form></section>`;
  if (
    !view.set(
      intro +
        heading(
          "ROYALTY ACCOUNTING",
          "Review the month. Keep the evidence.",
          "USD base accounting, separate legacy books, immutable statements and no invented per-stream rate.",
        ) +
        notice(
          "Wait 48 hours after UTC month-end for offline synchronization. Finalize only after reviewing eligibility, offline reports, fraud exclusions, actual payment costs and the approved universal 50% policy. Finalized royalties are liabilities until verified cash settlement; sandbox amounts are never withdrawable.",
          true,
        ) +
        `<section class="panel"><h2>Monthly statement preview</h2><form id="royalty-preview"><label>Month<input name="month" type="month" required></label><label>Records<select name="mode" aria-label="Records"><option value="test">Sandbox</option><option value="live">Live</option></select></label><label>Accounting currency<select name="currency"><option value="USD">USD</option><option value="NGN">Legacy NGN</option></select></label><button type="submit" class="button">Calculate preview</button><p class="form-status" role="status"></p></form><div id="royalty-preview-output"></div></section>` +
        heading("OFFLINE SYNC", "Validated once. Reviewed with the period.") +
        table(x.offline || [], [["status","Validation result"],["events","Reported plays"],["latest_at","Latest sync",date]]) +
        heading("VERIFIED PAYMENTS", "Original receipt evidence.") +
        table(x.payments, [
          ["order_id", "Order"],
          ["provider", "Provider"],
          ["mode", "Records"],
          ["currency", "Currency"],
          ["amount_minor", "USD or legacy gross", accountAmount],
          ["charge_currency", "Original currency"],
          [
            "charge_minor",
            "Original charge",
            (value, row) =>
              value === null || value === undefined
                ? "Legacy receipt"
                : new Intl.NumberFormat(undefined, {
                    style: "currency",
                    currency: row.charge_currency,
                  }).format(
                    Number(value) /
                      10 **
                        new Intl.NumberFormat("en", {
                          style: "currency",
                          currency: row.charge_currency,
                        }).resolvedOptions().maximumFractionDigits,
                  ),
          ],
          ["exchange_rate", "Original rate / USD"],
          [
            "conversion_at",
            "Rate timestamp",
            (value) => (value ? dateTime(value) : "Legacy receipt"),
          ],
          [
            "refund_base_minor",
            "Refunded base",
            (value, row) => (value == null ? "—" : accountAmount(value, row)),
          ],
          ["fees_minor", "Actual fees", accountAmount],
          ["tax_minor", "Excluded taxes", accountAmount],
        ]) +
        `<div class="two-column">` +
        form(
          "premium-costs",
          '<label>Receipt order ID<input name="order_id" required></label><label>Existing cost revision<input name="revision" type="number" min="0" value="0" required></label><label>Cost currency<input name="cost_currency" value="USD" pattern="[A-Z]{3}" required></label><label>Actual provider fees · minor units<input name="fees_minor" type="number" min="0" required></label><label>Excluded taxes · minor units<input name="tax_minor" type="number" min="0" required></label><label>Statement/invoice evidence<textarea name="evidence" minlength="10" maxlength="1000" required></textarea></label>',
          "Record verified payment costs",
        ) +
        form(
          "premium-refund",
          '<label>Receipt order ID<input name="order_id" required></label><label>Provider refund ID<input name="refund_id" required></label>',
          "Verify full provider refund",
        ) +
        form(
          "premium-exclude",
          '<label>Stream ID<input name="stream_id" inputmode="numeric" required></label><label>Disqualification evidence<textarea name="reason" minlength="10" maxlength="1000" required></textarea></label>',
          "Exclude disqualified stream",
        ) +
        "</div>" +
        heading("FINALIZED MONTHS", "Protected accounting history.") +
        table(x.statements, [
          ["month", "Month"],
          ["mode", "Records"],
          ["gross_minor", "Recognized gross", accountAmount],
          ["net_minor", "Net eligible", accountAmount],
          ["artist_pool_minor", "Artist pool", accountAmount],
          ["platform_minor", "Platform", accountAmount],
          ["stream_count", "Eligible plays"],
          ["undistributed_minor", "Undistributed liability", accountAmount],
          ["released_minor", "Cash-backed release", accountAmount],
        ]) +
        heading("CALCULATION HISTORY", "Review and reconciliation events.") +
        table(x.calculations || [], [
          ["action", "Event"],
          ["resource", "Month or statement"],
          ["actor_id", "Operator"],
          ["created_at", "Date", date],
        ]) +
        heading("ELIGIBILITY REVIEW", "Recent qualifying signals.") +
        table(x.streams, [
          ["id", "Stream"],
          ["artist_id", "Artist"],
          ["track_id", "Song"],
          ["mode", "Records"],
          ["listened_ms", "Listened ms"],
          ["exclusion", "Exclusion"],
          ["occurred_at", "Date", date],
        ]),
    )
  )
    return;
  bindForm(document.getElementById("royalty-preview"), async (b) => {
    const preview = await api(
      "/api/platform/admin/royalties/preview",
      "POST",
      b,
    );
    const root = document.getElementById("royalty-preview-output");
    root.innerHTML =
      table(
        [preview],
        [
          ["gross_minor", "Recognized gross", accountAmount],
          ["refund_minor", "Refunds", accountAmount],
          ["tax_minor", "Excluded tax", accountAmount],
          ["fees_minor", "Actual fees", accountAmount],
          ["commissions_minor", "Earned referrals", accountAmount],
          ["rounding_minor", "Rounding reconciliation", accountAmount],
          ["net_minor", "Net eligible", accountAmount],
          ["artist_pool_minor", "50% artist pool", accountAmount],
          ["stream_count", "Qualifying plays"],
          ["undistributed_minor", "Undistributed liability", accountAmount],
        ],
      ) +
      notice(
        preview.stream_count
          ? "Variable royalty per eligible stream: " +
              new Intl.NumberFormat(undefined, {
                style: "currency",
                currency: preview.currency || "USD",
                minimumFractionDigits: 2,
                maximumFractionDigits: 8,
              }).format(preview.artist_pool_minor / 100 / preview.stream_count)
          : "No qualifying streams: keep the artist pool as an undistributed liability.",
      ) +
      preview.issues.map((message) => notice(message, true)).join("") +
      `<form><label>Eligibility, fraud and accounting review note<textarea name="review_note" minlength="10" maxlength="1000" required></textarea></label><button type="submit" class="button" ${preview.issues.length ? "disabled" : ""}>Finalize reviewed statement</button><p class="form-status" role="status"></p></form>`;
    bindForm(root.querySelector("form"), async (proof) => {
      const payload = { ...b, ...proof, snapshot_hash: preview.snapshot_hash };
      await api("/api/platform/admin/royalties/finalize", "POST", payload, {
        headers: { "Idempotency-Key": keyFor("royalty-finalize", payload) },
      });
      clearKey("royalty-finalize");
      toast(
        "Statement finalized as an unsettled liability. No cash was released.",
      );
      ctx.route(true);
    });
  });
  for (const [id, action] of [
    ["costs", "costs"],
    ["refund", "refund"],
    ["exclude", "exclude"],
  ]) {
    const node = document.getElementById("premium-" + id);
    if (node)
      bindForm(node, async (b) => {
        const payload = { ...b };
        if (id === "costs")
          for (const field of ["fees_minor", "tax_minor", "revision"])
            payload[field] = Number(payload[field]);
        await api("/api/platform/admin/royalties/" + action, "POST", payload, {
          headers: {
            "Idempotency-Key": keyFor("royalties:" + action, payload),
          },
        });
        clearKey("royalties:" + action);
        toast("Accounting evidence recorded");
        ctx.route(true);
      });
  }
}
