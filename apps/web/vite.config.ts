import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(({ mode }) => { const env = loadEnv(mode, '../..', ''); return { plugins: [react()], envDir: '../..', server: { proxy: { '/api': { target: env.LOCAL_API_URL || 'http://127.0.0.1:8000', rewrite: path => path.replace(/^\/api/, '') } } } }; });
