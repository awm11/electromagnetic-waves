import { defineConfig } from "vite";
import { resolve } from "node:path";

// One site, three pages: the landing page, the radio waves app and the infrared app.
export default defineConfig({
  base: "/electromagnetic-waves/",
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        radio: resolve(__dirname, "radio-waves/index.html"),
        infrared: resolve(__dirname, "infrared/index.html"),
      },
    },
  },
});
