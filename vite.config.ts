import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv } from 'vite';

// Fix: Define __dirname for ES module scope.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
    // We no longer need to load env here for the API key,
    // but we'll keep the structure for potential future use.
    // const env = loadEnv(mode, '.', ''); 
    return {
      define: {
        // IMPORTANT: The GEMINI_API_KEY is no longer exposed to the frontend.
        // All AI calls are proxied through the backend, which now handles key management.
        // 'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY), // REMOVED
        // 'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY) // REMOVED
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      build: {
        rollupOptions: {
          // Externalize dependencies that are provided by the browser via import maps.
          // This prevents Vite from trying to bundle them, fixing build errors.
          external: ['@google/genai', 'marked']
        }
      }
    };
});
