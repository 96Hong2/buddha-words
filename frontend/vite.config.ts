import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const appVersion = JSON.parse(readFileSync('./package.json', 'utf8')).version as string;

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(appVersion) },
  plugins: [react()],
  // spec/ 이 정본이다. 프론트가 복사본을 두지 않고 그 파일을 그대로 import 한다.
  resolve: {
    alias: { '@spec': fileURLToPath(new URL('../spec', import.meta.url)) },
  },
  // 포트가 밀리면 백엔드 CORS 허용 목록에서 벗어나 API 가 전부 막힌다.
  // 조용히 다른 포트로 가는 대신 즉시 실패하게 둔다.
  server: { port: 5173, strictPort: true },
  preview: { port: 5173, strictPort: true },
});
