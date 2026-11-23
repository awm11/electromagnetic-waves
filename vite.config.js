import { defineConfig } from "vite";
import { resolve } from "node:path";

// One site, four pages: the landing page, the radio waves app, the infrared app and the black body app.
export default defineConfig({
  base: "/electromagnetic-waves/",
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        radio: resolve(__dirname, "radio-waves/index.html"),
        infrared: resolve(__dirname, "infrared/index.html"),
        blackbody: resolve(__dirname, "black-body/index.html"),
      },
    },
  },
});
