import { contextBridge, ipcRenderer, webFrame, webUtils } from 'electron'

// Which translucency the OS can back. Asked synchronously because the renderer
// needs it before its first paint, and answered by main because deciding it
// needs `os.release()` — a sandboxed preload may only require electron, events,
// timers and url, so importing node:os here throws before contextBridge runs
// and takes the ENTIRE bridge down with it (window.lioraDesktop undefined =>
// "Desktop IPC bridge is unavailable"). No reply means no glass, which degrades
// to an ordinary opaque window rather than a page thinned over nothing.
const translucencySupport = ipcRenderer.sendSync('liora:translucency:support')
const hudWindowing = ipcRenderer.sendSync('liora:hud:windowing')
const hudNativeDrag = hudWindowing?.nativeDrag === true

contextBridge.exposeInMainWorld('lioraDesktop', {
  glassSupported: translucencySupport?.glass === true,
  translucencySupported: translucencySupport?.translucency === true,
  getConnection: profile => ipcRenderer.invoke('liora:connection', profile),
  // Registry-scoped backend resolution: { connectionId, profile } → descriptor.
  getConnectionFor: payload => ipcRenderer.invoke('liora:connection:for', payload),
  getProfileRoutes: profiles => ipcRenderer.invoke('liora:plugin-profile-routes', profiles),
  revalidateConnection: () => ipcRenderer.invoke('liora:connection:revalidate'),
  touchBackend: profile => ipcRenderer.invoke('liora:backend:touch', profile),
  getGatewayWsUrl: profile => ipcRenderer.invoke('liora:gateway:ws-url', profile),
  // Registry-scoped fresh WS URL: { connectionId, profile } → result shape of
  // getGatewayWsUrl, minted against that connection's backend.
  getGatewayWsUrlFor: payload => ipcRenderer.invoke('liora:gateway:ws-url-for', payload),
  // Union agent roster across every registered connection.
  getAgentRoster: () => ipcRenderer.invoke('liora:agents:roster'),
  openSessionWindow: (sessionId, opts) => ipcRenderer.invoke('liora:window:openSession', sessionId, opts),
  openSessionInTerminal: (sessionId, opts) => ipcRenderer.invoke('liora:window:openInTerminal', sessionId, opts),
  openWindow: () => ipcRenderer.invoke('liora:window:openInstance'),
  openBrowserWindow: tabId => ipcRenderer.invoke('liora:window:openBrowser', tabId),
  onBrowserPopoutClosed: callback => {
    const listener = (_event, tabId) => callback(tabId)
    ipcRenderer.on('liora:browser-popout:closed', listener)

    return () => ipcRenderer.removeListener('liora:browser-popout:closed', listener)
  },
  claimAmbientCue: key => ipcRenderer.invoke('liora:ambient:claim', key),
  wakeIndicator: {
    getState: () => ipcRenderer.invoke('liora:wake-indicator:get'),
    setState: state => ipcRenderer.send('liora:wake-indicator:set', state),
    onState: callback => {
      const listener = (_event, state) => callback(state)
      ipcRenderer.on('liora:wake-indicator:state', listener)

      return () => ipcRenderer.removeListener('liora:wake-indicator:state', listener)
    }
  },
  petOverlay: {
    // Main renderer → main process: window lifecycle + drag. `request` is
    // `{ bounds, screen }`; resolves with the screen bounds it actually used.
    open: request => ipcRenderer.invoke('liora:pet-overlay:open', request),
    close: () => ipcRenderer.invoke('liora:pet-overlay:close'),
    setBounds: bounds => ipcRenderer.send('liora:pet-overlay:set-bounds', bounds),
    setIgnoreMouse: ignore => ipcRenderer.send('liora:pet-overlay:ignore-mouse', ignore),
    // Flip the overlay focusable (and focus it) while the composer needs keys.
    setFocusable: focusable => ipcRenderer.send('liora:pet-overlay:set-focusable', focusable),
    // Main renderer → overlay (forwarded by main): push the latest pet state.
    pushState: payload => ipcRenderer.send('liora:pet-overlay:state', payload),
    // Overlay → main renderer (forwarded by main): pop back in / composer submit.
    control: payload => ipcRenderer.send('liora:pet-overlay:control', payload),
    // Overlay subscribes to state pushes.
    onState: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('liora:pet-overlay:state', listener)

      return () => ipcRenderer.removeListener('liora:pet-overlay:state', listener)
    },
    // Main renderer subscribes to overlay control messages.
    onControl: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('liora:pet-overlay:control', listener)

      return () => ipcRenderer.removeListener('liora:pet-overlay:control', listener)
    }
  },
  // HUD mode: the chrome-free floating chat. A full app renderer (own gateway)
  // sized as a floating bar, so it mounts the real composer. Main owns the
  // window; `onChanged` keeps every window's toggle truthful.
  hud: {
    nativeDrag: hudNativeDrag,
    windowing: {
      clientPlacement: hudWindowing?.clientPlacement !== false,
      controlDrag: hudWindowing?.controlDrag === true,
      nativeDrag: hudNativeDrag,
      solid: hudWindowing?.solid === true,
      workspaceTransfer: hudWindowing?.workspaceTransfer === true
    },
    open: request => ipcRenderer.invoke('liora:hud:open', request),
    close: () => ipcRenderer.invoke('liora:hud:close'),
    setIgnoreMouse: ignore => ipcRenderer.send('liora:hud:ignore-mouse', ignore),
    beginMove: () => ipcRenderer.send('liora:hud:begin-move'),
    endMove: () => ipcRenderer.send('liora:hud:end-move'),
    moveBy: delta => ipcRenderer.send('liora:hud:move-by', delta),
    setWorkspaceTransfer: transferring => ipcRenderer.send('liora:hud:workspace-transfer', transferring),
    setBounds: bounds => ipcRenderer.send('liora:hud:set-bounds', bounds),
    resetLayout: () => ipcRenderer.invoke('liora:hud:reset-layout'),
    // Whether the band covers the window below the bar. Main pairs it with the
    // user's translucency setting to decide the native frost (macOS vibrancy /
    // Windows 11 DWM backdrop) — see hudFrostFor.
    setFrost: showing => ipcRenderer.invoke('liora:hud:frost', showing),
    // The HUD tells main which session it is on; main hands that back to the
    // app window when the HUD closes, so the app can re-home onto it.
    setSession: sessionId => ipcRenderer.send('liora:hud:session', sessionId),
    onGoto: callback => {
      const listener = (_event, sessionId) => callback(sessionId)
      ipcRenderer.on('liora:hud:goto', listener)

      return () => ipcRenderer.removeListener('liora:hud:goto', listener)
    },
    onChanged: callback => {
      const listener = (_event, state) => callback(state)
      ipcRenderer.on('liora:hud:changed', listener)

      return () => ipcRenderer.removeListener('liora:hud:changed', listener)
    },
    // Linux only, and silent elsewhere: where the cursor is, in page
    // coordinates, or null when it has left the window. Stands in for the
    // mousemove that `setIgnoreMouseEvents(true, { forward: true })` delivers on
    // macOS and Windows but not here.
    onCursor: callback => {
      const listener = (_event, point) => callback(point)
      ipcRenderer.on('liora:hud:cursor', listener)

      return () => ipcRenderer.removeListener('liora:hud:cursor', listener)
    },
    // Main's game-overlay watch: whether a fullscreen app (a game) is under
    // the HUD, so the renderer can step back to the low-opacity overlay
    // treatment while one owns the screen.
    onGameOverlay: callback => {
      const listener = (_event, state) => callback(state)
      ipcRenderer.on('liora:hud:game-overlay', listener)

      return () => ipcRenderer.removeListener('liora:hud:game-overlay', listener)
    }
  },
  // Quick Entry: the global-hotkey mini composer window. Main owns the OS
  // shortcut + the persisted preference; the quick window only captures text
  // and hands it back, and the primary renderer submits it through the normal
  // prompt path.
  quickEntry: {
    getSettings: () => ipcRenderer.invoke('liora:quick-entry:settings:get'),
    setSettings: patch => ipcRenderer.invoke('liora:quick-entry:settings:set', patch),
    submit: payload => ipcRenderer.send('liora:quick-entry:submit', payload),
    dismiss: () => ipcRenderer.send('liora:quick-entry:dismiss'),
    // Primary renderer → main → quick window: gateway connection state + the
    // recent-session options the target picker offers. Main caches the latest
    // payload so a freshly spawned quick window starts from truth.
    pushState: payload => ipcRenderer.send('liora:quick-entry:state', payload),
    // Quick window subscribes to those pushes.
    onState: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('liora:quick-entry:state', listener)

      return () => ipcRenderer.removeListener('liora:quick-entry:state', listener)
    },
    // Main → primary renderer: a submit captured by the quick window.
    onSubmit: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('liora:quick-entry:submit', listener)

      return () => ipcRenderer.removeListener('liora:quick-entry:submit', listener)
    },
    // Main → quick window: you were just summoned (reset draft + refocus).
    onShown: callback => {
      const listener = () => callback()
      ipcRenderer.on('liora:quick-entry:shown', listener)

      return () => ipcRenderer.removeListener('liora:quick-entry:shown', listener)
    }
  },
  getBootProgress: () => ipcRenderer.invoke('liora:boot-progress:get'),
  getConnectionConfig: profile => ipcRenderer.invoke('liora:connection-config:get', profile),
  saveConnectionConfig: payload => ipcRenderer.invoke('liora:connection-config:save', payload),
  applyConnectionConfig: payload => ipcRenderer.invoke('liora:connection-config:apply', payload),
  testConnectionConfig: payload => ipcRenderer.invoke('liora:connection-config:test', payload),
  // Opt-in OS-keychain encryption for stored gateway secrets (default off —
  // see secret-storage-policy.ts). get never touches the OS keychain.
  getSecretStorageEncryption: () => ipcRenderer.invoke('liora:secret-storage:get'),
  setSecretStorageEncryption: (on: boolean) => ipcRenderer.invoke('liora:secret-storage:set', on),
  // v2 multi-connection registry: named agent sources (local / remote / cloud / ssh).
  connections: {
    list: () => ipcRenderer.invoke('liora:connections:list'),
    save: payload => ipcRenderer.invoke('liora:connections:save', payload),
    remove: id => ipcRenderer.invoke('liora:connections:remove', id),
    setPrimary: id => ipcRenderer.invoke('liora:connections:set-primary', id),
    setLaunchMode: mode => ipcRenderer.invoke('liora:connections:set-launch-mode', mode),
    setLastUsed: id => ipcRenderer.invoke('liora:connections:set-last-used', id),
    test: id => ipcRenderer.invoke('liora:connections:test', id),
    updateManaged: id => ipcRenderer.invoke('liora:connections:update-managed', id),
    // Fan out `liora update` to every eligible registered connection.
    // Optional excludeIds skips rows the caller updates through another path.
    updateAll: options => ipcRenderer.invoke('liora:connections:update-all', options),
    // Registry lifecycle push (main → renderer): a connection was removed or
    // materially edited, so secondaries scoped to it must be disposed (and,
    // for edits, re-dialed at the new target).
    onChanged: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('liora:connections:changed', listener)

      return () => ipcRenderer.removeListener('liora:connections:changed', listener)
    }
  },
  sshConfigHosts: () => ipcRenderer.invoke('liora:ssh-config:hosts'),
  sshResolveHost: host => ipcRenderer.invoke('liora:ssh-config:resolve', host),
  probeConnectionConfig: remoteUrl => ipcRenderer.invoke('liora:connection-config:probe', remoteUrl),
  oauthLoginConnectionConfig: remoteUrl => ipcRenderer.invoke('liora:connection-config:oauth-login', remoteUrl),
  oauthLogoutConnectionConfig: remoteUrl => ipcRenderer.invoke('liora:connection-config:oauth-logout', remoteUrl),
  // Liora Cloud: one portal login powers discovery + silent per-agent sign-in
  // (cloud-auto-discovery Phase 3).
  cloud: {
    status: () => ipcRenderer.invoke('liora:cloud:status'),
    login: () => ipcRenderer.invoke('liora:cloud:login'),
    logout: () => ipcRenderer.invoke('liora:cloud:logout'),
    discover: org => ipcRenderer.invoke('liora:cloud:discover', org),
    agentSignIn: dashboardUrl => ipcRenderer.invoke('liora:cloud:agent-sign-in', dashboardUrl)
  },
  profile: {
    get: () => ipcRenderer.invoke('liora:profile:get'),
    remember: name => ipcRenderer.invoke('liora:profile:remember', name),
    set: name => ipcRenderer.invoke('liora:profile:set', name)
  },
  api: request => ipcRenderer.invoke('liora:api', request),
  notify: payload => ipcRenderer.invoke('liora:notify', payload),
  requestMicrophoneAccess: () => ipcRenderer.invoke('liora:requestMicrophoneAccess'),
  readWindowBelow: () => ipcRenderer.invoke('liora:window:readBelow'),
  readFileDataUrl: filePath => ipcRenderer.invoke('liora:readFileDataUrl', filePath),
  readFileDataUrlForAttach: filePath => ipcRenderer.invoke('liora:readFileDataUrlForAttach', filePath),
  dataUrlReadMax: {
    get: () => ipcRenderer.invoke('liora:data-url-read-max:get'),
    set: maxMb => ipcRenderer.invoke('liora:data-url-read-max:set', maxMb)
  },
  readFileText: filePath => ipcRenderer.invoke('liora:readFileText', filePath),
  readPluginSource: (filePath: string) => ipcRenderer.invoke('liora:readPluginSource', filePath),
  selectPaths: options => ipcRenderer.invoke('liora:selectPaths', options),
  selectSavePath: options => ipcRenderer.invoke('liora:selectSavePath', options),
  writeClipboard: text => ipcRenderer.invoke('liora:writeClipboard', text),
  readClipboard: () => ipcRenderer.invoke('liora:readClipboard'),
  saveGatewayFile: payload => ipcRenderer.invoke('liora:saveGatewayFile', payload),
  saveImageFromUrl: url => ipcRenderer.invoke('liora:saveImageFromUrl', url),
  contextMenuEdit: command => ipcRenderer.invoke('liora:context-menu:edit', command),
  contextMenuCopyImage: () => ipcRenderer.invoke('liora:context-menu:copy-image'),
  contextMenuSpellcheck: action => ipcRenderer.invoke('liora:context-menu:spellcheck', action),
  contextMenuGuestAddWord: payload => ipcRenderer.invoke('liora:context-menu:guest-add-word', payload),
  onContextMenuSpellcheck: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('liora:context-menu-spellcheck', listener)

    return () => ipcRenderer.removeListener('liora:context-menu-spellcheck', listener)
  },
  saveImageBuffer: (data, ext) => ipcRenderer.invoke('liora:saveImageBuffer', { data, ext }),
  saveClipboardImage: () => ipcRenderer.invoke('liora:saveClipboardImage'),
  getPathForFile: file => {
    try {
      return webUtils.getPathForFile(file) || ''
    } catch {
      return ''
    }
  },
  normalizePreviewTarget: (target, baseDir) => ipcRenderer.invoke('liora:normalizePreviewTarget', target, baseDir),
  watchPreviewFile: url => ipcRenderer.invoke('liora:watchPreviewFile', url),
  watchDirectory: dir => ipcRenderer.invoke('liora:watchDirectory', dir),
  stopPreviewFileWatch: id => ipcRenderer.invoke('liora:stopPreviewFileWatch', id),
  setActiveWork: payload => ipcRenderer.send('liora:active-work', payload),
  setTitleBarTheme: payload => ipcRenderer.send('liora:titlebar-theme', payload),
  setNativeTheme: mode => ipcRenderer.send('liora:native-theme', mode),
  setTranslucency: payload => ipcRenderer.send('liora:translucency', payload),
  setKeepAwake: on => ipcRenderer.send('liora:keep-awake', on),
  setDisableF12: blocked => ipcRenderer.send('liora:devtools:disable-f12', blocked),
  setPreviewShortcutActive: active => ipcRenderer.send('liora:previewShortcutActive', Boolean(active)),
  openExternal: url => ipcRenderer.invoke('liora:openExternal', url),
  mcpOauth: {
    // One-shot loopback listener for MCP OAuth against remote backends: bind
    // on this machine, hand redirectUri to mcp.servers.oauth.start, then wait
    // for the provider redirect and relay code/state via oauth.callback.
    listen: () => ipcRenderer.invoke('liora:mcp-oauth:listen'),
    wait: (id, timeoutMs) => ipcRenderer.invoke('liora:mcp-oauth:wait', id, timeoutMs),
    cancel: id => ipcRenderer.invoke('liora:mcp-oauth:cancel', id)
  },
  openPreviewInBrowser: url => ipcRenderer.invoke('liora:openPreviewInBrowser', url),
  reachPreviewUrl: url => ipcRenderer.invoke('liora:preview:reach', url),
  setActiveConnectionRoute: route => ipcRenderer.send('liora:connection:active-route', route),
  fetchLinkTitle: url => ipcRenderer.invoke('liora:fetchLinkTitle', url),
  resolveFavicon: url => ipcRenderer.invoke('liora:resolveFavicon', url),
  sanitizeWorkspaceCwd: cwd => ipcRenderer.invoke('liora:workspace:sanitize', cwd),
  settings: {
    getDefaultProjectDir: () => ipcRenderer.invoke('liora:setting:defaultProjectDir:get'),
    setDefaultProjectDir: dir => ipcRenderer.invoke('liora:setting:defaultProjectDir:set', dir),
    pickDefaultProjectDir: () => ipcRenderer.invoke('liora:setting:defaultProjectDir:pick')
  },
  zoom: {
    // Current zoom of this window, as { level, percent }.
    get: () => ipcRenderer.invoke('liora:zoom:get'),
    // Synchronous zoom factor (1 = 100%). Coordinate math needs it in the
    // same tick as the event it converts, so no IPC round-trip here.
    factor: () => webFrame.getZoomFactor(),
    setPercent: percent => ipcRenderer.send('liora:zoom:set-percent', percent),
    // Fires on every zoom change, including the Ctrl/Cmd +/-/0 shortcuts,
    // so the settings UI can stay in sync with the keyboard.
    onChanged: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('liora:zoom:changed', listener)

      return () => ipcRenderer.removeListener('liora:zoom:changed', listener)
    }
  },
  revealLogs: () => ipcRenderer.invoke('liora:logs:reveal'),
  getRecentLogs: () => ipcRenderer.invoke('liora:logs:recent'),
  // Fire-and-forget: persists a renderer error-boundary catch (with component
  // stack) to desktop.log so crashes survive the window (#79428).
  reportRendererError: report => ipcRenderer.send('liora:logs:renderer-error', report),
  readDir: dirPath => ipcRenderer.invoke('liora:fs:readDir', dirPath),
  gitRoot: startPath => ipcRenderer.invoke('liora:fs:gitRoot', startPath),
  revealPath: targetPath => ipcRenderer.invoke('liora:fs:reveal', targetPath),
  openDir: dirPath => ipcRenderer.invoke('liora:fs:openDir', dirPath),
  desktopPluginsRoot: () => ipcRenderer.invoke('liora:fs:desktopPluginsRoot'),
  logsRoot: () => ipcRenderer.invoke('liora:fs:logsRoot'),
  agentPluginsRoot: () => ipcRenderer.invoke('liora:fs:agentPluginsRoot'),
  renamePath: (targetPath, newName) => ipcRenderer.invoke('liora:fs:rename', targetPath, newName),
  writeTextFile: (filePath, content) => ipcRenderer.invoke('liora:fs:writeText', filePath, content),
  trashPath: targetPath => ipcRenderer.invoke('liora:fs:trash', targetPath),
  git: {
    worktreeList: repoPath => ipcRenderer.invoke('liora:git:worktreeList', repoPath),
    worktreeAdd: (repoPath, options) => ipcRenderer.invoke('liora:git:worktreeAdd', repoPath, options),
    worktreeRemove: (repoPath, worktreePath, options) =>
      ipcRenderer.invoke('liora:git:worktreeRemove', repoPath, worktreePath, options),
    branchSwitch: (repoPath, branch) => ipcRenderer.invoke('liora:git:branchSwitch', repoPath, branch),
    branchList: repoPath => ipcRenderer.invoke('liora:git:branchList', repoPath),
    baseBranchList: repoPath => ipcRenderer.invoke('liora:git:baseBranchList', repoPath),
    repoStatus: repoPath => ipcRenderer.invoke('liora:git:repoStatus', repoPath),
    fileDiff: (repoPath, filePath) => ipcRenderer.invoke('liora:git:fileDiff', repoPath, filePath),
    scanRepos: (roots, options) => ipcRenderer.invoke('liora:git:scanRepos', roots, options),
    review: {
      list: (repoPath, scope, baseRef) => ipcRenderer.invoke('liora:git:review:list', repoPath, scope, baseRef),
      diff: (repoPath, filePath, scope, baseRef, staged) =>
        ipcRenderer.invoke('liora:git:review:diff', repoPath, filePath, scope, baseRef, staged),
      stage: (repoPath, filePath) => ipcRenderer.invoke('liora:git:review:stage', repoPath, filePath),
      unstage: (repoPath, filePath) => ipcRenderer.invoke('liora:git:review:unstage', repoPath, filePath),
      revert: (repoPath, filePath) => ipcRenderer.invoke('liora:git:review:revert', repoPath, filePath),
      revParse: (repoPath, ref) => ipcRenderer.invoke('liora:git:review:revParse', repoPath, ref),
      commit: (repoPath, message, push) => ipcRenderer.invoke('liora:git:review:commit', repoPath, message, push),
      commitContext: repoPath => ipcRenderer.invoke('liora:git:review:commitContext', repoPath),
      push: repoPath => ipcRenderer.invoke('liora:git:review:push', repoPath),
      shipInfo: repoPath => ipcRenderer.invoke('liora:git:review:shipInfo', repoPath),
      prList: (repoPath, branches, numbers) =>
        ipcRenderer.invoke('liora:git:review:prList', repoPath, branches, numbers),
      fetchPrComment: (repoPath, url) => ipcRenderer.invoke('liora:git:review:fetchPrComment', repoPath, url),
      createPr: repoPath => ipcRenderer.invoke('liora:git:review:createPr', repoPath)
    }
  },
  terminal: {
    cwd: id => ipcRenderer.invoke('liora:terminal:cwd', id),
    dispose: id => ipcRenderer.invoke('liora:terminal:dispose', id),
    resize: (id, size) => ipcRenderer.invoke('liora:terminal:resize', id, size),
    start: options => ipcRenderer.invoke('liora:terminal:start', options),
    write: (id, data) => ipcRenderer.invoke('liora:terminal:write', id, data),
    onData: (id, callback) => {
      const channel = `liora:terminal:${id}:data`
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on(channel, listener)

      return () => ipcRenderer.removeListener(channel, listener)
    },
    onExit: (id, callback) => {
      const channel = `liora:terminal:${id}:exit`
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on(channel, listener)

      return () => ipcRenderer.removeListener(channel, listener)
    }
  },
  onClosePreviewRequested: callback => {
    const listener = () => callback()
    ipcRenderer.on('liora:close-preview-requested', listener)

    return () => ipcRenderer.removeListener('liora:close-preview-requested', listener)
  },
  onPreviewNav: callback => {
    const listener = (_event, command) => callback(command)
    ipcRenderer.on('liora:preview-nav', listener)

    return () => ipcRenderer.removeListener('liora:preview-nav', listener)
  },
  onOpenFolderRequested: callback => {
    const listener = () => callback()
    ipcRenderer.on('liora:open-folder-requested', listener)

    return () => ipcRenderer.removeListener('liora:open-folder-requested', listener)
  },
  onOpenUpdatesRequested: callback => {
    const listener = () => callback()
    ipcRenderer.on('liora:open-updates', listener)

    return () => ipcRenderer.removeListener('liora:open-updates', listener)
  },
  onDeepLink: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('liora:deep-link', listener)

    return () => ipcRenderer.removeListener('liora:deep-link', listener)
  },
  signalDeepLinkReady: () => ipcRenderer.invoke('liora:deep-link-ready'),
  probePluginRepo: payload => ipcRenderer.invoke('liora:plugin:probe', payload),
  installDesktopPlugin: payload => ipcRenderer.invoke('liora:plugin:installDesktop', payload),
  onWindowStateChanged: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('liora:window-state-changed', listener)

    return () => ipcRenderer.removeListener('liora:window-state-changed', listener)
  },
  onFocusSession: callback => {
    const listener = (_event, sessionId) => callback(sessionId)
    ipcRenderer.on('liora:focus-session', listener)

    return () => ipcRenderer.removeListener('liora:focus-session', listener)
  },
  onNotificationAction: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('liora:notification-action', listener)

    return () => ipcRenderer.removeListener('liora:notification-action', listener)
  },
  onNotificationActivate: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('liora:notification-activate', listener)

    return () => ipcRenderer.removeListener('liora:notification-activate', listener)
  },
  onPreviewFileChanged: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('liora:preview-file-changed', listener)

    return () => ipcRenderer.removeListener('liora:preview-file-changed', listener)
  },
  onBackendExit: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('liora:backend-exit', listener)

    return () => ipcRenderer.removeListener('liora:backend-exit', listener)
  },
  // Soft gateway-mode apply finished tearing down the primary backend. Renderer
  // should wipe session lists + re-dial without a window reload.
  onConnectionApplied: callback => {
    const listener = () => callback()
    ipcRenderer.on('liora:connection:applied', listener)

    return () => ipcRenderer.removeListener('liora:connection:applied', listener)
  },
  onPowerResume: callback => {
    const listener = () => callback()
    ipcRenderer.on('liora:power-resume', listener)

    return () => ipcRenderer.removeListener('liora:power-resume', listener)
  },
  // AC ↔ battery transitions; renderers slow their backstop polls on battery.
  getOnBattery: () => ipcRenderer.invoke('liora:power-battery:get'),
  onBatteryChanged: callback => {
    const listener = (_event, onBattery) => callback(Boolean(onBattery))
    ipcRenderer.on('liora:power-battery', listener)

    return () => ipcRenderer.removeListener('liora:power-battery', listener)
  },
  onBootProgress: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('liora:boot-progress', listener)

    return () => ipcRenderer.removeListener('liora:boot-progress', listener)
  },
  // First-launch bootstrap progress -- emitted by the install.ps1 stage
  // runner in main.ts (apps/desktop/electron/bootstrap-runner.ts).
  // Renderer's install overlay subscribes to live events and queries the
  // current snapshot via getBootstrapState() to recover after a devtools
  // reload mid-bootstrap.
  getBootstrapState: () => ipcRenderer.invoke('liora:bootstrap:get'),
  continueBootstrapLocal: () => ipcRenderer.invoke('liora:bootstrap:continue-local'),
  resetBootstrap: () => ipcRenderer.invoke('liora:bootstrap:reset'),
  repairBootstrap: () => ipcRenderer.invoke('liora:bootstrap:repair'),
  cancelBootstrap: () => ipcRenderer.invoke('liora:bootstrap:cancel'),
  onBootstrapEvent: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('liora:bootstrap:event', listener)

    return () => ipcRenderer.removeListener('liora:bootstrap:event', listener)
  },
  getVersion: () => ipcRenderer.invoke('liora:version'),
  getRemoteDisplayReason: () => ipcRenderer.invoke('liora:get-remote-display-reason'),
  uninstall: {
    summary: () => ipcRenderer.invoke('liora:uninstall:summary'),
    run: mode => ipcRenderer.invoke('liora:uninstall:run', { mode })
  },
  updates: {
    check: () => ipcRenderer.invoke('liora:updates:check'),
    apply: opts => ipcRenderer.invoke('liora:updates:apply', opts),
    getBranch: () => ipcRenderer.invoke('liora:updates:branch:get'),
    setBranch: name => ipcRenderer.invoke('liora:updates:branch:set', name),
    onProgress: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('liora:updates:progress', listener)

      return () => ipcRenderer.removeListener('liora:updates:progress', listener)
    }
  },
  themes: {
    fetchMarketplace: id => ipcRenderer.invoke('liora:vscode-theme:fetch', id),
    searchMarketplace: query => ipcRenderer.invoke('liora:vscode-theme:search', query)
  },
  // Find-in-page (Ctrl/Cmd+F): delegates to Electron's
  // webContents.findInPage on the IPC sender's window so a Cmd+F pressed
  // in a secondary session window searches THAT window, not the primary.
  // `onFoundInPage` returns the unsubscribe fn; the renderer wires it via
  // `initFindInPageListener` in store/find-in-page.ts and tears it down
  // when the FindBar unmounts.
  findInPage: (query, options) => ipcRenderer.invoke('liora:find-in-page', query, options),
  stopFindInPage: () => ipcRenderer.invoke('liora:stop-find-in-page'),
  onFoundInPage: callback => {
    const listener = (_event, result) => callback(result)
    ipcRenderer.on('liora:found-in-page', listener)

    return () => ipcRenderer.removeListener('liora:found-in-page', listener)
  },
  // Main-process `before-input-event` forwards Ctrl/Cmd+F here so renderer
  // can open the FindBar even when the GTK compositor has already grabbed
  // the chord at the windowing layer (#81727).
  onOpenFindBarRequested: callback => {
    const listener = () => callback()
    ipcRenderer.on('liora:open-find-bar', listener)

    return () => ipcRenderer.removeListener('liora:open-find-bar', listener)
  }
})
