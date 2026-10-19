import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

// `npm run dev`        → http://localhost:5173 (camera chạy được vì localhost được coi là an toàn)
// `npm run dev:phone`  → https://<IP-máy-tính>:5173 để mở từ điện thoại cùng Wi-Fi
//                         (trình duyệt điện thoại chỉ cho dùng camera trên HTTPS)
export default defineConfig(({ mode }) => ({
  plugins: mode === 'phone' ? [basicSsl()] : [],
  server: { port: 5173 },
}));
