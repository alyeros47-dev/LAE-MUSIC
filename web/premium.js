const dateTime = (value) =>
  new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "long",
  });
const ngn = (value) =>
  new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "NGN",
  }).format(Number(value || 0) / 100);
export class PremiumListeningTracker {
  constructor({ api, audio, listener }) {
    this.api = api;
    this.audio = audio;
    this.listener = listener;
    this.generation = 0;
    document.addEventListener("trackchange", (event) => {
      this.track = event.detail.id;
      this.begin();
    });
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
    if (!this.track || !this.listener()) return;
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
    date,
    currencyDisplay,
  } = ctx;
  const plans = await api(
      "/api/platform/premium/plans?currency=" +
        encodeURIComponent(currencyDisplay.currency),
    ),
    data = session.listener ? await api("/api/platform/premium/status") : null;
  const selectedProvider = plans.providers[0];
  if (
    !view.set(
      heading(
        "PREMIUM LISTENING",
        "A little more music. A direct connection.",
        "Affordable listening that supports the artists behind your soundtrack.",
        buttonLink("/discover", "Keep listening for free", true),
      ) +
        notice(
          "Public streaming, playlists and favorites remain available. Premium does not grant commercial or public-performance rights.",
        ) +
        `<section class="panel premium-status"><span class="eyebrow">${data?.active ? "PREMIUM ACTIVE" : "YOUR LISTENING CHOICE"}</span><h2>${data?.active ? "Welcome to Premium." : "Your music stays yours."}</h2><p>${data?.active ? "Activated " + dateTime(data.current.starts_at) + " · Expires " + dateTime(data.current.expires_at) : "Choose a fixed-term pass. A new pass starts after verified payment; renewals preserve your remaining cover."}</p><p>Ad-free playback without advertising interruptions · Premium badge · detailed Premium listening insights · qualifying listening supports artist royalty accounting.</p>${data ? `<span class="badge">${e(data.activity.premium_streams)} qualifying Premium plays this month</span>` : buttonLink("/join?role=listener&return=premium" + (url.searchParams.get("ref") ? "&ref=" + encodeURIComponent(url.searchParams.get("ref")) : ""), "Create a free listener account", true)}</section><div class="price-grid premium-prices">${plans.plans.map((p) => `<article class="price-card ${p.code === "monthly" ? "featured" : ""}"><span class="eyebrow">${e(p.days)} ${p.days === 1 ? "DAY" : "DAYS"}</span><h3>${e(p.name)}</h3><div class="price">${ngn(p.amount_minor)}</div>${p.estimated_minor !== undefined ? `<p>Approx. ${e(new Intl.NumberFormat(undefined, { style: "currency", currency: plans.display_currency }).format(p.estimated_minor / 10 ** new Intl.NumberFormat("en", { style: "currency", currency: plans.display_currency }).resolvedOptions().maximumFractionDigits))}</p>` : ""}<p>${p.code === "daily" ? "For your birthday, gathering or a day with your favorite sounds." : "A fixed term, with clear start and end dates."}</p><button class="button secondary" data-premium-plan="${e(p.code)}">Review ${e(p.name)}</button></article>`).join("")}</div>${notice("Introductory Nigerian prices are charged in NGN. Other currency displays are estimates, never permanent USD prices. Automatic renewal is off. No saved-card charge is authorized.")}${!plans.providers.length ? notice("Payment checkout is unavailable until the merchant’s sandbox account and credentials are reviewed. Unpaid records do not activate Premium.", true) : notice("Sandbox checkout only. Test payments never create withdrawable artist earnings.", true)}${data ? `<div class="section-heading"><h2>Your subscriptions and purchase records</h2></div><section class="panel">${data.orders.length ? data.orders.map((o) => `<article class="purchase-card"><span class="eyebrow">${o.verified_at ? "VERIFIED · " + e(o.mode) : "UNPAID"}</span><h3>${e(o.plan)} · ${ngn(o.amount_minor)}</h3><p>Reference ${e(o.reference || o.id)}</p>${o.attempt_id ? `<button class="button secondary" data-premium-verify="${e(o.attempt_id)}">Check original payment</button>` : selectedProvider ? `<button class="button secondary" data-premium-checkout="${e(o.id)}">Open sandbox checkout</button>` : ""}${o.checkout_url ? `<a class="button secondary" href="${e(o.checkout_url)}" target="_blank" rel="noopener noreferrer">Open provider checkout ↗</a>` : ""}</article>`).join("") : "<p>No purchase records yet.</p>"}</section><section class="panel"><h2>Your entitlement history</h2>${data.entitlements.map((t) => `<p>${e(t.plan)} · ${dateTime(t.starts_at)} → ${dateTime(t.expires_at)} · ${t.reversed ? "Reversed" : t.held ? "Under payment review" : new Date(t.expires_at) < new Date() ? "Expired" : "Paid cover"} · ${e(t.mode)}</p>`).join("") || "<p>No verified subscriptions yet.</p>"}</section>` : ""}`,
    )
  )
    return;
  document.querySelectorAll("[data-premium-plan]").forEach((button) => {
    button.onclick = () => {
      if (!session.listener) {
        ctx.navigate(
          "/join?role=listener&return=premium" +
            (url.searchParams.get("ref")
              ? "&ref=" + encodeURIComponent(url.searchParams.get("ref"))
              : ""),
        );
        return;
      }
      const plan = plans.plans.find(
        (p) => p.code === button.dataset.premiumPlan,
      );
      ctx.actionDialog(
        `<h2>Review ${e(plan.name)}.</h2><p>${ngn(plan.amount_minor)} · ${e(plan.days * 24)} hours · manual renewal only.</p><form><label>Affiliate ID, if referred<input name="referrer_id" inputmode="numeric" value="${e(url.searchParams.get("ref") || "")}"></label><p>No registration reward. Eligible subscription referrals use 10% direct and up to 5% indirect.</p><button class="button" type="submit">Save unpaid Premium record</button><p class="form-status" role="status"></p></form>`,
        (root) =>
          bindForm(root.querySelector("form"), async (b) => {
            const payload = {
              plan: plan.code,
              referrer_id: b.referrer_id || null,
            };
            await api("/api/platform/premium/orders", "POST", payload, {
              headers: { "Idempotency-Key": keyFor("premium-order", payload) },
            });
            clearKey("premium-order");
            document.getElementById("action-dialog").close();
            toast(
              "Purchase prepared. Premium starts only after verified payment.",
            );
            route(true);
          }),
      );
    };
  });
  document.querySelectorAll("[data-premium-checkout]").forEach((button) => {
    button.onclick = () =>
      ctx.actionDialog(
        '<h2>Choose your sandbox provider.</h2><form><label>Provider<select name="provider" aria-label="Provider">' +
          plans.providers.map((p) => "<option>" + e(p) + "</option>").join("") +
          '</select></label><p>NGN charge. Keep the original reference if the provider response is uncertain. No automatic renewal.</p><button class="button" type="submit">Create sandbox reference</button><p class="form-status" role="status"></p></form>',
        (root) =>
          bindForm(root.querySelector("form"), async (b) => {
            const payload = {
              order_id: button.dataset.premiumCheckout,
              provider: b.provider,
            };
            await api("/api/platform/premium/checkout", "POST", payload, {
              headers: {
                "Idempotency-Key": keyFor(
                  "premium-checkout:" + payload.order_id,
                  payload,
                ),
              },
            });
            document.getElementById("action-dialog").close();
            route(true);
          }),
      );
  });
  document.querySelectorAll("[data-premium-verify]").forEach((button) => {
    button.onclick = async () => {
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
    };
  });
}
export async function artistRoyaltiesPage(view, url, intro, ctx) {
  const { api, e, heading, notice, table, bindForm, date } = ctx,
    month =
      url.searchParams.get("month") || new Date().toISOString().slice(0, 7),
    mode = url.searchParams.get("mode") || "live",
    x = await api(
      "/api/platform/artist-royalties?" + new URLSearchParams({ month, mode }),
    );
  if (
    !view.set(
      intro +
        heading(
          "STREAMING ROYALTIES",
          "Your sound. Your share.",
          "50% of attributable net eligible Premium Listener revenue, for every artist package.",
        ) +
        `<form id="royalty-filter" class="row-actions"><label>Accounting month<input type="month" name="month" value="${e(month)}" required></label><label>Records<select name="mode" aria-label="Records"><option value="live" ${mode === "live" ? "selected" : ""}>Live</option><option value="test" ${mode === "test" ? "selected" : ""}>Sandbox · not cash</option></select></label><button type="submit" class="button secondary">View period</button><p class="form-status" role="status"></p></form><div class="metrics">${[
          ["TOTAL PLAYS", x.counts.total_plays],
          ["QUALIFYING PREMIUM PLAYS", x.counts.qualifying_premium_plays],
          ["RECORDED FREE PLAYS", x.counts.free_plays],
          ["ESTIMATED THIS PERIOD", ngn(x.estimated_minor)],
          ["PREVIOUS MONTH FINALIZED", ngn(x.previous_month_finalized_minor)],
          [
            "LIFETIME FINALIZED LESS ADJUSTMENTS",
            ngn(x.lifetime_finalized_minor - x.lifetime_adjustments_minor),
          ],
          ["AVAILABLE VERIFIED NGN BALANCE", ngn(x.available_minor)],
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
          ["amount_minor", "Estimated royalty", ngn],
        ]) +
        heading("FINALIZED STATEMENTS", "A permanent record.") +
        table(x.finalized, [
          ["month", "Month"],
          ["mode", "Records"],
          ["streams", "Plays"],
          ["amount_minor", "Finalized liability", ngn],
        ]) +
        heading("ADJUSTMENTS", "Corrections stay visible.") +
        table(x.adjustments, [
          ["month", "Month"],
          ["mode", "Records"],
          ["amount_minor", "Adjustment", ngn],
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
          "Separate NGN books, immutable statements and no invented per-stream rate.",
        ) +
        notice(
          "Finalize only after reviewing eligibility, fraud exclusions, actual payment costs and the approved universal 50% policy. Finalized royalties are liabilities until verified cash settlement; sandbox amounts are never withdrawable.",
          true,
        ) +
        `<section class="panel"><h2>Monthly statement preview</h2><form id="royalty-preview"><label>Month<input name="month" type="month" required></label><label>Records<select name="mode" aria-label="Records"><option value="test">Sandbox</option><option value="live">Live</option></select></label><button type="submit" class="button">Calculate preview</button><p class="form-status" role="status"></p></form><div id="royalty-preview-output"></div></section>` +
        heading("VERIFIED PAYMENTS", "Original receipt evidence.") +
        table(x.payments, [
          ["order_id", "Order"],
          ["provider", "Provider"],
          ["mode", "Records"],
          ["currency", "Currency"],
          ["amount_minor", "Gross", ngn],
          ["fees_minor", "Actual fees", ngn],
          ["tax_minor", "Excluded taxes", ngn],
        ]) +
        `<div class="two-column">` +
        form(
          "premium-costs",
          '<label>Receipt order ID<input name="order_id" required></label><label>Existing cost revision<input name="revision" type="number" min="0" value="0" required></label><label>Actual provider fees · kobo<input name="fees_minor" type="number" min="0" required></label><label>Excluded taxes · kobo<input name="tax_minor" type="number" min="0" required></label><label>Statement/invoice evidence<textarea name="evidence" minlength="10" maxlength="1000" required></textarea></label>',
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
          ["gross_minor", "Recognized gross", ngn],
          ["net_minor", "Net eligible", ngn],
          ["artist_pool_minor", "Artist pool", ngn],
          ["platform_minor", "Platform", ngn],
          ["stream_count", "Eligible plays"],
          ["undistributed_minor", "Undistributed liability", ngn],
          ["released_minor", "Cash-backed release", ngn],
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
          ["gross_minor", "Recognized gross", ngn],
          ["refund_minor", "Refunds", ngn],
          ["tax_minor", "Excluded tax", ngn],
          ["fees_minor", "Actual fees", ngn],
          ["commissions_minor", "Earned referrals", ngn],
          ["rounding_minor", "Rounding reconciliation", ngn],
          ["net_minor", "Net eligible", ngn],
          ["artist_pool_minor", "50% artist pool", ngn],
          ["stream_count", "Qualifying plays"],
          ["undistributed_minor", "Undistributed liability", ngn],
        ],
      ) +
      notice(
        preview.stream_count
          ? "Variable royalty per eligible stream: " +
              new Intl.NumberFormat(undefined, {
                style: "currency",
                currency: "NGN",
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
