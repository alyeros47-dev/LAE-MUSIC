"use strict";
const fs = require("node:fs"),
  assert = require("node:assert/strict"),
  crypto = require("node:crypto"),
  cp = require("node:child_process");
const dna = require("../lib/music-dna"),
  raw = require("../config/music-dna.json");
const {
  lyricFlow,
  adapters,
  sonicFlow,
} = require("../tests/music-dna-audit-support.cjs");
const hash = (s) => crypto.createHash("sha256").update(s).digest("hex");
(async () => {
  const c = dna.catalogue(),
    ui = await adapters(),
    expected = [
      ["gospel", "G", 14],
      ["secular-afrobeats", "S", 14],
      ["reggae-caribbean", "R", 7],
      ["western-international", "W", 8],
    ],
    rows = [],
    inventory = [];
  assert.equal(c.departments.length, 4);
  assert.equal(c.categories.length, 43);
  assert.equal(c.styles.length, 215);
  assert.equal(new Set(c.styles.map((s) => s.id)).size, 215);
  for (const [department, prefix, n] of expected) {
    const cats = c.categories.filter((x) => x.department_id === department);
    assert.deepEqual(
      cats.map((x) => x.group_id),
      Array.from({ length: n }, (_, i) => prefix + (i + 1)),
    );
    for (const cat of cats)
      assert.deepEqual(
        c.styles.filter((s) => s.category_id === cat.id).map((s) => s.id),
        Array.from(
          { length: 5 },
          (_, i) => cat.group_id + "-" + String(i + 1).padStart(2, "0"),
        ),
      );
    inventory.push({
      department,
      groups: cats.length,
      styles: c.styles.filter((s) => s.department_id === department).length,
    });
  }
  for (const style of raw.styles) {
    try {
      assert(style.description?.trim());
      const f = await lyricFlow(style.id),
        instructions = f.request.input[0].content,
        usr = JSON.parse(f.request.input[1].content);
      assert.equal(f.result.status, 200);
      assert.equal(f.result.data.music_dna.style_id, style.id);
      assert.deepEqual(f.counts, {
        reserve: 1,
        complete: 1,
        refund: 0,
        post: 1,
      });
      for (const v of [
        style.rhythm,
        style.drums_percussion,
        style.bass,
        style.instruments.keys,
        style.instruments.guitar,
        style.instruments.other,
        style.melody_harmony,
        style.arrangement,
        style.lyrics.structure,
        style.lyrics.vocabulary,
        style.production_mix,
        style.mood,
        style.energy,
      ])
        assert(instructions.includes(v));
      assert.equal(usr.idea, f.payload.idea);
      assert(!Object.hasOwn(usr, "mood"));
      assert(!Object.hasOwn(usr, "beat"));
      for (const ref of raw.styles.flatMap(
        (s) => s.research_references || [],
      )) {
        assert(!JSON.stringify(c).includes(ref));
        assert(!instructions.includes(ref));
        assert(!JSON.stringify(usr).includes(ref));
      }
      const contexts = [];
      for (const voice of ["neutral", "male", "female", "duet", "custom"])
        for (const languages of [
          [],
          ["en"],
          ["pcm"],
          ["yo"],
          ["ig"],
          ["ha"],
          ["fr"],
          ["en", "fr"],
          ["en", "pcm", "ig"],
        ]) {
          const x = dna.prepare(
            { ...f.payload, voice, musicDnaLanguages: languages },
            { artistId: 7, requestKey: "qa-dna-final-audit-request-0001" },
          );
          assert.deepEqual(x.profile, f.context.profile);
          assert.deepEqual(x.choices, f.context.choices);
          assert.equal(x.voice, voice);
          assert.deepEqual(x.languages, languages);
          contexts.push(x);
        }
      const next = dna.prepare(f.payload, {
        artistId: 7,
        requestKey: "qa-dna-final-audit-request-0002",
      });
      assert.notEqual(next.variation_id, f.context.variation_id);
      assert.equal(
        dna.prepare(f.payload, {
          artistId: 7,
          requestKey: "qa-dna-final-audit-request-0001",
        }).variation_id,
        f.context.variation_id,
      );
      const out = f.result.data,
        song = ui.musicRequest(
          { ...out, duration: "3 minutes", useVoice: false },
          { hasVoice: false },
        );
      assert.equal(song.style, out.style);
      assert(song.style.length <= 950);
      assert.equal(song.lyrics, out.lyrics);
      assert.equal(song.useVoice, false);
      const ref = style.research_references?.[0];
      if (ref)
        assert.throws(() =>
          dna.validateOutput(
            { ...f.response, lyrics: f.response.lyrics + " " + ref },
            f.context,
          ),
        );
      assert.throws(() =>
        dna.validateOutput(
          { ...f.response, style: "x".repeat(951) },
          f.context,
        ),
      );
      rows.push({
        id: style.id,
        name: style.name,
        department: style.department_id,
        category: style.category_id,
        status: "passed",
        voice_language_combinations: contexts.length,
        handler_reservations: f.counts.reserve,
        prompt_length: song.style.length,
        prompt_sha256: hash(song.style),
        instruction_sha256: hash(instructions),
      });
    } catch (e) {
      rows.push({ id: style.id, status: "failed", error: e.message });
      throw e;
    }
  }
  const representatives = [];
  for (const [id, voice, languages] of [
    ["G2-04", "female", ["en", "ha"]],
    ["S6-01", "male", ["en", "pcm"]],
    ["R7-05", "duet", ["en", "yo"]],
    ["W8-05", "custom", ["en", "fr"]],
  ]) {
    const f = await lyricFlow(id, { voice, languages }),
      song = ui.musicRequest(
        {
          ...f.result.data,
          duration: "3 minutes",
          useVoice: voice === "custom",
        },
        { hasVoice: true, status: "ready" },
      ),
      r = await sonicFlow(song);
    assert.equal(r.status, 200);
    assert.equal(r.network, 1);
    assert.equal(r.sent.tags, song.style);
    assert.equal(r.sent.prompt, song.lyrics);
    assert.equal(
      r.sent.task_type,
      voice === "custom" ? "persona_music" : "create_music",
    );
    if (voice === "custom")
      assert.equal(r.sent.persona_id, "owned-audit-persona");
    representatives.push({
      id,
      voice,
      languages,
      status: "passed",
      mocked_music_provider_calls: r.network,
      prompt_length: r.sent.tags.length,
    });
  }
  for (const id of ["missing-style", "gospel-g1"])
    assert.throws(() =>
      dna.prepare(
        { musicDnaStyle: id },
        { artistId: 7, requestKey: "qa-dna-final-audit-request-0001" },
      ),
    );
  const report = {
    schema_version: 1,
    scope:
      "Music DNA configuration, actual mocked lyrics/music handlers and prompt handoff; no paid calls",
    audited_commit: cp
      .execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" })
      .trim(),
    working_tree_changed: !!cp
      .execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" })
      .trim(),
    revision: c.revision,
    inventory,
    group_count: 43,
    style_count: rows.length,
    missing_ids: [],
    duplicate_ids: [],
    broken_mappings: [],
    styles: rows,
    representative_workflows: representatives,
    paid_provider_calls: 0,
    production_mutations: 0,
    automated_checks: "passed",
    deployment_readiness: "VERIFICATION INCOMPLETE",
    limitations: [
      "W7 upload is truncated; final short interface copy unavailable. Descriptions reuse approved musical-identity paragraphs.",
      "Real provider output, lyric coherence, audible originality, voice behavior and linguistic fidelity are not certified by synthetic replies.",
      "No live database connection/migration or Render environment verification was performed.",
      "Supported language codes: en, pcm, yo, ig, ha, fr. Custom supplied words are retained but unsupported language codes are rejected.",
      "Backing harmonies are profile/settings guidance; no separate provider harmony capability is claimed.",
    ],
  };
  fs.mkdirSync("artifacts", { recursive: true });
  fs.writeFileSync(
    "artifacts/music-dna-integration-audit.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      groups: 43,
      styles: rows.length,
      voice_language_cases: rows.reduce(
        (n, r) => n + r.voice_language_combinations,
        0,
      ),
      representative_workflows: representatives.length,
      status: "passed",
      report: "artifacts/music-dna-integration-audit.json",
      paid_provider_calls: 0,
    }),
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
