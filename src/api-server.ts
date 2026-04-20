import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { BrowserWindow, ipcMain } from 'electron';

export const API_PORT = 5050;

interface OwrapState {
  ollamaConnected: boolean;
  ollamaUrl: string;
  activeModel: string;
  temperature: number;
  activePromptFile: string;
  models: string[];
}

let cachedState: OwrapState = {
  ollamaConnected: false,
  ollamaUrl: 'http://localhost:11434',
  activeModel: 'wizardlm2:7b',
  temperature: 0.4,
  activePromptFile: 'life_assistant.txt',
  models: [],
};

const pendingRequests = new Map<string, {
  resolve: (response: string) => void;
  reject: (err: Error) => void;
}>();

function sendJson(res: http.ServerResponse, status: number, body: object): void {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(json),
  });
  res.end(json);
}

function getPromptFiles(appPath: string): string[] {
  const promptsDir = path.join(appPath, 'prompts');
  try {
    return fs.readdirSync(promptsDir)
      .filter((f: string) => f.endsWith('.txt'))
      .sort();
  } catch {
    return [];
  }
}

export function startApiServer(getWindow: () => BrowserWindow | null, appPath: string): http.Server {
  // Listen for state updates pushed from the renderer
  ipcMain.on('owrap-state-update', (_event: any, state: Partial<OwrapState>) => {
    cachedState = { ...cachedState, ...state };
  });

  // Listen for chat responses from the renderer
  ipcMain.on('api-chat-response', (_event: any, { id, response, error }: { id: string; response?: string; error?: string }) => {
    const pending = pendingRequests.get(id);
    if (!pending) return;
    pendingRequests.delete(id);
    if (error) {
      pending.reject(new Error(error));
    } else {
      pending.resolve(response || '');
    }
  });

  const server = http.createServer((req, res) => {
    // Restrict to localhost only — no external access
    const remote = (req.socket as any).remoteAddress || '';
    if (remote !== '127.0.0.1' && remote !== '::1' && remote !== '::ffff:127.0.0.1') {
      sendJson(res, 403, { error: 'Forbidden' });
      return;
    }

    const url = req.url || '/';
    const method = req.method || 'GET';

    // GET /api/status
    if (method === 'GET' && url === '/api/status') {
      sendJson(res, 200, {
        ollamaConnected: cachedState.ollamaConnected,
        ollamaUrl: cachedState.ollamaUrl,
        activeModel: cachedState.activeModel,
        temperature: cachedState.temperature,
        activePromptFile: cachedState.activePromptFile,
      });
      return;
    }

    // GET /api/models
    if (method === 'GET' && url === '/api/models') {
      sendJson(res, 200, { models: cachedState.models });
      return;
    }

    // GET /api/prompts
    if (method === 'GET' && url === '/api/prompts') {
      sendJson(res, 200, { prompts: getPromptFiles(appPath) });
      return;
    }

    // POST /api/chat
    if (method === 'POST' && url === '/api/chat') {
      let body = '';
      req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
      req.on('end', () => {
        let parsed: any;
        try {
          parsed = JSON.parse(body);
        } catch {
          sendJson(res, 400, { error: 'Invalid JSON body' });
          return;
        }

        const { message, model, temperature, systemPrompt, promptFile } = parsed;

        if (!message || typeof message !== 'string' || !message.trim()) {
          sendJson(res, 400, { error: '"message" field is required' });
          return;
        }

        if (temperature !== undefined && (typeof temperature !== 'number' || temperature < 0 || temperature > 1)) {
          sendJson(res, 400, { error: '"temperature" must be a number between 0.0 and 1.0' });
          return;
        }

        if (promptFile !== undefined && typeof promptFile === 'string') {
          const available = getPromptFiles(appPath);
          if (!available.includes(promptFile)) {
            sendJson(res, 400, { error: `"promptFile" not found: ${promptFile}` });
            return;
          }
        }

        if (!cachedState.ollamaConnected) {
          sendJson(res, 503, { error: 'Ollama is not connected' });
          return;
        }

        const win = getWindow();
        if (!win) {
          sendJson(res, 503, { error: 'App window not available' });
          return;
        }

        const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

        const timeoutHandle = setTimeout(() => {
          if (pendingRequests.has(id)) {
            pendingRequests.delete(id);
            sendJson(res, 504, { error: 'Request timed out' });
          }
        }, 120_000);

        new Promise<string>((resolve, reject) => {
          pendingRequests.set(id, { resolve, reject });
        })
          .then((response) => {
            clearTimeout(timeoutHandle);
            sendJson(res, 200, {
              response,
              model: model || cachedState.activeModel,
              temperature: temperature !== undefined ? temperature : cachedState.temperature,
            });
          })
          .catch((err: Error) => {
            clearTimeout(timeoutHandle);
            sendJson(res, 500, { error: err.message });
          });

        win.webContents.send('api-chat-request', {
          id,
          message: message.trim(),
          model: model || undefined,
          temperature: temperature !== undefined ? temperature : undefined,
          systemPrompt: systemPrompt || undefined,
          promptFile: promptFile || undefined,
        });
      });
      return;
    }

    sendJson(res, 404, { error: 'Not found' });
  });

  server.listen(API_PORT, '127.0.0.1', () => {
    console.log(`owrap API server listening on http://127.0.0.1:${API_PORT}`);
  });

  server.on('error', (err: Error) => {
    console.error('owrap API server error:', err.message);
  });

  return server;
}
