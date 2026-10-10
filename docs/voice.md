# Voice

Hold to talk and the interview use a speech engine. The default spends nothing.

## Default

When the browser exposes `SpeechRecognition` or `webkitSpeechRecognition`, the desk uses that. Chrome and Edge do. The label reads `Voice: browser (free)`.

Browser speech recognition is free to you, and the browser vendor processes it. For example, Google does this in Chrome and Microsoft does this in Edge, so audio may leave this device.

The same sentence is in the voice help under the hold control, and on Settings.

## Local whisper

If this browser has no speech recognition, and whisper.cpp is already installed, the label reads `Voice: local whisper`. The app looks for `WHISPER_CPP_BIN` and `WHISPER_CPP_MODEL`, or for `whisper-cli` or `main` on `PATH`. It does not download or install the binary or the weights.

The desk does not send the microphone to that binary. Type the answer. A caller with a wav can run the local transcriber. That path does not call the network.

## xAI, opt in only

xAI speech-to-text stays off until Settings names xAI and the rate-accept gate matches the current rate card. Both have to be true. Either one missing falls back to browser speech, then local whisper, then typed input.

The label then reads `Voice: xAI (paid, accepted)`. The desk still does not post microphone audio to the paid host. A caller that does post must pass the guard first.

The guard throws before any paid request unless the setting is on and the rate is accepted. The implemented paid path is `POST https://api.x.ai/v1/stt`. Docs also name `wss://api.x.ai/v1/stt`. This client does not open that socket.

Other known speech hosts are treated as paid too, including OpenAI, Groq, Deepgram, AssemblyAI, Google Cloud Speech, Azure Cognitive Services, Amazon Transcribe, Rev, Speechmatics, and ElevenLabs. Default mode does not call them.

## No speech in this browser

The label reads `Voice: unavailable`. The page says: Voice input needs Chrome or Edge on this computer. Type your answer instead. The draft still accepts typing.

## Older notes

Some older notes say local whisper.cpp is the default speech engine. Matt's cost rule still holds: the default must not spend API credit, and Grok voice stays behind an accepted rate. The desk order on this page is the one the selector uses. Browser speech first, because it is free to the user. Local whisper only when the browser cannot listen and the binary is already installed. xAI only when the setting and the accepted rate are both on.
