import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import Module from "node:module";
import { dirname } from "node:path";

// Characterization test: pins current behavior only (LT-002).
// node:child_process is replaced in-process with a fake spawn; ffmpeg is never run.

type Behavior =
  | { kind: "ok"; output: Uint8Array }
  | { kind: "exit"; code: number | null; stderr: string }
  | { kind: "error"; message: string };
const state = {
  behavior: { kind: "ok", output: new Uint8Array([1, 2, 3]) } as Behavior,
  spawns: [] as Array<{ command: string; args: string[]; options: unknown; input: Uint8Array | null }>,
};

function fakeSpawn(command: string, args: string[], options: unknown) {
  const child = new EventEmitter() as EventEmitter & { stderr: EventEmitter };
  child.stderr = new EventEmitter();
  const inputPath = args[args.indexOf("-i") + 1];
  state.spawns.push({ command, args, options, input: existsSync(inputPath) ? readFileSync(inputPath) : null });
  const behavior = state.behavior;
  setImmediate(() => {
    if (behavior.kind === "ok") {
      writeFileSync(args[args.length - 1], behavior.output);
      child.emit("close", 0);
    } else if (behavior.kind === "exit") {
      if (behavior.stderr) child.stderr.emit("data", Buffer.from(behavior.stderr));
      child.emit("close", behavior.code);
    } else {
      child.emit("error", new Error(behavior.message));
    }
  });
  return child;
}

const moduleWithLoad = Module as unknown as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};
const originalLoad = moduleWithLoad._load;
moduleWithLoad._load = function (request, parent, isMain) {
  if (request === "node:child_process" || request === "child_process") return { spawn: fakeSpawn };
  return originalLoad.call(this, request, parent, isMain);
};

async function main() {
  const savedPath = process.env.FFMPEG_PATH;
  try {
    const mod = await import("../src/lib/recording/audioPlaybackNormalization");
    process.env.FFMPEG_PATH = "  /fake/ffmpeg  ";
    const source = new Uint8Array([9, 8, 7]);
    const run = (sourceFileName: string, sourceMimeType: string) =>
      mod.normalizeAudioForPlayback({ sourceBytes: source, sourceFileName, sourceMimeType });

    assert.equal(mod.PLAYBACK_AUDIO_EXTENSION, "m4a");
    assert.equal(mod.PLAYBACK_AUDIO_CONTENT_TYPE, "audio/mp4");

    // Success: fixed ffmpeg arguments, AAC m4a output, temp dir removed.
    const result = await run("voice.wav", "audio/wav");
    assert.deepEqual(result, { bytes: new Uint8Array([1, 2, 3]), extension: "m4a", contentType: "audio/mp4" });
    const first = state.spawns[0];
    assert.equal(first.command, "/fake/ffmpeg");
    assert.deepEqual(first.options, { windowsHide: true });
    assert.deepEqual(first.input, Buffer.from(source));
    const inputPath = first.args[5];
    const outputPath = first.args[first.args.length - 1];
    assert.match(inputPath, /libread-playback-[^/\\]+[/\\]input\.wav$/);
    assert.equal(outputPath, `${dirname(inputPath)}${inputPath.includes("\\") ? "\\" : "/"}playback.m4a`);
    assert.deepEqual(first.args, [
      "-y", "-hide_banner", "-loglevel", "error", "-i", inputPath, "-vn", "-map_metadata", "-1",
      "-ac", "1", "-ar", "44100", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", outputPath,
    ]);
    assert.equal(existsSync(dirname(inputPath)), false);

    // Input extension: file name first, then MIME type, else "bin".
    const cases: Array<[string, string, string]> = [
      ["a.MP3", "", "mp3"],
      ["noext", "audio/mpeg", "mp3"],
      ["noext", "audio/x-m4a", "m4a"],
      ["noext", " AUDIO/MP4 ", "m4a"],
      ["noext", "audio/x-wav", "wav"],
      ["noext", "audio/webm;codecs=opus", "webm"],
      ["noext", "audio/ogg", "ogg"],
      ["noext", "audio/aac", "aac"],
      ["noext", "audio/flac", "flac"],
      ["noext", "application/octet-stream", "bin"],
    ];
    for (const [name, mime, ext] of cases) {
      await run(name, mime);
      const args = state.spawns.at(-1)!.args;
      assert.ok(args[5].endsWith(`input.${ext}`), `${name} ${mime} -> ${args[5]}`);
    }

    // Failures: non-zero exit (stderr or code), spawn error, empty output. Temp dir is removed each time.
    state.behavior = { kind: "exit", code: 1, stderr: "  bad input \n" };
    await assert.rejects(run("a.wav", ""), /^Error: playback_transcode_failed:bad input$/);
    assert.equal(existsSync(dirname(state.spawns.at(-1)!.args[5])), false);
    state.behavior = { kind: "exit", code: 2, stderr: "" };
    await assert.rejects(run("a.wav", ""), /^Error: playback_transcode_failed:ffmpeg exited with code 2$/);
    state.behavior = { kind: "exit", code: null, stderr: "" };
    await assert.rejects(run("a.wav", ""), /^Error: playback_transcode_failed:ffmpeg exited with code unknown$/);
    state.behavior = { kind: "error", message: "ENOENT" };
    await assert.rejects(run("a.wav", ""), /^Error: playback_transcode_failed:ENOENT$/);
    state.behavior = { kind: "error", message: "" };
    await assert.rejects(run("a.wav", ""), /^Error: playback_transcode_failed:ffmpeg spawn error$/);
    state.behavior = { kind: "ok", output: new Uint8Array() };
    await assert.rejects(run("a.wav", ""), /^Error: playback_transcode_failed:normalized output is empty$/);
    assert.equal(existsSync(dirname(state.spawns.at(-1)!.args[5])), false);

    console.log("audioPlaybackNormalization characterization: PASS");
  } finally {
    moduleWithLoad._load = originalLoad;
    if (savedPath === undefined) delete process.env.FFMPEG_PATH;
    else process.env.FFMPEG_PATH = savedPath;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
