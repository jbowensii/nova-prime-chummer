// Deliberately empty (CommonJS: a sandboxed preload can't be ESM). The window needs nothing from Node, and the per-launch
// secret is added to its requests by the main process (webRequest.onBeforeSendHeaders), so no script here or in the page can read it.
