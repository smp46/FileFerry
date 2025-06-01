import tailwindcss from "@tailwindcss/vite";

export default {
  build: {
    target: "es2022",
  },
  optimizeDeps: {
    esbuildOptions: { target: "es2022", supported: { bigint: true } },
  },
  server: {
    open: true,
  },
  plugins: [tailwindcss()],
  define: {
    global: "globalThis",
  },
};
