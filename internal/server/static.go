package server

import (
	"embed"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
)

//go:embed dist/*
var embeddedAssets embed.FS

// StaticFileSystem returns the HTTP file system for serving the Web Studio assets.
func StaticFileSystem() http.FileSystem {
	sub, err := fs.Sub(embeddedAssets, "dist")
	if err == nil {
		// Test if index.html is present in embedded assets
		if f, err := sub.Open("index.html"); err == nil {
			_ = f.Close()
			return http.FS(sub)
		}
	}

	// Fallback to local web/dist or dist directory during development
	candidates := []string{
		"web/dist",
		"dist",
		"../web/dist",
	}

	for _, dir := range candidates {
		if fi, err := os.Stat(filepath.Join(dir, "index.html")); err == nil && !fi.IsDir() {
			return http.Dir(dir)
		}
	}

	return nil
}
