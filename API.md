# owrap API

owrap exposes a local REST API that mirrors the functionality available in the UI. The server starts automatically with the app and is bound to `localhost` only — it is not reachable from the network.

**Base URL**: `http://localhost:5050`

All requests and responses use JSON (`Content-Type: application/json`).

Every message sent via the API is displayed in the **API Session** chat inside the owrap tab, clearly marked with an `[API]` badge, so the user always sees what is happening.

---

## Endpoints

### `GET /api/status`

Returns the current Ollama connection status and active configuration of the current session.

**Response**
```json
{
  "ollamaConnected": true,
  "ollamaUrl": "http://localhost:11434",
  "activeModel": "llama3.2",
  "temperature": 0.7,
  "activePromptFile": "life_assistant.txt"
}
```

---

### `GET /api/models`

Returns the list of Ollama models available on the connected Ollama instance.

**Response**
```json
{
  "models": ["llama3.2", "mistral", "phi3"]
}
```

---

### `GET /api/prompts`

Returns the list of available built-in system prompt files bundled with the app (from the `prompts/` directory).

**Response**
```json
{
  "prompts": [
    "apps_developer.txt",
    "cloud_engineer.txt",
    "japanese_teacher.txt",
    "life_assistant.txt",
    "local_network_recon.txt",
    "prompt_engineer.txt",
    "salesforce_consultant.txt",
    "shell_command_assistant.txt",
    "web_recon.txt"
  ]
}
```

---

### `POST /api/chat`

Sends a message through owrap to Ollama. Uses the app's active model, temperature, and system prompt by default. All fields except `message` are optional overrides.

**Request body**
```json
{
  "message": "What is the capital of Japan?",
  "model": "mistral",
  "temperature": 0.5,
  "systemPrompt": "You are a geography expert.",
  "promptFile": "cloud_engineer.txt"
}
```

| Field          | Type   | Required | Description                                                                                      |
|----------------|--------|----------|--------------------------------------------------------------------------------------------------|
| `message`      | string | yes      | The user message to send to the model                                                            |
| `model`        | string | no       | Override the active model for this request                                                       |
| `temperature`  | number | no       | Override temperature (0.0–1.0) for this request                                                 |
| `systemPrompt` | string | no       | Inline system prompt override for this request                                                   |
| `promptFile`   | string | no       | Name of a built-in prompt file to use (e.g. `cloud_engineer.txt`). Ignored if `systemPrompt` is set |

**Response**
```json
{
  "response": "The capital of Japan is Tokyo.",
  "model": "mistral",
  "temperature": 0.5
}
```

**Error response**
```json
{
  "error": "Ollama is not connected"
}
```

---

## Notes

- The API server only binds to `127.0.0.1` — no external access.
- If Ollama is not running, `/api/chat` returns HTTP `503` with an error message.
- Per-request overrides (`model`, `temperature`, `systemPrompt`) apply only to that request and do not change the UI state.
- All API conversations are stored in the persistent **API Session** in `~/Downloads/scoutai/`.
