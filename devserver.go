//go:build ignore
// +build ignore

package main

import (
	"log"
	"net/http"
	"os"
	"os/exec"

	"github.com/vugu/vugu/devutil"
)

func main() {
	l := "127.0.0.1:8844"
	log.Printf("Starting HTTP Server at %q", l)

	go runTailwindWatcher()

	wc := devutil.NewWasmCompiler().SetDir(".")
	mux := devutil.NewMux()

	mux.Match(devutil.NoFileExt, devutil.DefaultAutoReloadIndex.Replace(
		`<!-- styles -->`,
		`<link rel="stylesheet" href="/assets/css/output.css">`))

	mux.Exact("/main.wasm", devutil.NewMainWasmHandler(wc))
	mux.Exact("/wasm_exec.js", devutil.NewWasmExecJSHandler(wc))

	mux.Exact("/assets/css/output.css", devutil.StaticFilePath("./assets/css/output.css"))

	mux.Default(devutil.NewFileServer().SetDir("."))

	log.Fatal(http.ListenAndServe(l, mux))
}

func runTailwindWatcher() {
	cmd := exec.Command("tailwind",
		"-i", "./assets/css/input.css",
		"-o", "./assets/css/output.css",
		"--content", "./*.vugu",
		"--watch",
		"-v")

	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	log.Println("Starting Tailwind CSS watcher...")
	if err := cmd.Start(); err != nil {
		log.Printf("Error starting Tailwind CSS: %v", err)
		return
	}

	// Wait for the process to finish
	if err := cmd.Wait(); err != nil {
		log.Printf("Tailwind CSS process ended with error: %v", err)
	}
}
