# @hitchhiker/voice

Local speech-to-text for the Guide. This package spawns [whisper.cpp](https://github.com/ggml-org/whisper.cpp) when you have installed it. The binary is not bundled. Model weights are not in git.

The upstream project is MIT, copyright 2023-2026 The ggml authors. This repo does not vendor that source tree.

## Cost

The local path costs $0, and no audio leaves the machine. This package does not call a paid speech API, and a failed local run does not fall over to one.

## You download the model

This package does not pick a weight file and does not download one. Install a `whisper-cli` or `main` build for your operating system, and download a GGML model yourself from an official Whisper model card. Upstream documents several sizes. `base.en` and `small` are common choices. This package does not select one.

Homebrew, apt, and winget are not required. Point the variables below at the files you already have.

### Windows, macOS, and Linux

Set two environment variables:

- `WHISPER_CPP_BIN`: absolute path to the executable. When it is unset, the package scans `PATH` for `whisper-cli`, then `main`. On Windows it also looks for `whisper-cli.exe` and `main.exe`.
- `WHISPER_CPP_MODEL`: path to the model file, outside this repo's `packages/` directory. A model path inside `packages/` is refused, so a weight cannot be committed and then used from the package tree. An absolute path outside the repo is accepted.

`transcribe` checks that the binary, the model, and the wav are real files, then spawns the binary with `shell: false`. The arguments are an array, never a shell string:

`whisper-cli -m <model> -f <wav> -nt --no-timestamps`

A path with spaces or shell metacharacters stays a single argv entry. Only a local `.wav` file is accepted. `http:` and `https:` URLs are refused. An empty wav is refused before the process starts.

Upstream also offers `--output-txt` (`-otxt`) as an optional flag that writes a sidecar text file. This wrapper does not pass it. The transcript is trimmed stdout.

The child is killed if it runs longer than 60 seconds (`timeoutMs` can override that). A missing binary, a missing model, bad audio, a non-zero exit, empty stdout, or a timeout throws `WhisperError`. The `code` is `MISSING_BIN`, `MISSING_MODEL`, `BAD_AUDIO`, `FAILED`, or `TIMEOUT`. Stderr in a failure is trimmed to 500 characters. The environment is not copied into the error.

Guide config `voiceEngine` value `local` is the only engine this package calls.
